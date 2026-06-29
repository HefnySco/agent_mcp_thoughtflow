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

  constructor(storagePath: string) {
    this.storagePath = storagePath;
  }

  /**
   * Initialize the JSON storage adapter
   * Ensures the directory exists
   */
  async initialize(): Promise<void> {
    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Load state from JSON file
   * @returns The loaded state
   */
  async load(): Promise<ThoughtflowState> {
    try {
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
    } catch (err) {
      // Return empty state if file doesn't exist or JSON is corrupted
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) {
        console.warn(`[JsonStorageAdapter] Storage file ${this.storagePath} is missing or corrupted. Starting with empty state.`);
        return {
          tasks: new Map(),
          workflows: new Map(),
          workflowRuns: new Map(),
          strategies: new Map(),
          trees: new Map(),
          cognitiveLinks: new Map()
        };
      }
      // For any other error, fail fast
      throw new ThoughtflowError('Failed to load state from JSON file', 'STORAGE_ERROR');
    }
  }

  /**
   * Save state to JSON file
   * @param state - The state to save
   */
  async save(state: ThoughtflowState): Promise<void> {
    try {
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
      const tempPath = `${this.storagePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2));
      await fs.rename(tempPath, this.storagePath);
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new ThoughtflowError(`Failed to save state to JSON file: ${cause}`, 'STORAGE_ERROR');
    }
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
    try {
      await fs.unlink(this.storagePath);
    } catch (err) {
      // File doesn't exist, that's fine
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new ThoughtflowError('Failed to clear JSON storage', 'STORAGE_ERROR');
      }
    }
  }
}
