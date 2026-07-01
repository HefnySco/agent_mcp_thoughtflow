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
          workflowId: { type: 'string', description: 'Assign tasks to existing workflow ID' }
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
  }
];
