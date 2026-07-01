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

      const tree = (totService as any).getTreeFull(result.treeId);
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

      const thought = (totService as any).getThoughtFull(tree.id, tree.rootId);
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

  // Cognitive suggestions test
  describe('Cognitive Suggestions on Task Completion', () => {
    it('should return cognitive suggestions when task with linked thought is completed', async () => {
      // Create a tree and thought
      const tree = totService.createTree({
        goal: 'Test cognitive suggestions',
        rootContent: 'Root thought for testing'
      });

      // Create a task
      const task = taskService.createTask({
        name: 'Test task with linked thought',
        description: 'Task to test cognitive suggestions'
      });

      // Link thought to task
      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: tree.rootId,
        taskId: task.id,
        reason: 'Testing cognitive suggestions'
      });

      // Complete the task
      const result = taskService.updateTask(task.id, { status: 'completed' });

      // Verify cognitive suggestions are returned
      assert.ok(result.cognitiveSuggestions);
      assert.strictEqual(result.cognitiveSuggestions!.length, 1);
      assert.strictEqual(result.cognitiveSuggestions![0].type, 'verify_thought');
      assert.strictEqual(result.cognitiveSuggestions![0].thoughtId, tree.rootId);
      assert.ok(result.cognitiveSuggestions![0].reason.includes('completed'));
      assert.ok(result.cognitiveSuggestions![0].reason.includes(task.name));
    });

    it('should not return cognitive suggestions when task without linked thought is completed', async () => {
      // Create a task without linked thoughts
      const task = taskService.createTask({
        name: 'Test task without linked thought',
        description: 'Task to test no cognitive suggestions'
      });

      // Complete the task
      const result = taskService.updateTask(task.id, { status: 'completed' });

      // Verify no cognitive suggestions are returned
      assert.ok(!result.cognitiveSuggestions || result.cognitiveSuggestions.length === 0);
    });

    it('should return cognitive suggestions in advanceWorkflowRun for completed tasks with linked thoughts', async () => {
      // Create a tree and thought
      const tree = totService.createTree({
        goal: 'Test workflow cognitive suggestions',
        rootContent: 'Root thought for workflow testing'
      });

      // Create tasks
      const task1 = taskService.createTask({
        name: 'Task 1 with linked thought',
        description: 'First task'
      });

      const task2 = taskService.createTask({
        name: 'Task 2 without linked thought',
        description: 'Second task'
      });

      // Link thought to task1
      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: tree.rootId,
        taskId: task1.id,
        reason: 'Testing workflow cognitive suggestions'
      });

      // Create workflow with both tasks
      const workflow = taskService.createWorkflow({
        name: 'Test workflow for cognitive suggestions',
        taskIds: [task1.id, task2.id]
      });

      // Start workflow execution
      const runResult = taskService.startWorkflowExecution(workflow.id);
      assert.ok(runResult.runId);

      // Complete task1 (has linked thought)
      taskService.updateTask(task1.id, { status: 'completed' });

      // Complete task2 (no linked thought)
      taskService.updateTask(task2.id, { status: 'completed' });

      // Advance workflow run
      const advanceResult = taskService.advanceWorkflowRun(runResult.runId);

      // Verify cognitive suggestions are returned for task1
      assert.ok(advanceResult.cognitiveSuggestions);
      assert.strictEqual(advanceResult.cognitiveSuggestions!.length, 1);
      assert.strictEqual(advanceResult.cognitiveSuggestions![0].type, 'verify_thought');
      assert.strictEqual(advanceResult.cognitiveSuggestions![0].thoughtId, tree.rootId);
      assert.ok(advanceResult.cognitiveSuggestions![0].reason.includes('workflow'));
    });

    it('should return multiple cognitive suggestions for task with multiple linked thoughts', async () => {
      // Create a tree with multiple thoughts
      const tree = totService.createTree({
        goal: 'Test multiple cognitive suggestions',
        rootContent: 'Root thought'
      });

      const child1 = totService.addIdea(tree.id, tree.rootId, 'Child thought 1');
      const child2 = totService.addIdea(tree.id, tree.rootId, 'Child thought 2');

      // Create a task
      const task = taskService.createTask({
        name: 'Test task with multiple linked thoughts',
        description: 'Task to test multiple cognitive suggestions'
      });

      // Link multiple thoughts to the task
      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: tree.rootId,
        taskId: task.id,
        reason: 'First link'
      });

      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: child1.id,
        taskId: task.id,
        reason: 'Second link'
      });

      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: child2.id,
        taskId: task.id,
        reason: 'Third link'
      });

      // Complete the task
      const result = taskService.updateTask(task.id, { status: 'completed' });

      // Verify multiple cognitive suggestions are returned
      assert.ok(result.cognitiveSuggestions);
      assert.strictEqual(result.cognitiveSuggestions!.length, 3);
      assert.strictEqual(result.cognitiveSuggestions![0].type, 'verify_thought');
      assert.strictEqual(result.cognitiveSuggestions![1].type, 'verify_thought');
      assert.strictEqual(result.cognitiveSuggestions![2].type, 'verify_thought');
    });

    it('should not return cognitive suggestions when task status changes to non-completed', async () => {
      // Create a tree and thought
      const tree = totService.createTree({
        goal: 'Test non-completed status',
        rootContent: 'Root thought'
      });

      // Create a task
      const task = taskService.createTask({
        name: 'Test task status change',
        description: 'Task to test status changes'
      });

      // Link thought to task
      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: tree.rootId,
        taskId: task.id,
        reason: 'Testing status changes'
      });

      // Change task status to in_progress (not completed)
      const result = taskService.updateTask(task.id, { status: 'in_progress' });

      // Verify no cognitive suggestions are returned
      assert.ok(!result.cognitiveSuggestions || result.cognitiveSuggestions.length === 0);
    });
  });
});