import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { TaskOrchestratorService } from '../dist/services/TaskOrchestratorService.js';
import { runMaintenance } from '../dist/utils/stateMaintenance.js';

function mkStorage() {
  return {
    async initialize() {}, async load() { return emptyState(); }, async save() {}, async close() {}, async clear() {}
  } as any;
}
function emptyState(): any {
  return { tasks: new Map(), workflows: new Map(), workflowRuns: new Map(), strategies: new Map(), trees: new Map(), cognitiveLinks: new Map() };
}

describe('task hygiene', () => {
  let svc: TaskOrchestratorService;
  beforeEach(() => {
    process.env.THOUGHTFLOW_DEFAULT_STRATEGY = 'proj';
    svc = new TaskOrchestratorService(mkStorage());
    svc.setAutoSave(false);
    svc.setState(emptyState());
  });

  it('uses one shared project strategy instead of minting scratch strategies', () => {
    svc.createTasks({ tasks: [{ name: 'a' }] });
    svc.createTasks({ tasks: [{ name: 'b' }] });
    svc.createTasks({ tasks: [{ name: 'c' }, { name: 'd' }] });
    assert.deepStrictEqual([...svc.getState().strategies.keys()], ['proj']);
  });

  it('groups a multi-task batch into a workflow and resolves deps without workflowId', () => {
    const r = svc.createTasks({ tasks: [{ name: 'one' }, { name: 'two', dependencies: ['task-1'] }] });
    assert.ok(r.workflowId);
    const two = svc.getTask(r.tasks[1].id);
    assert.deepStrictEqual(two.dependencies, [r.tasks[0].id]);
    assert.strictEqual(svc.getTask(r.tasks[0].id).workflowId, r.workflowId);
  });

  it('treats wf_x and wf-x as the same workflow', () => {
    svc.createTasks({ workflowId: 'wf_x', tasks: [{ name: 'a' }] });
    svc.createTasks({ workflowId: 'wf-x', tasks: [{ name: 'b' }] });
    svc.createTasks({ workflowId: 'wf_x', tasks: [{ name: 'c' }] });
    assert.strictEqual(svc.getState().workflows.size, 1);
    const wf = [...svc.getState().workflows.values()][0];
    assert.strictEqual(wf.taskIds.length, 3);
    for (const id of wf.taskIds) assert.strictEqual(svc.getTask(id).workflowId, wf.id);
  });

  it('derives workflow and strategy status from tasks', () => {
    const r = svc.createTasks({ workflowId: 'w', tasks: [{ name: 'a' }, { name: 'b' }] });
    const wf = () => svc.getState().workflows.get(r.workflowId!)!;
    assert.strictEqual(wf().status, 'pending');
    svc.updateTask(r.tasks[0].id, { status: 'in_progress' });
    assert.strictEqual(wf().status, 'in_progress');
    svc.updateTask(r.tasks[0].id, { status: 'completed' });
    svc.updateTask(r.tasks[1].id, { status: 'completed' });
    assert.strictEqual(wf().status, 'completed');
    assert.strictEqual(svc.getState().strategies.get('proj')!.status, 'completed');
    svc.createTasks({ workflowId: 'w', tasks: [{ name: 'c' }] });
    assert.strictEqual(wf().status, 'in_progress');
    assert.strictEqual(svc.getState().strategies.get('proj')!.status, 'active');
  });

  it('stamps startedAt and finds/closes stale in_progress tasks', () => {
    const r = svc.createTasks({ tasks: [{ name: 'a' }] });
    svc.updateTask(r.tasks[0].id, { status: 'in_progress' });
    const t = svc.getTask(r.tasks[0].id);
    assert.ok(t.startedAt);
    assert.strictEqual(svc.getStaleTasks(24).length, 0);
    t.updatedAt = new Date(Date.now() - 48 * 3600_000).toISOString();
    assert.strictEqual(svc.getStaleTasks(24).length, 1);
    assert.strictEqual(svc.bulkUpdateTasks({ staleHours: 24, status: 'completed' }).updated, 1);
    assert.strictEqual(svc.getTask(t.id).status, 'completed');
  });

  it('supports priority/tags with filters, and archive hides completed tasks', () => {
    const r = svc.createTasks({ tasks: [{ name: 'a', tags: ['web'], priority: 'high' }, { name: 'b' }] });
    assert.deepStrictEqual(svc.listTasks(undefined, false, { tag: 'web' }).map(t => t.id), [r.tasks[0].id]);
    assert.strictEqual(svc.listTasks(undefined, false, { priority: 'high' }).length, 1);
    svc.updateTask(r.tasks[1].id, { status: 'completed' });
    svc.getTask(r.tasks[1].id).completedAt = new Date(Date.now() - 30 * 86_400_000).toISOString();
    assert.strictEqual(svc.archiveCompleted(14).archived, 1);
    assert.strictEqual(svc.listTasks().length, 1);
    assert.strictEqual(svc.listTasks(undefined, false, { includeArchived: true }).length, 2);
  });

  it('maintenance repairs legacy state: merges dup workflows, fixes links, drops empty scratch strategies', () => {
    const st = emptyState();
    const now = '2026-09-01T00:00:00.000Z';
    const strat = (id: string) => ({ id, name: id, status: 'active', treeIds: [], workflowIds: [] as string[], createdAt: now, updatedAt: now, description: 'Implicit strategy auto-created' });
    st.strategies.set('scratch-a', strat('scratch-a'));
    st.strategies.set('scratch-b', strat('scratch-b'));
    st.strategies.set('scratch-empty', strat('scratch-empty'));
    const wf = (id: string, name: string, sid: string, taskIds: string[], created: string) =>
      ({ id, name, taskIds, status: 'pending', createdAt: created, updatedAt: created, strategyId: sid });
    st.workflows.set('wf-x', wf('wf-x', 'wf_x', 'scratch-a', ['t1'], '2026-09-01T00:00:00.000Z'));
    st.workflows.set('wf-x-2', wf('wf-x-2', 'wf-x', 'scratch-b', ['t2'], '2026-09-02T00:00:00.000Z'));
    st.strategies.get('scratch-a').workflowIds.push('wf-x');
    st.strategies.get('scratch-b').workflowIds.push('wf-x-2');
    const task = (id: string, wid: string, sid: string) => ({ id, name: id, status: 'completed', dependencies: [], createdAt: now, updatedAt: now, workflowId: wid, strategyId: sid });
    st.tasks.set('t1', task('t1', 'wf_x', 'scratch-a')); // raw, un-slugged id
    st.tasks.set('t2', task('t2', 'wf-x-2', 'scratch-b'));
    const rep = runMaintenance(st);
    assert.strictEqual(rep.workflowsMerged, 1);
    assert.strictEqual(st.workflows.size, 1);
    assert.deepStrictEqual(st.workflows.get('wf-x').taskIds.sort(), ['t1', 't2']);
    assert.strictEqual(st.tasks.get('t1').workflowId, 'wf-x');
    assert.strictEqual(st.tasks.get('t2').workflowId, 'wf-x');
    assert.strictEqual(st.workflows.get('wf-x').status, 'completed');
    assert.ok(!st.strategies.has('scratch-empty'));
    assert.ok(!st.strategies.has('scratch-b') || st.strategies.get('scratch-b').workflowIds.length === 0);
    assert.strictEqual(runMaintenance(st).changed, false, 'idempotent');
  });
});
