import type {
  Task,
  Workflow,
  Strategy
} from '../types/index.js';
import type { IStorageAdapter } from '../storage/IStorageAdapter.js';
import {
  TaskNotFoundError,
  WorkflowNotFoundError,
  ThoughtflowError
} from '../types/index.js';
import { BaseService } from './BaseService.js';
import { logger } from '../utils/logger.js';
import { validateRequiredString, validateId } from '../utils/validators.js';

/**
 * LLM instruction for Strategy usage
 * Provides guidance to the LLM on how to use Strategies correctly
 */
const STRATEGY_LLM_INSTRUCTION = `Strategy Usage Rules:
- One Strategy = one cohesive goal/project area.
- Use create_strategy as get-or-create (idempotent by normalized name).
- Add Trees for divergent reasoning/exploration.
- Add Workflows for convergent execution with tasks.
- Promote promising thoughts to tasks. If a task blocks, spawn new Tree from it.
- Maintain strict isolation: do not mix tasks or workflows across different Strategies.
- Use Cognitive Bridge for provenance (link/promote/spawn).`;

/**
 * TaskOrchestratorService manages task execution with dependency tracking
 */
export class TaskOrchestratorService extends BaseService {
  constructor(storageAdapter: IStorageAdapter) {
    super(storageAdapter, 'TaskOrchestratorService');
  }

