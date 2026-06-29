import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';

/**
 * Tree of Thoughts tool definitions and handlers
 */
export const totToolDefinitions: { name: string; tool: Tool; handler: ToolHandler }[] = [
  {
    name: 'create_tree',
    tool: {
      name: 'create_tree',
      description: 'Create a new Tree of Thoughts for systematic reasoning',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'The goal or problem this tree is solving' },
          rootContent: { type: 'string', description: 'The content of the root thought' },
          maxDepth: { type: 'number', description: 'Maximum depth of the tree (default: 10)' },
          sessionId: { type: 'string', description: 'Optional session ID for context maintenance' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['goal', 'rootContent']
      }
    },
    handler: (args: any, service: any) => service.createTree(args)
  },
  {
    name: 'get_tree',
    tool: {
      name: 'get_tree',
      description: 'Get a tree by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Tree ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => {
      const tree = service.getTreeFull(args.id);
      // Convert thoughts Map to object for JSON serialization
      return {
        ...tree,
        thoughts: Object.fromEntries(tree.thoughts)
      };
    }
  },
  {
    name: 'list_trees',
    tool: {
      name: 'list_trees',
      description: 'List all trees',
      inputSchema: {
        type: 'object',
        properties: {}
      }
    },
    handler: (_args: any, service: any) => service.listTrees()
  },
  {
    name: 'delete_tree',
    tool: {
      name: 'delete_tree',
      description: 'Delete a tree',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Tree ID' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => service.deleteTree(args.id)
  },
  {
    name: 'add_idea',
    tool: {
      name: 'add_idea',
      description: 'Add a child thought to an existing thought',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          parentId: { type: 'string', description: 'Parent thought ID' },
          content: { type: 'string', description: 'Content of the child thought' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['treeId', 'parentId', 'content']
      }
    },
    handler: (args: any, service: any) => service.addIdea(args.treeId, args.parentId, args.content, args.metadata)
  },
  {
    name: 'get_thought',
    tool: {
      name: 'get_thought',
      description: 'Get a thought by ID',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID' }
        },
        required: ['treeId', 'thoughtId']
      }
    },
    handler: (args: any, service: any) => service.getThought(args.treeId, args.thoughtId)
  },
  {
    name: 'evaluate_thought',
    tool: {
      name: 'evaluate_thought',
      description: 'Evaluate a thought with a score (0-100) and optional multi-criteria fields',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID' },
          score: { type: 'number', minimum: 0, maximum: 100, description: 'Overall evaluation score (0-100)' },
          creativity: { type: 'number', minimum: 0, maximum: 100, description: 'Creativity score (0-100)' },
          risk: { type: 'number', minimum: 0, maximum: 100, description: 'Risk score (0-100)' },
          criteriaScores: { type: 'object', description: 'Custom criteria scores' },
          reasoning: { type: 'string', description: 'Reasoning for the evaluation' }
        },
        required: ['treeId', 'thoughtId', 'score']
      }
    },
    handler: (args: any, service: any) => service.evaluateThought(args)
  },
  {
    name: 'verify_thought',
    tool: {
      name: 'verify_thought',
      description: 'Mark a thought as verified after confirming its findings',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID' },
          verificationNotes: { type: 'string', description: 'Notes explaining how/why the thought was verified' }
        },
        required: ['treeId', 'thoughtId']
      }
    },
    handler: (args: any, service: any) => service.verifyThought(args)
  },
  {
    name: 'select_thought',
    tool: {
      name: 'select_thought',
      description: 'Mark a thought as selected for further exploration',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID' }
        },
        required: ['treeId', 'thoughtId']
      }
    },
    handler: (args: any, service: any) => service.selectThought(args)
  },
  {
    name: 'backtrack',
    tool: {
      name: 'backtrack',
      description: 'Backtrack from a thought, marking all descendants as pruned',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID to backtrack from' }
        },
        required: ['treeId', 'thoughtId']
      }
    },
    handler: (args: any, service: any) => service.backtrack(args)
  },
  {
    name: 'prune_tree',
    tool: {
      name: 'prune_tree',
      description: 'Prune thoughts below a certain evaluation threshold',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          threshold: { type: 'number', description: 'Evaluation threshold (thoughts below this will be pruned)' },
          riskThreshold: { type: 'number', description: 'Optional risk threshold' }
        },
        required: ['treeId', 'threshold']
      }
    },
    handler: (args: any, service: any) => service.pruneTree(args)
  },
  {
    name: 'clear_all_trees',
    tool: {
      name: 'clear_all_trees',
      description: 'Clear all trees',
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
    name: 'deduplicate_trees',
    tool: {
      name: 'deduplicate_trees',
      description: 'Deduplicate trees by normalized goal. Keeps the first occurrence of each unique normalized goal and removes duplicates.',
      inputSchema: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    handler: (_args: any, service: any) => Promise.resolve({ removed: service.deduplicateTrees() })
  }
];
