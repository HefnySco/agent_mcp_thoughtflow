import fs from 'fs/promises';
import path from 'path';
import type {
  Task,
  Workflow,
  WorkflowRun,
  Strategy,
  Tree
} from '../types/index.js';
import type { IStorageAdapter, ThoughtflowState, CognitiveLink } from './IStorageAdapter.js';
import { ThoughtflowError } from '../types/index.js';

/**
 * JSON file-based storage adapter
 * Stores data as JSON in a file
 */
export class JsonStorageAdapter implements IStorageAdapter {
  private storagePath: string;
  // mtime (ms) of the storage file as of our last successful load/save.
  // null means "no sync point yet" (fresh start, or right after clear()) -
  // in that state save() always proceeds, since there is nothing to compare against.
  private lastSyncedMtimeMs: number | null = null;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * Stat the storage file's mtime, or null if it doesn't exist.
   */
  private async statMtimeMs(): Promise<number | null> {
    try {
      const stat = await fs.stat(this.storagePath);
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }

  /**
   * Path to the explicit "please wipe this" sentinel file. An out-of-process
   * actor with no access to the live server's memory (e.g. the dashboard's
   * "Delete All" button) drops this file to unambiguously signal intent to
   * delete, rather than us having to infer it from the shape of the data
   * (which an incidental "everything happened to get deleted normally" could
   * also produce). Whoever consumes it (save(), below) deletes it - it's a
   * one-shot trigger, not a persistent mode.
   */
  private get deleteFlagPath(): string {
    return `${this.storagePath}.delete-flag`;
  }

  /**
   * If the delete flag is set, honor it unconditionally: empty `state` in
   * place, make sure the storage file is actually gone, and consume the flag.
   * Returns true if the flag was present and handled (caller should skip its
   * own write), false if there was no flag to act on.
   */
  private async consumeDeleteFlagIfSet(state: ThoughtflowState): Promise<boolean> {
    try {
      await fs.access(this.deleteFlagPath);
    } catch {
      return false; // no flag set
    }

    state.tasks.clear();
    state.workflows.clear();
    state.workflowRuns.clear();
    state.strategies.clear();
    state.trees.clear();
    state.cognitiveLinks.clear();

    await fs.unlink(this.storagePath).catch(() => {});
    await fs.unlink(this.deleteFlagPath).catch(() => {});
    this.lastSyncedMtimeMs = null;

    console.warn(
      `[JsonStorageAdapter] Delete flag set for ${this.storagePath} - rejected this session's in-memory ` +
      `state, deleted the file, and cleared the flag.`
    );
    return true;
  }

  /**
   * Cross-process mutual exclusion for save()/clear(), using an exclusive-create
   * lockfile as the mutex. Multiple Thoughtflow server processes (e.g. two
   * concurrent sessions) may point at the same storage file; without this, two
   * processes racing to write can both pass the mtime guard, then race each
   * other on the shared write-tmp-then-rename sequence - whichever rename lands
   * last silently discards the other's write. This makes save/clear fully
   * serialized across processes instead.
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const lockPath = `${this.storagePath}.lock`;
    const staleMs = 15000; // a held lock older than this implies its owner crashed
    const maxWaitMs = 10000;
    const start = Date.now();

    while (true) {
      try {
        const handle = await fs.open(lockPath, 'wx');
        await handle.writeFile(`${process.pid}:${Date.now()}`);
        await handle.close();
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw err;
        }
        // Lock is held by someone else - is it stale (owner likely crashed)?
        try {
          const lockStat = await fs.stat(lockPath);
          if (Date.now() - lockStat.mtimeMs > staleMs) {
            await fs.unlink(lockPath).catch(() => {});
            continue; // retry immediately, no backoff needed
          }
        } catch {
          continue; // lock disappeared between our open() and stat() - retry
        }
        if (Date.now() - start > maxWaitMs) {
          throw new ThoughtflowError(
            `Timed out waiting for storage lock on ${this.storagePath} - another Thoughtflow process may be stuck`,
            'STORAGE_ERROR'
          );
        }
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));
      }
    }

    try {
      return await fn();
    } finally {
      await fs.unlink(lockPath).catch(() => {});
    }
  }

  /**
   * Initialize the JSON storage adapter
   * Ensures the directory exists
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
  }

  private emptyState(): ThoughtflowState {
    return {
      tasks: new Map(),
      workflows: new Map(),
      workflowRuns: new Map(),
      strategies: new Map(),
      trees: new Map(),
      cognitiveLinks: new Map()
    };
  }

  /**
   * Read and parse the storage file into a ThoughtflowState, without touching
   * lastSyncedMtimeMs. Throws on missing/corrupt file (unlike load()).
   */
  private async readState(): Promise<ThoughtflowState> {
    const data = await fs.readFile(this.storagePath, 'utf-8');
    const parsed = JSON.parse(data);

    const validTaskStatuses = ['pending', 'in_progress', 'completed', 'failed'] as const;
    const tasks = new Map<string, Task>(
      Object.entries(parsed.tasks || {}).map(([id, task]: [string, unknown]) => {
        const taskObj = task as Task;
        const validatedStatus = validTaskStatuses.includes(taskObj.status as any) ? taskObj.status : 'pending';
        return [id, { ...taskObj, status: validatedStatus as Task['status'] }];
      })
    );

    const workflows = new Map<string, Workflow>(
      Object.entries(parsed.workflows || {}).map(([id, workflow]: [string, unknown]) => [id, workflow as Workflow])
    );

    const workflowRuns = new Map<string, WorkflowRun>(
      Object.entries(parsed.workflowRuns || {}).map(([id, run]: [string, unknown]) => [id, run as WorkflowRun])
    );

    const strategies = new Map<string, Strategy>(
      Object.entries(parsed.strategies || {}).map(([id, strategy]: [string, unknown]) => [id, strategy as Strategy])
    );

    const trees = new Map<string, Tree>(
      Object.entries(parsed.trees || {}).map(([id, tree]: [string, unknown]) => {
        const treeObj = tree as Tree;
        // Convert thoughts back to Map
        treeObj.thoughts = new Map(Object.entries((tree as any).thoughts || {}));
        return [id, treeObj];
      })
    );

    const cognitiveLinks = new Map<string, CognitiveLink>(
      Object.entries(parsed.cognitiveLinks || {}).map(([id, link]: [string, unknown]) => [id, link as CognitiveLink])
    );

    return { tasks, workflows, workflowRuns, strategies, trees, cognitiveLinks };
  }

  /**
   * Load state from JSON file
   * @returns The loaded state
   */
  async load(): Promise<ThoughtflowState> {
    try {
      const state = await this.readState();
      // Record this file's mtime as our sync point - a save() will now only
      // proceed if the file still looks like what we just loaded.
      this.lastSyncedMtimeMs = await this.statMtimeMs();
      return state;
    } catch (err) {
      // Return empty state if file doesn't exist or JSON is corrupted
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) {
        console.warn(`[JsonStorageAdapter] Storage file ${this.storagePath} is missing or corrupted. Starting with empty state.`);
        // A pending delete flag has now been honored by this load (we're
        // returning empty state either way) - consume it so it doesn't
        // linger and get processed again by a later save().
        await fs.unlink(this.deleteFlagPath).catch(() => {});
        // No file to sync against yet - the next save() should proceed normally.
        this.lastSyncedMtimeMs = null;
        return this.emptyState();
      }
      // For any other error, fail fast
      throw new ThoughtflowError('Failed to load state from JSON file', 'STORAGE_ERROR');
    }
  }

