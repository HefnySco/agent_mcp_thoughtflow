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
   * Helper method to add a unique ID to an array, preventing duplicates
   * Centralizes duplicate prevention logic for all ID tracking arrays
   */
  private addUniqueIdToArray(array: string[], id: string): void {
    if (!array.includes(id)) {
      array.push(id);
    }
  }

  /**
   * Promote a thought (or subtree) to executable tasks
   * This is the primary bridge tool for converting reasoning into action
   */
  promoteThoughtToTasks(params: PromoteThoughtToTasksParams): PromoteThoughtToTasksResult {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    
    const tree = this.totService.getTreeFull(params.treeId);
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
      
      // Update thought metadata with bidirectional tracking
      this.preserveCognitiveMetadata(thoughtToPromote);
      thoughtToPromote.metadata = thoughtToPromote.metadata || {};
      thoughtToPromote.metadata.cognitive = thoughtToPromote.metadata.cognitive || {};
      const thoughtCognitive = thoughtToPromote.metadata.cognitive as CognitiveMetadata;
      thoughtCognitive.promotedToTaskIds = thoughtCognitive.promotedToTaskIds || [];
      this.addUniqueIdToArray(thoughtCognitive.promotedToTaskIds, newTask.id);
      thoughtCognitive.promotedAt = now;
      
      // Add provenance entry
      thoughtCognitive.provenanceChain = thoughtCognitive.provenanceChain || [];
      thoughtCognitive.provenanceChain.push({
        type: 'thought_to_task',
        fromId: thoughtToPromote.id,
        toId: newTask.id,
        timestamp: now,
        reason: 'Promoted thought to task'
      });
      
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
    
    // Update task metadata with bidirectional tracking
    this.preserveCognitiveMetadata(task);
    task.metadata = task.metadata || {};
    task.metadata.cognitive = task.metadata.cognitive || {};
    const taskCognitive = task.metadata.cognitive as CognitiveMetadata;
    taskCognitive.explorationTreeIds = taskCognitive.explorationTreeIds || [];
    this.addUniqueIdToArray(taskCognitive.explorationTreeIds, tree.id);
    taskCognitive.spawnedAt = now;
    
    // Add provenance entry
    taskCognitive.provenanceChain = taskCognitive.provenanceChain || [];
    taskCognitive.provenanceChain.push({
      type: 'task_to_thought',
      fromId: params.taskId,
      toId: tree.id,
      timestamp: now,
      reason: 'Spawned ToT tree from task'
    });
    
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
   * Supports bidirectional soft links for "inspired by" or "related to" relationships
   */
  linkThoughtToTask(params: LinkThoughtToTaskParams): { success: boolean; thoughtId: string; taskId: string; reason: string } {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    validateRequiredString(params.taskId, 'taskId');
    
    const tree = this.totService.getTreeFull(params.treeId);
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
    
    // Update thought metadata with bidirectional link (preserve existing cognitive fields)
    this.preserveCognitiveMetadata(thought);
    thought.metadata = thought.metadata || {};
    thought.metadata.cognitive = thought.metadata.cognitive || {};
    const thoughtCognitive = thought.metadata.cognitive as CognitiveMetadata;
    thoughtCognitive.linkedTaskIds = thoughtCognitive.linkedTaskIds || [];
    this.addUniqueIdToArray(thoughtCognitive.linkedTaskIds, params.taskId);
    
    // Update task metadata with bidirectional link (preserve existing cognitive fields)
    this.preserveCognitiveMetadata(task);
    task.metadata = task.metadata || {};
    task.metadata.cognitive = task.metadata.cognitive || {};
    const taskCognitive = task.metadata.cognitive as CognitiveMetadata;
    taskCognitive.linkedThoughtIds = taskCognitive.linkedThoughtIds || [];
    this.addUniqueIdToArray(taskCognitive.linkedThoughtIds, params.thoughtId);
    
    // Update sync status
    thoughtCognitive.syncStatus = 'synced';
    thoughtCognitive.lastSyncedAt = now;
    taskCognitive.syncStatus = 'synced';
    taskCognitive.lastSyncedAt = now;
    
    // Add to provenance chain
    thoughtCognitive.provenanceChain = thoughtCognitive.provenanceChain || [];
    thoughtCognitive.provenanceChain.push({
      type: 'link',
      fromId: params.thoughtId,
      toId: params.taskId,
      timestamp: now,
      reason: params.reason || 'Soft link established'
    });
    
    taskCognitive.provenanceChain = taskCognitive.provenanceChain || [];
    taskCognitive.provenanceChain.push({
      type: 'link',
      fromId: params.taskId,
      toId: params.thoughtId,
      timestamp: now,
      reason: params.reason || 'Soft link established'
    });
    
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
    
    logger.info(`Soft linked thought ${params.thoughtId} to task ${params.taskId}${params.reason ? ` (reason: ${params.reason})` : ''}`);
    
    return {
      success: true,
      thoughtId: params.thoughtId,
      taskId: params.taskId,
      reason: params.reason || 'Soft link established'
    };
  }

  /**
   * Get cognitive provenance for a thought or task
   * Traces the full reasoning → execution chain including promotion/spawn events
   */
  getCognitiveProvenance(id: string, type: 'thought' | 'task', maxDepth: number = 5): any {
    validateId(id, type === 'thought' ? 'Thought' : 'Task');
    
    const visited = new Set<string>();
    const result: any = {
      id,
      type,
      data: null,
      cognitiveMetadata: null,
      relatedEntries: [],
      provenanceChain: []
    };
    
    if (type === 'thought') {
      const tree = this.totService.getAllTrees().find(t => t.thoughts.has(id));
      if (tree) {
        result.data = tree.thoughts.get(id);
        result.cognitiveMetadata = result.data?.metadata?.cognitive;
        // Include provenance chain from metadata
        if (result.cognitiveMetadata?.provenanceChain) {
          result.provenanceChain = result.cognitiveMetadata.provenanceChain;
        }
      }
    } else {
      result.data = this.taskService.getTask(id);
      result.cognitiveMetadata = result.data?.metadata?.cognitive;
      // Include provenance chain from metadata
      if (result.cognitiveMetadata?.provenanceChain) {
        result.provenanceChain = result.cognitiveMetadata.provenanceChain;
      }
    }
    
    // Traverse related entries via cognitiveLinks
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
   * Preserve existing cognitive metadata when updating entity metadata
   * Ensures bidirectional sync doesn't overwrite existing cognitive fields
   */
  private preserveCognitiveMetadata(entity: any): void {
    if (!entity.metadata) {
      entity.metadata = {};
    }
    if (!entity.metadata.cognitive) {
      entity.metadata.cognitive = {};
    }
    // Preserve all existing cognitive fields - this is a no-op placeholder
    // The actual preservation happens by not reassigning the entire cognitive object
  }

  /**
   * Create a cognitive link
   */
  private createCognitiveLink(link: Omit<CognitiveLink, 'id'>): void {
    const id = this.generateId(link.type);
    this.state.cognitiveLinks.set(id, { ...link, id });
  }

  /**
   * Traverse cognitive links to build provenance chain
   * Handles complex networks (one-to-many, many-to-one, chains, branches)
   * Prevents circular reference issues using visited set
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
    
    // Find all links from this entity (supports one-to-many)
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
          
          // Recursively traverse (supports chains and branches)
          this.traverseCognitiveLinks(link.toId, link.toType, visited, results, depth + 1, maxDepth);
        }
      }
    }
    
    // Also find reverse links (supports many-to-one)
    for (const link of this.state.cognitiveLinks.values()) {
      if (link.toId === currentId && link.toType === currentType) {
        const relatedData = link.fromType === 'thought' 
          ? this.getThoughtData(link.fromId)
          : this.taskService.getTask(link.fromId);
        
        if (relatedData && !visited.has(link.fromId)) {
          results.push({
            id: link.fromId,
            type: link.fromType,
            data: relatedData,
            linkType: link.type,
            reason: link.reason,
            createdAt: link.createdAt,
            reverse: true
          });
          
          // Recursively traverse reverse links
          this.traverseCognitiveLinks(link.fromId, link.fromType, visited, results, depth + 1, maxDepth);
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

  /**
   * Ensure cognitive hierarchy for an entity
   * Initializes cognitive metadata structure for trees and thoughts
   */
  ensureCognitiveHierarchy(entity: any, entityType: 'tree' | 'thought', _context?: string): void {
    if (entityType === 'tree') {
      // Ensure tree metadata has cognitive structure
      entity.metadata = entity.metadata || {};
      entity.metadata.cognitive = entity.metadata.cognitive || {};
      
      // If tree has sourceTaskId, ensure it's properly tracked
      if (entity.metadata.sourceTaskId) {
        const task = this.taskService.getTask(entity.metadata.sourceTaskId);
        if (task) {
          task.metadata = task.metadata || {};
          task.metadata.cognitive = task.metadata.cognitive || {};
          const taskCognitive = task.metadata.cognitive as CognitiveMetadata;
          taskCognitive.explorationTreeIds = taskCognitive.explorationTreeIds || [];
          this.addUniqueIdToArray(taskCognitive.explorationTreeIds, entity.id);
        }
      }
    } else if (entityType === 'thought') {
      // Ensure thought metadata has cognitive structure
      entity.metadata = entity.metadata || {};
      entity.metadata.cognitive = entity.metadata.cognitive || {};
    }
  }

  /**
   * Deduplicate strategies and trees in the current state.
   * This cleans up duplicate entries that may have been created before
   * the deduplication logic was added.
   * Returns an object with counts of removed duplicates.
   */
  deduplicateStrategiesAndTrees(): {
    strategiesRemoved: number;
    treesRemoved: number;
  } {
    const strategiesRemoved = this.taskService.deduplicateStrategies();
    const treesRemoved = this.totService.deduplicateTrees();

    logger.info(`Deduplication complete: ${strategiesRemoved} strategies, ${treesRemoved} trees removed`);

    return {
      strategiesRemoved,
      treesRemoved
    };
  }
}
