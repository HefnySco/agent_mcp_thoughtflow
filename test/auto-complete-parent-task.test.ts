/**
 * Test script to verify automatic parent task completion
 * This tests that:
 * - When all subtasks of a task are completed, the parent automatically becomes completed
 * - The propagation recurses up the task hierarchy
 */

import { TaskOrchestratorService } from '../src/services/TaskOrchestratorService';
import { ThoughtflowError } from '../src/types';
import { IStorageAdapter } from '../src/storage/IStorageAdapter';

// Create a mock storage adapter
class MockStorageAdapter implements IStorageAdapter {
  state: any = {
    tasks: new Map(),
    workflows: new Map(),
    strategies: new Map(),
    trees: new Map(),
    cognitiveLinks: new Map(),
    workflowRuns: new Map()
  };

  async initialize() {
    // No-op
  }

  async load() {
    return this.state;
  }

  async save(state: any) {
    this.state = state;
  }

  async clear() {
    this.state = {
      tasks: new Map(),
      workflows: new Map(),
      strategies: new Map(),
      trees: new Map(),
      cognitiveLinks: new Map(),
      workflowRuns: new Map()
    };
  }

  async close() {
    // No-op
  }
}

async function testAutoCompleteParentTask() {
  console.log('Testing automatic parent task completion...\n');

  const storage = new MockStorageAdapter();
  await storage.initialize();
  await storage.load();
  
  const taskService = new TaskOrchestratorService(storage);
  await taskService.load();

  try {
    // Test 1: Create a strategy and workflow
    console.log('Test 1: Create strategy and workflow');
    const strategy = taskService.createStrategy({
      name: 'Test Strategy',
      description: 'A test strategy for auto-completion'
    });
    console.log('✓ Strategy created:', strategy.id);

    const workflow = taskService.createWorkflow({
      name: 'Test Workflow',
      description: 'A test workflow',
      taskIds: [],
      strategyId: strategy.id
    });
    console.log('✓ Workflow created:', workflow.id);

    // Test 2: Create parent task with subtasks
    console.log('\nTest 2: Create parent task with subtasks');
    const parentTask = taskService.createTask({
      name: 'Parent Task',
      description: 'A parent task',
      workflowId: workflow.id
    });
    console.log('✓ Parent task created:', parentTask.id);

    const subtask1 = taskService.createTask({
      name: 'Subtask 1',
      description: 'First subtask',
      parentTaskId: parentTask.id,
      workflowId: workflow.id
    });
    console.log('✓ Subtask 1 created:', subtask1.id);

    const subtask2 = taskService.createTask({
      name: 'Subtask 2',
      description: 'Second subtask',
      parentTaskId: parentTask.id,
      workflowId: workflow.id
    });
    console.log('✓ Subtask 2 created:', subtask2.id);

    const subtask3 = taskService.createTask({
      name: 'Subtask 3',
      description: 'Third subtask',
      parentTaskId: parentTask.id,
      workflowId: workflow.id
    });
    console.log('✓ Subtask 3 created:', subtask3.id);

    // Test 3: Verify parent is still pending
    console.log('\nTest 3: Verify parent is still pending');
    const parentBefore = taskService.getTask(parentTask.id);
    console.log('  Parent status:', parentBefore.status);
    if (parentBefore.status === 'pending') {
      console.log('✓ Parent is still pending');
    } else {
      console.log('✗ FAILED: Parent should be pending');
    }

    // Test 4: Complete first subtask
    console.log('\nTest 4: Complete first subtask');
    taskService.updateTask(subtask1.id, { status: 'completed' });
    const parentAfter1 = taskService.getTask(parentTask.id);
    console.log('  Parent status after subtask 1:', parentAfter1.status);
    if (parentAfter1.status === 'pending') {
      console.log('✓ Parent still pending (not all subtasks completed)');
    } else {
      console.log('✗ FAILED: Parent should still be pending');
    }

    // Test 5: Complete second subtask
    console.log('\nTest 5: Complete second subtask');
    taskService.updateTask(subtask2.id, { status: 'completed' });
    const parentAfter2 = taskService.getTask(parentTask.id);
    console.log('  Parent status after subtask 2:', parentAfter2.status);
    if (parentAfter2.status === 'pending') {
      console.log('✓ Parent still pending (not all subtasks completed)');
    } else {
      console.log('✗ FAILED: Parent should still be pending');
    }

    // Test 6: Complete third subtask - this should trigger auto-completion of parent
    console.log('\nTest 6: Complete third subtask - should auto-complete parent');
    taskService.updateTask(subtask3.id, { status: 'completed' });
    const parentAfter3 = taskService.getTask(parentTask.id);
    console.log('  Parent status after subtask 3:', parentAfter3.status);
    console.log('  Parent completedAt:', parentAfter3.completedAt);
    
    if (parentAfter3.status === 'completed') {
      console.log('✓ Parent automatically completed');
      if (parentAfter3.completedAt) {
        console.log('✓ Parent has completion timestamp');
      } else {
        console.log('✗ FAILED: Parent should have completion timestamp');
      }
    } else {
      console.log('✗ FAILED: Parent should be automatically completed');
    }

    // Test 7: Test recursive propagation (grandsubtasks -> subtask -> parent)
    console.log('\nTest 7: Test recursive propagation (grandsubtasks -> subtask -> parent)');
    const workflow2 = taskService.createWorkflow({
      name: 'Test Workflow 2',
      description: 'Another test workflow',
      taskIds: [],
      strategyId: strategy.id
    });
    
    const parent2 = taskService.createTask({
      name: 'Parent 2',
      description: 'Another parent task',
      workflowId: workflow2.id
    });
    
    const subtaskA = taskService.createTask({
      name: 'Subtask A',
      description: 'Subtask with children',
      parentTaskId: parent2.id,
      workflowId: workflow2.id
    });
    
    const grandsubtask1 = taskService.createTask({
      name: 'Grandsubtask 1',
      description: 'First grandsubtask',
      parentTaskId: subtaskA.id,
      workflowId: workflow2.id
    });
    
    const grandsubtask2 = taskService.createTask({
      name: 'Grandsubtask 2',
      description: 'Second grandsubtask',
      parentTaskId: subtaskA.id,
      workflowId: workflow2.id
    });
    
    // Complete grandsubtasks
    taskService.updateTask(grandsubtask1.id, { status: 'completed' });
    
    const subtaskAfter1 = taskService.getTask(subtaskA.id);
    console.log('  Subtask A status after grandsubtask 1:', subtaskAfter1.status);
    
    taskService.updateTask(grandsubtask2.id, { status: 'completed' });
    
    const subtaskAfter2 = taskService.getTask(subtaskA.id);
    console.log('  Subtask A status after grandsubtask 2:', subtaskAfter2.status);
    
    const parentAfter = taskService.getTask(parent2.id);
    console.log('  Parent 2 status after all completions:', parentAfter.status);
    
    if (subtaskAfter2.status === 'completed') {
      console.log('✓ Subtask A automatically completed');
    } else {
      console.log('✗ FAILED: Subtask A should be automatically completed');
    }
    
    if (parentAfter.status === 'completed') {
      console.log('✓ Parent 2 automatically completed (recursive propagation)');
    } else {
      console.log('✗ FAILED: Parent 2 should be automatically completed');
    }

    console.log('\n=== All tests completed ===');

  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testAutoCompleteParentTask().catch(console.error);
