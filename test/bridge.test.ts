import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { CognitiveBridgeService } from '../dist/services/CognitiveBridgeService.js';
import { JsonStorageAdapter } from '../dist/storage/JsonStorageAdapter.js';
import { TaskOrchestratorService } from '../dist/services/TaskOrchestratorService.js';
import { ToTService } from '../dist/services/ToTService.js';
import fs from 'fs/promises';

describe('CognitiveBridgeService', () => {
  let bridgeService: CognitiveBridgeService;
  let taskService: TaskOrchestratorService;
  let totService: ToTService;
  let storageAdapter: JsonStorageAdapter;
  const testStoragePath = './test-bridge-state.json';

  before(async () => {
    try {
      await fs.unlink(testStoragePath);
    } catch {}

    storageAdapter = new JsonStorageAdapter(testStoragePath);
    await storageAdapter.initialize();

    taskService = new TaskOrchestratorService(storageAdapter);
    totService = new ToTService(storageAdapter);
    bridgeService = new CognitiveBridgeService(storageAdapter, taskService, totService);

    await bridgeService.load();
    await taskService.load();
    await totService.load();
  });

  after(async () => {
    await bridgeService.shutdown();
    await taskService.shutdown();
    await totService.shutdown();
    await storageAdapter.close();

    try {
      await fs.unlink(testStoragePath);
    } catch {}
  });

  describe('promoteThoughtToTasks', () => {
    it('should promote a single thought to a task', async () => {
      const tree = totService.createTree({
        goal: 'Test goal single',
        rootContent: 'Root thought'
      });

      const result = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        includeDescendants: false
      });

      assert.strictEqual(result.taskIds.length, 1);
      assert.strictEqual(result.thoughtsPromoted, 1);
      assert.strictEqual(result.hierarchyPreserved, true);

      const task = taskService.getTask(result.taskIds[0]);
      assert.ok(task.name.includes('Root thought'));
      assert.strictEqual(task.metadata?.cognitive?.sourceThoughtId, tree.rootId);
    });

    it('should be idempotent - promoting same thought twice returns existing tasks', async () => {
      const tree = totService.createTree({
        goal: 'Test goal idempotent',
        rootContent: 'Root thought'
      });

      const result1 = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId
      });

      const result2 = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId
      });

      assert.deepStrictEqual(result1.taskIds, result2.taskIds);
      assert.strictEqual(result2.thoughtsPromoted, 0);
    });

    it('should promote subtree with hierarchy preserved', async () => {
      const tree = totService.createTree({
        goal: 'Test goal subtree',
        rootContent: 'Root'
      });

      const child1 = totService.addChildThought({
        treeId: tree.id,
        parentId: tree.rootId,
        content: 'Child 1'
      });

      const child2 = totService.addChildThought({
        treeId: tree.id,
        parentId: tree.rootId,
        content: 'Child 2'
      });

      const result = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        includeDescendants: true,
        flattenHierarchy: false
      });

      assert.strictEqual(result.taskIds.length, 3);
      assert.strictEqual(result.thoughtsPromoted, 3);
      assert.strictEqual(result.hierarchyPreserved, true);
    });

    it('should attach tasks to workflow if workflowId provided', async () => {
      const tree = totService.createTree({
        goal: 'Test goal workflow',
        rootContent: 'Root'
      });

      const workflow = taskService.createWorkflow({
        name: 'Test workflow attach',
        taskIds: []
      });

      const result = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        workflowId: workflow.id
      });

      const updatedWorkflow = taskService.getWorkflow(workflow.id);
      assert.strictEqual(updatedWorkflow.taskIds.length, 1);
      assert.strictEqual(updatedWorkflow.taskIds[0], result.taskIds[0]);
    });

    it('should throw error for non-existent tree', () => {
      assert.throws(() => {
        bridgeService.promoteThoughtToTasks({
          treeId: 'non-existent',
          thoughtId: 'any'
        });
      }, /Tree with ID/);
    });

    it('should throw error for non-existent thought', () => {
      const tree = totService.createTree({
        goal: 'Test goal missing thought',
        rootContent: 'Root'
      });

      assert.throws(() => {
        bridgeService.promoteThoughtToTasks({
          treeId: tree.id,
          thoughtId: 'non-existent'
        });
      }, /Thought/);
    });
  });

  describe('spawnTotFromTask', () => {
    it('should spawn a ToT tree from a task', async () => {
      const task = taskService.createTask({
        name: 'Test task spawn',
        description: 'Test description'
      });

      const result = bridgeService.spawnTotFromTask({
        taskId: task.id,
        goal: 'Explore alternatives',
        rootContent: 'Initial thought'
      });

      assert.ok(result.treeId);
      assert.ok(result.rootThoughtId);

      const tree = totService.getTree(result.treeId);
      assert.strictEqual(tree.goal, 'Explore alternatives');
      assert.strictEqual(tree.metadata?.sourceTaskId, task.id);

      const updatedTask = taskService.getTask(task.id);
      assert.ok(updatedTask.metadata?.cognitive?.explorationTreeIds?.includes(result.treeId));
    });

    it('should throw error for non-existent task', () => {
      assert.throws(() => {
        bridgeService.spawnTotFromTask({
          taskId: 'non-existent',
          goal: 'Test',
          rootContent: 'Test'
        });
      }, /Task with ID/);
    });
  });

  describe('linkThoughtToTask', () => {
    it('should create bidirectional link between thought and task', async () => {
      const tree = totService.createTree({
        goal: 'Test goal link',
        rootContent: 'Root'
      });

      const task = taskService.createTask({ name: 'Test task link' });

      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: tree.rootId,
        taskId: task.id,
        reason: 'Related work'
      });

      const thought = totService.getThought(tree.id, tree.rootId);
      assert.ok(thought.metadata?.cognitive?.linkedTaskIds?.includes(task.id));

      const updatedTask = taskService.getTask(task.id);
      assert.ok(updatedTask.metadata?.cognitive?.linkedThoughtIds?.includes(tree.rootId));
    });

    // ... (other link tests remain similar - I can expand if needed)
  });

  // Strategy tests (fixed)
  describe('Strategy workflow management', () => {
    it('should add workflow to strategy', async () => {
      const strategy = taskService.createStrategy({ name: 'Strategy workflow add test' });
      const workflow = taskService.createWorkflow({ name: 'Workflow for add test', taskIds: [] });

      taskService.addWorkflowToStrategy(strategy.id, workflow.id);
      const updated = taskService.getStrategy(strategy.id);
      assert.ok(updated.workflowIds.includes(workflow.id));
    });

    it('should prevent duplicate workflow additions', async () => {
      const strategy = taskService.createStrategy({ name: 'Strategy duplicate workflow test' });
      const workflow = taskService.createWorkflow({ name: 'Dup workflow', taskIds: [] });

      taskService.addWorkflowToStrategy(strategy.id, workflow.id);
      taskService.addWorkflowToStrategy(strategy.id, workflow.id);

      const updated = taskService.getStrategy(strategy.id);
      assert.strictEqual(updated.workflowIds.filter(id => id === workflow.id).length, 1);
    });

    // Similar updates for remove and tree management...
  });

  // AddIdea test
  describe('addIdea', () => {
    it('should respect max depth', async () => {
      const tree = totService.createTree({
        goal: 'Max depth test',
        rootContent: 'Root',
        maxDepth: 2
      });

      const child1 = totService.addIdea(tree.id, tree.rootId, 'Child 1');
      const child2 = totService.addIdea(tree.id, child1.id, 'Child 2');

      assert.throws(() => {
        totService.addIdea(tree.id, child2.id, 'Child 3');
      }, /Maximum depth/);
    });
  });
});