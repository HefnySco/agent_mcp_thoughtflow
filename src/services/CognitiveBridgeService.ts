import { v4 as uuidv4 } from 'uuid';
import type {
  Tree,
  Thought,
  CognitiveMetadata,
  PromoteThoughtToTasksParams,
  PromoteThoughtToTasksResult,
  SpawnTotFromTaskParams,
  SpawnTotFromTaskResult,
  LinkThoughtToTaskParams
} from '../types/index.js';
import type { IStorageAdapter, CognitiveLink } from '../storage/IStorageAdapter.js';
import {
  TreeNotFoundError,
  ThoughtNotFoundError,
  TaskNotFoundError
} from '../types/index.js';
import { BaseService } from './BaseService.js';
import { TaskOrchestratorService } from './TaskOrchestratorService.js';
import { ToTService } from './ToTService.js';
import { logger } from '../utils/logger.js';
import { validateRequiredString, validateId } from '../utils/validators.js';

/**
 * CognitiveBridgeService enables bidirectional conversion between thoughts and tasks
 * This is the core innovation that closes the loop between reasoning and execution
 */
export class CognitiveBridgeService extends BaseService {
  private taskService: TaskOrchestratorService;
  private totService: ToTService;

  constructor(
    storageAdapter: IStorageAdapter,
    taskService: TaskOrchestratorService,
    totService: ToTService
  ) {
    super(storageAdapter, 'CognitiveBridgeService');
    this.taskService = taskService;
    this.totService = totService;
  }

  /**
   * Promote a thought (or subtree) to executable tasks
   * This is the primary bridge tool for converting reasoning into action
   */
  promoteThoughtToTasks(params: PromoteThoughtToTasksParams): PromoteThoughtToTasksResult {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    
    const tree = this.totService.getTree(params.treeId);
    if (!tree) {
      throw new TreeNotFoundError(params.treeId);
    }
    
    const thought = tree.thoughts.get(params.thoughtId);
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }
    
    // Check if already promoted (idempotency)
    const cognitiveMeta = thought.metadata?.cognitive as CognitiveMetadata;
    if (cognitiveMeta?.promotedToTaskIds && cognitiveMeta.promotedToTaskIds.length > 0) {
      logger.info(`Thought ${params.thoughtId} already promoted to tasks`);
      return {
        taskIds: cognitiveMeta.promotedToTaskIds,
        workflowId: cognitiveMeta.workflowId,
        thoughtsPromoted: 0,
        hierarchyPreserved: true
      };
    }
    
    const includeDescendants = params.includeDescendants !== false;
    const flattenHierarchy = params.flattenHierarchy === true;
    const taskNamePrefix = params.taskNamePrefix || '';
    
    const taskIds: string[] = [];
    const thoughtsToPromote: Thought[] = [];
    
    // Collect thoughts to promote
    if (includeDescendants) {
      this.collectSubtreeThoughts(tree, params.thoughtId, thoughtsToPromote);
    } else {
      thoughtsToPromote.push(thought);
    }
    
    const now = new Date().toISOString();
    
    // Create tasks for each thought using taskService
    for (const thoughtToPromote of thoughtsToPromote) {
      const taskName = `${taskNamePrefix}${thoughtToPromote.content.substring(0, 50)}${thoughtToPromote.content.length > 50 ? '...' : ''}`;
      
      const newTask = this.taskService.createTask({
        name: taskName,
        description: thoughtToPromote.content,
        dependencies: [],
        metadata: {
          cognitive: {
            sourceThoughtId: thoughtToPromote.id,
            sourceTreeId: params.treeId,
            promotedAt: now,
            syncStatus: 'synced'
          }
        }
      });
      
      taskIds.push(newTask.id);
      
      // Update thought metadata
      thoughtToPromote.metadata = thoughtToPromote.metadata || {};
      thoughtToPromote.metadata.cognitive = thoughtToPromote.metadata.cognitive || {};
      (thoughtToPromote.metadata.cognitive as CognitiveMetadata).promotedToTaskIds = 
        (thoughtToPromote.metadata.cognitive as CognitiveMetadata).promotedToTaskIds || [];
      (thoughtToPromote.metadata.cognitive as CognitiveMetadata).promotedToTaskIds!.push(newTask.id);
      (thoughtToPromote.metadata.cognitive as CognitiveMetadata).promotedAt = now;
      
      // Create cognitive link
      this.createCognitiveLink({
        type: 'thought_to_task',
        fromId: thoughtToPromote.id,
        toId: newTask.id,
        fromType: 'thought',
        toType: 'task',
        createdAt: now,
        reason: 'Promoted thought to task'
      });
    }
    
