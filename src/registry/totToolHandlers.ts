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
          strategyId: { type: 'string', description: 'Strategy ID - tree must belong to exactly one strategy' },
          metadata: { type: 'object', description: 'Additional metadata' }
        },
        required: ['goal', 'rootContent', 'strategyId']
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
          id: { type: 'string', description: 'Tree ID' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted trees' }
        },
        required: ['id']
      }
    },
    handler: (args: any, service: any) => {
      const tree = service.getTreeFull(args.id, args.includeDeleted);
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
        properties: {
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted trees' }
        }
      }
    },
    handler: (args: any, service: any) => service.listTrees(args.includeDeleted)
  },
  {
    name: 'delete_tree',
    tool: {
      name: 'delete_tree',
      description: 'Soft-delete a tree (marks as deleted, preserves for recovery)',
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
    name: 'delete_thought',
    tool: {
      name: 'delete_thought',
      description: 'Soft-delete a thought (marks as deleted, preserves for recovery)',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          thoughtId: { type: 'string', description: 'Thought ID' }
        },
        required: ['treeId', 'thoughtId']
      }
    },
    handler: (args: any, service: any) => service.deleteThought(args.treeId, args.thoughtId)
  },
  {
    name: 'add_ideas',
    tool: {
      name: 'add_ideas',
      description: 'BATCH idea creation - use this for adding multiple related child thoughts to a tree. Single-item add_idea is NOT available. When adding ideas to the root, use parentId: "root". You can also use the actual root ID returned when the tree was created. Supports positional references (idea-1, idea-2, etc.) for parentId within the batch - e.g., parentId: "idea-2" to attach to the second idea in this batch. Also supports name-based resolution for existing thoughts using fuzzy matching for robustness. Returns { thoughts: [{id, content, state}], idMap: {"idea-1": "real-id", ...} } so you can map positional refs to real IDs. All ideas must belong to the same tree. Use deduplication="skip" (default) to reuse existing thoughts, "error" to fail on duplicates, or "overwrite" to update existing thoughts in-place (resets state to pending). This is the ONLY way to add ideas - always use batch for efficiency.',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID - all ideas must belong to this tree' },
          ideas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                parentId: { type: 'string', description: 'Parent thought ID - use positional ref like "idea-1" for ideas in this batch, or existing thought ID/name (fuzzy matching supported)' },
                content: { type: 'string', description: 'Content of the child thought' },
                metadata: { type: 'object', description: 'Additional metadata' }
              },
              required: ['parentId', 'content']
            },
            description: 'Array of ideas to add - use positional refs (idea-1, idea-2) for cross-references within this batch'
          },
          deduplication: { type: 'string', enum: ['skip', 'error', 'overwrite'], description: 'Deduplication strategy: skip (use existing thought), error (fail if duplicate exists), or overwrite (update existing thought in-place)' }
        },
        required: ['treeId', 'ideas']
      }
    },
    handler: (args: any, service: any) => service.addIdeas(args)
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
      description: 'Evaluate a thought with a score (0-100) and optional multi-criteria fields. Automatically transitions the thought from "pending" to "evaluated" state when appropriate. Returns enhanced feedback including stateTransitioned, previousState, newState, and a helpful message with next-step guidance for the LLM.',
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
      description: 'Mark a thought as verified after confirming its findings. Automatically transitions the thought from "pending" to "evaluated" state when appropriate. Returns enhanced feedback including stateTransitioned, previousState, newState, and a helpful message with next-step guidance for the LLM.',
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
  },
  {
    name: 'generate_children_with_llm',
    tool: {
      name: 'generate_children_with_llm',
      description: 'Generate child thoughts using the configured LLM provider (Grok, Ollama, etc.). This triggers actual API calls to the LLM service.',
      inputSchema: {
        type: 'object',
        properties: {
          treeId: { type: 'string', description: 'Tree ID' },
          parentId: { type: 'string', description: 'Parent thought ID to generate children for' },
          numChildren: { type: 'number', description: 'Number of child thoughts to generate (default: 3)' },
          temperature: { type: 'number', description: 'Temperature for LLM generation (default: 0.7)' }
        },
        required: ['treeId', 'parentId']
      }
    },
    handler: async (args: any, service: any) => {
      const thoughts = await service.generateChildrenWithLLM(args);
      return {
        thoughts: thoughts.map((t: any) => ({
          id: t.id,
          content: t.content,
          state: t.state,
          depth: t.depth,
          metadata: t.metadata
        })),
        count: thoughts.length
      };
    }
  },
  {
    name: 'batch_evaluate_thoughts',
    tool: {
      name: 'batch_evaluate_thoughts',
      description: 'Batch evaluate multiple thoughts in one call. Consistent with batch pattern in add_ideas/create_tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          evaluations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                treeId: { type: 'string', description: 'Tree ID' },
                thoughtId: { type: 'string', description: 'Thought ID' },
                score: { type: 'number', description: 'Evaluation score (0-100)' },
                creativity: { type: 'number', description: 'Creativity score (0-100)' },
                risk: { type: 'number', description: 'Risk score (0-100)' },
                criteriaScores: { type: 'object', description: 'Custom criteria scores' },
                reasoning: { type: 'string', description: 'Evaluation reasoning' }
              },
              required: ['treeId', 'thoughtId', 'score']
            },
            description: 'Array of thought evaluations'
          }
        },
        required: ['evaluations']
      }
    },
    handler: (args: any, service: any) => service.batchEvaluateThoughts(args)
  }
];
