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
- Add Trees for divergent reasoning/exploration. Create or use an existing Tree before adding ideas.
- Add Workflows for convergent execution with tasks. Create or use an existing workflow before creating tasks.
- CRITICAL: When creating MULTIPLE related tasks or ideas, ALWAYS use batch tools:
  * Use create_tasks (not create_task) for tasks - supports positional refs (task-1, task-2) for dependencies/parentTaskId
  * Use add_ideas (not add_idea) for thoughts - supports positional refs (idea-1, idea-2) for parentId
  * Single-item tools (create_task, add_idea) are NOT available.
  * Batch tools return an idMap mapping positional refs to real IDs for later reference.
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
   * Get guidance for resolving task references
   */
  private getTaskReferenceGuidance(): string {
    return " Tip: Use positional refs like 'task-1' for tasks in the same batch, or the actual task ID. Name-based resolution is supported.";
  }

  /**
   * Create a new task
   * REQUIRES workflowId - task must belong to exactly one workflow
   */
  createTask(task: {
    name: string;
    description?: string;
    dependencies?: string[];
    parentTaskId?: string;
    order?: number;
    status?: Task['status'];
    workflowId: string; // Mandatory
    metadata?: Record<string, any>;
  }): Task {
    validateRequiredString(task.name, 'name');
    validateRequiredString(task.workflowId, 'workflowId');
    
    const existingIds = new Set(this.state.tasks.keys());
    const id = this.generateSlugId(task.name, existingIds);
    const now = new Date().toISOString();
    
    // Validate workflow exists
    const workflow = this.state.workflows.get(task.workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(task.workflowId);
    }
    
    // Validate parent task exists and is in same workflow
    if (task.parentTaskId) {
      const parentTask = this.state.tasks.get(task.parentTaskId);
      if (!parentTask) {
        throw new TaskNotFoundError(task.parentTaskId);
      }
      if (parentTask.workflowId !== task.workflowId) {
        throw new ThoughtflowError(
          `Parent task '${task.parentTaskId}' belongs to workflow '${parentTask.workflowId}', cannot create subtask in different workflow '${task.workflowId}'`,
          'WORKFLOW_BOUNDARY_VIOLATION'
        );
      }
    }
    
    // Validate dependencies exist and are in same workflow
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        const depTask = this.state.tasks.get(depId);
        if (!depTask) {
          throw new ThoughtflowError(`Dependency task '${depId}' not found`, 'DEPENDENCY_NOT_FOUND');
        }
        if (depTask.workflowId !== task.workflowId) {
          throw new ThoughtflowError(
            `Dependency task '${depId}' belongs to workflow '${depTask.workflowId}', cannot depend on task in different workflow '${task.workflowId}'`,
            'WORKFLOW_BOUNDARY_VIOLATION'
          );
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
      workflowId: task.workflowId,
      strategyId: workflow.strategyId, // Denormalize from workflow
      metadata: task.metadata
    };
    
    this.state.tasks.set(id, newTask);
    
    // Add task to workflow's taskIds
    if (!workflow.taskIds.includes(id)) {
      workflow.taskIds.push(id);
      workflow.updatedAt = now;
      this.state.workflows.set(task.workflowId, workflow);
    }
    
    this.triggerSave();
    logger.info(`Created task: ${id} - ${task.name} in workflow ${task.workflowId}`);
    // Return minimal summary
    return { id, name: newTask.name, status: newTask.status } as Task;
  }

  /**
   * Create multiple tasks in batch
   * Supports positional references (task-1, task-2, etc.) for dependencies and parentTaskId
   * Also supports name-based resolution
   * If workflowId is provided but the workflow does not exist, it will be automatically created
   * If workflowId is omitted, tasks will be created as standalone (no workflow association)
   * Returns enhanced response with tasks, idMap, and optional workflow creation info
   */
  createTasks(params: {
    tasks: Array<{
      name: string;
      description?: string;
      dependencies?: string[];
      parentTaskId?: string;
      order?: number;
      status?: Task['status'];
      metadata?: Record<string, any>;
    }>;
    workflowId?: string;
    deduplication?: 'skip' | 'error' | 'overwrite';
  }): { 
    tasks: Array<{ id: string; name: string; status: string }>; 
    idMap: Record<string, string>;
    workflowId?: string;
    workflowCreated?: boolean;
    message?: string;
  } {
    if (!params.tasks || params.tasks.length === 0) {
      throw new ThoughtflowError('Tasks array cannot be empty', 'INVALID_INPUT');
    }

    let workflow: Workflow | undefined;
    let workflowCreated = false;
    let message: string | undefined;

    // Handle workflowId scenarios
    if (params.workflowId) {
      // workflowId is provided - check if it exists
      workflow = this.state.workflows.get(params.workflowId);
      if (!workflow) {
        // Auto-create workflow
        const strategy = this.createStrategy({ name: params.workflowId });
        const createdWorkflow = this.createWorkflow({
          name: params.workflowId,
          description: `Auto-created workflow for tasks`,
          taskIds: [],
          strategyId: strategy.id
        });
        // Get the full workflow object from state (createWorkflow returns minimal summary)
        workflow = this.state.workflows.get(createdWorkflow.id);
        workflowCreated = true;
        message = `Workflow '${params.workflowId}' did not exist and was automatically created. The ${params.tasks.length} new tasks have been added to it. You can later use move_task to move any of these tasks to a different workflow, or rename the workflow if the name is not ideal.`;
      }
    }

    const deduplication = params.deduplication || 'skip';
    const idMap: Record<string, string> = {};
    const resultTasks: Array<{ id: string; name: string; status: string }> = [];
    const existingIds = new Set(this.state.tasks.keys());

    // First pass: create/update all tasks and build idMap
    for (let i = 0; i < params.tasks.length; i++) {
      const taskDef = params.tasks[i];
      const positionalRef = `task-${i + 1}`;
      
      validateRequiredString(taskDef.name, 'name');

      // Check for deduplication by normalized name (only if workflowId is provided)
      const normalizedName = this.normalizeKey(taskDef.name);
      let existingTaskId: string | null = null;
      
      if (params.workflowId) {
        for (const [id, task] of this.state.tasks) {
          if (this.normalizeKey(task.name) === normalizedName && task.workflowId === params.workflowId) {
            existingTaskId = id;
            break;
          }
        }
      }

      if (existingTaskId) {
        if (deduplication === 'error') {
          throw new ThoughtflowError(
            `Task with normalized name '${normalizedName}' already exists in workflow '${params.workflowId}'`,
            'DUPLICATE_TASK'
          );
        } else if (deduplication === 'skip') {
          idMap[positionalRef] = existingTaskId;
          const existingTask = this.state.tasks.get(existingTaskId);
          if (existingTask) {
            resultTasks.push({ id: existingTaskId, name: existingTask.name, status: existingTask.status });
          }
          continue;
        }
        // 'overwrite' - update existing task in-place
        const existingTask = this.state.tasks.get(existingTaskId);
        if (existingTask) {
          const now = new Date().toISOString();
          existingTask.name = taskDef.name;
          existingTask.description = taskDef.description;
          existingTask.order = taskDef.order;
          existingTask.status = taskDef.status || 'pending';
          existingTask.updatedAt = now;
          existingTask.metadata = taskDef.metadata;
          // Reset completion fields
          existingTask.completedAt = undefined;
          existingTask.failedAt = undefined;
          // Dependencies and parentTaskId will be resolved in second pass
          this.state.tasks.set(existingTaskId, existingTask);
          idMap[positionalRef] = existingTaskId;
          resultTasks.push({ id: existingTaskId, name: existingTask.name, status: existingTask.status });
          continue;
        }
      }

      // Create new task
      const id = this.generateSlugId(taskDef.name, existingIds);
      existingIds.add(id);
      idMap[positionalRef] = id;

      const now = new Date().toISOString();
      const newTask: Task = {
        id,
        name: taskDef.name,
        description: taskDef.description,
        dependencies: [], // Will resolve in second pass
        parentTaskId: undefined, // Will resolve in second pass
        order: taskDef.order,
        status: taskDef.status || 'pending',
        createdAt: now,
        updatedAt: now,
        workflowId: params.workflowId,
        strategyId: workflow?.strategyId,
        metadata: taskDef.metadata
      };

      this.state.tasks.set(id, newTask);
      
      // Add task to workflow's taskIds (only if workflow exists)
      if (workflow && !workflow.taskIds.includes(id)) {
        workflow.taskIds.push(id);
      }

      resultTasks.push({ id, name: newTask.name, status: newTask.status });
    }

    // Second pass: resolve positional references and name-based references
    for (let i = 0; i < params.tasks.length; i++) {
      const taskDef = params.tasks[i];
      const positionalRef = `task-${i + 1}`;
      const realId = idMap[positionalRef];
      
      if (!realId) continue; // Should not happen with current logic

      const task = this.state.tasks.get(realId);
      if (!task) continue;

      // Resolve dependencies (only if workflowId is provided)
      if (params.workflowId && taskDef.dependencies && taskDef.dependencies.length > 0) {
        const resolvedDeps: string[] = [];
        for (const depRef of taskDef.dependencies) {
          const resolvedId = this.resolveTaskReference(depRef, idMap, params.workflowId);
          if (!resolvedId) {
            throw new ThoughtflowError(
              `Cannot resolve dependency reference '${depRef}' for task '${task.name}'.${this.getTaskReferenceGuidance()}`,
              'DEPENDENCY_NOT_FOUND'
            );
          }
          resolvedDeps.push(resolvedId);
        }
        task.dependencies = resolvedDeps;
      }

      // Resolve parentTaskId (only if workflowId is provided)
      if (params.workflowId && taskDef.parentTaskId) {
        const resolvedParentId = this.resolveTaskReference(taskDef.parentTaskId, idMap, params.workflowId);
        if (!resolvedParentId) {
          throw new ThoughtflowError(
            `Cannot resolve parentTaskId reference '${taskDef.parentTaskId}' for task '${task.name}'.${this.getTaskReferenceGuidance()}`,
            'PARENT_NOT_FOUND'
          );
        }
        
        // Validate parent exists and is in same workflow
        const parentTask = this.state.tasks.get(resolvedParentId);
        if (!parentTask) {
          throw new TaskNotFoundError(resolvedParentId);
        }
        if (parentTask.workflowId !== params.workflowId) {
          throw new ThoughtflowError(
            `Parent task '${resolvedParentId}' belongs to workflow '${parentTask.workflowId}', cannot create subtask in different workflow '${params.workflowId}'`,
            'WORKFLOW_BOUNDARY_VIOLATION'
          );
        }
        
        task.parentTaskId = resolvedParentId;
      }

      this.state.tasks.set(realId, task);
    }

    // Update workflow timestamp if workflow exists
    if (workflow) {
      workflow.updatedAt = new Date().toISOString();
      this.state.workflows.set(params.workflowId!, workflow);
    }
    
    this.triggerSave();
    
    if (params.workflowId) {
      logger.info(`Processed ${resultTasks.length} tasks in batch for workflow ${params.workflowId}`);
    } else {
      logger.info(`Processed ${resultTasks.length} standalone tasks in batch`);
    }
    
    // Return enhanced response
    const response: { 
      tasks: Array<{ id: string; name: string; status: string }>; 
      idMap: Record<string, string>;
      workflowId?: string;
      workflowCreated?: boolean;
      message?: string;
    } = { tasks: resultTasks, idMap };
    
    if (params.workflowId) {
      response.workflowId = params.workflowId;
      if (workflowCreated) {
        response.workflowCreated = true;
        response.message = message;
      }
    }
    
    return response;
  }

  /**
   * Resolve a task reference (positional or name-based) to a real task ID
   */
  private resolveTaskReference(
    ref: string,
    idMap: Record<string, string>,
    workflowId: string
  ): string | null {
    // Check if it's a positional reference (task-1, task-2, etc.)
    if (ref.startsWith('task-')) {
      return idMap[ref] || null;
    }

    // Try to find by exact ID match
    if (this.state.tasks.has(ref)) {
      const task = this.state.tasks.get(ref);
      if (task && task.workflowId === workflowId) {
        return ref;
      }
    }

    // Try to find by normalized name within the workflow
    const normalizedName = this.normalizeKey(ref);
    for (const [id, task] of this.state.tasks) {
      if (this.normalizeKey(task.name) === normalizedName && task.workflowId === workflowId) {
        return id;
      }
    }

    return null;
  }

  /**
   * Get a task by ID
   */
  getTask(id: string, includeDeleted: boolean = false): Task {
    validateId(id, 'Task');
    const task = this.state.tasks.get(id);
    if (!task) {
      throw new TaskNotFoundError(id);
    }
    if (!includeDeleted && this.isDeleted(task)) {
      throw new TaskNotFoundError(id);
    }
    return task;
  }

  /**
   * Get all tasks
   */
  getAllTasks(includeDeleted: boolean = false): Task[] {
    return this.filterDeletedFromMap(this.state.tasks, includeDeleted);
  }

  /**
   * List tasks, optionally filtered by status
   * Returns minimal summaries for efficiency
   */
  listTasks(status?: Task['status'], includeDeleted: boolean = false): Array<{ id: string; name: string; status: string }> {
    const allTasks = this.filterDeletedFromMap(this.state.tasks, includeDeleted);
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
  }): Task & { cognitiveSuggestions?: Array<{ type: string; thoughtId: string; reason: string }> } {
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
        // Auto-complete parent if all subtasks are now completed
        this.autoCompleteParentTask(id);
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
    
    // Generate cognitive suggestions if task was just completed
    const cognitiveSuggestions: Array<{ type: string; thoughtId: string; reason: string }> = [];
    if (updates.status === 'completed' && task.metadata?.cognitive?.linkedThoughtIds) {
      const linkedThoughtIds = task.metadata.cognitive.linkedThoughtIds as string[];
      for (const thoughtId of linkedThoughtIds) {
        cognitiveSuggestions.push({
          type: 'verify_thought',
          thoughtId,
          reason: `Task '${task.name}' completed. Consider verifying linked thought '${thoughtId}' to confirm its findings.`
        });
      }
    }
    
    // Return minimal summary with cognitive suggestions
    const result = { id, name: task.name, status: task.status } as Task & { cognitiveSuggestions?: Array<{ type: string; thoughtId: string; reason: string }> };
    if (cognitiveSuggestions.length > 0) {
      result.cognitiveSuggestions = cognitiveSuggestions;
    }
    return result;
  }

  /**
   * Delete a task (soft-delete)
   * Also removes task from its workflow's taskIds
   */
  deleteTask(id: string): boolean {
    validateId(id, 'Task');
    const task = this.state.tasks.get(id);
    if (!task) {
      return false;
    }
    
    // Remove task from workflow's taskIds
    if (task.workflowId) {
      const workflow = this.state.workflows.get(task.workflowId);
      if (workflow) {
        const index = workflow.taskIds.indexOf(id);
        if (index > -1) {
          workflow.taskIds.splice(index, 1);
          workflow.updatedAt = new Date().toISOString();
          this.state.workflows.set(task.workflowId, workflow);
        }
      }
    }
    
    this.softDeleteEntity(task);
    this.triggerSave();
    logger.info(`Soft-deleted task: ${id}`);
    return true;
  }

  /**
   * Create a workflow
   * REQUIRES strategyId - workflow must belong to exactly one strategy
   */
  createWorkflow(workflow: {
    name: string;
    description?: string;
    taskIds: string[];
    strategyId: string; // Mandatory
    metadata?: Record<string, any>;
  }): Workflow {
    validateRequiredString(workflow.name, 'name');
    validateRequiredString(workflow.strategyId, 'strategyId');
    
    const existingIds = new Set(this.state.workflows.keys());
    const id = this.generateSlugId(workflow.name, existingIds);
    const now = new Date().toISOString();
    
    // Validate strategy exists
    const strategy = this.state.strategies.get(workflow.strategyId);
    if (!strategy) {
      throw new ThoughtflowError(`Strategy '${workflow.strategyId}' not found`, 'STRATEGY_NOT_FOUND');
    }
    
    // Validate all tasks exist and are not already owned by another workflow
    for (const taskId of workflow.taskIds) {
      const task = this.state.tasks.get(taskId);
      if (!task) {
        throw new TaskNotFoundError(taskId);
      }
      // Task must not already belong to a different workflow
      if (task.workflowId && task.workflowId !== id) {
        throw new ThoughtflowError(
          `Task '${taskId}' already belongs to workflow '${task.workflowId}'. A task can belong to only one workflow.`,
          'TASK_ALREADY_OWNED'
        );
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
    
    // Update all tasks to have this workflowId and strategyId
    for (const taskId of workflow.taskIds) {
      const task = this.state.tasks.get(taskId);
      if (task) {
        task.workflowId = id;
        task.strategyId = workflow.strategyId;
        this.state.tasks.set(taskId, task);
      }
    }
    
    // Add workflow to strategy's workflowIds
    if (!strategy.workflowIds.includes(id)) {
      strategy.workflowIds.push(id);
      strategy.updatedAt = now;
      this.state.strategies.set(workflow.strategyId, strategy);
    }
    
    this.triggerSave();
    logger.info(`Created workflow: ${id} - ${workflow.name} in strategy ${workflow.strategyId}`);
    // Return minimal summary
    return { id, name: newWorkflow.name, status: newWorkflow.status } as Workflow;
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(id: string, includeDeleted: boolean = false): Workflow {
    validateId(id, 'Workflow');
    const workflow = this.state.workflows.get(id);
    if (!workflow) {
      throw new WorkflowNotFoundError(id);
    }
    if (!includeDeleted && this.isDeleted(workflow)) {
      throw new WorkflowNotFoundError(id);
    }
    return workflow;
  }

  /**
   * Get all workflows
   */
  getAllWorkflows(includeDeleted: boolean = false): Workflow[] {
    return this.filterDeletedFromMap(this.state.workflows, includeDeleted);
  }

  /**
   * List all workflows (alias for getAllWorkflows for tool handler compatibility)
   * Tool handlers expect this name
   * Returns minimal summaries for efficiency
   */
  listWorkflows(includeDeleted: boolean = false): Array<{ id: string; name: string; status: string; taskCount: number }> {
    const workflows = this.filterDeletedFromMap(this.state.workflows, includeDeleted);
    return workflows.map(w => ({
      id: w.id,
      name: w.name,
      status: w.status,
      taskCount: w.taskIds.length
    }));
  }

  /**
   * Delete a workflow (soft-delete)
   */
  deleteWorkflow(id: string): boolean {
    validateId(id, 'Workflow');
    const workflow = this.state.workflows.get(id);
    if (!workflow) {
      return false;
    }
    this.softDeleteEntity(workflow);
    this.triggerSave();
    logger.info(`Soft-deleted workflow: ${id}`);
    return true;
  }

  /**
   * Add tasks to a workflow
   * ENFORCES single workflow ownership - each task can belong to only one workflow
   */
  addTasksToWorkflow(workflowId: string, taskIds: string[]): void {
    validateId(workflowId, 'Workflow');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    
    // Enforce single workflow ownership for each task
    for (const taskId of taskIds) {
      const task = this.state.tasks.get(taskId);
      if (!task) {
        throw new TaskNotFoundError(taskId);
      }
      if (task.workflowId && task.workflowId !== workflowId) {
        throw new ThoughtflowError(
          `Task '${taskId}' already belongs to workflow '${task.workflowId}'. A task can belong to only one workflow.`,
          'TASK_ALREADY_OWNED'
        );
      }
    }
    
    // Add task IDs, avoiding duplicates
    for (const taskId of taskIds) {
      if (!workflow.taskIds.includes(taskId)) {
        workflow.taskIds.push(taskId);
        // Update task's workflowId and strategyId
        const task = this.state.tasks.get(taskId);
        if (task) {
          task.workflowId = workflowId;
          task.strategyId = workflow.strategyId;
          this.state.tasks.set(taskId, task);
        }
      }
    }
    
    workflow.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    logger.info(`Added ${taskIds.length} tasks to workflow: ${workflowId}`);
  }

  /**
   * Add a single task to a workflow at a specific position
   * ENFORCES single workflow ownership - task can belong to only one workflow
   * position: -1 = end (default), 0 = beginning, or specific index
   */
  addTaskToWorkflow(workflowId: string, taskId: string, position: number = -1): Workflow {
    validateId(workflowId, 'Workflow');
    validateId(taskId, 'Task');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    
    const task = this.state.tasks.get(taskId);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    
    // Enforce single workflow ownership
    if (task.workflowId && task.workflowId !== workflowId) {
      throw new ThoughtflowError(
        `Task '${taskId}' already belongs to workflow '${task.workflowId}'. A task can belong to only one workflow.`,
        'TASK_ALREADY_OWNED'
      );
    }
    
    // Check if task already in workflow
    if (workflow.taskIds.includes(taskId)) {
      logger.info(`Task ${taskId} already in workflow ${workflowId}`);
      return { id: workflowId, name: workflow.name, status: workflow.status } as Workflow;
    }
    
    // Insert at specified position
    if (position === -1 || position >= workflow.taskIds.length) {
      workflow.taskIds.push(taskId);
    } else if (position === 0) {
      workflow.taskIds.unshift(taskId);
    } else {
      workflow.taskIds.splice(position, 0, taskId);
    }
    
    // Update task's workflowId and strategyId
    task.workflowId = workflowId;
    task.strategyId = workflow.strategyId;
    this.state.tasks.set(taskId, task);
    
    workflow.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    logger.info(`Added task ${taskId} to workflow ${workflowId} at position ${position}`);
    
    // Return minimal summary
    return { id: workflowId, name: workflow.name, status: workflow.status } as Workflow;
  }

  /**
   * Remove a task from a workflow
   */
  removeTaskFromWorkflow(workflowId: string, taskId: string): Workflow {
    validateId(workflowId, 'Workflow');
    validateId(taskId, 'Task');
    
    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    
    const index = workflow.taskIds.indexOf(taskId);
    
    if (index === -1) {
      logger.info(`Task ${taskId} not found in workflow ${workflowId}`);
      return { id: workflowId, name: workflow.name, status: workflow.status } as Workflow;
    }
    
    workflow.taskIds.splice(index, 1);
    workflow.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    logger.info(`Removed task ${taskId} from workflow ${workflowId}`);
    
    // Return minimal summary
    return { id: workflowId, name: workflow.name, status: workflow.status } as Workflow;
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
   * Delete a strategy (soft-delete)
   */
  deleteStrategy(id: string): boolean {
    validateId(id, 'Strategy');
    const strategy = this.state.strategies.get(id);
    if (!strategy) {
      return false;
    }
    this.softDeleteEntity(strategy);
    this.triggerSave();
    logger.info(`Soft-deleted strategy: ${id}`);
    return true;
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
        // Soft-delete linked workflows (they cannot exist without a strategy)
        for (const workflowId of strategy.workflowIds) {
          const workflow = this.state.workflows.get(workflowId);
          if (workflow) {
            this.softDeleteEntity(workflow);
            this.state.workflows.set(workflowId, workflow);
          }
        }
        // Soft-delete linked trees (trees cannot exist without a strategy)
        for (const treeId of strategy.treeIds) {
          const tree = this.state.trees.get(treeId);
          if (tree) {
            this.softDeleteEntity(tree);
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
   * Since trees must belong to exactly one strategy, this soft-deletes the tree
   */
  removeTreeFromStrategy(strategyId: string, treeId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(treeId, 'Tree');

    const strategy = this.getStrategy(strategyId);
    const tree = this.state.trees.get(treeId);

    if (tree) {
      // Soft-delete tree (it cannot exist without a strategy)
      this.softDeleteEntity(tree);
      this.state.trees.set(treeId, tree);
    }

    const index = strategy.treeIds.indexOf(treeId);

    if (index > -1) {
      strategy.treeIds.splice(index, 1);
      strategy.updatedAt = new Date().toISOString();
      this.triggerSave();
      logger.info(`Removed tree ${treeId} from strategy ${strategyId} (soft-deleted)`);
    }

    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id: strategyId, name: strategy.name, status: strategy.status } as Strategy);
  }

  /**
   * Add a workflow to a strategy
   * ENFORCES single strategy ownership - workflow can belong to only one strategy
   */
  addWorkflowToStrategy(strategyId: string, workflowId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(workflowId, 'Workflow');
    
    const strategy = this.getStrategy(strategyId);
    const workflow = this.state.workflows.get(workflowId);
    
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }
    
    // Enforce single strategy ownership
    if (workflow.strategyId && workflow.strategyId !== strategyId) {
      throw new ThoughtflowError(
        `Workflow '${workflowId}' already belongs to strategy '${workflow.strategyId}'. A workflow can belong to only one strategy.`,
        'WORKFLOW_ALREADY_OWNED'
      );
    }
    
    workflow.strategyId = strategyId;
    this.state.workflows.set(workflowId, workflow);
    
    // Propagate strategyId to all tasks in the workflow
    for (const taskId of workflow.taskIds) {
      const task = this.state.tasks.get(taskId);
      if (task) {
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
   * Since workflows must belong to exactly one strategy, this soft-deletes the workflow
   */
  removeWorkflowFromStrategy(strategyId: string, workflowId: string): Strategy {
    validateId(strategyId, 'Strategy');
    validateId(workflowId, 'Workflow');
    
    const strategy = this.getStrategy(strategyId);
    const workflow = this.state.workflows.get(workflowId);
    
    if (workflow) {
      // Soft-delete workflow (it cannot exist without a strategy)
      this.softDeleteEntity(workflow);
      this.state.workflows.set(workflowId, workflow);
      
      // Also soft-delete all tasks in the workflow
      for (const taskId of workflow.taskIds) {
        const task = this.state.tasks.get(taskId);
        if (task) {
          this.softDeleteEntity(task);
          this.state.tasks.set(taskId, task);
        }
      }
    }
    
    const index = strategy.workflowIds.indexOf(workflowId);
    
    if (index > -1) {
      strategy.workflowIds.splice(index, 1);
      strategy.updatedAt = new Date().toISOString();
      this.triggerSave();
      logger.info(`Removed workflow ${workflowId} from strategy ${strategyId} (soft-deleted)`);
    }

    // Return minimal summary with LLM_instruction
    return this.enrichStrategyWithLLMInstruction({ id: strategyId, name: strategy.name, status: strategy.status } as Strategy);
  }

  /**
   * Clear all data (soft-delete all entities)
   * Marks all entities as deleted instead of removing them
   */
  async clearAll(): Promise<void> {
    // Soft-delete all tasks
    for (const task of this.state.tasks.values()) {
      this.softDeleteEntity(task);
    }
    // Soft-delete all workflows
    for (const workflow of this.state.workflows.values()) {
      this.softDeleteEntity(workflow);
    }
    // Soft-delete all workflow runs
    for (const run of this.state.workflowRuns.values()) {
      this.softDeleteEntity(run);
    }
    // Soft-delete all strategies
    for (const strategy of this.state.strategies.values()) {
      this.softDeleteEntity(strategy);
    }
    // Soft-delete all trees
    for (const tree of this.state.trees.values()) {
      this.softDeleteEntity(tree);
    }
    // Soft-delete all cognitive links
    for (const link of this.state.cognitiveLinks.values()) {
      this.softDeleteEntity(link);
    }
    this.triggerSave();
    logger.info('Soft-deleted all data');
  }

  /**
   * Purge soft-deleted items (hard delete)
   * Permanently removes items marked as deleted from the state
   * @param entityType - Optional: specific entity type to purge ('task', 'workflow', 'tree', 'strategy', 'link', 'all')
   * @param olderThanDays - Optional: only purge items deleted more than this many days ago
   * @returns Object with counts of purged items by type
   */
  async purgeDeleted(entityType?: string, olderThanDays?: number): Promise<{
    tasks: number;
    workflows: number;
    workflowRuns: number;
    strategies: number;
    trees: number;
    cognitiveLinks: number;
  }> {
    const now = new Date();
    const cutoffDate = olderThanDays 
      ? new Date(now.getTime() - olderThanDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const result = {
      tasks: 0,
      workflows: 0,
      workflowRuns: 0,
      strategies: 0,
      trees: 0,
      cognitiveLinks: 0
    };

    const shouldPurgeType = (type: string): boolean => {
      if (!entityType || entityType === 'all') return true;
      return entityType === type;
    };

    const shouldPurgeByAge = (deletedAt: string | null | undefined): boolean => {
      if (!cutoffDate) return true;
      if (!deletedAt) return false;
      return deletedAt < cutoffDate;
    };

    // Purge tasks
    if (shouldPurgeType('task') || shouldPurgeType('all')) {
      for (const [id, task] of this.state.tasks) {
        if (this.isDeleted(task) && shouldPurgeByAge(task.deletedAt)) {
          this.state.tasks.delete(id);
          result.tasks++;
        }
      }
    }

    // Purge workflows
    if (shouldPurgeType('workflow') || shouldPurgeType('all')) {
      for (const [id, workflow] of this.state.workflows) {
        if (this.isDeleted(workflow) && shouldPurgeByAge(workflow.deletedAt)) {
          this.state.workflows.delete(id);
          result.workflows++;
        }
      }
    }

    // Purge workflow runs
    if (shouldPurgeType('workflow_run') || shouldPurgeType('all')) {
      for (const [id, run] of this.state.workflowRuns) {
        if (this.isDeleted(run) && shouldPurgeByAge(run.deletedAt)) {
          this.state.workflowRuns.delete(id);
          result.workflowRuns++;
        }
      }
    }

    // Purge strategies
    if (shouldPurgeType('strategy') || shouldPurgeType('all')) {
      for (const [id, strategy] of this.state.strategies) {
        if (this.isDeleted(strategy) && shouldPurgeByAge(strategy.deletedAt)) {
          this.state.strategies.delete(id);
          result.strategies++;
        }
      }
    }

    // Purge trees
    if (shouldPurgeType('tree') || shouldPurgeType('all')) {
      for (const [id, tree] of this.state.trees) {
        if (this.isDeleted(tree) && shouldPurgeByAge(tree.deletedAt)) {
          this.state.trees.delete(id);
          result.trees++;
        }
      }
    }

    // Purge cognitive links
    if (shouldPurgeType('link') || shouldPurgeType('all')) {
      for (const [id, link] of this.state.cognitiveLinks) {
        if (this.isDeleted(link) && shouldPurgeByAge(link.deletedAt)) {
          this.state.cognitiveLinks.delete(id);
          result.cognitiveLinks++;
        }
      }
    }

    this.triggerSave();
    logger.info(`Purged soft-deleted items: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Restore a soft-deleted entity
   * @param entityType - Entity type to restore ('task', 'workflow', 'tree', 'strategy', 'link')
   * @param id - Entity ID to restore
   * @returns True if restored, false if not found or not deleted
   */
  restoreDeleted(entityType: string, id: string): boolean {
    validateId(id, entityType.charAt(0).toUpperCase() + entityType.slice(1));
    
    let entity: any;
    switch (entityType) {
      case 'task':
        entity = this.state.tasks.get(id);
        break;
      case 'workflow':
        entity = this.state.workflows.get(id);
        break;
      case 'tree':
        entity = this.state.trees.get(id);
        break;
      case 'strategy':
        entity = this.state.strategies.get(id);
        break;
      case 'link':
        entity = this.state.cognitiveLinks.get(id);
        break;
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }

    if (!entity) {
      return false;
    }

    if (!this.isDeleted(entity)) {
      return false; // Not deleted, nothing to restore
    }

    // Restore by clearing deletion flags
    entity.isDeleted = false;
    entity.deletedAt = null;
    this.triggerSave();
    logger.info(`Restored ${entityType}: ${id}`);
    return true;
  }

  // ============================================================================
  // Workflow Execution Engine
  // ============================================================================

  /**
   * Start execution of a workflow
   * Creates a workflow run and marks initially ready tasks as in_progress
   * Returns minimal task identifiers (id + status only) for maximum token efficiency
   * Use get_task() when you need full task details like name/description
   */
  startWorkflowExecution(workflowId: string): {
    runId: string;
    workflowStatus: 'in_progress' | 'completed' | 'failed';
    readyTasks: Array<{ id: string; status: string }>;
    totalTasks: number;
    readyCount: number;
  } {
    validateId(workflowId, 'Workflow');

    const workflow = this.state.workflows.get(workflowId);
    if (!workflow) {
      throw new WorkflowNotFoundError(workflowId);
    }

    // Create workflow run
    const existingRunIds = new Set(this.state.workflowRuns.keys());
    const runId = this.generateSlugId(`run-${workflow.name}`, existingRunIds);
    const now = new Date().toISOString();

    const workflowRun = {
      id: runId,
      workflowId,
      status: 'in_progress' as const,
      startedAt: now,
      taskExecutionOrder: [...workflow.taskIds],
      lastCompletedTaskIds: [],
      lastFailedTaskIds: []
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

    // Return minimal task identifiers (id + status only) for maximum token efficiency
    const readyTaskSummaries = readyTasks.map(t => ({ id: t.id, status: 'in_progress' }));
    return {
      runId,
      workflowStatus: 'in_progress',
      readyTasks: readyTaskSummaries,
      totalTasks: workflow.taskIds.length,
      readyCount: readyTasks.length
    };
  }

  /**
   * Advance a workflow run after task completion
   * Returns deltas (newly completed/failed/ready tasks) instead of accumulated state
   * Returns minimal task identifiers (id + status only) for maximum token efficiency
   * Use get_task() when you need full task details like name/description
   * Use get_workflow_run_status() when you want the complete current state of the whole workflow
   */
  advanceWorkflowRun(runId: string): {
    newlyCompletedTasks: Array<{ id: string; status: string }>;
    newlyFailedTasks: Array<{ id: string; status: string }>;
    newlyReadyTasks: Array<{ id: string; status: string }>;
    workflowStatus: 'in_progress' | 'completed' | 'failed';
    cognitiveSuggestions?: Array<{ type: string; thoughtId: string; reason: string }>;
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

    // Calculate deltas: tasks that changed since last advance
    const lastCompletedIds = workflowRun.lastCompletedTaskIds || [];
    const lastFailedIds = workflowRun.lastFailedTaskIds || [];

    const newlyCompletedTasks = completedTasks.filter(t => !lastCompletedIds.includes(t.id));
    const newlyFailedTasks = failedTasks.filter(t => !lastFailedIds.includes(t.id));

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

    // Update workflow run with new completed/failed task IDs for next delta calculation
    workflowRun.lastCompletedTaskIds = completedTasks.map(t => t.id);
    workflowRun.lastFailedTaskIds = failedTasks.map(t => t.id);

    // Determine workflow status
    let workflowStatus: 'in_progress' | 'completed' | 'failed' = 'in_progress';

    if (failedTasks.length > 0) {
      workflowStatus = 'failed';
    } else if (inProgressTasks.length === 0 && pendingTasks.length === 0) {
      workflowStatus = 'completed';
      workflowRun.completedAt = now;
      workflowRun.status = 'completed';
    }

    // Generate cognitive suggestions only from newly completed tasks with linked thoughts
    const cognitiveSuggestions: Array<{ type: string; thoughtId: string; reason: string }> = [];
    for (const task of newlyCompletedTasks) {
      if (task.metadata?.cognitive?.linkedThoughtIds) {
        const linkedThoughtIds = task.metadata.cognitive.linkedThoughtIds as string[];
        for (const thoughtId of linkedThoughtIds) {
          cognitiveSuggestions.push({
            type: 'verify_thought',
            thoughtId,
            reason: `Task '${task.name}' completed in workflow. Consider verifying linked thought '${thoughtId}' to confirm its findings.`
          });
        }
      }
    }

    this.state.workflowRuns.set(runId, workflowRun);
    this.triggerSave();

    logger.info(`Advanced workflow run: ${runId}, status: ${workflowStatus}, newlyCompleted: ${newlyCompletedTasks.length}, newlyReady: ${newlyReadyTasks.length}`);

    // Return minimal task identifiers (id + status only) for maximum token efficiency
    const newlyCompletedTaskSummaries = newlyCompletedTasks.map(t => ({ id: t.id, status: t.status }));
    const newlyFailedTaskSummaries = newlyFailedTasks.map(t => ({ id: t.id, status: t.status }));
    const newlyReadyTaskSummaries = newlyReadyTasks.map(t => ({ id: t.id, status: t.status }));

    const result: {
      newlyCompletedTasks: Array<{ id: string; status: string }>;
      newlyFailedTasks: Array<{ id: string; status: string }>;
      newlyReadyTasks: Array<{ id: string; status: string }>;
      workflowStatus: 'in_progress' | 'completed' | 'failed';
      cognitiveSuggestions?: Array<{ type: string; thoughtId: string; reason: string }>;
    } = {
      newlyCompletedTasks: newlyCompletedTaskSummaries,
      newlyFailedTasks: newlyFailedTaskSummaries,
      newlyReadyTasks: newlyReadyTaskSummaries,
      workflowStatus
    };

    if (cognitiveSuggestions.length > 0) {
      result.cognitiveSuggestions = cognitiveSuggestions;
    }

    return result;
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
   * Get a workflow run by ID (minimal summary)
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
   * Get full workflow run status with all task details
   * Use this when you need the complete picture of a workflow run
   * Returns all tasks with their current status, not just deltas
   */
  getWorkflowRunStatus(runId: string): {
    runId: string;
    workflowId: string;
    workflowStatus: 'pending' | 'in_progress' | 'completed' | 'failed';
    startedAt: string;
    completedAt?: string;
    tasks: Array<{
      id: string;
      name: string;
      status: string;
      dependencies?: string[];
    }>;
    summary: {
      total: number;
      completed: number;
      failed: number;
      inProgress: number;
      pending: number;
    };
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

    // Get all tasks in the workflow with their current status
    const workflowTasks = workflow.taskIds
      .map(id => this.state.tasks.get(id))
      .filter((t): t is Task => t !== undefined);

    const tasks = workflowTasks.map(t => ({
      id: t.id,
      name: t.name,
      status: t.status,
      dependencies: t.dependencies
    }));

    // Calculate summary counts
    const summary = {
      total: workflowTasks.length,
      completed: workflowTasks.filter(t => t.status === 'completed').length,
      failed: workflowTasks.filter(t => t.status === 'failed').length,
      inProgress: workflowTasks.filter(t => t.status === 'in_progress').length,
      pending: workflowTasks.filter(t => t.status === 'pending').length
    };

    return {
      runId: workflowRun.id,
      workflowId: workflowRun.workflowId,
      workflowStatus: workflowRun.status,
      startedAt: workflowRun.startedAt,
      completedAt: workflowRun.completedAt,
      tasks,
      summary
    };
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
  // Hierarchy Validation Helpers
  // ============================================================================

  /**
   * Validate that the hierarchy invariants are maintained
   * Returns an object with validation results and any violations found
   */
  validateHierarchyInvariants(): {
    valid: boolean;
    violations: string[];
    details: {
      tasksWithoutWorkflow: string[];
      workflowsWithoutStrategy: string[];
      tasksInMultipleWorkflows: string[];
      workflowsInMultipleStrategies: string[];
      tasksWithWrongStrategy: string[];
    };
  } {
    const violations: string[] = [];
    const details = {
      tasksWithoutWorkflow: [] as string[],
      workflowsWithoutStrategy: [] as string[],
      tasksInMultipleWorkflows: [] as string[],
      workflowsInMultipleStrategies: [] as string[],
      tasksWithWrongStrategy: [] as string[]
    };

    // Check tasks without workflowId
    for (const [taskId, task] of this.state.tasks) {
      if (!task.workflowId) {
        details.tasksWithoutWorkflow.push(taskId);
        violations.push(`Task '${taskId}' (${task.name}) has no workflowId`);
      }
    }

    // Check workflows without strategyId
    for (const [workflowId, workflow] of this.state.workflows) {
      if (!workflow.strategyId) {
        details.workflowsWithoutStrategy.push(workflowId);
        violations.push(`Workflow '${workflowId}' (${workflow.name}) has no strategyId`);
      }
    }

    // Check tasks in multiple workflows
    const taskWorkflowCount = new Map<string, number>();
    for (const workflow of this.state.workflows.values()) {
      for (const taskId of workflow.taskIds) {
        taskWorkflowCount.set(taskId, (taskWorkflowCount.get(taskId) || 0) + 1);
      }
    }
    for (const [taskId, count] of taskWorkflowCount) {
      if (count > 1) {
        details.tasksInMultipleWorkflows.push(taskId);
        violations.push(`Task '${taskId}' is in ${count} workflows (should be exactly 1)`);
      }
    }

    // Check workflows in multiple strategies
    const workflowStrategyCount = new Map<string, number>();
    for (const strategy of this.state.strategies.values()) {
      for (const workflowId of strategy.workflowIds) {
        workflowStrategyCount.set(workflowId, (workflowStrategyCount.get(workflowId) || 0) + 1);
      }
    }
    for (const [workflowId, count] of workflowStrategyCount) {
      if (count > 1) {
        details.workflowsInMultipleStrategies.push(workflowId);
        violations.push(`Workflow '${workflowId}' is in ${count} strategies (should be exactly 1)`);
      }
    }

    // Check tasks with wrong strategyId (denormalization mismatch)
    for (const [taskId, task] of this.state.tasks) {
      if (task.workflowId) {
        const workflow = this.state.workflows.get(task.workflowId);
        if (workflow && workflow.strategyId !== task.strategyId) {
          details.tasksWithWrongStrategy.push(taskId);
          violations.push(`Task '${taskId}' has strategyId '${task.strategyId}' but its workflow '${task.workflowId}' has strategyId '${workflow.strategyId}'`);
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
      details
    };
  }

  /**
   * Repair hierarchy invariants by fixing denormalization issues
   * Returns the number of fixes applied
   */
  repairHierarchyInvariants(): number {
    let fixes = 0;

    // Fix task strategyId to match workflow
    for (const [taskId, task] of this.state.tasks) {
      if (task.workflowId) {
        const workflow = this.state.workflows.get(task.workflowId);
        if (workflow && workflow.strategyId !== task.strategyId) {
          task.strategyId = workflow.strategyId;
          this.state.tasks.set(taskId, task);
          fixes++;
          logger.info(`Fixed task '${taskId}' strategyId to match workflow '${task.workflowId}'`);
        }
      }
    }

    // Ensure workflow taskIds are consistent
    for (const workflow of this.state.workflows.values()) {
      const validTaskIds: string[] = [];
      for (const taskId of workflow.taskIds) {
        const task = this.state.tasks.get(taskId);
        if (task && task.workflowId === workflow.id) {
          validTaskIds.push(taskId);
        }
      }
      if (validTaskIds.length !== workflow.taskIds.length) {
        workflow.taskIds = validTaskIds;
        workflow.updatedAt = new Date().toISOString();
        fixes++;
        logger.info(`Fixed workflow '${workflow.id}' taskIds`);
      }
    }

    if (fixes > 0) {
      this.triggerSave();
    }

    return fixes;
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
   * Check if all child tasks of a parent task are completed
   */
  private areAllSubtasksCompleted(parentTaskId: string): boolean {
    const subtasks = Array.from(this.state.tasks.values())
      .filter(task => task.parentTaskId === parentTaskId);
    
    if (subtasks.length === 0) {
      return false;
    }
    
    for (const subtask of subtasks) {
      if (subtask.status !== 'completed') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Automatically complete parent task if all its subtasks are completed
   * Recursively propagates up the task hierarchy
   */
  private autoCompleteParentTask(taskId: string): void {
    const task = this.state.tasks.get(taskId);
    if (!task || !task.parentTaskId) {
      return;
    }
    
    const parentTask = this.state.tasks.get(task.parentTaskId);
    if (!parentTask) {
      return;
    }
    
    // Check if all subtasks of parent are now completed
    if (this.areAllSubtasksCompleted(task.parentTaskId)) {
      // Mark parent as completed
      const now = new Date().toISOString();
      parentTask.status = 'completed';
      parentTask.completedAt = now;
      parentTask.updatedAt = now;
      
      logger.info(`Auto-completed parent task ${parentTask.id} with ${this.getSubtasks(task.parentTaskId).length} completed subtasks`);
      
      // Recursively check parent's parent
      this.autoCompleteParentTask(task.parentTaskId);
    }
  }

  /**
   * Move a task to a new parent or change its order
   * ENFORCES workflow boundary - parent must be in same workflow
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

    // Validate new parent exists and is in same workflow
    if (options.newParentTaskId !== undefined && options.newParentTaskId !== null) {
      const newParent = this.state.tasks.get(options.newParentTaskId);
      if (!newParent) {
        throw new TaskNotFoundError(options.newParentTaskId);
      }
      if (newParent.workflowId !== task.workflowId) {
        throw new ThoughtflowError(
          `Parent task '${options.newParentTaskId}' belongs to workflow '${newParent.workflowId}', cannot move task '${taskId}' to different workflow (current: '${task.workflowId}')`,
          'WORKFLOW_BOUNDARY_VIOLATION'
        );
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