    // If workflowId provided, attach tasks to workflow
    if (params.workflowId) {
      this.taskService.addTasksToWorkflow(params.workflowId, taskIds);
      
      // Update all thoughts with workflowId
      for (const thoughtToPromote of thoughtsToPromote) {
        const meta = thoughtToPromote.metadata?.cognitive as CognitiveMetadata;
        if (meta) {
          meta.workflowId = params.workflowId;
        }
      }
    }
    
    // Update tree timestamp
    tree.updatedAt = now;
    this.triggerSave();
    
    logger.info(`Promoted ${thoughtsToPromote.length} thoughts to ${taskIds.length} tasks`);
    
    return {
      taskIds,
      workflowId: params.workflowId,
      thoughtsPromoted: thoughtsToPromote.length,
      hierarchyPreserved: !flattenHierarchy
    };
  }

  /**
   * Spawn a ToT tree from a task
   * Enables "if blocked → think again" loop
   */
  spawnTotFromTask(params: SpawnTotFromTaskParams): SpawnTotFromTaskResult {
    validateRequiredString(params.taskId, 'taskId');
    validateRequiredString(params.goal, 'goal');
    validateRequiredString(params.rootContent, 'rootContent');
    
    const task = this.taskService.getTask(params.taskId);
    if (!task) {
      throw new TaskNotFoundError(params.taskId);
    }
    
    const now = new Date().toISOString();
    
    // Create tree using totService
    const tree = this.totService.createTree({
      goal: params.goal,
      rootContent: params.rootContent,
      maxDepth: params.maxDepth,
      metadata: {
        sourceTaskId: params.taskId,
        spawnedAt: now
      }
    });
    
    // Update task metadata
    task.metadata = task.metadata || {};
    task.metadata.cognitive = task.metadata.cognitive || {};
    (task.metadata.cognitive as CognitiveMetadata).explorationTreeIds = 
      (task.metadata.cognitive as CognitiveMetadata).explorationTreeIds || [];
    (task.metadata.cognitive as CognitiveMetadata).explorationTreeIds!.push(tree.id);
    (task.metadata.cognitive as CognitiveMetadata).spawnedAt = now;
    
    // Create cognitive link
    this.createCognitiveLink({
      type: 'task_to_thought',
      fromId: params.taskId,
      toId: tree.id,
      fromType: 'task',
      toType: 'thought',
      createdAt: now,
      reason: 'Spawned ToT tree from task'
    });
    
    this.triggerSave();
    
    logger.info(`Spawned ToT tree ${tree.id} from task ${params.taskId}`);
    
    return {
      treeId: tree.id,
      rootThoughtId: tree.rootId
    };
  }

  /**
   * Create a lightweight explicit link between a thought and a task
   */
  linkThoughtToTask(params: LinkThoughtToTaskParams): void {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    validateRequiredString(params.taskId, 'taskId');
    
    const tree = this.totService.getTree(params.treeId);
    if (!tree) {
      throw new TreeNotFoundError(params.treeId);
    }
    
    const thought = tree.thoughts.get(params.thoughtId);
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }
    
    const task = this.taskService.getTask(params.taskId);
    if (!task) {
      throw new TaskNotFoundError(params.taskId);
    }
    
    const now = new Date().toISOString();
    
    // Update thought metadata
    thought.metadata = thought.metadata || {};
    thought.metadata.cognitive = thought.metadata.cognitive || {};
    (thought.metadata.cognitive as CognitiveMetadata).linkedTaskIds = 
      (thought.metadata.cognitive as CognitiveMetadata).linkedTaskIds || [];
    (thought.metadata.cognitive as CognitiveMetadata).linkedTaskIds!.push(params.taskId);
    
    // Update task metadata
    task.metadata = task.metadata || {};
    task.metadata.cognitive = task.metadata.cognitive || {};
    (task.metadata.cognitive as CognitiveMetadata).linkedThoughtIds = 
      (task.metadata.cognitive as CognitiveMetadata).linkedThoughtIds || [];
    (task.metadata.cognitive as CognitiveMetadata).linkedThoughtIds!.push(params.thoughtId);
    
    // Create cognitive link
    this.createCognitiveLink({
      type: 'link',
      fromId: params.thoughtId,
      toId: params.taskId,
      fromType: 'thought',
      toType: 'task',
      createdAt: now,
      reason: params.reason
    });
    
    tree.updatedAt = now;
    task.updatedAt = now;
    this.triggerSave();
    
    logger.info(`Linked thought ${params.thoughtId} to task ${params.taskId}`);
  }

  /**
   * Get cognitive provenance for a thought or task
   * Traces the full reasoning → execution chain
   */
  getCognitiveProvenance(id: string, type: 'thought' | 'task', maxDepth: number = 5): any {
    validateId(id, type === 'thought' ? 'Thought' : 'Task');
    
    const visited = new Set<string>();
    const result: any = {
      id,
      type,
      data: null,
      cognitiveMetadata: null,
      relatedEntries: []
    };
    
    if (type === 'thought') {
      const tree = this.totService.getAllTrees().find(t => t.thoughts.has(id));
      if (tree) {
        result.data = tree.thoughts.get(id);
        result.cognitiveMetadata = result.data?.metadata?.cognitive;
      }
    } else {
      result.data = this.taskService.getTask(id);
      result.cognitiveMetadata = result.data?.metadata?.cognitive;
    }
    
    // Traverse related entries
    this.traverseCognitiveLinks(id, type, visited, result.relatedEntries, 0, maxDepth);
    
    return result;
  }

  /**
   * Collect all thoughts in a subtree
   */
  private collectSubtreeThoughts(tree: Tree, thoughtId: string, result: Thought[]): void {
    const thought = tree.thoughts.get(thoughtId);
    if (!thought) return;
    
    result.push(thought);
    
    for (const childId of thought.children) {
      this.collectSubtreeThoughts(tree, childId, result);
    }
  }

  /**
   * Create a cognitive link
   */
  private createCognitiveLink(link: Omit<CognitiveLink, 'id'>): void {
    const id = uuidv4();
    this.state.cognitiveLinks.set(id, { ...link, id });
  }

  /**
   * Traverse cognitive links to build provenance chain
   */
  private traverseCognitiveLinks(
    currentId: string,
    currentType: 'thought' | 'task',
    visited: Set<string>,
    results: any[],
    depth: number,
    maxDepth: number
  ): void {
    if (depth >= maxDepth || visited.has(currentId)) {
      return;
    }
    
    visited.add(currentId);
    
    // Find all links from this entity
    for (const link of this.state.cognitiveLinks.values()) {
      if (link.fromId === currentId && link.fromType === currentType) {
        const relatedData = link.toType === 'thought' 
          ? this.getThoughtData(link.toId)
          : this.taskService.getTask(link.toId);
        
        if (relatedData) {
          results.push({
            id: link.toId,
            type: link.toType,
            data: relatedData,
            linkType: link.type,
            reason: link.reason,
            createdAt: link.createdAt
          });
          
          this.traverseCognitiveLinks(link.toId, link.toType, visited, results, depth + 1, maxDepth);
        }
      }
    }
  }

  /**
   * Get thought data from any tree
   */
  private getThoughtData(thoughtId: string): Thought | null {
    for (const tree of this.totService.getAllTrees()) {
      const thought = tree.thoughts.get(thoughtId);
      if (thought) return thought;
    }
    return null;
  }

  /**
   * Get the count of cognitive links
   */
  getCognitiveLinkCount(): number {
    return this.state.cognitiveLinks.size;
  }
}
