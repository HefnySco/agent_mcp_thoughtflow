import type { CognitiveBridgeService } from '../services/CognitiveBridgeService.js';
import {
  PromoteThoughtToTasksParams,
  PromoteThoughtToTasksResult,
  SpawnTotFromTaskParams,
  SpawnTotFromTaskResult,
  LinkThoughtToTaskParams
} from '../types/index.js';

/**
 * Bridge Layer MCP Tool Handlers
 * These tools enable bidirectional conversion between thoughts and tasks
 */

export function registerBridgeHandlers(
  bridgeService: CognitiveBridgeService,
  registerTool: (name: string, handler: (args: any) => Promise<any>) => void
): void {
  /**
   * Promote a thought (or subtree) to executable tasks
   * Converts reasoning into structured work with provenance tracking
   */
  registerTool(
    'promote_thought_to_tasks',
    async (args: PromoteThoughtToTasksParams): Promise<PromoteThoughtToTasksResult> => {
      return bridgeService.promoteThoughtToTasks(args);
    }
  );

  /**
   * Spawn a ToT tree from a task
   * Enables "if blocked → think again" loop
   */
  registerTool(
    'spawn_tot_from_task',
    async (args: SpawnTotFromTaskParams): Promise<SpawnTotFromTaskResult> => {
      return bridgeService.spawnTotFromTask(args);
    }
  );

  /**
   * Create a lightweight explicit link between a thought and a task
   * For provenance without full promotion
   */
  registerTool(
    'link_thought_to_task',
    async (args: LinkThoughtToTaskParams): Promise<{ success: boolean }> => {
      bridgeService.linkThoughtToTask(args);
      return { success: true };
    }
  );

  /**
   * Get cognitive provenance for a thought or task
   * Traces the full reasoning → execution chain
   */
  registerTool(
    'get_cognitive_provenance',
    async (args: { id: string; type: 'thought' | 'task'; maxDepth?: number }): Promise<any> => {
      return bridgeService.getCognitiveProvenance(args.id, args.type, args.maxDepth);
    }
  );
}
