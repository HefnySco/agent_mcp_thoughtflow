import type { ToTService } from '../services/ToTService.js';
import type { Tree, Thought } from '../types/index.js';

/**
 * Tree of Thoughts MCP Tool Handlers
 * These tools provide systematic reasoning and exploration capabilities
 */

export function registerTotHandlers(
  totService: ToTService,
  registerTool: (name: string, handler: (args: any) => Promise<any>) => void
): void {
  /**
   * Create a new Tree of Thoughts
   * REQUIRES strategyId - tree must belong to exactly one strategy
   * Returns both 'id' (actual ID used) and 'normalizedName' (clean slug without suffix)
   * Use normalizedName for future references when possible - it's more readable and stable
   */
  registerTool(
    'create_tree',
    async (args: {
      goal: string;
      rootContent: string;
      maxDepth?: number;
      sessionId?: string;
      strategyId: string; // Mandatory
      metadata?: Record<string, any>;
    }): Promise<Tree> => {
      return totService.createTree(args);
    }
  );

  /**
   * Get a tree by ID
   */
  registerTool(
    'get_tree',
    async (args: { id: string }): Promise<Tree> => {
      return totService.getTree(args.id);
    }
  );

  /**
   * Get all trees
   */
  registerTool(
    'list_trees',
    async (): Promise<Tree[]> => {
      return totService.getAllTrees();
    }
  );

  /**
   * Delete a tree
   */
  registerTool(
    'delete_tree',
    async (args: { id: string }): Promise<{ success: boolean }> => {
      const deleted = totService.deleteTree(args.id);
      return { success: deleted };
    }
  );

  /**
   * Add a child thought to an existing thought
   * Returns both 'id' (actual ID used) and 'normalizedName' (clean slug without suffix)
   * Use normalizedName for future references when possible - it's more readable and stable
   * Fuzzy matching is enabled: if parentId is slightly wrong, the system will find the closest match
   */
  registerTool(
    'add_child',
    async (args: {
      treeId: string;
      parentId: string;
      content: string;
      metadata?: Record<string, any>;
    }): Promise<Thought> => {
      return totService.addChildThought(args);
    }
  );

  /**
   * Get a thought by ID
   */
  registerTool(
    'get_thought',
    async (args: { treeId: string; thoughtId: string }): Promise<Thought> => {
      return totService.getThought(args.treeId, args.thoughtId);
    }
  );

  /**
   * Evaluate a thought
   */
  registerTool(
    'evaluate_thought',
    async (args: {
      treeId: string;
      thoughtId: string;
      score: number;
      creativity?: number;
      risk?: number;
      criteriaScores?: Record<string, number>;
      reasoning?: string;
    }): Promise<Thought> => {
      return totService.evaluateThought(args);
    }
  );

  /**
   * Verify a thought
   */
  registerTool(
    'verify_thought',
    async (args: {
      treeId: string;
      thoughtId: string;
      verificationNotes?: string;
    }): Promise<Thought> => {
      return totService.verifyThought(args);
    }
  );

  /**
   * Select a thought
   */
  registerTool(
    'select_thought',
    async (args: { treeId: string; thoughtId: string }): Promise<Thought> => {
      return totService.selectThought(args);
    }
  );

  /**
   * Backtrack from a thought
   */
  registerTool(
    'backtrack',
    async (args: { treeId: string; thoughtId: string }): Promise<Thought> => {
      return totService.backtrack(args);
    }
  );

  /**
   * Prune tree by evaluation threshold
   */
  registerTool(
    'prune_tree',
    async (args: {
      treeId: string;
      threshold: number;
      riskThreshold?: number;
    }): Promise<{ prunedCount: number; remainingCount: number }> => {
      return totService.pruneTree(args);
    }
  );


  /**
   * Clear all trees
   */
  registerTool(
    'clear_all_trees',
    async (): Promise<{ success: boolean }> => {
      totService.clearAllTrees();
      return { success: true };
    }
  );
}
