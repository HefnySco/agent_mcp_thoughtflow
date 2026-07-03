import type {
  Tree,
  Thought,
  Strategy,
  LLMProvider
} from '../types/index.js';
import type { IStorageAdapter } from '../storage/IStorageAdapter.js';
import {
  TreeNotFoundError,
  ThoughtNotFoundError,
  ValidationError,
  ThoughtflowError
} from '../types/index.js';
import { BaseService } from './BaseService.js';
import { logger } from '../utils/logger.js';
import { validateRequiredString, validateId, validateEvaluationScore } from '../utils/validators.js';
import { MockLLMProvider } from '../llm-providers/mock-llm-provider.js';

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Find closest matching thought ID by normalized name
 * Returns array of [id, distance] pairs sorted by distance
 */
function findClosestMatches(
  targetId: string,
  thoughtIds: string[],
  maxDistance: number = 3
): Array<{ id: string; distance: number }> {
  const targetSlug = targetId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const matches: Array<{ id: string; distance: number }> = [];

  for (const id of thoughtIds) {
    const idSlug = id.toLowerCase().replace(/[^a-z0-9-]/g, '');
    const distance = levenshteinDistance(targetSlug, idSlug);
    
    if (distance <= maxDistance) {
      matches.push({ id, distance });
    }
  }

  return matches.sort((a, b) => a.distance - b.distance);
}

/**
 * LLM instruction for Strategy usage
 * Provides guidance to the LLM on how to use Strategies correctly
 */
const STRATEGY_LLM_INSTRUCTION = `Strategy Usage Rules:
- One Strategy = one cohesive goal/project area.
- Use create_strategy as get-or-create (idempotent by normalized name).
- Add Trees for divergent reasoning/exploration. Create or use an existing Tree before adding ideas.
- Add Workflows for convergent execution with tasks. Create or use an existing workflow before creating tasks.
- CRITICAL: When creating MULTIPLE related tasks or ideas, ALWAYS use batch tools:
  * Use create_tasks (not create_task) for tasks - supports positional refs (task-1, task-2) for dependencies/parentTaskId
  * Use add_ideas (not add_idea) for thoughts - supports positional refs (idea-1, idea-2) for parentId
  * Single-item tools (create_task, add_idea) are NOT available.
  * Batch tools return an idMap mapping positional refs to real IDs for later reference.
- When adding ideas to a tree, use parentId: 'root' or the actual rootId returned when the tree was created.
- When adding child ideas, prefer parentId: 'root' for the tree root.
- Promote promising thoughts to tasks. If a task blocks, spawn new Tree from it.
- Maintain strict isolation: do not mix tasks or workflows across different Strategies.
- Use Cognitive Bridge for provenance (link/promote/spawn).
- CRITICAL: When using evaluate_thought, the score parameter MUST be a numeric value between 0 and 100 (not a string). Always pass score as a number type.`;

export interface ToTServiceConfig {
  llmProvider?: LLMProvider | null;
  strictLLM?: boolean;
  cognitiveBridgeService?: any; // CognitiveBridgeService to avoid circular dependency
}

/**
 * ToTService manages Tree of Thoughts for systematic reasoning
 */
export class ToTService extends BaseService {
  // @ts-ignore - LLM provider infrastructure in place for future use
  private llmProvider?: LLMProvider | null;
  // @ts-ignore - LLM provider infrastructure in place for future use
  private strictLLM: boolean;
  private cognitiveBridgeService?: any;

  constructor(storageAdapter: IStorageAdapter, config?: ToTServiceConfig) {
    super(storageAdapter, 'ToTService');
    this.llmProvider = config?.llmProvider;
    this.strictLLM = config?.strictLLM ?? false;
    this.cognitiveBridgeService = config?.cognitiveBridgeService;
    
    // Ensure fallback MockLLMProvider is always available if none is passed
    if (!this.llmProvider) {
      this.llmProvider = new MockLLMProvider();
      logger.info('No LLM provider configured. Using MockLLMProvider as fallback.');
    }
  }

