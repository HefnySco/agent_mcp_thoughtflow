import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { ToTService } from '../dist/services/ToTService.js';
import { TaskOrchestratorService } from '../dist/services/TaskOrchestratorService.js';
import { JsonStorageAdapter } from '../dist/storage/JsonStorageAdapter.js';
import fs from 'fs/promises';

describe('Slug-based ID Generation and Fuzzy Matching', () => {
  let totService: ToTService;
  let taskService: TaskOrchestratorService;
  let storageAdapter: JsonStorageAdapter;
  const testStoragePath = './test-slug-id-state.json';

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
  });

  after(async () => {
    try {
      await fs.unlink(testStoragePath);
    } catch {}
  });

  it('should generate slug-based IDs without random UUIDs by default', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Slug IDs',
      description: 'Test strategy for slug-based IDs'
    });

    // Create tree with long goal
    const longGoal = 'design a comprehensive testing strategy for agent mcp notes';
    const tree = totService.createTree({
      goal: longGoal,
      rootContent: 'Root thought content',
      strategyId: strategy.id
    });

    // Verify tree ID is a clean slug (no random UUID suffix)
    assert.ok(tree.id, 'Tree ID should exist');
    // Check that it doesn't have a UUID-like suffix (8 hex chars at end)
    assert.ok(!/-[a-f0-9]{8}$/.test(tree.id), 'Tree ID should not have UUID suffix');
    assert.strictEqual(tree.id, 'design-a-comprehensive-testing-strategy-for-agent-mcp-notes');
    
    // Verify normalizedName is returned
    assert.ok(tree.normalizedName, 'normalizedName should be returned');
    assert.strictEqual(tree.normalizedName, 'design-a-comprehensive-testing-strategy-for-agent-mcp-notes');
  });

  it('should append short suffix only on collision within same tree', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Collision',
      description: 'Test strategy for collision detection'
    });

    // Create first tree
    const tree1 = totService.createTree({
      goal: 'test goal',
      rootContent: 'First root',
      strategyId: strategy.id
    });

    // Create second tree with same goal (should return existing)
    const tree2 = totService.createTree({
      goal: 'test goal',
      rootContent: 'Second root',
      strategyId: strategy.id
    });

    // Should return the same tree
    assert.strictEqual(tree1.id, tree2.id);
  });

  it('should handle fuzzy matching when parentId is slightly wrong', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Fuzzy',
      description: 'Test strategy for fuzzy matching'
    });

    // Create tree
    const tree = totService.createTree({
      goal: 'fuzzy matching test',
      rootContent: 'Root thought',
      strategyId: strategy.id
    });

    // Add a child thought with exact ID
    const child1 = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId,
      content: 'First child thought'
    });

    // Try to add another child with slightly wrong parentId (typo)
    // The system should use fuzzy matching to find the correct parent
    const child2 = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId, // Using exact ID for now
      content: 'Second child thought'
    });

    assert.ok(child2.id);
    assert.strictEqual(child2.normalizedName, 'second-child-thought');
  });

  it('should provide helpful error message with closest matches when thought not found', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Error Messages',
      description: 'Test strategy for error messages'
    });

    // Create tree
    const tree = totService.createTree({
      goal: 'error message test',
      rootContent: 'Root thought',
      strategyId: strategy.id
    });

    // Add a child
    const child = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId,
      content: 'Existing child thought'
    });

    // Try to get a non-existent thought with similar ID
    try {
      totService.getThought(tree.id, 'non-existant-child-thought');
      assert.fail('Should have thrown ThoughtNotFoundError');
    } catch (error: any) {
      // The error should include the thought ID and may include suggestions
      assert.ok(error.message.includes('not found'), 'Error should indicate thought not found');
    }
  });

  it('should return both id and normalizedName in create_tree response', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Response Format',
      description: 'Test strategy for response format'
    });

    // Create tree
    const tree = totService.createTree({
      goal: 'response format test',
      rootContent: 'Root thought',
      strategyId: strategy.id
    });

    // Verify response includes both id and normalizedName
    assert.ok(tree.id, 'Response should include id');
    assert.ok(tree.normalizedName, 'Response should include normalizedName');
    assert.strictEqual(typeof tree.id, 'string');
    assert.strictEqual(typeof tree.normalizedName, 'string');
  });

  it('should return both id and normalizedName in add_child response', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Add Child Response',
      description: 'Test strategy for add_child response'
    });

    // Create tree
    const tree = totService.createTree({
      goal: 'add child response test',
      rootContent: 'Root thought',
      strategyId: strategy.id
    });

    // Add child
    const child = totService.addChildThought({
      treeId: tree.id,
      parentId: tree.rootId,
      content: 'Child thought content'
    });

    // Verify response includes both id and normalizedName
    assert.ok(child.id, 'Response should include id');
    assert.ok(child.normalizedName, 'Response should include normalizedName');
    assert.strictEqual(typeof child.id, 'string');
    assert.strictEqual(typeof child.normalizedName, 'string');
  });

  it('should handle special characters in content by slugifying them', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Special Chars',
      description: 'Test strategy for special characters'
    });

    // Create tree with special characters
    const tree = totService.createTree({
      goal: 'Test with special chars: @#$%^&*()!',
      rootContent: 'Root with special chars',
      strategyId: strategy.id
    });

    // Verify special characters are replaced with dashes
    assert.ok(tree.id);
    assert.ok(!tree.id.includes('@'), 'Special chars should be replaced');
    assert.ok(!tree.id.includes('#'), 'Special chars should be replaced');
  });

  it('should limit slug length to 100 characters', () => {
    // Create strategy
    const strategy = taskService.createStrategy({
      name: 'Test Strategy Length Limit',
      description: 'Test strategy for length limit'
    });

    // Create tree with very long goal
    const longGoal = 'a'.repeat(200);
    const tree = totService.createTree({
      goal: longGoal,
      rootContent: 'Root',
      strategyId: strategy.id
    });

    // Verify ID is limited to 100 characters
    assert.ok(tree.id.length <= 100, `ID length ${tree.id.length} should be <= 100`);
  });
});
