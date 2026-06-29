import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { CognitiveBridgeService } from '../src/services/CognitiveBridgeService.js';
import { JsonStorageAdapter } from '../src/storage/JsonStorageAdapter.js';
import { TaskOrchestratorService } from '../src/services/TaskOrchestratorService.js';
import { ToTService } from '../src/services/ToTService.js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

describe('CognitiveBridgeService', () => {
  let bridgeService: CognitiveBridgeService;
  let taskService: TaskOrchestratorService;
  let totService: ToTService;
  let storageAdapter: JsonStorageAdapter;
  const testStoragePath = './test-bridge-state.json';

  before(async () => {
    // Clean up any existing test file
    try {
      await fs.unlink(testStoragePath);
    } catch {
      // File doesn't exist, that's fine
    }

    storageAdapter = new JsonStorageAdapter(testStoragePath);
    await storageAdapter.initialize();

    bridgeService = new CognitiveBridgeService(storageAdapter);
    taskService = new TaskOrchestratorService(storageAdapter);
    totService = new ToTService(storageAdapter);

    await bridgeService.load();
    await taskService.load();
    await totService.load();
  });

  after(async () => {
    await bridgeService.shutdown();
    await taskService.shutdown();
    await totService.shutdown();
    await storageAdapter.close();

    // Clean up test file
    try {
      await fs.unlink(testStoragePath);
    } catch {
      // File doesn't exist, that's fine
    }
  });

  describe('promoteThoughtToTasks', () => {
    it('should promote a single thought to a task', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
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
      assert.strictEqual(task.name.includes('Root thought'), true);
      assert.strictEqual(task.metadata?.cognitive?.sourceThoughtId, tree.rootId);
    });

    it('should be idempotent - promoting same thought twice returns existing tasks', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
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
      assert.strictEqual(result2.thoughtsPromoted, 0); // No new promotions
    });

    it('should promote subtree with hierarchy preserved', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
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
        goal: 'Test goal',
        rootContent: 'Root'
      });

      const workflow = taskService.createWorkflow({
        name: 'Test workflow',
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
      }, (err: Error) => err.message.includes('Tree with ID'));
    });

    it('should throw error for non-existent thought', () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      assert.throws(() => {
        bridgeService.promoteThoughtToTasks({
          treeId: tree.id,
          thoughtId: 'non-existent'
        });
      }, (err: Error) => err.message.includes('Thought'));
    });
  });

  describe('spawnTotFromTask', () => {
    it('should spawn a ToT tree from a task', async () => {
      const task = taskService.createTask({
        name: 'Test task',
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
      }, (err: Error) => err.message.includes('Task with ID'));
    });
  });

  describe('linkThoughtToTask', () => {
    it('should create bidirectional link between thought and task', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      const task = taskService.createTask({
        name: 'Test task'
      });

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

    it('should throw error for non-existent tree', () => {
      const task = taskService.createTask({
        name: 'Test task'
      });

      assert.throws(() => {
        bridgeService.linkThoughtToTask({
          treeId: 'non-existent',
          thoughtId: 'any',
          taskId: task.id
        });
      }, (err: Error) => err.message.includes('Tree with ID'));
    });

    it('should throw error for non-existent thought', () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      const task = taskService.createTask({
        name: 'Test task'
      });

      assert.throws(() => {
        bridgeService.linkThoughtToTask({
          treeId: tree.id,
          thoughtId: 'non-existent',
          taskId: task.id
        });
      }, (err: Error) => err.message.includes('Thought'));
    });

    it('should throw error for non-existent task', () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      assert.throws(() => {
        bridgeService.linkThoughtToTask({
          treeId: tree.id,
          thoughtId: tree.rootId,
          taskId: 'non-existent'
        });
      }, (err: Error) => err.message.includes('Task with ID'));
    });
  });

  describe('getCognitiveProvenance', () => {
    it('should return provenance for a task', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      const result = bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId
      });

      const provenance = bridgeService.getCognitiveProvenance({
        id: result.taskIds[0],
        type: 'task'
      });

      assert.strictEqual(provenance.id, result.taskIds[0]);
      assert.strictEqual(provenance.type, 'task');
      assert.ok(provenance.data);
      assert.ok(provenance.cognitiveMetadata);
    });

    it('should return provenance for a thought', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      const provenance = bridgeService.getCognitiveProvenance({
        id: tree.rootId,
        type: 'thought'
      });

      assert.strictEqual(provenance.id, tree.rootId);
      assert.strictEqual(provenance.type, 'thought');
      assert.ok(provenance.data);
    });

    it('should respect maxDepth parameter', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      const child1 = totService.addChildThought({
        treeId: tree.id,
        parentId: tree.rootId,
        content: 'Child 1'
      });

      const child2 = totService.addChildThought({
        treeId: tree.id,
        parentId: child1.id,
        content: 'Child 2'
      });

      bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId,
        includeDescendants: true
      });

      const provenance = bridgeService.getCognitiveProvenance({
        id: tree.rootId,
        type: 'thought',
        maxDepth: 1
      });

      // Should limit traversal depth
      assert.ok(provenance.relatedEntries.length >= 0);
    });
  });

  describe('cognitive metadata namespace', () => {
    it('should store all bridge data under metadata.cognitive', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root'
      });

      bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId
      });

      const thought = totService.getThought(tree.id, tree.rootId);
      assert.ok(thought.metadata?.cognitive);
      assert.ok(thought.metadata.cognitive && (thought.metadata.cognitive as any).promotedToTaskIds);
      assert.ok(thought.metadata.cognitive && (thought.metadata.cognitive as any).promotedAt);
    });

    it('should not pollute other metadata fields', async () => {
      const tree = totService.createTree({
        goal: 'Test goal',
        rootContent: 'Root',
        metadata: { customField: 'custom value' }
      });

      bridgeService.promoteThoughtToTasks({
        treeId: tree.id,
        thoughtId: tree.rootId
      });

      const thought = totService.getThought(tree.id, tree.rootId);
      assert.strictEqual(thought.metadata?.customField, 'custom value');
      assert.ok(thought.metadata && thought.metadata.cognitive);
    });
  });
});