  /**
   * Called from save() when the file on disk has changed since our last sync.
   * Distinguishes two cases and reconciles `state` (the in-memory state about
   * to be saved) in place:
   *  - The file is now empty: an intentional full clear happened (dashboard
   *    "Delete All", admin clear_state, manual rm, hand-edit to {}). Respect
   *    it - empty `state` in place too (so the live service's memory matches)
   *    and report that nothing should be written.
   *  - The file has different, non-empty content: most likely another
   *    concurrent Thoughtflow session/process saved its own new entries since
   *    we last synced. Merge its additions into `state` (favoring our own
   *    in-memory copy for any id we already hold) so neither side's work is
   *    lost, and report that the merged state should be written.
   * Returns true if `state` should now be written to disk, false if it was
   * already fully reconciled (emptied) and no write is needed.
   */
  private async reconcileWithDisk(state: ThoughtflowState): Promise<boolean> {
    let diskState: ThoughtflowState;
    try {
      diskState = await this.readState();
    } catch {
      diskState = this.emptyState();
    }

    const diskTotal = diskState.tasks.size + diskState.workflows.size + diskState.workflowRuns.size
      + diskState.strategies.size + diskState.trees.size + diskState.cognitiveLinks.size;

    if (diskTotal === 0) {
      state.tasks.clear();
      state.workflows.clear();
      state.workflowRuns.clear();
      state.strategies.clear();
      state.trees.clear();
      state.cognitiveLinks.clear();
      console.warn(
        `[JsonStorageAdapter] ${this.storagePath} was cleared externally since it was last read. ` +
        `Adopted the empty state instead of resurrecting in-memory data.`
      );
      return false;
    }

    let mergedCount = 0;
    const mergeMap = <T,>(mine: Map<string, T>, disk: Map<string, T>) => {
      for (const [id, value] of disk) {
        if (!mine.has(id)) {
          mine.set(id, value);
          mergedCount++;
        }
      }
    };
    mergeMap(state.tasks, diskState.tasks);
    mergeMap(state.workflows, diskState.workflows);
    mergeMap(state.workflowRuns, diskState.workflowRuns);
    mergeMap(state.strategies, diskState.strategies);
    mergeMap(state.trees, diskState.trees);
    mergeMap(state.cognitiveLinks, diskState.cognitiveLinks);

    if (mergedCount > 0) {
      console.warn(
        `[JsonStorageAdapter] ${this.storagePath} changed externally (likely another concurrent session) ` +
        `since it was last read - merged ${mergedCount} entr${mergedCount === 1 ? 'y' : 'ies'} from disk before saving.`
      );
    }
    return true;
  }

