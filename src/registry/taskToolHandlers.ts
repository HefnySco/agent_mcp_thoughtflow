import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';

/**
 * Task Orchestrator tool definitions and handlers
 */
export const taskToolDefinitions: { name: string; tool: Tool; handler: ToolHandler }[] = [
  {
    name: 'create_tasks',
    tool: {
      name: 'create_tasks',
      description: 'BATCH task creation - use this for creating multiple related tasks. Single-item create_task is NOT available. Supports positional references (task-1, task-2, etc.) for dependencies and parentTaskId within the batch - e.g., dependencies: ["task-1", "task-3"] or parentTaskId: "task-2". Also supports name-based resolution for existing tasks. Returns { tasks: [{id, name, status}], idMap: {"task-1": "real-id", ...} } so you can map positional refs to real IDs. Use deduplication="skip" to reuse existing tasks, "error" to fail on duplicates, or "overwrite" to create new ones. All tasks must belong to the same workflow. This is the ONLY way to create tasks - always use batch for efficiency.',
      inputSchema: {
        type: 'object',
        properties: {
          tasks: {
            type: 'array',
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
            },
            description: 'Array of tasks to create - use positional refs (task-1, task-2) for cross-references within this batch'
          },
          workflowId: { type: 'string', description: 'Workflow ID - all tasks must belong to this workflow. If provided but the workflow does not exist, it will be automatically created (requires strategyId). If omitted, tasks will be created as standalone (no workflow association) and assigned to a default strategy.' },
          strategyId: { type: 'string', description: 'Strategy ID - required when workflowId triggers auto-creation. If workflow already exists, this is ignored. If workflowId is omitted, this specifies the strategy for standalone tasks (defaults to "scratch" strategy).' },
          deduplication: { type: 'string', enum: ['skip', 'error', 'overwrite'], description: 'Deduplication strategy: skip (use existing task), error (fail if duplicate exists), or overwrite (create new task anyway)' }
        },
        required: ['tasks']
      }
    },
    handler: (args: any, service: any) => {
      return service.createTasks(args);
    }
  },
  {
    name: 'get_task',
    tool: {
      name: 'get_task',
      description: 'Get a task by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted tasks' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.getTask(args.id, args.includeDeleted)
  },
  {
    name: 'list_tasks',
    tool: {
      name: 'list_tasks',
      description: 'List all tasks, optionally filtered by status',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'Filter by status' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted tasks' }
        }
      }
    },
    handler: (args: any, service: any) => service.listTasks(args.status, args.includeDeleted)
  },
  {
    name: 'update_task',
    tool: {
      name: 'update_task',
      description: 'Update a task',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' },
          name: { type: 'string', description: 'Task name' },
          description: { type: 'string', description: 'Task description' },
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'Task status' },
          dependencies: { type: 'array', items: { type: 'string' }, description: 'Task dependency IDs' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.updateTask(args.id, args)
  },
  {
    name: 'delete_task',
    tool: {
      name: 'delete_task',
      description: 'Soft-delete a task (marks as deleted, preserves for recovery)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.deleteTask(args.id)
  },
  {
    name: 'create_workflow',
    tool: {
      name: 'create_workflow',
      description: 'Create a workflow with a set of tasks. Remember to call start_workflow_execution to begin processing.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workflow name' },
          description: { type: 'string', description: 'Workflow description' },
          taskIds: { type: 'array', items: { type: 'string' }, description: 'Task IDs in the workflow' },
          strategyId: { type: 'string', description: 'Strategy ID - workflow must belong to exactly one strategy' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['name', 'taskIds', 'strategyId']
      }
    },
    handler: (args: any, service: any) => service.createWorkflow(args)
  },
  {
    name: 'get_workflow',
    tool: {
      name: 'get_workflow',
      description: 'Get a workflow by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Workflow ID' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted workflows' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.getWorkflow(args.id, args.includeDeleted)
  },
  {
    name: 'list_workflows',
    tool: {
      name: 'list_workflows',
      description: 'List all workflows',
      inputSchema: {
        type: 'object',
        properties: {
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted workflows' }
        }
      }
    },
    handler: (args: any, service: any) => service.listWorkflows(args.includeDeleted)
  },
  {
    name: 'delete_workflow',
    tool: {
      name: 'delete_workflow',
      description: 'Soft-delete a workflow (marks as deleted, preserves for recovery)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Workflow ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.deleteWorkflow(args.id)
  },
  {
    name: 'create_strategy',
    tool: {
      name: 'create_strategy',
      description: 'Create a strategy for organizing related workflows',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Strategy name' },
          description: { type: 'string', description: 'Strategy description' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['name']
      }
    },
    handler: (args: any, service: any) => service.createStrategy(args)
  },
  {
    name: 'get_strategy',
    tool: {
      name: 'get_strategy',
      description: 'Get a strategy by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Strategy ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.getStrategy(args.id)
  },
  {
    name: 'list_strategies',
    tool: {
      name: 'list_strategies',
      description: 'List all strategies',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: (_args: any, service: any) => service.getAllStrategies()
  },
  {
    name: 'delete_strategy',
    tool: {
      name: 'delete_strategy',
      description: 'Soft-delete a strategy (marks as deleted, preserves for recovery)',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Strategy ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.deleteStrategy(args.id)
  },
  {
    name: 'add_tree_to_strategy',
    tool: {
      name: 'add_tree_to_strategy',
      description: 'Add a tree to a strategy',
      inputSchema: {
        type: 'object',
        properties: {
          strategyId: { type: 'string', description: 'Strategy ID' },
          treeId: { type: 'string', description: 'Tree ID' }
        },
        required: ['strategyId', 'treeId']
      }
    },
    handler: (args: any, service: any) => service.addTreeToStrategy(args.strategyId, args.treeId)
  },
  {
    name: 'remove_tree_from_strategy',
    tool: {
      name: 'remove_tree_from_strategy',
      description: 'Remove a tree from a strategy',
      inputSchema: {
        type: 'object',
        properties: {
          strategyId: { type: 'string', description: 'Strategy ID' },
          treeId: { type: 'string', description: 'Tree ID' }
        },
        required: ['strategyId', 'treeId']
      }
    },
    handler: (args: any, service: any) => service.removeTreeFromStrategy(args.strategyId, args.treeId)
  },
  {
    name: 'add_workflow_to_strategy',
    tool: {
      name: 'add_workflow_to_strategy',
      description: 'Add a workflow to a strategy',
      inputSchema: {
        type: 'object',
        properties: {
          strategyId: { type: 'string', description: 'Strategy ID' },
          workflowId: { type: 'string', description: 'Workflow ID' }
        },
        required: ['strategyId', 'workflowId']
      }
    },
    handler: (args: any, service: any) => service.addWorkflowToStrategy(args.strategyId, args.workflowId)
  },
  {
    name: 'remove_workflow_from_strategy',
    tool: {
      name: 'remove_workflow_from_strategy',
      description: 'Remove a workflow from a strategy',
      inputSchema: {
        type: 'object',
        properties: {
          strategyId: { type: 'string', description: 'Strategy ID' },
          workflowId: { type: 'string', description: 'Workflow ID' }
        },
        required: ['strategyId', 'workflowId']
      }
    },
    handler: (args: any, service: any) => service.removeWorkflowFromStrategy(args.strategyId, args.workflowId)
  },
  {
    name: 'clear_all',
    tool: {
      name: 'clear_all',
      description: 'Clear all data (tasks, workflows, strategies, trees)',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: async (_args: any, service: any) => {
      await service.clearAll();
      return { success: true };
    }
  },
  {
    name: 'start_workflow_execution',
    tool: {
      name: 'start_workflow_execution',
      description: 'Start execution of a workflow. Returns runId, workflowStatus, readyTasks (minimal: id + status only), totalTasks, and readyCount. IMPORTANT: readyTasks contains only task identifiers (id + status) for maximum token efficiency. Use get_task() when you need full task details like name/description. You must manually execute the ready tasks, update their status to completed, and call advance_workflow_run to progress. Use get_workflow_run_status when you need the complete picture of all tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' }
        },
        required: ['workflowId']
      }
    },
    handler: (args: any, service: any) => service.startWorkflowExecution(args.workflowId)
  },
  {
    name: 'advance_workflow_run',
    tool: {
      name: 'advance_workflow_run',
      description: 'Advance a workflow run after completing tasks. Returns deltas: newlyCompletedTasks, newlyFailedTasks, newlyReadyTasks (all minimal: id + status only), and workflowStatus. This is token-efficient - it does NOT re-list all previously completed tasks. Task arrays contain only identifiers (id + status) for maximum token efficiency. Use get_task() when you need full task details like name/description. Call this AFTER you have updated ready tasks to completed. Use get_workflow_run_status when you need the complete picture of all tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Workflow run ID' }
        },
        required: ['runId']
      }
    },
    handler: (args: any, service: any) => service.advanceWorkflowRun(args.runId)
  },
  {
    name: 'get_workflow_run',
    tool: {
      name: 'get_workflow_run',
      description: 'Get a workflow run by ID (minimal summary). Use get_workflow_run_status for full details including all tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Workflow run ID' }
        },
        required: ['runId']
      }
    },
    handler: (args: any, service: any) => service.getWorkflowRun(args.runId)
  },
  {
    name: 'get_workflow_run_status',
    tool: {
      name: 'get_workflow_run_status',
      description: 'Get full workflow run status with all task details and summary counts. Use this when you need the complete picture of a workflow run (all tasks with their current status). For token-efficient incremental updates during execution, use advance_workflow_run instead.',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Workflow run ID' }
        },
        required: ['runId']
      }
    },
    handler: (args: any, service: any) => service.getWorkflowRunStatus(args.runId)
  },
  {
    name: 'list_workflow_runs',
    tool: {
      name: 'list_workflow_runs',
      description: 'List all workflow runs',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: (_args: any, service: any) => service.listWorkflowRuns()
  },
  {
    name: 'delete_workflow_run',
    tool: {
      name: 'delete_workflow_run',
      description: 'Delete a workflow run',
      inputSchema: {
        type: 'object',
        properties: {
          runId: { type: 'string', description: 'Workflow run ID' }
        },
        required: ['runId']
      }
    },
    handler: (args: any, service: any) => service.deleteWorkflowRun(args.runId)
  },
  {
    name: 'get_subtasks',
    tool: {
      name: 'get_subtasks',
      description: 'Get all subtasks of a parent task',
      inputSchema: {
        type: 'object',
        properties: {
          parentTaskId: { type: 'string', description: 'Parent task ID' }
        },
        required: ['parentTaskId']
      }
    },
    handler: (args: any, service: any) => service.getSubtasks(args.parentTaskId)
  },
  {
    name: 'move_task',
    tool: {
      name: 'move_task',
      description: 'Move a task to a new parent or change its order',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
          newParentTaskId: { type: 'string', description: 'New parent task ID (null to remove parent)' },
          order: { type: 'number', description: 'Order among siblings' }
        },
        required: ['taskId']
      }
    },
    handler: (args: any, service: any) => service.moveTask(args.taskId, args)
  },
  {
    name: 'deduplicate_strategies',
    tool: {
      name: 'deduplicate_strategies',
      description: 'Deduplicate strategies by normalized name. Keeps the first occurrence of each unique normalized name and removes duplicates.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    handler: (_args: any, service: any) => Promise.resolve({ removed: service.deduplicateStrategies() })
  },
  {
    name: 'add_task_to_workflow',
    tool: {
      name: 'add_task_to_workflow',
      description: 'Add a task to a workflow at a specific position. position: -1 = end (default), 0 = beginning, or specific index.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' },
          taskId: { type: 'string', description: 'Task ID to add' },
          position: { type: 'number', description: 'Position to insert at (-1 for end, 0 for beginning, or specific index)' }
        },
        required: ['workflowId', 'taskId']
      }
    },
    handler: (args: any, service: any) => service.addTaskToWorkflow(args.workflowId, args.taskId, args.position)
  },
  {
    name: 'remove_task_from_workflow',
    tool: {
      name: 'remove_task_from_workflow',
      description: 'Remove a task from a workflow',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID' },
          taskId: { type: 'string', description: 'Task ID to remove' }
        },
        required: ['workflowId', 'taskId']
      }
    },
    handler: (args: any, service: any) => service.removeTaskFromWorkflow(args.workflowId, args.taskId)
  },
  {
    name: 'purge_deleted',
    tool: {
      name: 'purge_deleted',
      description: 'Permanently delete (hard purge) soft-deleted items. Use with caution - this cannot be undone.',
      inputSchema: {
        type: 'object',
        properties: {
          entityType: { 
            type: 'string', 
            description: 'Entity type to purge: "task", "workflow", "tree", "strategy", "link", "workflow_run", or "all" (default)',
            enum: ['task', 'workflow', 'tree', 'strategy', 'link', 'workflow_run', 'all']
          },
          olderThanDays: { 
            type: 'number', 
            description: 'Only purge items deleted more than this many days ago. If not specified, purges all soft-deleted items.' 
          }
        },
        required: []
      }
    },
    handler: (args: any, service: any) => service.purgeDeleted(args.entityType, args.olderThanDays)
  },
  {
    name: 'restore_deleted',
    tool: {
      name: 'restore_deleted',
      description: 'Restore a soft-deleted entity back to active state',
      inputSchema: {
        type: 'object',
        properties: {
          entityType: { 
            type: 'string', 
            description: 'Entity type to restore',
            enum: ['task', 'workflow', 'tree', 'strategy', 'link']
          },
          id: { 
            type: 'string', 
            description: 'Entity ID to restore' 
          }
        },
        required: ['entityType', 'id']
      }
    },
    handler: (args: any, service: any) => Promise.resolve({ restored: service.restoreDeleted(args.entityType, args.id) })
  }
];
