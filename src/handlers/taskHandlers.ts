import type { TaskOrchestratorService } from '../services/TaskOrchestratorService.js';
import type { Task, Workflow, Strategy } from '../types/index.js';

/**
 * Task Orchestrator MCP Tool Handlers
 * These tools provide structured task and workflow management
 */

export function registerTaskHandlers(
  taskService: TaskOrchestratorService,
  registerTool: (name: string, handler: (args: any) => Promise<any>) => void
): void {
  /**
   * Create a new task
   * REQUIRES workflowId - task must belong to exactly one workflow
   */
  registerTool(
    'create_task',
    async (args: {
      name: string;
      description?: string;
      dependencies?: string[];
      parentTaskId?: string;
      workflowId: string; // Mandatory
      metadata?: Record<string, any>;
    }): Promise<Task> => {
      return taskService.createTask(args);
    }
  );

  /**
   * Get a task by ID
   */
  registerTool(
    'get_task',
    async (args: { id: string }): Promise<Task> => {
      return taskService.getTask(args.id);
    }
  );

  /**
   * Get all tasks
   */
  registerTool(
    'list_tasks',
    async (args?: { status?: Task['status'] }): Promise<Task[]> => {
      const allTasks = taskService.getAllTasks();
      if (args?.status) {
        return allTasks.filter(t => t.status === args.status);
      }
      return allTasks;
    }
  );

  /**
   * Update a task
   */
  registerTool(
    'update_task',
    async (args: {
      id: string;
      name?: string;
      description?: string;
      status?: Task['status'];
      dependencies?: string[];
      metadata?: Record<string, any>;
    }): Promise<Task> => {
      return taskService.updateTask(args.id, args);
    }
  );

  /**
   * Delete a task
   */
  registerTool(
    'delete_task',
    async (args: { id: string }): Promise<{ success: boolean }> => {
      const deleted = taskService.deleteTask(args.id);
      return { success: deleted };
    }
  );

  /**
   * Create a workflow
   * REQUIRES strategyId - workflow must belong to exactly one strategy
   */
  registerTool(
    'create_workflow',
    async (args: {
      name: string;
      description?: string;
      taskIds: string[];
      strategyId: string; // Mandatory
      metadata?: Record<string, any>;
    }): Promise<Workflow> => {
      return taskService.createWorkflow(args);
    }
  );

  /**
   * Get a workflow by ID
   */
  registerTool(
    'get_workflow',
    async (args: { id: string }): Promise<Workflow> => {
      return taskService.getWorkflow(args.id);
    }
  );

  /**
   * Get all workflows
   */
  registerTool(
    'list_workflows',
    async (): Promise<Workflow[]> => {
      return taskService.getAllWorkflows();
    }
  );

  /**
   * Delete a workflow
   */
  registerTool(
    'delete_workflow',
    async (args: { id: string }): Promise<{ success: boolean }> => {
      const deleted = taskService.deleteWorkflow(args.id);
      return { success: deleted };
    }
  );

  /**
   * Create a strategy
   */
  registerTool(
    'create_strategy',
    async (args: {
      name: string;
      description?: string;
      metadata?: Record<string, any>;
    }): Promise<Strategy> => {
      return taskService.createStrategy(args);
    }
  );

  /**
   * Get a strategy by ID
   */
  registerTool(
    'get_strategy',
    async (args: { id: string }): Promise<Strategy> => {
      return taskService.getStrategy(args.id);
    }
  );

  /**
   * Get all strategies
   */
  registerTool(
    'list_strategies',
    async (): Promise<Strategy[]> => {
      return taskService.getAllStrategies();
    }
  );

  /**
   * Clear all data
   */
  registerTool(
    'clear_all',
    async (): Promise<{ success: boolean }> => {
      await taskService.clearAll();
      return { success: true };
    }
  );
}
