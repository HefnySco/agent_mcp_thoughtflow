import type { ThoughtflowState } from '../storage/IStorageAdapter.js';
import type { Task, Workflow, Strategy } from '../types/index.js';

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/** Tasks that count toward a parent's derived status (live, not archived-away). */
function liveTasks(state: ThoughtflowState, ids: Iterable<string>): Task[] {
  const out: Task[] = [];
  for (const id of ids) {
    const t = state.tasks.get(id);
    if (t && !t.isDeleted) out.push(t);
  }
  return out;
}

export function deriveStatusFromTasks(tasks: Task[], current: Workflow['status']): Workflow['status'] {
  if (tasks.length === 0) return current;
  if (tasks.some(t => t.status === 'failed')) return 'failed';
  if (tasks.every(t => t.status === 'completed')) return 'completed';
  if (tasks.some(t => t.status === 'in_progress' || t.status === 'completed')) return 'in_progress';
  return 'pending';
}

/** Recompute a workflow's status (and started/completed timestamps) from its tasks. Returns true if changed. */
export function refreshWorkflowStatus(state: ThoughtflowState, workflowId: string): boolean {
  const wf = state.workflows.get(workflowId);
  if (!wf) return false;
  const next = deriveStatusFromTasks(liveTasks(state, wf.taskIds), wf.status);
  if (next === wf.status) return false;
  const now = new Date().toISOString();
  wf.status = next;
  wf.updatedAt = now;
  if (next !== 'pending' && !wf.startedAt) wf.startedAt = now;
  if (next === 'completed') wf.completedAt = now;
  else wf.completedAt = undefined;
  return true;
}

/**
 * Recompute an *active/completed* strategy's status from everything it owns.
 * Paused/archived are deliberate human choices and are never overridden.
 */
export function refreshStrategyStatus(state: ThoughtflowState, strategyId: string): boolean {
  const st = state.strategies.get(strategyId);
  if (!st || (st.status !== 'active' && st.status !== 'completed')) return false;
  const tasks: Task[] = [];
  for (const t of state.tasks.values()) {
    if (t.strategyId === strategyId && !t.isDeleted) tasks.push(t);
  }
  if (tasks.length === 0) return false;
  const next: Strategy['status'] = tasks.every(t => t.status === 'completed') ? 'completed' : 'active';
  if (next === st.status) return false;
  st.status = next;
  st.updatedAt = new Date().toISOString();
  return true;
}

export function isImplicitStrategy(s: Strategy): boolean {
  return s.id.startsWith('scratch-') || (s.description ?? '').startsWith('Implicit strategy');
}

export interface MaintenanceReport {
  workflowsMerged: number;
  taskLinksRepaired: number;
  workflowStatusesUpdated: number;
  strategyStatusesUpdated: number;
  emptyStrategiesRemoved: number;
  changed: boolean;
}

/**
 * Idempotent, non-destructive repair pass over the whole state:
 *  1. repoint tasks whose workflowId doesn't match a real workflow id
 *     (e.g. "wf_foo" vs the slugged "wf-foo")
 *  2. merge workflows that slug to the same name
 *  3. make workflow.taskIds agree with task.workflowId
 *  4. derive workflow and strategy statuses from their tasks
 *  5. drop implicit (scratch-*) strategies that own nothing
 */
