import { v4 as uuidv4 } from 'uuid';
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
    metadata?: Record<string, any>;
  }): Task {
    validateRequiredString(task.name, 'name');
    
    const id = uuidv4();
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
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      metadata: task.metadata
    };
    
    this.state.tasks.set(id, newTask);
    this.triggerSave();
    logger.info(`Created task: ${id} - ${task.name}`);
    return newTask;
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
   */
  listTasks(status?: Task['status']): Task[] {
    const allTasks = Array.from(this.state.tasks.values());
    if (status) {
      return allTasks.filter(task => task.status === status);
    }
    return allTasks;
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
      task.metadata = updates.metadata;
    }
    
    task.updatedAt = now;
    this.state.tasks.set(id, task);
    this.triggerSave();
    return task;
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
    metadata?: Record<string, any>;
  }): Workflow {
    validateRequiredString(workflow.name, 'name');
    
    const id = uuidv4();
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
      metadata: workflow.metadata
    };
    
    this.state.workflows.set(id, newWorkflow);
    this.triggerSave();
    logger.info(`Created workflow: ${id} - ${workflow.name}`);
    return newWorkflow;
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
   * Create a strategy
   */
  createStrategy(strategy: {
    name: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Strategy {
    validateRequiredString(strategy.name, 'name');
    
    const id = uuidv4();
    const now = new Date().toISOString();
    
    const newStrategy: Strategy = {
      id,
      name: strategy.name,
      description: strategy.description,
      status: 'active',
      treeIds: [],
      createdAt: now,
      updatedAt: now,
      metadata: strategy.metadata
    };
    
    this.state.strategies.set(id, newStrategy);
    this.triggerSave();
    logger.info(`Created strategy: ${id} - ${strategy.name}`);
    return newStrategy;
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
    return strategy;
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): Strategy[] {
    return Array.from(this.state.strategies.values());
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    this.state = {
      tasks: new Map(),
      workflows: new Map(),
      workflowRuns: new Map(),
      strategies: new Map(),
      trees: new Map(),
      cognitiveLinks: new Map()
    };
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
  startWorkflowExecution(workflowId: string): { runId: string; readyTasks: Task[] } {
    validateId(workflowId, 'Workflow');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }

    // Create workflow run
    const runId = uuidv4();
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
    
    return { runId, readyTasks };
  }

  /**
   * Advance a workflow run after task completion
   * Finds newly ready tasks and returns workflow status
   */
  advanceWorkflowRun(runId: string): {
    completedTasks: Task[];
    failedTasks: Task[];
    newlyReadyTasks: Task[];
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
    
    return {
      completedTasks,
      failedTasks,
      newlyReadyTasks,
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

    // Update task
    const updatedTask: Task = {
      ...task,
      parentTaskId: options.newParentTaskId !== undefined 
        ? (options.newParentTaskId || undefined) 
        : task.parentTaskId,
      order: options.order !== undefined ? options.order : task.order,
      updatedAt: new Date().toISOString()
    };

    this.state.tasks.set(taskId, updatedTask);
    this.triggerSave();
    logger.info(`Moved task: ${taskId}`);
    
    return updatedTask;
  }
}