  /**
   * Create a new Tree of Thoughts
   * REQUIRES strategyId - tree must belong to exactly one strategy
   */
  createTree(params: {
    goal: string;
    rootContent: string;
    maxDepth?: number;
    sessionId?: string;
    strategyId: string; // Mandatory
    metadata?: Record<string, any>;
  }): Tree {
    validateRequiredString(params.goal, 'goal');
    validateRequiredString(params.rootContent, 'rootContent');
    validateRequiredString(params.strategyId, 'strategyId');

    // Validate strategy exists
    const strategy = this.state.strategies.get(params.strategyId);
    if (!strategy) {
      throw new ThoughtflowError(`Strategy '${params.strategyId}' not found`, 'STRATEGY_NOT_FOUND');
    }

    // Normalize the goal for comparison
    const normalizedGoal = this.normalizeKey(params.goal);

    // Check if tree with same normalized goal already exists
    for (const [id, existingTree] of this.state.trees) {
      if (this.normalizeKey(existingTree.goal) === normalizedGoal) {
        // Only return existing tree if it has thoughts (not a stale empty tree)
        if (existingTree.thoughts.size > 0) {
          logger.info(`Returning existing tree: ${id} - ${existingTree.goal} (normalized: ${normalizedGoal})`);
          return { id: existingTree.id, goal: existingTree.goal, rootId: existingTree.rootId, normalizedName: this.slugify(existingTree.goal) } as any;
        } else {
          logger.info(`Deleting stale empty tree: ${id} - ${existingTree.goal} (normalized: ${normalizedGoal})`);
          this.state.trees.delete(id);
        }
      }
    }

    // Collect existing IDs for collision detection
    const existingTreeIds = new Set(this.state.trees.keys());
    const existingThoughtIds = new Set<string>();
    for (const tree of this.state.trees.values()) {
      for (const thoughtId of tree.thoughts.keys()) {
        existingThoughtIds.add(thoughtId);
      }
    }

    // Generate slug-based IDs with collision detection
    const treeId = this.generateSlugId(params.goal, existingTreeIds);
    const rootId = this.generateSlugId(params.rootContent, existingThoughtIds);
    
    const now = new Date().toISOString();

    const treeMetadata = params.metadata ? { ...params.metadata } : {};
    if (params.sessionId) {
      treeMetadata.sessionId = params.sessionId;
    }

    const rootThought: Thought = {
      id: rootId,
      content: params.rootContent,
      parentId: null,
      children: [],
      evaluation: null,
      state: 'pending',
      depth: 0,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata
    };

    const thoughts = new Map<string, Thought>();
    thoughts.set(rootId, rootThought);

    const tree: Tree = {
      id: treeId,
      rootId,
      thoughts,
      goal: params.goal,
      createdAt: now,
      updatedAt: now,
      maxDepth: params.maxDepth || 10,
      strategyId: params.strategyId,
      metadata: treeMetadata
    };

    this.state.trees.set(treeId, tree);

    // Add tree to strategy's treeIds
    if (!strategy.treeIds.includes(treeId)) {
      strategy.treeIds.push(treeId);
      strategy.updatedAt = now;
      this.state.strategies.set(params.strategyId, strategy);
    }

    this.triggerSave();
    logger.info(`Created tree: ${treeId} - ${params.goal} (normalized: ${normalizedGoal}) in strategy ${params.strategyId}`);

    // Enforce cognitive hierarchy if cognitiveBridgeService is available
    if (this.cognitiveBridgeService) {
      this.cognitiveBridgeService.ensureCognitiveHierarchy(tree, 'tree', params.goal);
    }

    // Return with both id and normalizedName
    return { id: treeId, goal: params.goal, rootId, normalizedName: this.slugify(params.goal) } as any;
  }

  /**
   * Get a tree by ID (minimal summary for LLM efficiency)
   */
  getTree(id: string, includeDeleted: boolean = false): Tree {
    validateId(id, 'Tree');
    const tree = this.state.trees.get(id);
    if (!tree) {
      throw new TreeNotFoundError(id);
    }
    if (!includeDeleted && this.isDeleted(tree)) {
      throw new TreeNotFoundError(id);
    }
    // Return minimal summary for LLM efficiency
    return { id: tree.id, goal: tree.goal, rootId: tree.rootId } as Tree;
  }

  /**
   * Get a tree by ID with full details (for dashboard/internal use)
   */
  getTreeFull(id: string, includeDeleted: boolean = false): Tree {
    validateId(id, 'Tree');
    const tree = this.state.trees.get(id);
    if (!tree) {
      throw new TreeNotFoundError(id);
    }
    if (!includeDeleted && this.isDeleted(tree)) {
      throw new TreeNotFoundError(id);
    }
    return tree;
  }

  /**
   * Get all trees
   */
  getAllTrees(includeDeleted: boolean = false): Tree[] {
    return this.filterDeletedFromMap(this.state.trees, includeDeleted);
  }

  /**
   * Deduplicate trees by normalized goal.
   * Keeps the first occurrence of each unique normalized goal and removes duplicates.
   * Returns the number of duplicates removed.
   */
  deduplicateTrees(): number {
    const seen = new Map<string, string>(); // normalized goal -> tree id
    const toDelete: string[] = [];

    for (const [id, tree] of this.state.trees) {
      const normalizedGoal = this.normalizeKey(tree.goal);
      if (seen.has(normalizedGoal)) {
        toDelete.push(id);
        logger.info(`Marking duplicate tree for deletion: ${id} - ${tree.goal} (normalized: ${normalizedGoal})`);
      } else {
        seen.set(normalizedGoal, id);
      }
    }

    // Delete duplicates
    for (const id of toDelete) {
      this.state.trees.delete(id);
    }

    if (toDelete.length > 0) {
      this.triggerSave();
      logger.info(`Deduplicated trees: removed ${toDelete.length} duplicates`);
    }

    return toDelete.length;
  }

  /**
   * List all trees (alias for getAllTrees for tool handler compatibility)
   * Tool handlers use this name for consistency with other list operations
   * Returns minimal summaries for efficiency
   */
  listTrees(): Array<{ id: string; goal: string; thoughtCount: number }> {
    return Array.from(this.state.trees.values()).map(t => ({
      id: t.id,
      goal: t.goal,
      thoughtCount: t.thoughts.size
    }));
  }

  /**
   * Delete a tree
   */
  deleteTree(id: string): boolean {
    validateId(id, 'Tree');
    const tree = this.state.trees.get(id);
    if (!tree) {
      return false;
    }
    // Soft-delete the tree
    this.softDeleteEntity(tree);
    // Also soft-delete all thoughts in the tree
    for (const thought of tree.thoughts.values()) {
      this.softDeleteEntity(thought);
    }
    this.triggerSave();
    logger.info(`Soft-deleted tree: ${id} with ${tree.thoughts.size} thoughts`);
    return true;
  }

  /**
   * Delete a thought (soft-delete)
   */
  deleteThought(treeId: string, thoughtId: string): boolean {
    validateId(treeId, 'Tree');
    validateId(thoughtId, 'Thought');
    const tree = this.state.trees.get(treeId);
    if (!tree) {
      return false;
    }
    const thought = tree.thoughts.get(thoughtId);
    if (!thought) {
      return false;
    }
    this.softDeleteEntity(thought);
    this.triggerSave();
    logger.info(`Soft-deleted thought: ${thoughtId} in tree: ${treeId}`);
    return true;
  }