  /**
   * Create a new task
   */
  createTask(task: {
    name: string;
    description?: string;
    dependencies?: string[];
    parentTaskId?: string;
    order?: number;
    status?: Task['status'];
    strategyId?: string;
    metadata?: Record<string, any>;
  }): Task {
    validateRequiredString(task.name, 'name');
    
    const id = this.generateId(task.name);
    const now = new Date().toISOString();
    
    // Validate parent task exists
    if (task.parentTaskId) {
      if (!this.state.tasks.has(task.parentTaskId)) {
        throw new TaskNotFoundError(task.parentTaskId);
      }
    }
    
    // Validate dependencies exist
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        if (!this.state.tasks.has(depId)) {
          throw new ThoughtflowError(`Dependency task '${depId}' not found`, 'DEPENDENCY_NOT_FOUND');
        }
      }
    }
    
    const newTask: Task = {
      id,
      name: task.name,
      description: task.description,
      dependencies: task.dependencies || [],
      parentTaskId: task.parentTaskId,
      order: task.order,
      status: task.status || 'pending',
      createdAt: now,
      updatedAt: now,
      strategyId: task.strategyId,
      metadata: task.metadata
    };
    
    this.state.tasks.set(id, newTask);
    this.triggerSave();
    logger.info(`Created task: ${id} - ${task.name}`);
    // Return minimal summary
    return { id, name: newTask.name, status: newTask.status } as Task;
  }

  /**
   * Get a task by ID
   */
  getTask(id: string): Task {
    validateId(id, 'Task');
    const task = this.state.tasks.get(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    return task;
  }

  /**
   * Get all tasks
   */
  getAllTasks(): Task[] {
    return Array.from(this.state.tasks.values());
  }

  /**
   * List tasks, optionally filtered by status
   * Returns minimal summaries for efficiency
   */
  listTasks(status?: Task['status']): Array<{ id: string; name: string; status: string }> {
    const allTasks = Array.from(this.state.tasks.values());
    const filtered = status ? allTasks.filter(task => task.status === status) : allTasks;
    return filtered.map(t => ({ id: t.id, name: t.name, status: t.status }));
  }

  /**
   * Update a task
   */
  updateTask(id: string, updates: {
    name?: string;
    description?: string;
    status?: Task['status'];
    dependencies?: string[];
    metadata?: Record<string, any>;
  }): Task {
    const task = this.getTask(id);
    const now = new Date().toISOString();
    
    if (updates.name !== undefined) {
      validateRequiredString(updates.name, 'name');
      task.name = updates.name;
    }
    if (updates.description !== undefined) {
      task.description = updates.description;
    }
    if (updates.status !== undefined) {
      task.status = updates.status;
      if (updates.status === 'completed') {
        task.completedAt = now;
      } else if (updates.status === 'failed') {
        task.failedAt = now;
      }
    }
    if (updates.dependencies !== undefined) {
      task.dependencies = updates.dependencies;
    }
    if (updates.metadata !== undefined) {
      // Preserve cognitive metadata when updating
      if (task.metadata?.cognitive && updates.metadata?.cognitive) {
        // Merge cognitive metadata, preserving existing fields
        const existingCognitive = task.metadata.cognitive;
        task.metadata = { ...updates.metadata, cognitive: { ...existingCognitive, ...updates.metadata.cognitive } };
      } else if (task.metadata?.cognitive && !updates.metadata?.cognitive) {
        // Keep existing cognitive metadata
        task.metadata = { ...updates.metadata, cognitive: task.metadata.cognitive };
      } else {
        task.metadata = updates.metadata;
      }
    }
    
    task.updatedAt = now;
    this.state.tasks.set(id, task);
    this.triggerSave();
    // Return minimal summary
    return { id, name: task.name, status: task.status } as Task;
  }

  /**
   * Delete a task
   */
  deleteTask(id: string): boolean {
    validateId(id, 'Task');
    const deleted = this.state.tasks.delete(id);
    if (deleted) {
      this.triggerSave();
      logger.info(`Deleted task: ${id}`);
    }
    return deleted;
  }

  /**
   * Create a workflow
   */
  createWorkflow(workflow: {
    name: string;
    description?: string;
    taskIds: string[];
    strategyId?: string;
    metadata?: Record<string, any>;
  }): Workflow {
    validateRequiredString(workflow.name, 'name');
    
    const id = this.generateId(workflow.name);
    const now = new Date().toISOString();
    
    // Validate all tasks exist
    for (const taskId of workflow.taskIds) {
      if (!this.state.tasks.has(taskId)) {
        throw new TaskNotFoundError(taskId);
      }
    }
    
    const newWorkflow: Workflow = {
      id,
      name: workflow.name,
      description: workflow.description,
      taskIds: workflow.taskIds,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      strategyId: workflow.strategyId,
      metadata: workflow.metadata
    };
    
    this.state.workflows.set(id, newWorkflow);
    this.triggerSave();
    logger.info(`Created workflow: ${id} - ${workflow.name}`);
    // Return minimal summary
    return { id, name: newWorkflow.name, status: newWorkflow.status } as Workflow;
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(id: string): Workflow {
    validateId(id, 'Workflow');
    const workflow = this.state.workflows.get(id);
    if (!workflow) {
      throw new WorkflowNotFoundError(id);
    }
    return workflow;
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(): Workflow[] {
    return Array.from(this.state.workflows.values());
  }

  /**
   * List all workflows (alias for getAllWorkflows for tool handler compatibility)
   * Tool handlers expect this name
   * Returns minimal summaries for efficiency
   */
  listWorkflows(): Array<{ id: string; name: string; status: string; taskCount: number }> {
    return Array.from(this.state.workflows.values()).map(w => ({
      id: w.id,
      name: w.name,
      status: w.status,
      taskCount: w.taskIds.length
    }));
  }

  /**
   * Delete a workflow
   */
  deleteWorkflow(id: string): boolean {
    validateId(id, 'Workflow');
    const deleted = this.state.workflows.delete(id);
    if (deleted) {
      this.triggerSave();
      logger.info(`Deleted workflow: ${id}`);
    }
    return deleted;
  }

  /**
   * Add tasks to a workflow
   */
  addTasksToWorkflow(workflowId: string, taskIds: string[]): void {
    validateId(workflowId, 'Workflow');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    
    // Strategy isolation guardrail
    if (workflow.strategyId) {
      for (const taskId of taskIds) {
        const task = this.state.tasks.get(taskId);
        if (task && task.strategyId && task.strategyId !== workflow.strategyId) {
          throw new ThoughtflowError(
            `Cannot add task '${taskId}' from strategy '${task.strategyId}' to workflow '${workflowId}' belonging to strategy '${workflow.strategyId}'. Cross-strategy task sharing is not allowed.`,
            'CROSS_STRATEGY_ISOLATION_VIOLATION'
          );
        }
      }
    }
    
    // Add task IDs, avoiding duplicates
    for (const taskId of taskIds) {
      if (!workflow.taskIds.includes(taskId)) {
        workflow.taskIds.push(taskId);
      }
    }
    
    workflow.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    logger.info(`Added ${taskIds.length} tasks to workflow: ${workflowId}`);
  }

  /**
   * Add LLM_instruction to a Strategy object for return to LLM
   */
  private enrichStrategyWithLLMInstruction(strategy: Strategy): Strategy {
    return {
      ...strategy,
      LLM_instruction: STRATEGY_LLM_INSTRUCTION
    };
  }

  /**
   * Create a strategy (idempotent get-or-create by normalized name)
   */
  createStrategy(strategy: {
    name: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Strategy {
    validateRequiredString(strategy.name, 'name');

    // Normalize the name for comparison and use as ID
    const normalizedName = this.normalizeKey(strategy.name);

    // Check if strategy with same normalized name already exists
    for (const [id, existingStrategy] of this.state.strategies) {
      if (this.normalizeKey(existingStrategy.name) === normalizedName) {
        // Update timestamp to reflect access
        existingStrategy.updatedAt = new Date().toISOString();
        this.state.strategies.set(id, existingStrategy);
        this.triggerSave();
        logger.info(`Returning existing strategy (get-or-create): ${id} - ${existingStrategy.name} (normalized: ${normalizedName})`);
        return this.enrichStrategyWithLLMInstruction(existingStrategy);
      }
    }

    // Use normalized name as ID since strategies should be unique by name
    const id = normalizedName;
    const now = new Date().toISOString();

    const newStrategy: Strategy = {
      id,
      name: strategy.name,
      description: strategy.description,
      status: 'active',
      treeIds: [],
      workflowIds: [],
      createdAt: now,
      updatedAt: now,
      metadata: strategy.metadata
    };

    this.state.strategies.set(id, newStrategy);
    this.triggerSave();
    logger.info(`Created new strategy: ${id} - ${strategy.name} (normalized: ${normalizedName})`);
    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id, name: newStrategy.name, status: newStrategy.status } as Strategy);
  }

  /**
   * Get a strategy by ID
   */
  getStrategy(id: string): Strategy {
    validateId(id, 'Strategy');
    const strategy = this.state.strategies.get(id);
    if (!strategy) {
      throw new ThoughtflowError(`Strategy '${id}' not found`, 'STRATEGY_NOT_FOUND');
    }
    return this.enrichStrategyWithLLMInstruction(strategy);
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): Strategy[] {
    return Array.from(this.state.strategies.values()).map(s => this.enrichStrategyWithLLMInstruction(s));
  }

  /**
   * Deduplicate strategies by normalized name.
   * Keeps the first occurrence of each unique normalized name and removes duplicates.
   * Returns the number of duplicates removed.
   * Also cleans up orphaned workflow/tree references from deleted strategies.
   */
  deduplicateStrategies(): number {
    const seen = new Map<string, string>(); // normalized name -> strategy id
    const toDelete: string[] = [];

    for (const [id, strategy] of this.state.strategies) {
      const normalizedName = this.normalizeKey(strategy.name);
      if (seen.has(normalizedName)) {
        toDelete.push(id);
        logger.info(`Marking duplicate strategy for deletion: ${id} - ${strategy.name} (normalized: ${normalizedName})`);
      } else {
        seen.set(normalizedName, id);
      }
    }

    // Delete duplicates and clean up references
    for (const id of toDelete) {
      const strategy = this.state.strategies.get(id);
      if (strategy) {
        // Clear strategyId from linked workflows
        for (const workflowId of strategy.workflowIds) {
          const workflow = this.state.workflows.get(workflowId);
          if (workflow) {
            workflow.strategyId = undefined;
            this.state.workflows.set(workflowId, workflow);
          }
        }
        // Clear strategyId from linked trees
        for (const treeId of strategy.treeIds) {
          const tree = this.state.trees.get(treeId);
          if (tree) {
            tree.strategyId = undefined;
            this.state.trees.set(treeId, tree);
          }
        }
      }
      this.state.strategies.delete(id);
    }

    if (toDelete.length > 0) {
      this.triggerSave();
      logger.info(`Deduplicated strategies: removed ${toDelete.length} duplicates`);
    }

    return toDelete.length;
  }

  /**
   * Add a tree to a strategy
   */
  addTreeToStrategy(strategyId: string, treeId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(treeId, 'Tree');
    
    const strategy = this.getStrategy(strategyId);
    const tree = this.state.trees.get(treeId);
    
    if (!tree) {
      throw new ThoughtflowError(`Tree '${treeId}' not found`, 'TREE_NOT_FOUND');
    }
    
    // Propagate strategyId to tree
    if (tree.strategyId && tree.strategyId !== strategyId) {
      throw new ThoughtflowError(
        `Tree '${treeId}' already belongs to strategy '${tree.strategyId}'. Cannot add to different strategy '${strategyId}'.`,
        'TREE_ALREADY_OWNED'
      );
    }
    
    tree.strategyId = strategyId;
    this.state.trees.set(treeId, tree);
    
    if (!strategy.treeIds.includes(treeId)) {
      strategy.treeIds.push(treeId);
      strategy.updatedAt = new Date().toISOString();
      this.triggerSave();
      logger.info(`Added tree ${treeId} to strategy ${strategyId}`);
    }

    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id: strategyId, name: strategy.name, status: strategy.status } as Strategy);
  }

  /**
   * Remove a tree from a strategy
   */
  removeTreeFromStrategy(strategyId: string, treeId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(treeId, 'Tree');
    
    const strategy = this.getStrategy(strategyId);
    const tree = this.state.trees.get(treeId);
    
    if (tree) {
      // Clear strategyId from tree (unlink only, do not delete)
      tree.strategyId = undefined;
      this.state.trees.set(treeId, tree);
    }
    
    const index = strategy.treeIds.indexOf(treeId);
    
    if (index > -1) {
      strategy.treeIds.splice(index, 1);
      strategy.updatedAt = new Date().toISOString();
      this.triggerSave();
      logger.info(`Removed tree ${treeId} from strategy ${strategyId} (unlinked, not deleted)`);
    }

    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id: strategyId, name: strategy.name, status: strategy.status } as Strategy);
  }

  /**
   * Add a workflow to a strategy
   */
  addWorkflowToStrategy(strategyId: string, workflowId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(workflowId, 'Workflow');
    
    const strategy = this.getStrategy(strategyId);
    const workflow = this.state.workflows.get(workflowId);
    
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    
    // Propagate strategyId to workflow
    if (workflow.strategyId && workflow.strategyId !== strategyId) {
      throw new ThoughtflowError(
        `Workflow '${workflowId}' already belongs to strategy '${workflow.strategyId}'. Cannot add to different strategy '${strategyId}'.`,
        'WORKFLOW_ALREADY_OWNED'
      );
    }
    
    workflow.strategyId = strategyId;
    this.state.workflows.set(workflowId, workflow);
    
    // Propagate strategyId to all tasks in the workflow
    for (const taskId of workflow.taskIds) {
      const task = this.state.tasks.get(taskId);
      if (task) {
        if (task.strategyId && task.strategyId !== strategyId) {
          throw new ThoughtflowError(
            `Task '${taskId}' already belongs to strategy '${task.strategyId}'. Cannot reassign to strategy '${strategyId}' via workflow '${workflowId}'.`,
            'TASK_ALREADY_OWNED'
          );
        }
        task.strategyId = strategyId;
        this.state.tasks.set(taskId, task);
      }
    }
    
    if (!strategy.workflowIds.includes(workflowId)) {
      strategy.workflowIds.push(workflowId);
      strategy.updatedAt = new Date().toISOString();
      this.triggerSave();
      logger.info(`Added workflow ${workflowId} to strategy ${strategyId}`);
    }

    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id: strategyId, name: strategy.name, status: strategy.status } as Strategy);
  }

  /**
   * Remove a workflow from a strategy
   */
  removeWorkflowFromStrategy(strategyId: string, workflowId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(workflowId, 'Workflow');
    
    const strategy = this.getStrategy(strategyId);
    const workflow = this.state.workflows.get(workflowId);
    
    if (workflow) {
      // Clear strategyId from workflow (unlink only, do not delete)
      workflow.strategyId = undefined;
      this.state.workflows.set(workflowId, workflow);
      
      // Also clear strategyId from tasks in the workflow (optional, but keeps consistency)
      for (const taskId of workflow.taskIds) {
        const task = this.state.tasks.get(taskId);
        if (task) {
          task.strategyId = undefined;
          this.state.tasks.set(taskId, task);
        }
      }
    }
    
    const index = strategy.workflowIds.indexOf(workflowId);
    
    if (index > -1) {
      strategy.workflowIds.splice(index, 1);
      strategy.updatedAt = new Date().toISOString();
      this.triggerSave();
      logger.info(`Removed workflow ${workflowId} from strategy ${strategyId} (unlinked, not deleted)`);
    }

    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id: strategyId, name: strategy.name, status: strategy.status } as Strategy);
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    // Clear the shared state object instead of creating a new one
    this.state.tasks.clear();
    this.state.workflows.clear();
    this.state.workflowRuns.clear();
    this.state.strategies.clear();
    this.state.trees.clear();
    this.state.cognitiveLinks.clear();
    await this.storageAdapter.clear();
    logger.info('Cleared all data');
  }

  // ============================================================================
  // Workflow Execution Engine
  // ============================================================================

  /**
   * Start execution of a workflow
   * Creates a workflow run and marks initially ready tasks as in_progress
   */
  startWorkflowExecution(workflowId: string): { runId: string; readyTasks: Array<{ id: string; name: string; status: string }> } {
    validateId(workflowId, 'Workflow');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }

    // Create workflow run
    const runId = this.generateId(`run-${workflow.name}`);
    const now = new Date().toISOString();
    
    const workflowRun = {
      id: runId,
      workflowId,
      status: 'in_progress' as const,
      startedAt: now,
      taskExecutionOrder: [...workflow.taskIds]
    };
    
    this.state.workflowRuns.set(runId, workflowRun);
    
    // Find and mark initially ready tasks as in_progress
    const readyTasks = this.getReadyTasks(workflowId);
    readyTasks.forEach(task => {
      const updatedTask = { ...task, status: 'in_progress' as const, startedAt: now };
      this.state.tasks.set(task.id, updatedTask);
    });
    
    this.triggerSave();
    logger.info(`Started workflow execution: ${runId} for workflow: ${workflowId}`);
    
    // Return minimal task summaries
    const readyTaskSummaries = readyTasks.map(t => ({ id: t.id, name: t.name, status: t.status }));
    return { runId, readyTasks: readyTaskSummaries };
  }

  /**
   * Advance a workflow run after task completion
   * Finds newly ready tasks and returns workflow status
   */
  advanceWorkflowRun(runId: string): {
    completedTasks: Array<{ id: string; name: string; status: string }>;
    failedTasks: Array<{ id: string; name: string; status: string }>;
    newlyReadyTasks: Array<{ id: string; name: string; status: string }>;
    workflowStatus: 'in_progress' | 'completed' | 'failed';
  } {
    validateId(runId, 'WorkflowRun');
    
    const workflowRun = this.state.workflowRuns.get(runId);
    if (!workflowRun) {
      throw new ThoughtflowError(`Workflow run '${runId}' not found`, 'WORKFLOW_RUN_NOT_FOUND');
    }

    const workflow = this.state.workflows.get(workflowRun.workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowRun.workflowId);
    }

    // Get all tasks in the workflow
    const workflowTasks = workflow.taskIds
      .map(id => this.state.tasks.get(id))
      .filter((t): t is Task => t !== undefined);

    // Find completed and failed tasks
    const completedTasks = workflowTasks.filter(t => t.status === 'completed');
    const failedTasks = workflowTasks.filter(t => t.status === 'failed');
    const inProgressTasks = workflowTasks.filter(t => t.status === 'in_progress');
    const pendingTasks = workflowTasks.filter(t => t.status === 'pending');

    // Find newly ready tasks (pending tasks with all dependencies completed)
    const newlyReadyTasks = pendingTasks.filter(task => {
      const deps = task.dependencies || [];
      return deps.every(depId => {
        const depTask = this.state.tasks.get(depId);
        return depTask && depTask.status === 'completed';
      });
    });

    // Mark newly ready tasks as in_progress
    const now = new Date().toISOString();
    newlyReadyTasks.forEach(task => {
      const updatedTask = { ...task, status: 'in_progress' as const, startedAt: now };
      this.state.tasks.set(task.id, updatedTask);
    });

    // Determine workflow status
    let workflowStatus: 'in_progress' | 'completed' | 'failed' = 'in_progress';
    
    if (failedTasks.length > 0) {
      workflowStatus = 'failed';
    } else if (inProgressTasks.length === 0 && pendingTasks.length === 0) {
      workflowStatus = 'completed';
      workflowRun.completedAt = now;
      workflowRun.status = 'completed';
    }

    this.state.workflowRuns.set(runId, workflowRun);
    this.triggerSave();
    
    logger.info(`Advanced workflow run: ${runId}, status: ${workflowStatus}`);
    
    // Return minimal task summaries
    const completedTaskSummaries = completedTasks.map(t => ({ id: t.id, name: t.name, status: t.status }));
    const failedTaskSummaries = failedTasks.map(t => ({ id: t.id, name: t.name, status: t.status }));
    const newlyReadyTaskSummaries = newlyReadyTasks.map(t => ({ id: t.id, name: t.name, status: t.status }));
    
    return {
      completedTasks: completedTaskSummaries,
      failedTasks: failedTaskSummaries,
      newlyReadyTasks: newlyReadyTaskSummaries,
      workflowStatus
    };
  }

  /**
   * Get tasks that are ready to execute (all dependencies completed)
   */
  getReadyTasks(workflowId: string): Task[] {
    validateId(workflowId, 'Workflow');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }

    return workflow.taskIds
      .map(id => this.state.tasks.get(id))
      .filter((t): t is Task => t !== undefined)
      .filter(task => {
        if (task.status !== 'pending') {
          return false;
        }
        const deps = task.dependencies || [];
        return deps.every(depId => {
          const depTask = this.state.tasks.get(depId);
          return depTask && depTask.status === 'completed';
        });
      });
  }

  /**
   * Get a workflow run by ID
   */
  getWorkflowRun(runId: string) {
    validateId(runId, 'WorkflowRun');
    const run = this.state.workflowRuns.get(runId);
    if (!run) {
      throw new ThoughtflowError(`Workflow run '${runId}' not found`, 'WORKFLOW_RUN_NOT_FOUND');
    }
    return run;
  }

  /**
   * List all workflow runs
   */
  listWorkflowRuns() {
    return Array.from(this.state.workflowRuns.values());
  }

  /**
   * Delete a workflow run
   */
  deleteWorkflowRun(runId: string): boolean {
    validateId(runId, 'WorkflowRun');
    const deleted = this.state.workflowRuns.delete(runId);
    if (deleted) {
      this.triggerSave();
      logger.info(`Deleted workflow run: ${runId}`);
    }
    return deleted;
  }

  // ============================================================================
  // Task Hierarchy Support
  // ============================================================================

  /**
   * Get all subtasks of a parent task
   */
  getSubtasks(parentTaskId: string): Task[] {
    validateId(parentTaskId, 'Task');
    
    if (!this.state.tasks.has(parentTaskId)) {
      throw new TaskNotFoundError(parentTaskId);
    }

    return Array.from(this.state.tasks.values())
      .filter(task => task.parentTaskId === parentTaskId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  /**
   * Move a task to a new parent or change its order
   */
  moveTask(taskId: string, options: {
    newParentTaskId?: string | null;
    order?: number;
  }): Task {
    validateId(taskId, 'Task');
    
    const task = this.state.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    // Validate new parent exists if provided
    if (options.newParentTaskId !== undefined && options.newParentTaskId !== null) {
      if (!this.state.tasks.has(options.newParentTaskId)) {
        throw new TaskNotFoundError(options.newParentTaskId);
      }
    }

    // Preserve cognitive metadata during move
    const preservedCognitive = task.metadata?.cognitive;

    // Update task
    const updatedTask: Task = {
      ...task,
      parentTaskId: options.newParentTaskId !== undefined 
        ? (options.newParentTaskId || undefined) 
        : task.parentTaskId,
      order: options.order !== undefined ? options.order : task.order,
      updatedAt: new Date().toISOString(),
      metadata: {
        ...task.metadata,
        cognitive: preservedCognitive
      }
    };

    this.state.tasks.set(taskId, updatedTask);
    this.triggerSave();
    logger.info(`Moved task: ${taskId} (cognitive metadata preserved)`);
    
    // Return minimal summary
    return { id: taskId, name: updatedTask.name, status: updatedTask.status } as Task;
  }
}
