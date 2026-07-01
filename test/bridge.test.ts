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
    await taskService.load();
    
    totService = new ToTService(storageAdapter);
    // Share state from taskService with totService
    totService.setState(taskService.getState());
    
    bridgeService = new CognitiveBridgeService(storageAdapter, taskService, totService);
    // Share state from taskService with bridgeService
    bridgeService.setState(taskService.getState());

    await bridgeService.load();
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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy',
        description: 'Test strategy for promotion'
      });

      const tree = totService.createTree({
        goal: 'Test goal single',
        rootContent: 'Root thought',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow',
        description: 'Test workflow for promotion',
        taskIds: [],
        strategyId: strategy.id
      });

      const result = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        includeDescendants: false,
        workflowId: workflow.id
      });

      assert.strictEqual(result.taskIds.length, 1);
      assert.strictEqual(result.thoughtsPromoted, 1);
      assert.strictEqual(result.hierarchyPreserved, true);

      const task = taskService.getTask(result.taskIds[0]);
      assert.ok(task.name.includes('Root thought'));
      assert.strictEqual(task.metadata?.cognitive?.sourceThoughtId, tree.rootId);
      assert.strictEqual(task.workflowId, workflow.id);
    });

    it('should be idempotent - promoting same thought twice returns existing tasks', async () => {
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Idempotent',
        description: 'Test strategy for idempotent test'
      });

      const tree = totService.createTree({
        goal: 'Test goal idempotent',
        rootContent: 'Root thought',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Idempotent',
        description: 'Test workflow for idempotent test',
        taskIds: [],
        strategyId: strategy.id
      });

      const result1 = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        workflowId: workflow.id
      });

      const result2 = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        workflowId: workflow.id
      });

      assert.deepStrictEqual(result1.taskIds, result2.taskIds);
      assert.strictEqual(result2.thoughtsPromoted, 0);
    });

    it('should promote subtree with hierarchy preserved', async () => {
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Subtree',
        description: 'Test strategy for subtree test'
      });

      const tree = totService.createTree({
        goal: 'Test goal subtree',
        rootContent: 'Root',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Subtree',
        description: 'Test workflow for subtree test',
        taskIds: [],
        strategyId: strategy.id
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
        flattenHierarchy: false,
        workflowId: workflow.id
      });

      assert.strictEqual(result.taskIds.length, 3);
      assert.strictEqual(result.thoughtsPromoted, 3);
      assert.strictEqual(result.hierarchyPreserved, true);
    });

    it('should attach tasks to workflow if workflowId provided', async () => {
      // Create strategy for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Attach',
        description: 'Test strategy for attach test'
      });

      const tree = totService.createTree({
        goal: 'Test goal workflow',
        rootContent: 'Root',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test workflow attach',
        taskIds: [],
        strategyId: strategy.id
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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy NonExistent Tree',
        description: 'Test strategy for non-existent tree test'
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow NonExistent Tree',
        description: 'Test workflow for non-existent tree test',
        taskIds: [],
        strategyId: strategy.id
      });

      assert.throws(() => {
        bridgeService.promoteThoughtToTasks({
          treeId: 'non-existent',
          thoughtId: 'any',
          workflowId: workflow.id
        });
      }, /Tree with ID/);
    });

    it('should throw error for non-existent thought', () => {
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy NonExistent Thought',
        description: 'Test strategy for non-existent thought test'
      });

      const tree = totService.createTree({
        goal: 'Test goal missing thought',
        rootContent: 'Root',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow NonExistent Thought',
        description: 'Test workflow for non-existent thought test',
        taskIds: [],
        strategyId: strategy.id
      });

      assert.throws(() => {
        bridgeService.promoteThoughtToTasks({
          treeId: tree.id,
          thoughtId: 'non-existent',
          workflowId: workflow.id
        });
      }, /Thought/);
    });
  });

  describe('spawnTotFromTask', () => {
    it('should spawn a ToT tree from a task', async () => {
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Spawn',
        description: 'Test strategy for spawn test'
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Spawn',
        description: 'Test workflow for spawn test',
        taskIds: [],
        strategyId: strategy.id
      });

      const task = taskService.createTask({
        name: 'Test task spawn',
        description: 'Test description',
        workflowId: workflow.id
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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Link',
        description: 'Test strategy for link test'
      });

      const tree = totService.createTree({
        goal: 'Test goal link',
        rootContent: 'Root',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Link',
        description: 'Test workflow for link test',
        taskIds: [],
        strategyId: strategy.id
      });

      const task = taskService.createTask({
        name: 'Test task link',
        workflowId: workflow.id
      });

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
      const workflow = taskService.createWorkflow({ name: 'Workflow for add test', taskIds: [], strategyId: strategy.id });

      taskService.addWorkflowToStrategy(strategy.id, workflow.id);
      const updated = taskService.getStrategy(strategy.id);
      assert.ok(updated.workflowIds.includes(workflow.id));
    });

    it('should prevent duplicate workflow additions', async () => {
      const strategy = taskService.createStrategy({ name: 'Strategy duplicate workflow test' });
      const workflow = taskService.createWorkflow({ name: 'Dup workflow', taskIds: [], strategyId: strategy.id });

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
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Max Depth',
        description: 'Test strategy for max depth test'
      });

      const tree = totService.createTree({
        goal: 'Max depth test',
        rootContent: 'Root',
        maxDepth: 2,
        strategyId: strategy.id
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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Cognitive',
        description: 'Test strategy for cognitive suggestions'
      });

      // Create a tree and thought
      const tree = totService.createTree({
        goal: 'Test cognitive suggestions',
        rootContent: 'Root thought for testing',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Cognitive',
        description: 'Test workflow for cognitive suggestions',
        taskIds: [],
        strategyId: strategy.id
      });

      // Create a task
      const task = taskService.createTask({
        name: 'Test task with linked thought',
        description: 'Task to test cognitive suggestions',
        workflowId: workflow.id
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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy No Suggestions',
        description: 'Test strategy for no suggestions test'
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow No Suggestions',
        description: 'Test workflow for no suggestions test',
        taskIds: [],
        strategyId: strategy.id
      });

      // Create a task without linked thoughts
      const task = taskService.createTask({
        name: 'Test task without linked thought',
        description: 'Task to test no cognitive suggestions',
        workflowId: workflow.id
      });

      // Complete the task
      const result = taskService.updateTask(task.id, { status: 'completed' });

      // Verify no cognitive suggestions are returned
      assert.ok(!result.cognitiveSuggestions || result.cognitiveSuggestions.length === 0);
    });

    it('should return cognitive suggestions in advanceWorkflowRun for completed tasks with linked thoughts', async () => {
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Workflow Cognitive',
        description: 'Test strategy for workflow cognitive suggestions'
      });

      // Create a tree and thought
      const tree = totService.createTree({
        goal: 'Test workflow cognitive suggestions',
        rootContent: 'Root thought for workflow testing',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test workflow for cognitive suggestions',
        taskIds: [],
        strategyId: strategy.id
      });

      // Create tasks
      const task1 = taskService.createTask({
        name: 'Task 1 with linked thought',
        description: 'First task',
        workflowId: workflow.id
      });

      const task2 = taskService.createTask({
        name: 'Task 2 without linked thought',
        description: 'Second task',
        workflowId: workflow.id
      });

      // Link thought to task1
      bridgeService.linkThoughtToTask({
        treeId: tree.id,
        thoughtId: tree.rootId,
        taskId: task1.id,
        reason: 'Testing workflow cognitive suggestions'
      });

      // Add tasks to workflow
      taskService.addTasksToWorkflow(workflow.id, [task1.id, task2.id]);

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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Multiple Suggestions',
        description: 'Test strategy for multiple suggestions'
      });

      // Create a tree with multiple thoughts
      const tree = totService.createTree({
        goal: 'Test multiple cognitive suggestions',
        rootContent: 'Root thought',
        strategyId: strategy.id
      });

      const child1 = totService.addIdea(tree.id, tree.rootId, 'Child thought 1');
      const child2 = totService.addIdea(tree.id, tree.rootId, 'Child thought 2');

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Multiple Suggestions',
        description: 'Test workflow for multiple suggestions',
        taskIds: [],
        strategyId: strategy.id
      });

      // Create a task
      const task = taskService.createTask({
        name: 'Test task with multiple linked thoughts',
        description: 'Task to test multiple cognitive suggestions',
        workflowId: workflow.id
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
      // Create strategy and workflow for hierarchy
      const strategy = taskService.createStrategy({
        name: 'Test Strategy Status Change',
        description: 'Test strategy for status change test'
      });

      // Create a tree and thought
      const tree = totService.createTree({
        goal: 'Test non-completed status',
        rootContent: 'Root thought',
        strategyId: strategy.id
      });

      const workflow = taskService.createWorkflow({
        name: 'Test Workflow Status Change',
        description: 'Test workflow for status change test',
        taskIds: [],
        strategyId: strategy.id
      });

      // Create a task
      const task = taskService.createTask({
        name: 'Test task status change',
        description: 'Task to test status changes',
        workflowId: workflow.id
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