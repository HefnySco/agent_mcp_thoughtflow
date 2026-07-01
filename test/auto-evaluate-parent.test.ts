/**
 * Test script to verify automatic parent evaluation
 * This tests that:
 * - When all children of a thought are evaluated, the parent automatically becomes evaluated
 * - The parent's evaluation score is the average of its children's scores
 * - The propagation recurses up the tree
 */

import { ToTService } from '../src/services/ToTService';
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

async function testAutoEvaluateParent() {
  console.log('Testing automatic parent evaluation...\n');

  const storage = new MockStorageAdapter();
  await storage.initialize();
  await storage.load();
  
  const taskService = new TaskOrchestratorService(storage);
  await taskService.load();
  
  const totService = new ToTService(storage);
  // Share the state from taskService with totService
  totService.setState(taskService.getState());

  try {
    // Test 1: Create a strategy first (required by tree creation)
    console.log('Test 1: Create strategy');
    const strategy = taskService.createStrategy({
      name: 'Test Strategy',
      description: 'A test strategy for auto-evaluation'
    });
    console.log('✓ Strategy created:', strategy.id);

    // Test 2: Create a tree
    console.log('\nTest 2: Create tree');
    const tree = totService.createTree({
      goal: 'Test auto-evaluation',
      rootContent: 'Root thought',
      strategyId: strategy.id
    });
    console.log('✓ Tree created:', tree.id);

    // Test 3: Add child thoughts to root
    console.log('\nTest 3: Add child thoughts to root');
    const child1 = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId,
      content: 'Child 1'
    });
    console.log('✓ Child 1 created:', child1.id);

    const child2 = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId,
      content: 'Child 2'
    });
    console.log('✓ Child 2 created:', child2.id);

    const child3 = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId,
      content: 'Child 3'
    });
    console.log('✓ Child 3 created:', child3.id);

    // Test 4: Verify root is still pending
    console.log('\nTest 4: Verify root is still pending');
    const rootBefore = totService.getThoughtFull(tree.id, tree.rootId);
    console.log('  Root state:', rootBefore.state);
    if (rootBefore.state === 'pending') {
      console.log('✓ Root is still pending');
    } else {
      console.log('✗ FAILED: Root should be pending');
    }

    // Test 5: Evaluate first child
    console.log('\nTest 5: Evaluate first child (score: 80)');
    totService.evaluateThought({
      treeId: tree.id,
      thoughtId: child1.id,
      score: 80
    });
    const rootAfter1 = totService.getThoughtFull(tree.id, tree.rootId);
    console.log('  Root state after child 1:', rootAfter1.state);
    if (rootAfter1.state === 'pending') {
      console.log('✓ Root still pending (not all children evaluated)');
    } else {
      console.log('✗ FAILED: Root should still be pending');
    }

    // Test 6: Evaluate second child
    console.log('\nTest 6: Evaluate second child (score: 90)');
    totService.evaluateThought({
      treeId: tree.id,
      thoughtId: child2.id,
      score: 90
    });
    const rootAfter2 = totService.getThoughtFull(tree.id, tree.rootId);
    console.log('  Root state after child 2:', rootAfter2.state);
    if (rootAfter2.state === 'pending') {
      console.log('✓ Root still pending (not all children evaluated)');
    } else {
      console.log('✗ FAILED: Root should still be pending');
    }

    // Test 7: Evaluate third child - this should trigger auto-evaluation of root
    console.log('\nTest 7: Evaluate third child (score: 70) - should auto-evaluate root');
    totService.evaluateThought({
      treeId: tree.id,
      thoughtId: child3.id,
      score: 70
    });
    const rootAfter3 = totService.getThoughtFull(tree.id, tree.rootId);
    console.log('  Root state after child 3:', rootAfter3.state);
    console.log('  Root evaluation score:', rootAfter3.evaluation);
    
    if (rootAfter3.state === 'evaluated') {
      console.log('✓ Root automatically evaluated');
      // Average should be (80 + 90 + 70) / 3 = 80
      const expectedAverage = (80 + 90 + 70) / 3;
      if (Math.abs(rootAfter3.evaluation! - expectedAverage) < 0.01) {
        console.log('✓ Root evaluation score is correct average:', expectedAverage);
      } else {
        console.log('✗ FAILED: Root evaluation score should be', expectedAverage, 'but is', rootAfter3.evaluation);
      }
    } else {
      console.log('✗ FAILED: Root should be automatically evaluated');
    }

    // Test 8: Test recursive propagation
    console.log('\nTest 8: Test recursive propagation (grandchildren -> child -> root)');
    const tree2 = totService.createTree({
      goal: 'Test recursive propagation',
      rootContent: 'Root 2',
      strategyId: strategy.id
    });
    
    const childA = totService.addChildThought({
      treeId: tree2.id,
      parentId: tree2.rootId,
      content: 'Child A'
    });
    
    const grandchild1 = totService.addChildThought({
      treeId: tree2.id,
      parentId: childA.id,
      content: 'Grandchild 1'
    });
    
    const grandchild2 = totService.addChildThought({
      treeId: tree2.id,
      parentId: childA.id,
      content: 'Grandchild 2'
    });
    
    // Evaluate grandchildren
    totService.evaluateThought({
      treeId: tree2.id,
      thoughtId: grandchild1.id,
      score: 60
    });
    
    const childAfter1 = totService.getThoughtFull(tree2.id, childA.id);
    console.log('  Child A state after grandchild 1:', childAfter1.state);
    
    totService.evaluateThought({
      treeId: tree2.id,
      thoughtId: grandchild2.id,
      score: 80
    });
    
    const childAfter2 = totService.getThoughtFull(tree2.id, childA.id);
    console.log('  Child A state after grandchild 2:', childAfter2.state);
    console.log('  Child A evaluation score:', childAfter2.evaluation);
    
    if (childAfter2.state === 'evaluated') {
      console.log('✓ Child A automatically evaluated (average of grandchildren)');
      const expectedAvg = (60 + 80) / 2;
      if (Math.abs(childAfter2.evaluation! - expectedAvg) < 0.01) {
        console.log('✓ Child A evaluation score is correct average:', expectedAvg);
      } else {
        console.log('✗ FAILED: Child A evaluation score should be', expectedAvg);
      }
    } else {
      console.log('✗ FAILED: Child A should be automatically evaluated');
    }

    console.log('\n=== All tests completed ===');

  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

testAutoEvaluateParent().catch(console.error);
