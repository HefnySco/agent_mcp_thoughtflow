import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';
import type { ParamFieldSpec } from '../utils/paramResolver.js';

/**
 * Tree of Thoughts tool definitions and handlers
 */
export const totToolDefinitions: { name: string; tool: Tool; handler: ToolHandler; paramSpec?: ParamFieldSpec[] }[] = [
  {
    name: 'tree',
    tool: {
      name: 'tree',
      description: 'Manage Trees of Thoughts (the container for a reasoning session): create, get, list, delete, prune, clear_all, or deduplicate - pick one via `action`. IMPORTANT: use this (with the `thought` tool) whenever you have 2+ candidate approaches that need to be compared/scored before picking one - even if the candidates are already named/known, not just for open-ended brainstorming. Do NOT model competing alternatives as parallel `task` entries - create a tree here, add the candidates as sibling thoughts (`thought` action="compare_options"), evaluate each, select the winner, then use `bridge` action="promote_to_tasks" to convert only the winning approach into tasks.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['create', 'get', 'list', 'delete', 'prune', 'clear_all', 'deduplicate'], description: 'Which operation to perform' },
          id: { type: 'string', description: 'Tree ID, for get/delete/prune' },
          goal: { type: 'string', description: 'The goal or problem this tree is solving, for create' },
          rootContent: { type: 'string', description: 'The content of the root thought, for create' },
          maxDepth: { type: 'number', description: 'Maximum depth of the tree (default: 10), for create' },
          sessionId: { type: 'string', description: 'Optional session ID for context maintenance, for create' },
          strategyId: { type: 'string', description: 'Strategy ID, for create. Optional - if omitted, the tree is created under a new implicit strategy.' },
          metadata: { type: 'object', description: 'Additional metadata, for create' },
          includeDeleted: { type: 'boolean', description: 'Include soft-deleted trees, for get/list' },
          threshold: { type: 'number', description: 'Evaluation threshold - thoughts below this will be pruned, for prune' },
          riskThreshold: { type: 'number', description: 'Optional risk threshold, for prune' }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'id', aliases: ['treeId'], type: 'string' },
      { canonical: 'goal', type: 'string' },
      { canonical: 'rootContent', type: 'string' },
      { canonical: 'maxDepth', type: 'number' },
      { canonical: 'sessionId', type: 'string' },
      { canonical: 'strategyId', type: 'string' },
      { canonical: 'metadata', type: 'object' },
      { canonical: 'includeDeleted', type: 'boolean' },
      { canonical: 'threshold', type: 'number' },
      { canonical: 'riskThreshold', type: 'number' }
    ],
    handler: (args: any, service: any) => {
      switch (args.action) {
        case 'create': return service.createTree(args);
        case 'get': {
          const tree = service.getTreeFull(args.id, args.includeDeleted);
          // Convert thoughts Map to object for JSON serialization
          return { ...tree, thoughts: Object.fromEntries(tree.thoughts) };
        }
        case 'list': return service.listTrees(args.includeDeleted);
        case 'delete': return service.deleteTree(args.id);
        case 'prune': return service.pruneTree({ treeId: args.id, threshold: args.threshold, riskThreshold: args.riskThreshold });
        case 'clear_all': return Promise.resolve(service.clearAll()).then(() => ({ success: true }));
        case 'deduplicate': return Promise.resolve({ removed: service.deduplicateTrees() });
        default: throw new Error(`Unknown tree action: '${args.action}'. Expected one of: create, get, list, delete, prune, clear_all, deduplicate.`);
      }
    }
  },
  {
    name: 'thought',
    tool: {
      name: 'thought',
      description: 'Manage thoughts (nodes within a Tree of Thoughts): compare_options (batch, for evaluating known candidate approaches), add_ideas (batch, for open-ended idea generation), get, evaluate, verify, select, backtrack, delete, generate_children, or batch_evaluate - pick one via `action`. compare_options/add_ideas/batch_evaluate are the ONLY ways to add/evaluate thoughts - always batch, even for a single item. When adding ideas to the root, use parentId: "root" or the actual root ID. DISCIPLINE: after compare_options or add_ideas, evaluate EVERY candidate (action="evaluate") before select - never select without scoring the alternatives first.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['compare_options', 'add_ideas', 'get', 'evaluate', 'verify', 'select', 'backtrack', 'delete', 'generate_children', 'batch_evaluate'], description: 'Which operation to perform' },
          treeId: { type: 'string', description: 'Tree ID - required for all actions except batch_evaluate (which carries treeId per-item)' },
          id: { type: 'string', description: 'Thought ID, for get/evaluate/verify/select/backtrack/delete' },
          parentId: { type: 'string', description: 'Parent thought ID, for generate_children (use "root" or the actual root ID for top-level)' },
          options: {
            type: 'array',
            description: 'Array of candidate approaches to compare, for action="compare_options" - each becomes a sibling thought under parentId (default "root") in one call, ready to evaluate and select from',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Short label for the candidate (used as content if `content` is omitted)' },
                content: { type: 'string', description: 'Full description of the candidate approach' },
                parentId: { type: 'string', description: 'Parent thought ID (default: "root")' },
                metadata: { type: 'object', description: 'Additional metadata' }
              }
            }
          },
          ideas: {
            type: 'array',
            description: 'Array of ideas to add, for action="add_ideas" - use positional refs (idea-1, idea-2) for cross-references within this batch',
            items: {
              type: 'object',
              properties: {
                parentId: { type: 'string', description: 'Parent thought ID - use positional ref like "idea-1" for ideas in this batch, or existing thought ID/name (fuzzy matching supported)' },
                content: { type: 'string', description: 'Content of the child thought' },
                metadata: { type: 'object', description: 'Additional metadata' }
              },
              required: ['parentId', 'content']
            }
          },
          deduplication: { type: 'string', enum: ['skip', 'error', 'overwrite'], description: 'Deduplication strategy for add_ideas: skip (use existing thought), error (fail if duplicate exists), or overwrite (update existing thought in-place)' },
          score: { type: 'number', minimum: 0, maximum: 100, description: 'Overall evaluation score (0-100), for evaluate' },
          creativity: { type: 'number', minimum: 0, maximum: 100, description: 'Creativity score (0-100), for evaluate' },
          risk: { type: 'number', minimum: 0, maximum: 100, description: 'Risk score (0-100), for evaluate' },
          criteriaScores: { type: 'object', description: 'Custom criteria scores, for evaluate' },
          reasoning: { type: 'string', description: 'Reasoning for the evaluation, for evaluate' },
          verificationNotes: { type: 'string', description: 'Notes explaining how/why the thought was verified, for verify' },
          numChildren: { type: 'number', description: 'Number of child thoughts to generate (default: 3), for generate_children' },
          temperature: { type: 'number', description: 'Temperature for LLM generation (default: 0.7), for generate_children' },
          evaluations: {
            type: 'array',
            description: 'Array of thought evaluations, for action="batch_evaluate"',
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
            }
          }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'treeId', type: 'string' },
      { canonical: 'id', aliases: ['thoughtId'], type: 'string' },
      { canonical: 'parentId', type: 'string' },
      { canonical: 'options', type: 'array' },
      { canonical: 'ideas', type: 'array' },
      { canonical: 'deduplication', type: 'string' },
      { canonical: 'score', type: 'number' },
      { canonical: 'creativity', type: 'number' },
      { canonical: 'risk', type: 'number' },
      { canonical: 'criteriaScores', type: 'object' },
      { canonical: 'reasoning', type: 'string' },
      { canonical: 'verificationNotes', type: 'string' },
      { canonical: 'numChildren', type: 'number' },
      { canonical: 'temperature', type: 'number' },
      { canonical: 'evaluations', type: 'array' }
    ],
    handler: async (args: any, service: any) => {
      switch (args.action) {
        case 'compare_options': {
          const options = args.options || [];
          const ideas = options.map((opt: any) => ({
            parentId: opt.parentId || 'root',
            content: opt.content || opt.name,
            metadata: opt.metadata
          }));
          const result = await service.addIdeas({ treeId: args.treeId, ideas, deduplication: args.deduplication });
          return {
            ...result,
            LLM_instruction: `${result.thoughts.length} candidate option(s) created as sibling thoughts. Do NOT select one yet - call action="evaluate" with a score (0-100) and reasoning for EACH candidate first, then call action="select" on the highest-scoring one. Only after selecting should you convert the winner into tasks, via the bridge tool's action="promote_to_tasks".`
          };
        }
        case 'add_ideas': return service.addIdeas({ treeId: args.treeId, ideas: args.ideas, deduplication: args.deduplication });
        case 'get': return service.getThought(args.treeId, args.id);
        case 'evaluate': return service.evaluateThought({ treeId: args.treeId, thoughtId: args.id, score: args.score, creativity: args.creativity, risk: args.risk, criteriaScores: args.criteriaScores, reasoning: args.reasoning });
        case 'verify': return service.verifyThought({ treeId: args.treeId, thoughtId: args.id, verificationNotes: args.verificationNotes });
        case 'select': return service.selectThought({ treeId: args.treeId, thoughtId: args.id });
        case 'backtrack': return service.backtrack({ treeId: args.treeId, thoughtId: args.id });
        case 'delete': return service.deleteThought(args.treeId, args.id);
        case 'generate_children': {
          const thoughts = await service.generateChildrenWithLLM({ treeId: args.treeId, parentId: args.parentId, numChildren: args.numChildren, temperature: args.temperature });
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
        case 'batch_evaluate': return service.batchEvaluateThoughts({ evaluations: args.evaluations });
        default: throw new Error(`Unknown thought action: '${args.action}'. Expected one of: compare_options, add_ideas, get, evaluate, verify, select, backtrack, delete, generate_children, batch_evaluate.`);
      }
    }
  }
];
