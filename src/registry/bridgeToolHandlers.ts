import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolHandler } from './ToolRegistry.js';
import type { ParamFieldSpec } from '../utils/paramResolver.js';

/**
 * Cognitive Bridge tool definitions and handlers
 */
export const bridgeToolDefinitions: { name: string; tool: Tool; handler: ToolHandler; paramSpec?: ParamFieldSpec[] }[] = [
  {
    name: 'bridge',
    tool: {
      name: 'bridge',
      description: 'Cognitive Bridge: convert reasoning into tracked execution and back. Actions - promote_to_tasks (thought/subtree -> tasks), spawn_tot_from_task (task -> new reasoning tree when blocked), link_to_task (soft bidirectional link for provenance), get_provenance (trace reasoning<->execution chain), complete_task_and_thought (atomically complete a task + evaluate/verify its linked thoughts), quick_plan (one call: strategy + workflow + tasks + root thought), sync_workflow_thoughts (evaluate pending thoughts linked to completed tasks), dedup_strategies_and_trees (cleanup). Pick one via `action`.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['promote_to_tasks', 'spawn_tot_from_task', 'link_to_task', 'get_provenance', 'dedup_strategies_and_trees', 'complete_task_and_thought', 'quick_plan', 'sync_workflow_thoughts'], description: 'Which operation to perform' },
          treeId: { type: 'string', description: 'Tree ID, for promote_to_tasks/spawn_tot_from_task (existing tree to attach to)/link_to_task' },
          thoughtId: { type: 'string', description: 'Thought ID, for promote_to_tasks/link_to_task' },
          includeDescendants: { type: 'boolean', description: 'Include descendant thoughts, for promote_to_tasks' },
          flattenHierarchy: { type: 'boolean', description: 'Flatten subtree into flat task list, for promote_to_tasks' },
          taskNamePrefix: { type: 'string', description: 'Prefix for task names, for promote_to_tasks' },
          workflowId: { type: 'string', description: 'Workflow ID, for promote_to_tasks (assign to existing workflow; auto-created if omitted) or sync_workflow_thoughts (workflow to sync)' },
          skipEvaluationGate: { type: 'boolean', description: 'Skip the evaluate+select cycle for simple workflows (default false), for promote_to_tasks' },
          taskId: { type: 'string', description: 'Task ID, for spawn_tot_from_task/link_to_task/complete_task_and_thought' },
          goal: { type: 'string', description: 'Goal, for spawn_tot_from_task (reasoning tree goal) or quick_plan (project goal)' },
          rootContent: { type: 'string', description: 'Root thought content, for spawn_tot_from_task' },
          maxDepth: { type: 'number', description: 'Maximum depth, for spawn_tot_from_task or get_provenance (traversal depth)' },
          reason: { type: 'string', description: 'Optional reason for the link (e.g. "inspired by", "related to"), for link_to_task' },
          id: { type: 'string', description: 'Task or thought ID, for get_provenance' },
          type: { type: 'string', enum: ['task', 'thought'], description: 'Type of entity, for get_provenance' },
          score: { type: 'number', description: 'Evaluation score for linked thoughts (default 85), for complete_task_and_thought' },
          verificationNotes: { type: 'string', description: 'Optional verification notes for linked thoughts, for complete_task_and_thought' },
          verified: { type: 'boolean', description: 'Mark task as verified, for complete_task_and_thought' },
          verificationMethod: { type: 'string', description: 'Verification method (e.g. "manual_test", "stress_test", "code_review", "automated_test"), for complete_task_and_thought' },
          tasks: { type: 'array', items: { type: 'object' }, description: 'Array of tasks to create, for quick_plan' },
          strategyName: { type: 'string', description: 'Optional strategy name (defaults to goal), for quick_plan' },
          workflowName: { type: 'string', description: 'Optional workflow name (defaults to goal), for quick_plan' }
        },
        required: ['action']
      }
    },
    paramSpec: [
      { canonical: 'action', type: 'string' },
      { canonical: 'treeId', type: 'string' },
      { canonical: 'thoughtId', type: 'string' },
      { canonical: 'includeDescendants', type: 'boolean' },
      { canonical: 'flattenHierarchy', type: 'boolean' },
      { canonical: 'taskNamePrefix', type: 'string' },
      { canonical: 'workflowId', type: 'string' },
      { canonical: 'skipEvaluationGate', type: 'boolean' },
      { canonical: 'taskId', type: 'string' },
      { canonical: 'goal', type: 'string' },
      { canonical: 'rootContent', type: 'string' },
      { canonical: 'maxDepth', type: 'number' },
      { canonical: 'reason', type: 'string' },
      { canonical: 'id', type: 'string' },
      { canonical: 'type', type: 'string' },
      { canonical: 'score', type: 'number' },
      { canonical: 'verificationNotes', type: 'string' },
      { canonical: 'verified', type: 'boolean' },
      { canonical: 'verificationMethod', type: 'string' },
      { canonical: 'tasks', type: 'array' },
      { canonical: 'strategyName', type: 'string' },
      { canonical: 'workflowName', type: 'string' }
    ],
    handler: (args: any, service: any) => {
      switch (args.action) {
        case 'promote_to_tasks': return service.promoteThoughtToTasks({
          treeId: args.treeId, thoughtId: args.thoughtId, includeDescendants: args.includeDescendants,
          flattenHierarchy: args.flattenHierarchy, taskNamePrefix: args.taskNamePrefix,
          workflowId: args.workflowId, skipEvaluationGate: args.skipEvaluationGate
        });
        case 'spawn_tot_from_task': return service.spawnTotFromTask({
          taskId: args.taskId, treeId: args.treeId, goal: args.goal, rootContent: args.rootContent, maxDepth: args.maxDepth
        });
        case 'link_to_task': return service.linkThoughtToTask({
          treeId: args.treeId, thoughtId: args.thoughtId, taskId: args.taskId, reason: args.reason
        });
        case 'get_provenance': return service.getCognitiveProvenance(args.id, args.type, args.maxDepth);
        case 'dedup_strategies_and_trees': return service.deduplicateStrategiesAndTrees();
        case 'complete_task_and_thought': return service.completeTaskAndThought({
          taskId: args.taskId, score: args.score, verificationNotes: args.verificationNotes,
          verified: args.verified, verificationMethod: args.verificationMethod
        });
        case 'quick_plan': return service.quickPlan({
          goal: args.goal, tasks: args.tasks, strategyName: args.strategyName, workflowName: args.workflowName
        });
        case 'sync_workflow_thoughts': return service.syncWorkflowThoughts({ workflowId: args.workflowId });
        default: throw new Error(`Unknown bridge action: '${args.action}'. Expected one of: promote_to_tasks, spawn_tot_from_task, link_to_task, get_provenance, dedup_strategies_and_trees, complete_task_and_thought, quick_plan, sync_workflow_thoughts.`);
      }
    }
  }
];
