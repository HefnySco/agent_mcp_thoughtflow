import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';
import type { ParamFieldSpec } from '../utils/paramResolver.js';

/**
 * Task Orchestrator tool definitions and handlers
 */
export const taskToolDefinitions: { name: string; tool: Tool; handler: ToolHandler; paramSpec?: ParamFieldSpec[] }[] = [
  {
    name: 'task',
    tool: {
      name: 'task',
      description: 'Manage tasks: create (batch), get, list, update, delete, move, or get_subtasks - pick one via `action`. Flexible input: `id` accepts aliases (taskId, parentTaskId) and a bare number N is treated as "task-N". BATCH creation is the only way to create tasks (action="create" with a `tasks` array) - supports positional references (task-1, task-2) for dependencies/parentTaskId within the batch and name-based resolution for existing tasks. Returns { tasks: [{id, name, status}], idMap } on create so you can map positional refs to real IDs. IMPORTANT: use this tool for a known, linear sequence of work. If you have 2+ candidate approaches that need to be compared/scored before picking one, do NOT model them as parallel/alternative tasks here - use the `tree`/`thought` tools to generate and evaluate the candidates first, then use `bridge` action="promote_to_tasks" to convert only the winning approach into tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'get', 'list', 'update', 'delete', 'move', 'get_subtasks'], description: 'Which operation to perform' },
          id: { type: 'string', description: 'Task ID, for get/update/delete/move/get_subtasks. A bare number N resolves to "task-N".' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted tasks. Used by get/list.' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'Filter by status (list) or set status (update/create item)' },
          name: { type: 'string', description: 'Task name, for update' },
          description: { type: 'string', description: 'Task description, for update' },
          dependencies: { type: 'array', items: { type: 'string' }, description: 'Task dependency IDs, for update' },
          metadata: { type: 'object', description: 'Additional metadata, for update' },
          newParentTaskId: { type: 'string', description: 'New parent task ID (or null to remove parent), for move' },
          order: { type: 'number', description: 'Order among siblings, for move' },
          tasks: {
            type: 'array',
            description: 'Array of tasks to create (action="create") - use positional refs (task-1, task-2) for cross-references within this batch',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Task name' },
                description: { type: 'string', description: 'Task description' },
                dependencies: { type: 'array', items: { type: 'string' }, description: 'Task dependency IDs - use positional refs like "task-1" for tasks in this batch, or existing task IDs/names' },
                parentTaskId: { type: 'string', description: 'Parent task ID for subtasks - use positional ref like "task-1" for tasks in this batch, or existing task ID/name' },
                order: { type: 'number', description: 'Order among siblings' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'Task status' },
                metadata: { type: 'object', description: 'Additional metadata' }
              },
              required: ['name']
            }
          },
          workflowId: { type: 'string', description: 'Workflow ID, for action="create" - all tasks must belong to this workflow. If provided but the workflow does not exist, it will be automatically created (under strategyId, or a new implicit strategy if strategyId is also omitted). If omitted entirely, tasks are created as standalone under an implicit strategy.' },
          strategyId: { type: 'string', description: 'Strategy ID, for action="create". Optional - defaults to a new implicit strategy, whether used for auto-creating a workflow or for standalone tasks. If workflow already exists, this is ignored.' },
          deduplication: { type: 'string', enum: ['skip', 'error', 'overwrite'], description: 'Deduplication strategy for action="create": skip (use existing task), error (fail if duplicate exists), or overwrite (create new task anyway)' }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'id', aliases: ['taskId', 'parentTaskId'], type: 'string', numericRefTemplate: (n) => `task-${n}` },
      { canonical: 'includeDeleted', type: 'boolean' },
      { canonical: 'status', type: 'string' },
      { canonical: 'name', aliases: ['title', 'taskName'], type: 'string' },
      { canonical: 'description', type: 'string' },
      { canonical: 'dependencies', type: 'array' },
      { canonical: 'metadata', type: 'object' },
      { canonical: 'newParentTaskId', type: 'string' },
      { canonical: 'order', type: 'number' },
      { canonical: 'tasks', type: 'array' },
      { canonical: 'workflowId', type: 'string' },
      { canonical: 'strategyId', type: 'string' },
      { canonical: 'deduplication', type: 'string' }
    ],
    handler: (args: any, service: any) => {
      switch (args.action) {
        case 'create': return service.createTasks(args);
        case 'get': return service.getTask(args.id, args.includeDeleted);
        case 'list': return service.listTasks(args.status, args.includeDeleted);
        case 'update': return service.updateTask(args.id, args);
        case 'delete': return service.deleteTask(args.id);
        case 'move': return service.moveTask(args.id, args);
        case 'get_subtasks': return service.getSubtasks(args.id);
        default: throw new Error(`Unknown task action: '${args.action}'. Expected one of: create, get, list, update, delete, move, get_subtasks.`);
      }
    }
  },
  {
    name: 'workflow',
    tool: {
      name: 'workflow',
      description: 'Manage workflows: create, get, list, delete, add_task, or remove_task - pick one via `action`. Remember to use the workflow_run tool (action="start") to begin processing after creating a workflow.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'get', 'list', 'delete', 'add_task', 'remove_task'], description: 'Which operation to perform' },
          id: { type: 'string', description: 'Workflow ID, for get/delete/add_task/remove_task' },
          name: { type: 'string', description: 'Workflow name, for create' },
          description: { type: 'string', description: 'Workflow description, for create' },
          taskIds: { type: 'array', items: { type: 'string' }, description: 'Task IDs in the workflow, for create' },
          strategyId: { type: 'string', description: 'Strategy ID, for create. Optional - if omitted, the workflow is created under a new implicit strategy.' },
          metadata: { type: 'object', description: 'Additional metadata, for create' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted workflows, for get/list' },
          taskId: { type: 'string', description: 'Task ID to add/remove, for add_task/remove_task' },
          position: { type: 'number', description: 'Position to insert at, for add_task (-1 for end [default], 0 for beginning, or specific index)' }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'id', aliases: ['workflowId'], type: 'string' },
      { canonical: 'name', type: 'string' },
      { canonical: 'description', type: 'string' },
      { canonical: 'taskIds', type: 'array' },
      { canonical: 'strategyId', type: 'string' },
      { canonical: 'metadata', type: 'object' },
      { canonical: 'includeDeleted', type: 'boolean' },
      { canonical: 'taskId', type: 'string' },
      { canonical: 'position', type: 'number' }
    ],
    handler: (args: any, service: any) => {
      switch (args.action) {
        case 'create': return service.createWorkflow(args);
        case 'get': return service.getWorkflow(args.id, args.includeDeleted);
        case 'list': return service.listWorkflows(args.includeDeleted);
        case 'delete': return service.deleteWorkflow(args.id);
        case 'add_task': return service.addTaskToWorkflow(args.id, args.taskId, args.position);
        case 'remove_task': return service.removeTaskFromWorkflow(args.id, args.taskId);
        default: throw new Error(`Unknown workflow action: '${args.action}'. Expected one of: create, get, list, delete, add_task, remove_task.`);
      }
    }
  },
  {
    name: 'workflow_run',
    tool: {
      name: 'workflow_run',
      description: 'Manage workflow execution: start, advance, get, get_status, list, or delete - pick one via `action`. start returns runId, workflowStatus, readyTasks (minimal: id + status only), totalTasks, and readyCount - you must manually execute ready tasks, mark them completed via the task tool, then call action="advance" to progress. advance returns only deltas (newlyCompletedTasks/newlyFailedTasks/newlyReadyTasks, minimal id+status) - token-efficient, does not re-list prior tasks. Use action="get_status" for the full picture of all tasks in a run.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['start', 'advance', 'get', 'get_status', 'list', 'delete'], description: 'Which operation to perform' },
          workflowId: { type: 'string', description: 'Workflow ID, for start' },
          id: { type: 'string', description: 'Workflow run ID, for advance/get/get_status/delete' }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'workflowId', type: 'string' },
      { canonical: 'id', aliases: ['runId'], type: 'string' }
    ],
    handler: (args: any, service: any) => {
      switch (args.action) {
        case 'start': return service.startWorkflowExecution(args.workflowId);
        case 'advance': return service.advanceWorkflowRun(args.id);
        case 'get': return service.getWorkflowRun(args.id);
        case 'get_status': return service.getWorkflowRunStatus(args.id);
        case 'list': return service.listWorkflowRuns();
        case 'delete': return service.deleteWorkflowRun(args.id);
        default: throw new Error(`Unknown workflow_run action: '${args.action}'. Expected one of: start, advance, get, get_status, list, delete.`);
      }
    }
  },
  {
    name: 'strategy',
    tool: {
      name: 'strategy',
      description: 'Manage strategies (the top-level organizer grouping related trees and workflows): create, get, list, delete, add_tree, remove_tree, add_workflow, remove_workflow, or deduplicate - pick one via `action`. create is idempotent get-or-create by normalized name.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'get', 'list', 'delete', 'add_tree', 'remove_tree', 'add_workflow', 'remove_workflow', 'deduplicate'], description: 'Which operation to perform' },
          id: { type: 'string', description: 'Strategy ID, for get/delete/add_tree/remove_tree/add_workflow/remove_workflow' },
          name: { type: 'string', description: 'Strategy name, for create' },
          description: { type: 'string', description: 'Strategy description, for create' },
          metadata: { type: 'object', description: 'Additional metadata, for create' },
          treeId: { type: 'string', description: 'Tree ID, for add_tree/remove_tree' },
          workflowId: { type: 'string', description: 'Workflow ID, for add_workflow/remove_workflow' }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'id', aliases: ['strategyId'], type: 'string' },
      { canonical: 'name', type: 'string' },
      { canonical: 'description', type: 'string' },
      { canonical: 'metadata', type: 'object' },
      { canonical: 'treeId', type: 'string' },
      { canonical: 'workflowId', type: 'string' }
    ],
    handler: (args: any, service: any) => {
      switch (args.action) {
        case 'create': return service.createStrategy(args);
        case 'get': return service.getStrategy(args.id);
        case 'list': return service.getAllStrategies();
        case 'delete': return service.deleteStrategy(args.id);
        case 'add_tree': return service.addTreeToStrategy(args.id, args.treeId);
        case 'remove_tree': return service.removeTreeFromStrategy(args.id, args.treeId);
        case 'add_workflow': return service.addWorkflowToStrategy(args.id, args.workflowId);
        case 'remove_workflow': return service.removeWorkflowFromStrategy(args.id, args.workflowId);
        case 'deduplicate': return Promise.resolve({ removed: service.deduplicateStrategies() });
        default: throw new Error(`Unknown strategy action: '${args.action}'. Expected one of: create, get, list, delete, add_tree, remove_tree, add_workflow, remove_workflow, deduplicate.`);
      }
    }
  }
];
