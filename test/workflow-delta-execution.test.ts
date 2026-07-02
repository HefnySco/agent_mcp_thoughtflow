import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { TaskOrchestratorService } from '../dist/services/TaskOrchestratorService.js';
import { JsonStorageAdapter } from '../dist/storage/JsonStorageAdapter.js';
import fs from 'fs/promises';

describe('Workflow Delta Execution', () => {
  let taskService: TaskOrchestratorService;
  let storageAdapter: JsonStorageAdapter;
  const testStoragePath = './test-workflow-delta-state.json';

  before(async () => {
    try {
      await fs.unlink(testStoragePath);
    } catch {}

    storageAdapter = new JsonStorageAdapter(testStoragePath);
    await storageAdapter.initialize();

    taskService = new TaskOrchestratorService(storageAdapter);
    await taskService.load();
  });

  after(async () => {
    try {
      await fs.unlink(testStoragePath);
    } catch {}
  });

  it('should return minimal readyTasks with summary on start_workflow_execution', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Delta Execution',
      description: 'Test strategy for delta execution'
    });

    // Create workflow first (tasks must belong to a workflow)
    const workflow = taskService.createWorkflow({
      name: 'Test Workflow Delta',
      description: 'Test workflow for delta execution',
      taskIds: [],
      strategyId: strategy.id
    });

    // Create 5 tasks with dependencies
    const task1 = taskService.createTask({
      name: 'Task 1',
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task2 = taskService.createTask({
      name: 'Task 2',
      dependencies: [task1.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task3 = taskService.createTask({
      name: 'Task 3',
      dependencies: [task1.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task4 = taskService.createTask({
      name: 'Task 4',
      dependencies: [task2.id, task3.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task5 = taskService.createTask({
      name: 'Task 5',
      dependencies: [task4.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    // Start workflow execution
    const result = taskService.startWorkflowExecution(workflow.id);

    // Verify response structure
    assert.ok(result.runId);
    assert.strictEqual(result.workflowStatus, 'in_progress');
    assert.strictEqual(result.totalTasks, 5);
    assert.strictEqual(result.readyCount, 1); // Only task1 is ready (no dependencies)

    // Verify readyTasks are minimal (only id, name, status)
    assert.strictEqual(result.readyTasks.length, 1);
    assert.strictEqual(result.readyTasks[0].id, task1.id);
    assert.strictEqual(result.readyTasks[0].name, 'Task 1');
    assert.strictEqual(result.readyTasks[0].status, 'in_progress');
    // Minimal summaries don't have description field
    assert.ok(!('description' in result.readyTasks[0]));
  });

  it('should return deltas on advance_workflow_run instead of accumulated state', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Delta Advance',
      description: 'Test strategy for delta advance'
    });

    // Create workflow first
    const workflow = taskService.createWorkflow({
      name: 'Test Workflow Delta Advance',
      description: 'Test workflow for delta advance',
      taskIds: [],
      strategyId: strategy.id
    });

    // Create 5 tasks with dependencies
    const task1 = taskService.createTask({
      name: 'Task 1',
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task2 = taskService.createTask({
      name: 'Task 2',
      dependencies: [task1.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task3 = taskService.createTask({
      name: 'Task 3',
      dependencies: [task1.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task4 = taskService.createTask({
      name: 'Task 4',
      dependencies: [task2.id, task3.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task5 = taskService.createTask({
      name: 'Task 5',
      dependencies: [task4.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    // Start workflow execution
    const startResult = taskService.startWorkflowExecution(workflow.id);
    const runId = startResult.runId;

    // Complete task1
    taskService.updateTask(task1.id, { status: 'completed' });

    // Advance workflow run
    const advance1 = taskService.advanceWorkflowRun(runId);

    // Verify deltas: only newly completed and newly ready tasks
    assert.strictEqual(advance1.newlyCompletedTasks.length, 1);
    assert.strictEqual(advance1.newlyCompletedTasks[0].id, task1.id);
    assert.strictEqual(advance1.newlyFailedTasks.length, 0);
    assert.strictEqual(advance1.newlyReadyTasks.length, 2); // task2 and task3 become ready
    assert.strictEqual(advance1.workflowStatus, 'in_progress');

    // Verify task summaries are minimal
    assert.ok(!('description' in advance1.newlyCompletedTasks[0]));
    assert.ok(!('description' in advance1.newlyReadyTasks[0]));

    // Complete task2 and task3
    taskService.updateTask(task2.id, { status: 'completed' });
    taskService.updateTask(task3.id, { status: 'completed' });

    // Advance workflow run again
    const advance2 = taskService.advanceWorkflowRun(runId);

    // Verify deltas: only newly completed and newly ready tasks
    // task2 and task3 are newly completed, task4 becomes newly ready
    assert.strictEqual(advance2.newlyCompletedTasks.length, 2);
    assert.strictEqual(advance2.newlyFailedTasks.length, 0);
    assert.strictEqual(advance2.newlyReadyTasks.length, 1); // task4 becomes ready
    assert.strictEqual(advance2.newlyReadyTasks[0].id, task4.id);

    // Complete task4
    taskService.updateTask(task4.id, { status: 'completed' });

    // Advance workflow run again
    const advance3 = taskService.advanceWorkflowRun(runId);

    // Verify deltas: task4 newly completed, task5 newly ready
    assert.strictEqual(advance3.newlyCompletedTasks.length, 1);
    assert.strictEqual(advance3.newlyCompletedTasks[0].id, task4.id);
    assert.strictEqual(advance3.newlyReadyTasks.length, 1);
    assert.strictEqual(advance3.newlyReadyTasks[0].id, task5.id);

    // Complete task5
    taskService.updateTask(task5.id, { status: 'completed' });

    // Advance workflow run again
    const advance4 = taskService.advanceWorkflowRun(runId);

    // Verify workflow is completed
    assert.strictEqual(advance4.newlyCompletedTasks.length, 1);
    assert.strictEqual(advance4.newlyCompletedTasks[0].id, task5.id);
    assert.strictEqual(advance4.newlyReadyTasks.length, 0);
    assert.strictEqual(advance4.workflowStatus, 'completed');
  });

  it('should return full state with get_workflow_run_status', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Full Status',
      description: 'Test strategy for full status'
    });

    // Create workflow first
    const workflow = taskService.createWorkflow({
      name: 'Test Workflow Full Status',
      description: 'Test workflow for full status',
      taskIds: [],
      strategyId: strategy.id
    });

    // Create 5 tasks
    const task1 = taskService.createTask({
      name: 'Task 1',
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task2 = taskService.createTask({
      name: 'Task 2',
      dependencies: [task1.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task3 = taskService.createTask({
      name: 'Task 3',
      dependencies: [task1.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task4 = taskService.createTask({
      name: 'Task 4',
      dependencies: [task2.id, task3.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    const task5 = taskService.createTask({
      name: 'Task 5',
      dependencies: [task4.id],
      workflowId: workflow.id,
      metadata: { strategyId: strategy.id }
    });

    // Start workflow execution
    const startResult = taskService.startWorkflowExecution(workflow.id);
    const runId = startResult.runId;

    // Complete task1
    taskService.updateTask(task1.id, { status: 'completed' });

    // Advance workflow run
    taskService.advanceWorkflowRun(runId);

    // Get full status
    const fullStatus = taskService.getWorkflowRunStatus(runId);

    // Verify full state includes all tasks
    assert.strictEqual(fullStatus.runId, runId);
    assert.strictEqual(fullStatus.workflowId, workflow.id);
    assert.strictEqual(fullStatus.tasks.length, 5);
    assert.strictEqual(fullStatus.summary.total, 5);
    assert.strictEqual(fullStatus.summary.completed, 1);
    assert.strictEqual(fullStatus.summary.inProgress, 2); // task2 and task3
    assert.strictEqual(fullStatus.summary.pending, 2); // task4 and task5
    assert.strictEqual(fullStatus.summary.failed, 0);

    // Verify tasks have dependencies
    const task2Status = fullStatus.tasks.find(t => t.id === task2.id);
    assert.ok(task2Status, 'Task 2 should be in full status');
    assert.deepStrictEqual(task2Status!.dependencies, [task1.id]);
  });

  it('should track delta state correctly across multiple advances', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Delta Tracking',
      description: 'Test strategy for delta tracking'
    });

    // Create workflow first
    const workflow = taskService.createWorkflow({
      name: 'Test Workflow Delta Tracking',
      description: 'Test workflow for delta tracking',
      taskIds: [],
      strategyId: strategy.id
    });

    // Create 6 tasks
    const tasks = [];
    for (let i = 1; i <= 6; i++) {
      const task = taskService.createTask({
        name: `Task ${i}`,
        workflowId: workflow.id,
        metadata: { strategyId: strategy.id }
      });
      tasks.push(task);
    }

    // Start workflow execution
    const startResult = taskService.startWorkflowExecution(workflow.id);
    const runId = startResult.runId;

    // All 6 tasks should be ready (no dependencies)
    assert.strictEqual(startResult.readyCount, 6);

    // Complete tasks 1, 2, 3
    taskService.updateTask(tasks[0].id, { status: 'completed' });
    taskService.updateTask(tasks[1].id, { status: 'completed' });
    taskService.updateTask(tasks[2].id, { status: 'completed' });

    // Advance
    const advance1 = taskService.advanceWorkflowRun(runId);
    assert.strictEqual(advance1.newlyCompletedTasks.length, 3);

    // Complete tasks 4, 5
    taskService.updateTask(tasks[3].id, { status: 'completed' });
    taskService.updateTask(tasks[4].id, { status: 'completed' });

    // Advance again
    const advance2 = taskService.advanceWorkflowRun(runId);
    assert.strictEqual(advance2.newlyCompletedTasks.length, 2); // Only tasks 4, 5

    // Complete task 6
    taskService.updateTask(tasks[5].id, { status: 'completed' });

    // Advance again
    const advance3 = taskService.advanceWorkflowRun(runId);
    assert.strictEqual(advance3.newlyCompletedTasks.length, 1); // Only task 6
    assert.strictEqual(advance3.workflowStatus, 'completed');
  });
});