  /**
   * Robust thought lookup with fuzzy matching
   * First tries exact match, then fuzzy within tree, then within strategy
   */
  private findThoughtRobustly(treeId: string, thoughtId: string): { thought: Thought; tree: Tree } | null {
    // Try exact match first
    const tree = this.getTreeFull(treeId);
    const exactMatch = tree.thoughts.get(thoughtId);
    if (exactMatch) {
      return { thought: exactMatch, tree };
    }

    // Try fuzzy match within the same tree
    const treeThoughtIds = Array.from(tree.thoughts.keys());
    const closeMatches = findClosestMatches(thoughtId, treeThoughtIds, 3);
    
    if (closeMatches.length > 0) {
      const bestMatch = tree.thoughts.get(closeMatches[0].id);
      if (bestMatch) {
        logger.warn(`Thought '${thoughtId}' not found exactly. Using closest match '${closeMatches[0].id}' (distance: ${closeMatches[0].distance})`);
        return { thought: bestMatch, tree };
      }
    }

    // Try fuzzy match across all trees in the same strategy
    const strategy = this.state.strategies.get(tree.strategyId);
    if (strategy) {
      for (const otherTreeId of strategy.treeIds) {
        if (otherTreeId === treeId) continue; // Already checked this tree
        
        const otherTree = this.state.trees.get(otherTreeId);
        if (otherTree) {
          const otherThoughtIds = Array.from(otherTree.thoughts.keys());
          const strategyMatches = findClosestMatches(thoughtId, otherThoughtIds, 3);
          
          if (strategyMatches.length > 0) {
            const bestMatch = otherTree.thoughts.get(strategyMatches[0].id);
            if (bestMatch) {
              logger.warn(`Thought '${thoughtId}' not found in tree ${treeId}. Found in tree ${otherTreeId} as '${strategyMatches[0].id}' (distance: ${strategyMatches[0].distance})`);
              return { thought: bestMatch, tree: otherTree };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Add a child thought to an existing thought
   * Supports magic "root" or "rootId" to resolve to tree.rootId
   */
  addChildThought(params: {
    treeId: string;
    parentId: string;
    content: string;
    metadata?: Record<string, any>;
  }): Thought {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.parentId, 'parentId');
    validateRequiredString(params.content, 'content');

    const tree = this.getTreeFull(params.treeId);

    // Resolve magic "root" or "rootId" to tree.rootId
    let resolvedParentId = params.parentId;
    if (params.parentId === 'root' || params.parentId === 'rootId') {
      resolvedParentId = tree.rootId;
    }

    // Use robust lookup for parent thought
    const parentResult = this.findThoughtRobustly(params.treeId, resolvedParentId);
    const parentThought = parentResult?.thought || tree.thoughts.get(resolvedParentId);

    if (!parentThought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(resolvedParentId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${resolvedParentId}${matchInfo}.${this.getParentResolutionGuidance()}`);
    }
    
    if (parentThought.depth >= tree.maxDepth) {
      throw new ValidationError(`Maximum depth reached for tree ${params.treeId}`, 'depth');
    }
    
    // Collect existing thought IDs for collision detection
    const existingThoughtIds = new Set(tree.thoughts.keys());
    
    // Generate slug-based ID with collision detection
    const childId = this.generateSlugId(params.content, existingThoughtIds);
    const now = new Date().toISOString();
    
    const childThought: Thought = {
      id: childId,
      content: params.content,
      parentId: params.parentId,
      children: [],
      evaluation: null,
      state: 'pending',
      depth: parentThought.depth + 1,
      createdAt: now,
      updatedAt: now,
      metadata: params.metadata || {}
    };
    
    tree.thoughts.set(childId, childThought);
    parentThought.children.push(childId);
    tree.updatedAt = now;
    this.triggerSave();
    
    logger.info(`Added child thought ${childId} to parent ${params.parentId} in tree ${params.treeId}`);
    
    // Return with both id and normalizedName
    return { id: childId, content: params.content, state: 'pending', normalizedName: this.slugify(params.content) } as any;
  }

  /**
   * Add child thought with individual parameters (alias for addChildThought)
   * Tool handlers use this for compatibility with MCP schema that uses individual parameters
   */
  addIdea(treeId: string, parentId: string, content: string, metadata?: Record<string, any>): Thought {
    return this.addChildThought({ treeId, parentId, content, metadata });
  }

  /**
   * Add multiple child thoughts in batch
   * Supports positional references (idea-1, idea-2, etc.) for parentId
   * Uses fuzzy matching (findThoughtRobustly) for robustness
   * Returns all thoughts (minimal) + idMap mapping positional refs to real IDs
   */
  addIdeas(params: {
    treeId: string;
    ideas: Array<{
      parentId: string;
      content: string;
      metadata?: Record<string, any>;
    }>;
    deduplication?: 'skip' | 'error' | 'overwrite';
  }): { thoughts: Array<{ id: string; content: string; state: string }>; idMap: Record<string, string> } {
    validateRequiredString(params.treeId, 'treeId');
    
    if (!params.ideas || params.ideas.length === 0) {
      throw new ThoughtflowError('Ideas array cannot be empty', 'INVALID_INPUT');
    }

    const tree = this.getTreeFull(params.treeId);
    const deduplication = params.deduplication || 'skip';
    const idMap: Record<string, string> = {};
    const resultThoughts: Array<{ id: string; content: string; state: string }> = [];
    const existingThoughtIds = new Set(tree.thoughts.keys());

    // First pass: create/update all thoughts and build idMap
    for (let i = 0; i < params.ideas.length; i++) {
      const ideaDef = params.ideas[i];
      const positionalRef = `idea-${i + 1}`;
      
      validateRequiredString(ideaDef.content, 'content');
      validateRequiredString(ideaDef.parentId, 'parentId');

      // Check for deduplication by normalized content
      const normalizedContent = this.normalizeKey(ideaDef.content);
      let existingThoughtId: string | null = null;
      
      for (const [id, thought] of tree.thoughts) {
        if (this.normalizeKey(thought.content) === normalizedContent) {
          existingThoughtId = id;
          break;
        }
      }

      if (existingThoughtId) {
        if (deduplication === 'error') {
          throw new ThoughtflowError(
            `Thought with normalized content '${normalizedContent}' already exists in tree '${params.treeId}'`,
            'DUPLICATE_THOUGHT'
          );
        } else if (deduplication === 'skip') {
          idMap[positionalRef] = existingThoughtId;
          const existingThought = tree.thoughts.get(existingThoughtId);
          if (existingThought) {
            resultThoughts.push({ id: existingThoughtId, content: existingThought.content, state: existingThought.state });
          }
          continue;
        }
        // 'overwrite' - update existing thought in-place
        const existingThought = tree.thoughts.get(existingThoughtId);
        if (existingThought) {
          const now = new Date().toISOString();
          existingThought.content = ideaDef.content;
          existingThought.state = 'pending';
          existingThought.updatedAt = now;
          existingThought.metadata = ideaDef.metadata || {};
          // Reset evaluation fields
          existingThought.evaluation = null;
          existingThought.verified = false;
          existingThought.verificationNotes = undefined;
          // Parent will be resolved in second pass
          tree.thoughts.set(existingThoughtId, existingThought);
          idMap[positionalRef] = existingThoughtId;
          resultThoughts.push({ id: existingThoughtId, content: existingThought.content, state: existingThought.state });
          continue;
        }
      }

      // Resolve parent reference (positional or name-based)
      const resolvedParentId = this.resolveThoughtReference(ideaDef.parentId, idMap, tree);
      if (!resolvedParentId) {
        throw new ThoughtNotFoundError(
          params.treeId,
          `Cannot resolve parentId reference '${ideaDef.parentId}' for idea at position ${i + 1}.${this.getParentResolutionGuidance()}`
        );
      }

      // Get parent thought and validate depth
      const parentResult = this.findThoughtRobustly(params.treeId, resolvedParentId);
      const parentThought = parentResult?.thought || tree.thoughts.get(resolvedParentId);
      
      if (!parentThought) {
        throw new ThoughtNotFoundError(params.treeId, resolvedParentId);
      }
      
      if (parentThought.depth >= tree.maxDepth) {
        throw new ValidationError(`Maximum depth reached for tree ${params.treeId}`, 'depth');
      }

      // Create new thought
      const childId = this.generateSlugId(ideaDef.content, existingThoughtIds);
      existingThoughtIds.add(childId);
      idMap[positionalRef] = childId;

      const now = new Date().toISOString();
      const childThought: Thought = {
        id: childId,
        content: ideaDef.content,
        parentId: resolvedParentId,
        children: [],
        evaluation: null,
        state: 'pending',
        depth: parentThought.depth + 1,
        createdAt: now,
        updatedAt: now,
        metadata: ideaDef.metadata || {}
      };

      tree.thoughts.set(childId, childThought);
      parentThought.children.push(childId);
      tree.updatedAt = now;

      resultThoughts.push({ id: childId, content: ideaDef.content, state: 'pending' });
    }

    // Second pass: resolve parent references for overwritten thoughts
    for (let i = 0; i < params.ideas.length; i++) {
      const ideaDef = params.ideas[i];
      const positionalRef = `idea-${i + 1}`;
      const realId = idMap[positionalRef];
      
      if (!realId) continue; // Should not happen with current logic

      const thought = tree.thoughts.get(realId);
      if (!thought) continue;

      // If this is an overwritten thought, re-resolve its parent
      if (thought.parentId === undefined && ideaDef.parentId) {
        const resolvedParentId = this.resolveThoughtReference(ideaDef.parentId, idMap, tree);
        if (!resolvedParentId) {
          throw new ThoughtNotFoundError(
            params.treeId,
            `Cannot resolve parentId reference '${ideaDef.parentId}' for idea at position ${i + 1}.${this.getParentResolutionGuidance()}`
          );
        }

        const parentResult = this.findThoughtRobustly(params.treeId, resolvedParentId);
        const parentThought = parentResult?.thought || tree.thoughts.get(resolvedParentId);
        
        if (!parentThought) {
          throw new ThoughtNotFoundError(params.treeId, resolvedParentId);
        }
        
        if (parentThought.depth >= tree.maxDepth) {
          throw new ValidationError(`Maximum depth reached for tree ${params.treeId}`, 'depth');
        }

        thought.parentId = resolvedParentId;
        thought.depth = parentThought.depth + 1;
        
        // Add to parent's children if not already there
        if (!parentThought.children.includes(realId)) {
          parentThought.children.push(realId);
        }
        
        tree.thoughts.set(realId, thought);
      }
    }

    this.triggerSave();
    logger.info(`Processed ${resultThoughts.length} child thoughts in batch for tree ${params.treeId}`);
    
    return { thoughts: resultThoughts, idMap };
  }

  /**
   * Get guidance for resolving parent references
   */
  private getParentResolutionGuidance(): string {
    return " Tip: Use parentId: 'root' for the tree root, positional refs like 'idea-2' for ideas in the same batch, or the actual thought ID. Fuzzy matching is supported.";
  }

  /**
   * Resolve a thought reference (positional or name-based) to a real thought ID
   * Uses fuzzy matching for robustness
   * Supports magic "root" or "rootId" to resolve to tree.rootId
   */
  private resolveThoughtReference(
    ref: string,
    idMap: Record<string, string>,
    tree: Tree
  ): string | null {
    // Check for magic "root" or "rootId" references
    if (ref === 'root' || ref === 'rootId') {
      return tree.rootId;
    }

    // Check if it's a positional reference (idea-1, idea-2, etc.)
    if (ref.startsWith('idea-')) {
      return idMap[ref] || null;
    }

    // Use robust lookup for existing thoughts
    const result = this.findThoughtRobustly(tree.id, ref);
    if (result) {
      return result.thought.id;
    }

    return null;
  }

  /**
   * Get a thought by ID (minimal summary for LLM efficiency)
   */
  getThought(treeId: string, thoughtId: string): Thought {
    validateId(treeId, 'Tree');
    validateId(thoughtId, 'Thought');

    const tree = this.getTreeFull(treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(treeId, thoughtId);
    const thought = result?.thought || tree.thoughts.get(thoughtId);

    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(treeId, `${thoughtId}${matchInfo}`);
    }

    // Return minimal summary for LLM efficiency
    return {
      id: thought.id,
      content: thought.content,
      state: thought.state,
      evaluation: thought.evaluation,
      parentId: thought.parentId
    } as Thought;
  }

  /**
   * Get a thought by ID with full details (for dashboard/internal use)
   */
  getThoughtFull(treeId: string, thoughtId: string): Thought {
    validateId(treeId, 'Tree');
    validateId(thoughtId, 'Thought');

    const tree = this.getTreeFull(treeId);
    const thought = tree.thoughts.get(thoughtId);

    if (!thought) {
      throw new ThoughtNotFoundError(treeId, thoughtId);
    }

    return thought;
  }

  /**
   * Check if all children of a thought are evaluated
   */
  private areAllChildrenEvaluated(tree: Tree, thought: Thought): boolean {
    if (thought.children.length === 0) {
      return false;
    }
    
    for (const childId of thought.children) {
      const childThought = tree.thoughts.get(childId);
      if (!childThought || childThought.state !== 'evaluated') {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Automatically evaluate parent if all its children are evaluated
   * Recursively propagates up the tree
   */
  private autoEvaluateParent(tree: Tree, thoughtId: string): void {
    const thought = tree.thoughts.get(thoughtId);
    if (!thought || !thought.parentId) {
      return;
    }
    
    const parentThought = tree.thoughts.get(thought.parentId);
    if (!parentThought) {
      return;
    }
    
    // Check if all children of parent are now evaluated
    if (this.areAllChildrenEvaluated(tree, parentThought)) {
      // Calculate average evaluation from children
      let totalScore = 0;
      let evaluatedCount = 0;
      
      for (const childId of parentThought.children) {
        const child = tree.thoughts.get(childId);
        if (child && child.evaluation !== null) {
          totalScore += child.evaluation;
          evaluatedCount++;
        }
      }
      
      const averageScore = evaluatedCount > 0 ? totalScore / evaluatedCount : 0;
      
      // Mark parent as evaluated with average score
      parentThought.evaluation = averageScore;
      parentThought.state = 'evaluated';
      parentThought.updatedAt = new Date().toISOString();
      
      logger.info(`Auto-evaluated parent thought ${parentThought.id} with average score ${averageScore.toFixed(2)} from ${evaluatedCount} children`);
      
      // Recursively check parent's parent
      this.autoEvaluateParent(tree, parentThought.id);
    }
  }

  /**
   * Evaluate a thought
   * Auto-transitions from "pending" to "evaluated" when appropriate
   * Returns rich feedback with state transition information
   */
  evaluateThought(params: {
    treeId: string;
    thoughtId: string;
    score: number;
    creativity?: number;
    risk?: number;
    criteriaScores?: Record<string, number>;
    reasoning?: string;
  }): any {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    validateEvaluationScore(params.score);
    
    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.thoughtId);
    const thought = result?.thought || tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.thoughtId}${matchInfo}`);
    }
    
    // Auto-transition from pending to evaluated
    const previousState = thought.state;
    let stateTransitioned = false;
    
    if (thought.state === 'pending') {
      thought.state = 'evaluated';
      stateTransitioned = true;
      logger.info(`Auto-transitioned thought ${thought.id} from 'pending' to 'evaluated' during evaluation`);
    }
    
    thought.evaluation = params.score;
    thought.state = 'evaluated';
    
    if (params.creativity !== undefined) {
      thought.creativity = params.creativity;
    }
    if (params.risk !== undefined) {
      thought.risk = params.risk;
    }
    if (params.criteriaScores) {
      thought.criteriaScores = params.criteriaScores;
    }
    
    if (params.reasoning) {
      thought.metadata = thought.metadata || {};
      thought.metadata.evaluationReasoning = params.reasoning;
    }
    
    thought.updatedAt = new Date().toISOString();
    tree.updatedAt = new Date().toISOString();
    
    // Auto-evaluate parent if all its children are now evaluated
    this.autoEvaluateParent(tree, params.thoughtId);
    
    this.triggerSave();
    
    // Build response with rich feedback
    const response: any = {
      id: thought.id,
      content: thought.content,
      state: thought.state,
      evaluation: thought.evaluation
    };
    
    // Add state transition info if transition occurred
    if (stateTransitioned) {
      response.stateTransitioned = true;
      response.previousState = previousState;
      response.newState = thought.state;
      response.message = "Thought has been evaluated and automatically moved from 'pending' to 'evaluated' state. You can now safely call select_thought on it or continue exploring its children.";
    } else {
      response.message = "Thought has been evaluated. It was already in an evaluated or selected state.";
    }
    
    return response;
  }

  /**
   * Evaluate thought with individual parameters (alias for evaluateThought)
   * Tool handlers use this for compatibility with MCP schema that uses individual parameters
   */
  evaluateThoughtIndividual(treeId: string, thoughtId: string, args: any): Thought {
    return this.evaluateThought({
      treeId,
      thoughtId,
      score: args.score,
      creativity: args.creativity,
      risk: args.risk,
      criteriaScores: args.criteriaScores,
      reasoning: args.reasoning
    });
  }

  /**
   * Batch evaluate multiple thoughts
   * Consistent with batch pattern in add_ideas/create_tasks
   */
  batchEvaluateThoughts(params: {
    evaluations: Array<{
      treeId: string;
      thoughtId: string;
      score: number;
      creativity?: number;
      risk?: number;
      criteriaScores?: Record<string, number>;
      reasoning?: string;
    }>;
  }): {
    results: Array<{
      thoughtId: string;
      state: string;
      evaluation: any;
      error?: string;
    }>;
    successCount: number;
    failCount: number;
  } {
    const results: Array<{
      thoughtId: string;
      state: string;
      evaluation: any;
      error?: string;
    }> = [];
    let successCount = 0;
    let failCount = 0;

    for (const evalParams of params.evaluations) {
      try {
        const thought = this.evaluateThought(evalParams);
        results.push({
          thoughtId: evalParams.thoughtId,
          state: thought.state,
          evaluation: thought.evaluation
        });
        successCount++;
      } catch (e) {
        results.push({
          thoughtId: evalParams.thoughtId,
          state: 'error',
          evaluation: null,
          error: String(e)
        });
        failCount++;
      }
    }

    logger.info(`Batch evaluate: ${successCount} succeeded, ${failCount} failed`);

    return { results, successCount, failCount };
  }

  /**
   * Verify a thought
   * Auto-transitions from "pending" to "evaluated" when appropriate
   * Returns rich feedback with state transition information
   */
  verifyThought(params: {
    treeId: string;
    thoughtId: string;
    verificationNotes?: string;
  }): any {
    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.thoughtId);
    const thought = result?.thought || tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.thoughtId}${matchInfo}`);
    }
    
    // Auto-transition from pending to evaluated
    const previousState = thought.state;
    let stateTransitioned = false;
    
    if (thought.state === 'pending') {
      thought.state = 'evaluated';
      stateTransitioned = true;
      logger.info(`Auto-transitioned thought ${thought.id} from 'pending' to 'evaluated' during verification`);
    }
    
    thought.verified = true;
    if (params.verificationNotes) {
      thought.verificationNotes = params.verificationNotes;
    }
    thought.updatedAt = new Date().toISOString();
    tree.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    // Build response with rich feedback
    const response: any = {
      id: thought.id,
      content: thought.content,
      state: thought.state,
      verified: thought.verified
    };
    
    // Add state transition info if transition occurred
    if (stateTransitioned) {
      response.stateTransitioned = true;
      response.previousState = previousState;
      response.newState = thought.state;
      response.message = "Thought has been verified and automatically moved from 'pending' to 'evaluated' state. You can now safely call select_thought on it or continue exploring its children.";
    } else {
      response.message = "Thought has been verified. It was already in an evaluated or selected state.";
    }
    
    return response;
  }

  /**
   * Select a thought
   */
  selectThought(params: {
    treeId: string;
    thoughtId: string;
  }): Thought {
    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.thoughtId);
    const thought = result?.thought || tree.thoughts.get(params.thoughtId);

    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.thoughtId}${matchInfo}`);
    }

    // Validate that all child thoughts are evaluated before selecting parent
    const unevaluatedChildren = thought.children.filter(childId => {
      const childThought = tree.thoughts.get(childId);
      return childThought && childThought.state !== 'evaluated';
    });

    if (unevaluatedChildren.length > 0) {
      throw new ThoughtflowError(
        `Cannot select thought '${thought.content}' - it has ${unevaluatedChildren.length} unevaluated child thoughts. Please evaluate all child thoughts first before selecting the parent.`,
        'PARENT_HAS_UNEVALUATED_CHILDREN'
      );
    }

    thought.state = 'selected';
    tree.updatedAt = new Date().toISOString();
    this.triggerSave();

    // Return minimal summary
    return { id: thought.id, content: thought.content, state: thought.state } as Thought;
  }

  /**
   * Backtrack from a thought
   */
  backtrack(params: {
    treeId: string;
    thoughtId: string;
  }): Thought {
    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.thoughtId);
    const thought = result?.thought || tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.thoughtId}${matchInfo}`);
    }
    
    // Mark the target thought as pruned
    thought.state = 'pruned';
    
    // Mark all descendants as pruned
    const pruneDescendants = (thoughtId: string) => {
      const t = tree.thoughts.get(thoughtId);
      if (!t) return;
      
      t.state = 'pruned';
      for (const childId of t.children) {
        pruneDescendants(childId);
      }
    };
    
    for (const childId of thought.children) {
      pruneDescendants(childId);
    }
    
    tree.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    return thought;
  }

  /**
   * Prune tree by evaluation threshold
   */
  pruneTree(params: {
    treeId: string;
    threshold: number;
    riskThreshold?: number;
  }): { prunedCount: number; remainingCount: number } {
    const tree = this.getTreeFull(params.treeId);
    
    let prunedCount = 0;
    
    for (const thought of tree.thoughts.values()) {
      if (thought.state === 'pruned') {
        continue;
      }
      
      if (thought.state === 'evaluated' && thought.evaluation !== null && thought.evaluation < params.threshold) {
        thought.state = 'pruned';
        prunedCount++;
      }
      
      if (params.riskThreshold !== undefined && 
          thought.state === 'evaluated' &&
          thought.risk !== null && 
          thought.risk !== undefined &&
          thought.risk > params.riskThreshold) {
        thought.state = 'pruned';
        prunedCount++;
      }
    }
    
    tree.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    const totalPrunedInTree = Array.from(tree.thoughts.values()).filter(t => t.state === 'pruned').length;
    const remainingCount = tree.thoughts.size - totalPrunedInTree;
    
    return { prunedCount, remainingCount };
  }

  /**
   * Get a strategy by ID
   */
  getStrategy(id: string): Strategy {
    validateId(id, 'Strategy');
    const strategy = this.state.strategies.get(id);
    if (!strategy) {
      throw new ThoughtflowError(`Strategy '${id}' not found`, 'STRATEGY_NOT_FOUND');
    }
    return this.enrichStrategyWithLLMInstruction(strategy);
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): Strategy[] {
    return Array.from(this.state.strategies.values()).map(s => this.enrichStrategyWithLLMInstruction(s));
  }

  /**
   * Add LLM_instruction to a Strategy object for return to LLM
   */
  private enrichStrategyWithLLMInstruction(strategy: Strategy): Strategy {
    return {
      ...strategy,
      LLM_instruction: STRATEGY_LLM_INSTRUCTION
    };
  }

  /**
   * List all strategies (alias for getAllStrategies for tool handler compatibility)
   * Tool handlers use this name for consistency with other list operations
   */
  listStrategies(): Array<{ id: string; name: string; status: string }> {
    return Array.from(this.state.strategies.values()).map(s => ({
      id: s.id,
      name: s.name,
      status: s.status
    }));
  }

  /**
   * Clear all trees
   */
  clearAllTrees(): void {
    this.state.trees.clear();
    this.triggerSave();
    logger.info('Cleared all trees');
  }

  /**
   * Clear all data (alias for clearAllTrees for tool handler compatibility)
   * Tool handlers use this name for consistency with other clear operations
   */
  clearAll(): void {
    this.clearAllTrees();
  }
  /**
   * Generate child thoughts using LLM
   */
  async generateChildrenWithLLM(params: {
    treeId: string;
    parentId: string;
    numChildren?: number;
    temperature?: number;
  }): Promise<Thought[]> {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.parentId, 'parentId');
    
    // Check for LLM provider and fallback to MockLLMProvider if needed
    let provider = this.llmProvider;
    if (!provider) {
      if (this.strictLLM) {
        throw new ThoughtflowError('LLM provider not configured', 'LLM_NOT_CONFIGURED');
      }
      logger.info('No LLM provider configured. Falling back to MockLLMProvider for thought generation.');
      provider = new MockLLMProvider();
      this.llmProvider = provider;
    }

    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.parentId);
    const parentThought = result?.thought || tree.thoughts.get(params.parentId);
    
    if (!parentThought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.parentId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.parentId}${matchInfo}`);
    }

    const numChildren = params.numChildren || 3;
    const temperature = params.temperature || 0.7;

    // Build context from parent and tree goal
    const context = `Goal: ${tree.goal}\nParent thought: ${parentThought.content}\nDepth: ${parentThought.depth}`;

    // Generate thoughts using LLM
    const generatedContents = await provider.generateThoughts(
      context,
      numChildren,
      undefined,
      temperature
    );

    // Add each generated thought as a child
    const newThoughts: Thought[] = [];
    for (const content of generatedContents) {
      const childThought = this.addChildThought({
        treeId: params.treeId,
        parentId: params.parentId,
        content: content.trim(),
        metadata: { generatedBy: 'llm' }
      });
      newThoughts.push(childThought);
    }

    logger.info(`Generated ${newThoughts.length} child thoughts using LLM for parent ${params.parentId}`);
    return newThoughts;
  }

  /**
   * Evaluate a thought using LLM
   */
  async evaluateWithLLM(params: {
    treeId: string;
    thoughtId: string;
    useLLMJudge?: boolean;
  }): Promise<Thought> {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    
    // Check for LLM provider and fallback to MockLLMProvider if needed
    let provider = this.llmProvider;
    if (!provider || !provider.evaluateThoughtStructured) {
      if (this.strictLLM) {
        throw new ThoughtflowError('LLM provider does not support structured evaluation', 'LLM_NOT_SUPPORTED');
      }
      logger.info('No LLM provider configured. Falling back to MockLLMProvider for thought evaluation.');
      provider = new MockLLMProvider();
      this.llmProvider = provider;
    }

    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.thoughtId);
    const thought = result?.thought || tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.thoughtId}${matchInfo}`);
    }

    // Build context for evaluation
    const context = `Goal: ${tree.goal}\nThought: ${thought.content}`;

    // Get structured evaluation from LLM (provider is guaranteed to have method after check)
    const evaluation = await provider.evaluateThoughtStructured!(
      thought.content,
      tree.goal,
      context
    );

    // Update thought with evaluation
    thought.evaluation = evaluation.overallScore;
    thought.state = 'evaluated';
    thought.creativity = evaluation.creativity;
    thought.risk = evaluation.risk;
    thought.criteriaScores = evaluation.criteriaScores;
    thought.metadata = thought.metadata || {};
    thought.metadata.evaluationReasoning = evaluation.reasoning;
    thought.metadata.evaluatedBy = 'llm';

    tree.updatedAt = new Date().toISOString();
    
    // Auto-evaluate parent if all its children are now evaluated
    this.autoEvaluateParent(tree, params.thoughtId);
    
    this.triggerSave();

    logger.info(`Evaluated thought ${params.thoughtId} using LLM with score ${evaluation.overallScore}`);
    
    // Return minimal summary
    return { 
      id: thought.id, 
      content: thought.content, 
      state: thought.state, 
      evaluation: thought.evaluation,
      creativity: thought.creativity,
      risk: thought.risk
    } as Thought;
  }

  /**
   * Refine a thought using LLM
   */
  async refineThought(params: {
    treeId: string;
    thoughtId: string;
    goal?: string;
  }): Promise<Thought> {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    
    // Check for LLM provider and fallback to MockLLMProvider if needed
    let provider = this.llmProvider;
    if (!provider || !provider.refineThought) {
      if (this.strictLLM) {
        throw new ThoughtflowError('LLM provider does not support thought refinement', 'LLM_NOT_SUPPORTED');
      }
      logger.info('No LLM provider configured. Falling back to MockLLMProvider for thought refinement.');
      provider = new MockLLMProvider();
      this.llmProvider = provider;
    }

    const tree = this.getTreeFull(params.treeId);
    
    // Use robust lookup
    const result = this.findThoughtRobustly(params.treeId, params.thoughtId);
    const thought = result?.thought || tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      // Provide helpful error message with closest matches
      const treeThoughtIds = Array.from(tree.thoughts.keys());
      const closeMatches = findClosestMatches(params.thoughtId, treeThoughtIds, 3);
      const matchInfo = closeMatches.length > 0 
        ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
        : '';
      throw new ThoughtNotFoundError(params.treeId, `${params.thoughtId}${matchInfo}`);
    }

    const goal = params.goal || tree.goal;

    // Refine thought using LLM (provider is guaranteed to have method after check)
    const refinedContent = await provider.refineThought!(
      thought.content,
      goal
    );

    // Update thought with refined content
    thought.content = refinedContent.trim();
    thought.updatedAt = new Date().toISOString();
    thought.metadata = thought.metadata || {};
    thought.metadata.refinedBy = 'llm';

    tree.updatedAt = new Date().toISOString();
    this.triggerSave();

    logger.info(`Refined thought ${params.thoughtId} using LLM`);
    
    // Return minimal summary
    return { 
      id: thought.id, 
      content: thought.content, 
      state: thought.state 
    } as Thought;
  }

  /**
   * Synthesize multiple thoughts using LLM
   */
  async synthesizeThoughts(params: {
    treeId: string;
    thoughtIds: string[];
    newParentId?: string;
  }): Promise<Thought> {
    validateRequiredString(params.treeId, 'treeId');
    
    // Check for LLM provider and fallback to MockLLMProvider if needed
    let provider = this.llmProvider;
    if (!provider || !provider.synthesizeThoughts) {
      if (this.strictLLM) {
        throw new ThoughtflowError('LLM provider does not support thought synthesis', 'LLM_NOT_SUPPORTED');
      }
      logger.info('No LLM provider configured. Falling back to MockLLMProvider for thought synthesis.');
      provider = new MockLLMProvider();
      this.llmProvider = provider;
    }

    const tree = this.getTreeFull(params.treeId);
    
    // Get all thoughts to synthesize
    const thoughtsToSynthesize: string[] = [];
    let parentId: string | null = null;
    
    for (const thoughtId of params.thoughtIds) {
      // Use robust lookup for each thought
      const result = this.findThoughtRobustly(params.treeId, thoughtId);
      const thought = result?.thought || tree.thoughts.get(thoughtId);
      
      if (!thought) {
        // Provide helpful error message with closest matches
        const treeThoughtIds = Array.from(tree.thoughts.keys());
        const closeMatches = findClosestMatches(thoughtId, treeThoughtIds, 3);
        const matchInfo = closeMatches.length > 0 
          ? ` Did you mean: ${closeMatches.map(m => `'${m.id}'`).join(', ')}?`
          : '';
        throw new ThoughtNotFoundError(params.treeId, `${thoughtId}${matchInfo}`);
      }
      
      thoughtsToSynthesize.push(thought.content);
      if (parentId === null) {
        parentId = thought.parentId;
      }
    }

    // Use provided newParentId or common parent
    const finalParentId = params.newParentId || parentId;

    // Synthesize thoughts using LLM (provider is guaranteed to have method after check)
    const synthesizedContent = await provider.synthesizeThoughts!(
      thoughtsToSynthesize,
      tree.goal
    );

    // Add synthesized thought as a child
    const synthesizedThought = this.addChildThought({
      treeId: params.treeId,
      parentId: finalParentId || tree.rootId,
      content: synthesizedContent.trim(),
      metadata: { 
        synthesizedFrom: params.thoughtIds,
        synthesizedBy: 'llm'
      }
    });

    logger.info(`Synthesized ${params.thoughtIds.length} thoughts into ${synthesizedThought.id} using LLM`);
    return synthesizedThought;
  }

  /**
   * Get LLM provider status
   */
  async getLLMStatus(): Promise<{
    providerType: string;
    model?: string;
    connected: boolean;
    available: boolean;
  }> {
    const status = {
      providerType: 'none',
      model: undefined as string | undefined,
      connected: false,
      available: false
    };

    if (!this.llmProvider) {
      return status;
    }

    // Determine provider type
    if (this.llmProvider.constructor.name === 'OllamaLLMProvider') {
      status.providerType = 'ollama';
      // Try to get connection status if available
      if ('checkConnection' in this.llmProvider) {
        status.connected = await (this.llmProvider as any).checkConnection();
      }
      if ('listModels' in this.llmProvider && status.connected) {
        try {
          const models = await (this.llmProvider as any).listModels();
          status.available = models.length > 0;
        } catch {
          status.available = false;
        }
      }
    } else if (this.llmProvider.constructor.name === 'GrokLLMProvider') {
      status.providerType = 'grok';
      status.connected = true;
      status.available = true;
    } else if (this.llmProvider.constructor.name === 'MockLLMProvider') {
      status.providerType = 'mock';
      status.connected = true;
      status.available = true;
    }

    return status;
  }
}
