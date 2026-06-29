import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';

/**
 * Task Orchestrator tool definitions and handlers
 */
export const taskToolDefinitions: { name: string; tool: Tool; handler: ToolHandler }[] = [
  {
    name: 'create_task',
    tool: {
      name: 'create_task',
      description: 'Create a new task with optional dependencies and metadata',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Task name' },
          description: { type: 'string', description: 'Task description' },
          dependencies: { type: 'array', items: { type: 'string' }, description: 'Task dependency IDs' },
          parentTaskId: { type: 'string', description: 'Parent task ID for subtasks' },
          order: { type: 'number', description: 'Order among siblings' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['name']
      }
    },
    handler: (args: any, service: any) => service.createTask(args)
  },
  {
    name: 'get_task',
    tool: {
      name: 'get_task',
      description: 'Get a task by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.getTask(args.id)
  },
  {
    name: 'list_tasks',
    tool: {
      name: 'list_tasks',
      description: 'List all tasks, optionally filtered by status',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'failed'], description: 'Filter by status' }
        }
      }
    },
    handler: (args: any, service: any) => service.listTasks(args.status)
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
      description: 'Delete a task',
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
      description: 'Create a workflow with a set of tasks',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Workflow name' },
          description: { type: 'string', description: 'Workflow description' },
          taskIds: { type: 'array', items: { type: 'string' }, description: 'Task IDs in the workflow' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['name', 'taskIds']
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
          id: { type: 'string', description: 'Workflow ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.getWorkflow(args.id)
  },
  {
    name: 'list_workflows',
    tool: {
      name: 'list_workflows',
      description: 'List all workflows',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: (_args: any, service: any) => service.listWorkflows()
  },
  {
    name: 'delete_workflow',
    tool: {
      name: 'delete_workflow',
      description: 'Delete a workflow',
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
      description: 'Start execution of a workflow',
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
      description: 'Advance a workflow run after task completion',
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
      description: 'Get a workflow run by ID',
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
  }
];
