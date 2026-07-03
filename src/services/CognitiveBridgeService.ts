import type {
  Tree,
  Thought,
  Task,
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
  TaskNotFoundError,
  ThoughtflowError
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
   * REQUIRES workflowId - tasks must belong to exactly one workflow
   */
  promoteThoughtToTasks(params: PromoteThoughtToTasksParams): PromoteThoughtToTasksResult {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    validateRequiredString(params.workflowId, 'workflowId');
    
    const tree = this.totService.getTreeFull(params.treeId);
    if (!tree) {
      throw new TreeNotFoundError(params.treeId);
    }
    
    const thought = tree.thoughts.get(params.thoughtId);
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }
    
    // Check if already promoted to this workflow (idempotency)
    const cognitiveMeta = thought.metadata?.cognitive as CognitiveMetadata;
    if (cognitiveMeta?.promotedToTaskIds && cognitiveMeta.promotedToTaskIds.length > 0 && cognitiveMeta.workflowId === params.workflowId) {
      logger.info(`Thought ${params.thoughtId} already promoted to tasks in workflow ${params.workflowId}`);
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
    
    // Create tasks for each thought using taskService (requires workflowId)
    for (const thoughtToPromote of thoughtsToPromote) {
      const taskName = `${taskNamePrefix}${thoughtToPromote.content}`;
      
      const newTask = this.taskService.createTask({
        name: taskName,
        description: thoughtToPromote.content,
        dependencies: [],
        workflowId: params.workflowId, // Mandatory
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
      thoughtCognitive.workflowId = params.workflowId;
      
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
    
    // Update tree timestamp
    tree.updatedAt = now;
    this.triggerSave();
    
    logger.info(`Promoted ${thoughtsToPromote.length} thoughts to ${taskIds.length} tasks in workflow ${params.workflowId}`);

    // After successful promotion, mark thoughts as selected/verified
    // Skip evaluation gate if requested for simple workflows
    this.markThoughtsAsPromoted(tree, thoughtsToPromote, taskIds, now, params.skipEvaluationGate);

    return {
      taskIds,
      workflowId: params.workflowId,
      thoughtsPromoted: thoughtsToPromote.length,
      hierarchyPreserved: !flattenHierarchy
    };
  }

  /**
   * Mark thoughts as selected and verified after promotion
   * This ensures promoted thoughts are no longer in pending state
   */
  private markThoughtsAsPromoted(
    tree: Tree,
    thoughtsToPromote: Thought[],
    promotedTaskIds: string[],
    promotedAt: string,
    skipEvaluationGate: boolean = false
  ): void {
    for (const thoughtToPromote of thoughtsToPromote) {
      // Auto-evaluate if no score exists and not skipping gate
      if (!skipEvaluationGate && thoughtToPromote.evaluation === null) {
        thoughtToPromote.evaluation = 88; // High default score (85-90 range)
        thoughtToPromote.state = 'evaluated';
        thoughtToPromote.metadata = thoughtToPromote.metadata || {};
        thoughtToPromote.metadata.evaluationReasoning = 'Thought promoted to executable tasks via Cognitive Bridge';
        logger.info(`Thought ${thoughtToPromote.id} auto-evaluated with score 88 during promotion`);
      }

      // Change state to selected (bypassing child evaluation check for promoted thoughts)
      thoughtToPromote.state = 'selected';

      // Mark as verified
      thoughtToPromote.verified = true;
      thoughtToPromote.verificationNotes = 'Promoted to tasks. Full provenance stored in task.metadata.cognitive and cognitiveLinks.';

      // Update cognitive metadata with promotion details
      this.preserveCognitiveMetadata(thoughtToPromote);
      thoughtToPromote.metadata = thoughtToPromote.metadata || {};
      thoughtToPromote.metadata.cognitive = thoughtToPromote.metadata.cognitive || {};
      const thoughtCognitive = thoughtToPromote.metadata.cognitive as CognitiveMetadata;
      thoughtCognitive.promotedAt = promotedAt;
      thoughtCognitive.promotedToTaskIds = promotedTaskIds;
      thoughtCognitive.promotionReason = 'Thought promoted to executable tasks via Cognitive Bridge';
      
      logger.info(`Thought ${thoughtToPromote.id} promoted to tasks → state changed to selected + verified`);
    }
    
    // Update tree timestamp to ensure changes are visible immediately
    tree.updatedAt = promotedAt;
    this.triggerSave();
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

    if (!task.strategyId) {
      throw new ThoughtflowError(`Task '${params.taskId}' does not have a strategyId. Cannot spawn tree without strategy context.`, 'TASK_NO_STRATEGY');
    }

    const now = new Date().toISOString();

    // Create tree using totService with strategyId from task
    const tree = this.totService.createTree({
      goal: params.goal,
      rootContent: params.rootContent,
      maxDepth: params.maxDepth,
      strategyId: task.strategyId, // Use task's denormalized strategyId
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
  getCognitiveProvenance(id: string, type: 'thought' | 'task', maxDepth: number = 5, includeDeleted: boolean = false): any {
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
      const tree = this.totService.getAllTrees(includeDeleted).find(t => t.thoughts.has(id));
      if (tree) {
        const thought = tree.thoughts.get(id);
        if (thought && (!this.isDeleted(thought) || includeDeleted)) {
          result.data = thought;
          result.cognitiveMetadata = result.data?.metadata?.cognitive;
          // Include provenance chain from metadata
          if (result.cognitiveMetadata?.provenanceChain) {
            result.provenanceChain = result.cognitiveMetadata.provenanceChain;
          }
        }
      }
    } else {
      try {
        result.data = this.taskService.getTask(id, includeDeleted);
        result.cognitiveMetadata = result.data?.metadata?.cognitive;
        // Include provenance chain from metadata
        if (result.cognitiveMetadata?.provenanceChain) {
          result.provenanceChain = result.cognitiveMetadata.provenanceChain;
        }
      } catch (e) {
        // Task not found or deleted
        if (!includeDeleted) {
          result.data = null;
        }
      }
    }
    
    // Traverse related entries via cognitiveLinks
    this.traverseCognitiveLinks(id, type, visited, result.relatedEntries, 0, maxDepth, includeDeleted);
    
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
    const existingIds = new Set(this.state.cognitiveLinks.keys());
    const id = this.generateSlugId(link.type, existingIds);
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
    maxDepth: number,
    includeDeleted: boolean = false
  ): void {
    if (depth >= maxDepth || visited.has(currentId)) {
      return;
    }
    
    visited.add(currentId);
    
    // Find all links from this entity (supports one-to-many)
    for (const link of this.state.cognitiveLinks.values()) {
      if (link.fromId === currentId && link.fromType === currentType) {
        // Skip deleted links unless includeDeleted is true
        if (!includeDeleted && this.isDeleted(link)) {
          continue;
        }
        
        const relatedData = link.toType === 'thought' 
          ? this.getThoughtData(link.toId, includeDeleted)
          : (() => {
              try {
                return this.taskService.getTask(link.toId, includeDeleted);
              } catch (e) {
                return null;
              }
            })();
        
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
          this.traverseCognitiveLinks(link.toId, link.toType, visited, results, depth + 1, maxDepth, includeDeleted);
        }
      }
    }
    
    // Also find reverse links (supports many-to-one)
    for (const link of this.state.cognitiveLinks.values()) {
      if (link.toId === currentId && link.toType === currentType) {
        // Skip deleted links unless includeDeleted is true
        if (!includeDeleted && this.isDeleted(link)) {
          continue;
        }
        
        const relatedData = link.fromType === 'thought' 
          ? this.getThoughtData(link.fromId, includeDeleted)
          : (() => {
              try {
                return this.taskService.getTask(link.fromId, includeDeleted);
              } catch (e) {
                return null;
              }
            })();
        
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
          this.traverseCognitiveLinks(link.fromId, link.fromType, visited, results, depth + 1, maxDepth, includeDeleted);
        }
      }
    }
  }

  /**
   * Get thought data from any tree
   */
  private getThoughtData(thoughtId: string, includeDeleted: boolean = false): Thought | null {
    for (const tree of this.totService.getAllTrees(includeDeleted)) {
      const thought = tree.thoughts.get(thoughtId);
      if (thought && (!this.isDeleted(thought) || includeDeleted)) {
        return thought;
      }
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

  /**
   * Auto-evaluate linked thoughts when a task is completed
   * Called from TaskOrchestratorService when task status becomes 'completed'
   */
  autoEvaluateLinkedThoughts(taskId: string, defaultScore: number = 85): {
    evaluated: number;
    skipped: number;
    errors: number;
  } {
    const task = this.taskService.getTask(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    const linkedThoughtIds = task.metadata?.cognitive?.linkedThoughtIds as string[];
    if (!linkedThoughtIds || linkedThoughtIds.length === 0) {
      return { evaluated: 0, skipped: 0, errors: 0 };
    }

    let evaluated = 0;
    let skipped = 0;
    let errors = 0;

    for (const thoughtId of linkedThoughtIds) {
      try {
        // Find the thought in any tree
        const thought = this.getThoughtData(thoughtId);
        if (!thought) {
          skipped++;
          continue;
        }

        // Skip if already evaluated or not in pending state
        if (thought.state !== 'pending' || thought.evaluation !== null) {
          skipped++;
          continue;
        }

        // Evaluate the thought
        this.totService.evaluateThought({
          treeId: this.findTreeIdForThought(thoughtId),
          thoughtId,
          score: defaultScore,
          reasoning: `Auto-evaluated after linked task '${task.name}' was completed`
        });

        evaluated++;
      } catch (e) {
        logger.error(`Failed to auto-evaluate thought ${thoughtId}: ${e}`);
        errors++;
      }
    }

    logger.info(`Auto-evaluated ${evaluated} linked thoughts for task ${taskId} (skipped: ${skipped}, errors: ${errors})`);

    return { evaluated, skipped, errors };
  }

  /**
   * Find the tree ID for a given thought
   */
  private findTreeIdForThought(thoughtId: string): string {
    for (const tree of this.totService.getAllTrees()) {
      if (tree.thoughts.has(thoughtId)) {
        return tree.id;
      }
    }
    throw new ThoughtNotFoundError('unknown', thoughtId);
  }

  /**
   * Atomically complete a task and evaluate/verify all linked thoughts
   */
  completeTaskAndThought(params: {
    taskId: string;
    score?: number;
    verificationNotes?: string;
  }): {
    task: Task;
    thoughtResults: Array<{
      thoughtId: string;
      evaluated: boolean;
      verified: boolean;
      error?: string;
    }>;
  } {
    const { taskId, score = 85, verificationNotes } = params;

    // Mark task as completed
    const task = this.taskService.updateTask(taskId, { status: 'completed' });

    // Get linked thoughts
    const linkedThoughtIds = task.metadata?.cognitive?.linkedThoughtIds as string[];
    const thoughtResults: Array<{
      thoughtId: string;
      evaluated: boolean;
      verified: boolean;
      error?: string;
    }> = [];

    if (linkedThoughtIds && linkedThoughtIds.length > 0) {
      for (const thoughtId of linkedThoughtIds) {
        try {
          const thought = this.getThoughtData(thoughtId);
          if (!thought) {
            thoughtResults.push({ thoughtId, evaluated: false, verified: false, error: 'Thought not found' });
            continue;
          }

          const treeId = this.findTreeIdForThought(thoughtId);

          // Evaluate if pending
          if (thought.state === 'pending' && thought.evaluation === null) {
            this.totService.evaluateThought({
              treeId,
              thoughtId,
              score,
              reasoning: `Auto-evaluated after linked task '${task.name}' was completed via complete_task_and_thought`
            });
          }

          // Verify if verification notes provided
          if (verificationNotes) {
            this.totService.verifyThought({
              treeId,
              thoughtId,
              verificationNotes
            });
          }

          thoughtResults.push({ thoughtId, evaluated: true, verified: !!verificationNotes });
        } catch (e) {
          thoughtResults.push({ thoughtId, evaluated: false, verified: false, error: String(e) });
        }
      }
    }

    return { task, thoughtResults };
  }

  /**
   * Quick plan: single call to create strategy + workflow + tasks + root thought
   */
  quickPlan(params: {
    goal: string;
    tasks: Array<{
      name: string;
      description?: string;
      dependencies?: string[];
      parentTaskId?: string;
      order?: number;
      status?: Task['status'];
      metadata?: Record<string, any>;
    }>;
    strategyName?: string;
    workflowName?: string;
  }): {
    strategyId: string;
    workflowId: string;
    taskIds: string[];
    treeId: string;
    rootThoughtId: string;
  } {
    const { goal, tasks, strategyName, workflowName } = params;

    // Create or get strategy (createStrategy handles normalization internally)
    const strategy = this.taskService.createStrategy({
      name: strategyName || goal,
      description: `Strategy for: ${goal}`
    });

    // Create workflow (createWorkflow handles normalization internally)
    const workflow = this.taskService.createWorkflow({
      name: workflowName || goal,
      description: `Workflow for: ${goal}`,
      taskIds: [],
      strategyId: strategy.id
    });

    // Create tasks
    const taskResult = this.taskService.createTasks({
      tasks,
      workflowId: workflow.id,
      strategyId: strategy.id
    });

    // Create tree with root thought
    const tree = this.totService.createTree({
      goal,
      rootContent: `Implementation plan for: ${goal}`,
      strategyId: strategy.id
    });

    return {
      strategyId: strategy.id,
      workflowId: workflow.id,
      taskIds: taskResult.tasks.map(t => t.id),
      treeId: tree.id,
      rootThoughtId: tree.rootId
    };
  }

  /**
   * Sync workflow thoughts - evaluate pending linked thoughts for all completed tasks
   */
  syncWorkflowThoughts(params: {
    workflowId: string;
  }): {
    synced: number;
    alreadySynced: number;
    skipped: number;
    details: Array<{
      taskId: string;
      taskName: string;
      thoughtId: string;
      action: 'evaluated' | 'skipped' | 'error';
      reason?: string;
    }>;
  } {
    const { workflowId } = params;

    // Get workflow
    const workflow = this.taskService.getWorkflow(workflowId);
    if (!workflow) {
      throw new ThoughtflowError(`Workflow '${workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    let synced = 0;
    let alreadySynced = 0;
    let skipped = 0;
    const details: Array<{
      taskId: string;
      taskName: string;
      thoughtId: string;
      action: 'evaluated' | 'skipped' | 'error';
      reason?: string;
    }> = [];

    // Iterate through all tasks in the workflow
    for (const taskId of workflow.taskIds) {
      const task = this.taskService.getTask(taskId);
      if (!task) continue;

      // Only process completed tasks
      if (task.status !== 'completed') {
        skipped++;
        continue;
      }

      const linkedThoughtIds = task.metadata?.cognitive?.linkedThoughtIds as string[];
      if (!linkedThoughtIds || linkedThoughtIds.length === 0) {
        continue;
      }

      // Evaluate each linked thought
      for (const thoughtId of linkedThoughtIds) {
        try {
          const thought = this.getThoughtData(thoughtId);
          if (!thought) {
            details.push({
              taskId,
              taskName: task.name,
              thoughtId,
              action: 'skipped',
              reason: 'Thought not found'
            });
            skipped++;
            continue;
          }

          // Skip if already evaluated
          if (thought.state !== 'pending' || thought.evaluation !== null) {
            details.push({
              taskId,
              taskName: task.name,
              thoughtId,
              action: 'skipped',
              reason: 'Already evaluated'
            });
            alreadySynced++;
            continue;
          }

          // Evaluate the thought
          const treeId = this.findTreeIdForThought(thoughtId);
          this.totService.evaluateThought({
            treeId,
            thoughtId,
            score: 85,
            reasoning: `Auto-evaluated via sync_workflow_thoughts for completed task '${task.name}'`
          });

          details.push({
            taskId,
            taskName: task.name,
            thoughtId,
            action: 'evaluated'
          });
          synced++;
        } catch (e) {
          details.push({
            taskId,
            taskName: task.name,
            thoughtId,
            action: 'error',
            reason: String(e)
          });
          skipped++;
        }
      }
    }

    logger.info(`Sync workflow ${workflowId}: ${synced} evaluated, ${alreadySynced} already synced, ${skipped} skipped`);

    return { synced, alreadySynced, skipped, details };
  }
}