export function runMaintenance(state: ThoughtflowState): MaintenanceReport {
  const r: MaintenanceReport = {
    workflowsMerged: 0, taskLinksRepaired: 0, workflowStatusesUpdated: 0,
    strategyStatusesUpdated: 0, emptyStrategiesRemoved: 0, changed: false
  };

  // 2. Merge duplicate workflows (by slug of id/name), keeping the earliest.
  const canonical = new Map<string, Workflow>();
  const remap = new Map<string, string>(); // dropped id -> kept id
  const byAge = [...state.workflows.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const wf of byAge) {
    if (wf.isDeleted) continue;
    // Workflows minted under throwaway implicit strategies merge across them;
    // under explicit strategies they only merge within the same strategy.
    const implicit = state.strategies.get(wf.strategyId);
    const key = implicit && isImplicitStrategy(implicit) ? `*::${slugify(wf.name)}` : `${wf.strategyId}::${slugify(wf.name)}`;
    const keep = canonical.get(key);
    if (!keep) { canonical.set(key, wf); continue; }
    for (const id of wf.taskIds) if (!keep.taskIds.includes(id)) keep.taskIds.push(id);
    remap.set(wf.id, keep.id);
    state.workflows.delete(wf.id);
    const st = state.strategies.get(wf.strategyId);
    if (st) st.workflowIds = st.workflowIds.filter(id => id !== wf.id);
    r.workflowsMerged++;
  }
  for (const run of state.workflowRuns.values()) {
    const to = remap.get(run.workflowId);
    if (to) run.workflowId = to;
  }

  // 1. Repair task -> workflow links.
  const slugToWf = new Map<string, Workflow>();
  for (const wf of state.workflows.values()) {
    slugToWf.set(slugify(wf.id), wf);
    if (!slugToWf.has(slugify(wf.name))) slugToWf.set(slugify(wf.name), wf);
  }
  for (const t of state.tasks.values()) {
    if (!t.workflowId) continue;
    let target = remap.has(t.workflowId) ? state.workflows.get(remap.get(t.workflowId)!) : state.workflows.get(t.workflowId);
    if (!target) target = slugToWf.get(slugify(t.workflowId));
    if (target && target.id !== t.workflowId) { t.workflowId = target.id; r.taskLinksRepaired++; }
    if (target && t.strategyId !== target.strategyId) { t.strategyId = target.strategyId; r.taskLinksRepaired++; }
  }

  // 3. taskIds <-> task.workflowId consistency.
  for (const wf of state.workflows.values()) {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const id of wf.taskIds) {
      const t = state.tasks.get(id);
      if (!t || seen.has(id)) continue;
      seen.add(id);
      if (t.workflowId !== wf.id) {
        if (t.workflowId && state.workflows.has(t.workflowId)) continue; // belongs elsewhere
        t.workflowId = wf.id; r.taskLinksRepaired++;
      }
      ids.push(id);
    }
    for (const t of state.tasks.values()) {
      if (t.workflowId === wf.id && !seen.has(t.id)) { ids.push(t.id); seen.add(t.id); }
    }
    if (ids.length !== wf.taskIds.length) r.taskLinksRepaired++;
    wf.taskIds = ids;
    const st = state.strategies.get(wf.strategyId);
    if (st && !st.workflowIds.includes(wf.id)) st.workflowIds.push(wf.id);
  }

  // 4. Derived statuses.
  for (const wf of state.workflows.values()) if (refreshWorkflowStatus(state, wf.id)) r.workflowStatusesUpdated++;
  for (const st of state.strategies.values()) if (refreshStrategyStatus(state, st.id)) r.strategyStatusesUpdated++;

  // 5. GC empty implicit strategies.
  const owned = new Set<string>();
  for (const t of state.tasks.values()) if (t.strategyId) owned.add(t.strategyId);
  for (const wf of state.workflows.values()) owned.add(wf.strategyId);
  for (const tree of state.trees.values()) { const sid = (tree as any).strategyId; if (sid) owned.add(sid); }
  for (const [id, st] of [...state.strategies]) {
    if (isImplicitStrategy(st) && !owned.has(id) && st.workflowIds.length === 0 && st.treeIds.length === 0) {
      state.strategies.delete(id);
      r.emptyStrategiesRemoved++;
    }
  }

  r.changed = r.workflowsMerged + r.taskLinksRepaired + r.workflowStatusesUpdated
    + r.strategyStatusesUpdated + r.emptyStrategiesRemoved > 0;
  return r;
}
