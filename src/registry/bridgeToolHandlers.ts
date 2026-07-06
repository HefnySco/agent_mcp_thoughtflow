import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';

/**
 * Cognitive Bridge tool definitions and handlers
 */
export const bridgeToolDefinitions: { name: string; tool: Tool; handler: ToolHandler }[] = [
  {
    name: 'promote_thought_to_tasks',
    tool: {
      name: 'promote_thought_to_tasks',
      description: 'Promote a thought (or subtree) to executable tasks',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID to promote' },
          includeDescendants: { type: 'boolean', description: 'Include descendant thoughts' },
          flattenHierarchy: { type: 'boolean', description: 'Flatten subtree into flat task list' },
          taskNamePrefix: { type: 'string', description: 'Prefix for task names' },
          workflowId: { type: 'string', description: 'Assign tasks to existing workflow ID' },
          skipEvaluationGate: { type: 'boolean', description: 'Skip the evaluate+select cycle for simple workflows (default false)' }
        },
        required: ['treeId', 'thoughtId', 'workflowId']
      }
    },
    handler: (args: any, service: any) => service.promoteThoughtToTasks(args)
  },
  {
    name: 'spawn_tot_from_task',
    tool: {
      name: 'spawn_tot_from_task',
      description: 'Spawn a Tree of Thoughts from a task for reasoning',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID' },
          treeId: { type: 'string', description: 'Existing tree ID to attach to' },
          goal: { type: 'string', description: 'Goal for the reasoning tree' },
          rootContent: { type: 'string', description: 'Root thought content' },
          maxDepth: { type: 'number', description: 'Maximum depth' }
        },
        required: ['taskId']
      }
    },
    handler: (args: any, service: any) => service.spawnTotFromTask(args)
  },
  {
    name: 'link_thought_to_task',
    tool: {
      name: 'link_thought_to_task',
      description: 'Create a soft bidirectional link between a thought and a task for provenance tracking',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID' },
          taskId: { type: 'string', description: 'Task ID' },
          reason: { type: 'string', description: 'Optional reason for the link (e.g., "inspired by", "related to")' }
        },
        required: ['treeId', 'thoughtId', 'taskId']
      }
    },
    handler: (args: any, service: any) => service.linkThoughtToTask(args)
  },
  {
    name: 'get_cognitive_provenance',
    tool: {
      name: 'get_cognitive_provenance',
      description: 'Get cognitive provenance chain for a task or thought',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Task or thought ID' },
          type: { type: 'string', enum: ['task', 'thought'], description: 'Type of entity' },
          maxDepth: { type: 'number', description: 'Maximum depth to traverse' }
        },
        required: ['id', 'type']
      }
    },
    handler: (args: any, service: any) => service.getCognitiveProvenance(args.id, args.type, args.maxDepth)
  },
  {
    name: 'deduplicate_strategies_and_trees',
    tool: {
      name: 'deduplicate_strategies_and_trees',
      description: 'Deduplicate strategies and trees by their normalized name/goal. This cleans up duplicate entries that may have been created before the deduplication logic was added. Keeps the first occurrence of each unique normalized name/goal and removes duplicates.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    handler: (_args: any, service: any) => service.deduplicateStrategiesAndTrees()
  },
  {
    name: 'complete_task_and_thought',
    tool: {
      name: 'complete_task_and_thought',
      description: 'Atomically mark a task as completed and evaluate/verify all linked thoughts in one operation',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Task ID to complete' },
          score: { type: 'number', description: 'Evaluation score for linked thoughts (default 85)' },
          verificationNotes: { type: 'string', description: 'Optional verification notes for linked thoughts' },
          verified: { type: 'boolean', description: 'Mark task as verified' },
          verificationMethod: { type: 'string', description: 'Verification method (e.g. "manual_test", "stress_test", "code_review", "automated_test")' }
        },
        required: ['taskId']
      }
    },
    handler: (args: any, service: any) => service.completeTaskAndThought(args)
  },
  {
    name: 'quick_plan',
    tool: {
      name: 'quick_plan',
      description: 'Single call to create strategy + workflow + tasks + root thought. Reduces 4-5 tool calls to 1 for new project setup.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Goal for the project' },
          tasks: { type: 'array', items: { type: 'object' }, description: 'Array of tasks to create' },
          strategyName: { type: 'string', description: 'Optional strategy name (defaults to goal)' },
          workflowName: { type: 'string', description: 'Optional workflow name (defaults to goal)' }
        },
        required: ['goal', 'tasks']
      }
    },
    handler: (args: any, service: any) => service.quickPlan(args)
  },
  {
    name: 'sync_workflow_thoughts',
    tool: {
      name: 'sync_workflow_thoughts',
      description: 'Scan all completed tasks in a workflow and evaluate any still-pending linked thoughts. Returns sync report.',
      inputSchema: {
        type: 'object',
        properties: {
          workflowId: { type: 'string', description: 'Workflow ID to sync' }
        },
        required: ['workflowId']
      }
    },
    handler: (args: any, service: any) => service.syncWorkflowThoughts(args)
  }
];