  /**
   * Save state to JSON file
   * @param state - The state to save
   */
  async save(state: ThoughtflowState): Promise<void> {
    await this.withLock(async () => {
      try {
        // An explicit delete flag always wins, unconditionally - it's the
        // out-of-process dashboard (or anything else) unambiguously telling us
        // to reject our own in-memory state rather than write it back.
        if (await this.consumeDeleteFlagIfSet(state)) {
          return;
        }

        // Safety guard: if the file was modified since we last synced with it
        // (e.g. the dashboard's "Delete All", a manual `rm`, hand-editing the
        // JSON, or another concurrent session's save), don't blindly overwrite
        // it with our (now stale) in-memory state. reconcileWithDisk() tells an
        // intentional external clear (adopt it, write nothing) apart from a
        // concurrent session's additions (merge them into `state` in place,
        // then fall through and write the merged result). This check + the
        // resulting write happen inside the lock, so it's race-free against
        // other Thoughtflow processes sharing this same file.
        if (this.lastSyncedMtimeMs !== null) {
          const currentMtimeMs = await this.statMtimeMs();
          if (currentMtimeMs === null || currentMtimeMs !== this.lastSyncedMtimeMs) {
            const shouldWrite = await this.reconcileWithDisk(state);
            if (!shouldWrite) {
              this.lastSyncedMtimeMs = await this.statMtimeMs();
              return;
            }
          }
        }

        const data = {
          tasks: Object.fromEntries(state.tasks),
          workflows: Object.fromEntries(state.workflows),
          workflowRuns: Object.fromEntries(state.workflowRuns),
          strategies: Object.fromEntries(state.strategies),
          trees: Array.from(state.trees.entries()).reduce((acc: Record<string, any>, [id, tree]: [string, Tree]) => {
            // Convert thoughts Map to object for serialization
            acc[id] = {
              ...tree,
              thoughts: Object.fromEntries(tree.thoughts)
            };
            return acc;
          }, {} as Record<string, any>),
          cognitiveLinks: Object.fromEntries(state.cognitiveLinks)
        };

        const dir = path.dirname(this.storagePath);
        await fs.mkdir(dir, { recursive: true });
        // Per-process-unique temp name - belt-and-suspenders alongside the lock,
        // so even a lock bypass can't cause two writers to share one temp file.
        const tempPath = `${this.storagePath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
        await fs.rename(tempPath, this.storagePath);

        // Record the mtime of what we just wrote as our new sync point.
        this.lastSyncedMtimeMs = await this.statMtimeMs();
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        throw new ThoughtflowError(`Failed to save state to JSON file: ${cause}`, 'STORAGE_ERROR');
      }
    });
  }

  /**
   * Close the JSON storage adapter
   * No-op for file-based storage
   */
  async close(): Promise<void> {
    // No-op for file-based storage
  }

  /**
   * Clear all data from storage
   */
  async clear(): Promise<void> {
    await this.withLock(async () => {
      try {
        await fs.unlink(this.storagePath);
      } catch (err) {
        // File doesn't exist, that's fine
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw new ThoughtflowError('Failed to clear JSON storage', 'STORAGE_ERROR');
        }
      }
      // We just deleted the file ourselves as part of an intentional clear -
      // drop the sync point so the next save() (of the now-empty in-memory
      // state) is allowed to proceed instead of being treated as a conflict.
      this.lastSyncedMtimeMs = null;
    });
  }
}
