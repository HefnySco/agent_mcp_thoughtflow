/**
 * Test script to verify the new strict hierarchy model
 * This tests that:
 * - Tasks require workflowId
 * - Workflows require strategyId
 * - Single ownership is enforced
 * - Hierarchy validation works
 */

import { TaskOrchestratorService } from '../src/services/TaskOrchestratorService';
import { ThoughtflowError } from '../src/types';
import { IStorageAdapter } from '../src/storage/IStorageAdapter';

// Create a mock storage adapter
class MockStorageAdapter implements IStorageAdapter {
  state: any = {
    tasks: {},
    workflows: {},
    strategies: {},
    trees: {},
    cognitiveLinks: {},
    workflowRuns: {}
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
      tasks: {},
      workflows: {},
      strategies: {},
      trees: {},
      cognitiveLinks: {},
      workflowRuns: {}
    };
  }

  async close() {
    // No-op
  }
}

async function testHierarchy() {
  console.log('Testing strict hierarchy model...\n');

  const storage = new MockStorageAdapter();
  const service = new TaskOrchestratorService(storage);

  try {
    // Test 1: Create strategy
    console.log('Test 1: Create strategy');
    const strategy = service.createStrategy({
      name: 'Test Strategy',
      description: 'A test strategy'
    });
    console.log('✓ Strategy created:', strategy.id);

    // Test 2: Create workflow with strategyId (should succeed)
    console.log('\nTest 2: Create workflow with strategyId');
    const workflow = service.createWorkflow({
      name: 'Test Workflow',
      description: 'A test workflow',
      taskIds: [],
      strategyId: strategy.id
    });
    console.log('✓ Workflow created:', workflow.id);
    console.log('  Workflow strategyId:', workflow.strategyId);

    // Test 3: Create workflow without strategyId (should fail)
    console.log('\nTest 3: Create workflow without strategyId (should fail)');
    try {
      service.createWorkflow({
        name: 'Invalid Workflow',
        description: 'Should fail',
        taskIds: [],
        strategyId: 'non-existent-strategy'
      });
      console.log('✗ FAILED: Should have thrown an error');
    } catch (error: any) {
      if (error.code === 'STRATEGY_NOT_FOUND') {
        console.log('✓ Correctly rejected workflow without valid strategyId');
      } else {
        console.log('✗ FAILED: Wrong error:', error.message);
      }
    }

    // Test 4: Create task with workflowId (should succeed)
    console.log('\nTest 4: Create task with workflowId');
    const task = service.createTask({
      name: 'Test Task',
      description: 'A test task',
      workflowId: workflow.id
    });
    console.log('✓ Task created:', task.id);
    console.log('  Task workflowId:', task.workflowId);
    console.log('  Task strategyId (denormalized):', task.strategyId);

    // Test 5: Create task without valid workflowId (should fail)
    console.log('\nTest 5: Create task without valid workflowId (should fail)');
    try {
      service.createTask({
        name: 'Invalid Task',
        description: 'Should fail',
        workflowId: 'non-existent-workflow'
      });
      console.log('✗ FAILED: Should have thrown an error');
    } catch (error: any) {
      if (error.code === 'WORKFLOW_NOT_FOUND') {
        console.log('✓ Correctly rejected task without valid workflowId');
      } else {
        console.log('✗ FAILED: Wrong error:', error.message);
      }
    }

    // Test 6: Add task to different workflow (should fail - single ownership)
    console.log('\nTest 6: Add task to different workflow (should fail)');
    const workflow2 = service.createWorkflow({
      name: 'Second Workflow',
      description: 'Another workflow',
      taskIds: [],
      strategyId: strategy.id
    });
    try {
      service.addTaskToWorkflow(workflow2.id, task.id);
      console.log('✗ FAILED: Should have thrown an error');
    } catch (error: any) {
      if (error.code === 'TASK_ALREADY_OWNED') {
        console.log('✓ Correctly enforced single workflow ownership');
      } else {
        console.log('✗ FAILED: Wrong error:', error.message);
      }
    }

    // Test 7: Validate hierarchy invariants
    console.log('\nTest 7: Validate hierarchy invariants');
    const validation = service.validateHierarchyInvariants();
    console.log('  Valid:', validation.valid);
    console.log('  Violations:', validation.violations.length);
    if (validation.valid) {
      console.log('✓ Hierarchy invariants are valid');
    } else {
      console.log('✗ FAILED: Violations found:', validation.violations);
    }

    // Test 8: Create a task with parent in different workflow (should fail)
    console.log('\nTest 8: Create task with parent in different workflow (should fail)');
    const task2 = service.createTask({
      name: 'Task in workflow 2',
      description: 'Another task',
      workflowId: workflow2.id
    });
    try {
      service.createTask({
        name: 'Invalid Subtask',
        description: 'Should fail',
        workflowId: workflow.id,
        parentTaskId: task2.id
      });
      console.log('✗ FAILED: Should have thrown an error');
    } catch (error: any) {
      if (error.code === 'WORKFLOW_BOUNDARY_VIOLATION') {
        console.log('✓ Correctly enforced workflow boundary for parent task');
      } else {
        console.log('✗ FAILED: Wrong error:', error.message);
      }
    }

    // Test 9: Create a task with dependency in different workflow (should fail)
    console.log('\nTest 9: Create task with dependency in different workflow (should fail)');
    try {
      service.createTask({
        name: 'Invalid Dependent Task',
        description: 'Should fail',
        workflowId: workflow.id,
        dependencies: [task2.id]
      });
      console.log('✗ FAILED: Should have thrown an error');
    } catch (error: any) {
      if (error.code === 'WORKFLOW_BOUNDARY_VIOLATION') {
        console.log('✓ Correctly enforced workflow boundary for dependencies');
      } else {
        console.log('✗ FAILED: Wrong error:', error.message);
      }
    }

    console.log('\n=== All tests completed ===');

  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testHierarchy().catch(console.error);
