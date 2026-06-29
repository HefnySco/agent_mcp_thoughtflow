import type {
  Tree,
  Thought,
  Strategy
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

/**
 * ToTService manages Tree of Thoughts for systematic reasoning
 */
export class ToTService extends BaseService {
  constructor(storageAdapter: IStorageAdapter) {
    super(storageAdapter, 'ToTService');
  }

  /**
   * Create a new Tree of Thoughts
   */
  createTree(params: {
    goal: string;
    rootContent: string;
    maxDepth?: number;
    sessionId?: string;
    metadata?: Record<string, any>;
  }): Tree {
    validateRequiredString(params.goal, 'goal');
    validateRequiredString(params.rootContent, 'rootContent');

    // Normalize the goal for comparison
    const normalizedGoal = this.normalizeKey(params.goal);

    // Check if tree with same normalized goal already exists
    for (const [id, existingTree] of this.state.trees) {
      if (this.normalizeKey(existingTree.goal) === normalizedGoal) {
        // Only return existing tree if it has thoughts (not a stale empty tree)
        if (existingTree.thoughts.size > 0) {
          logger.info(`Returning existing tree: ${id} - ${existingTree.goal} (normalized: ${normalizedGoal})`);
          return existingTree;
        } else {
          logger.info(`Deleting stale empty tree: ${id} - ${existingTree.goal} (normalized: ${normalizedGoal})`);
          this.state.trees.delete(id);
        }
      }
    }

    const treeId = this.generateId(params.goal);
    const rootId = this.generateId(params.rootContent);
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
      metadata: treeMetadata
    };

    this.state.trees.set(treeId, tree);
    this.triggerSave();
    logger.info(`Created tree: ${treeId} - ${params.goal} (normalized: ${normalizedGoal})`);
    // Return minimal summary for LLM efficiency
    return { id: treeId, goal: params.goal, rootId } as Tree;
  }

  /**
   * Get a tree by ID (minimal summary for LLM efficiency)
   */
  getTree(id: string): Tree {
    validateId(id, 'Tree');
    const tree = this.state.trees.get(id);
    if (!tree) {
      throw new TreeNotFoundError(id);
    }
    // Return minimal summary for LLM efficiency
    return { id: tree.id, goal: tree.goal, rootId: tree.rootId } as Tree;
  }

  /**
   * Get a tree by ID with full details (for dashboard/internal use)
   */
  getTreeFull(id: string): Tree {
    validateId(id, 'Tree');
    const tree = this.state.trees.get(id);
    if (!tree) {
      throw new TreeNotFoundError(id);
    }
    return tree;
  }

  /**
   * Get all trees
   */
  getAllTrees(): Tree[] {
    return Array.from(this.state.trees.values());
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
    const deleted = this.state.trees.delete(id);
    if (deleted) {
      this.triggerSave();
      logger.info(`Deleted tree: ${id}`);
    }
    return deleted;
  }

  /**
   * Add a child thought to an existing thought
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
    const parentThought = tree.thoughts.get(params.parentId);
    
    if (!parentThought) {
      throw new ThoughtNotFoundError(params.treeId, params.parentId);
    }
    
    if (parentThought.depth >= tree.maxDepth) {
      throw new ValidationError(`Maximum depth reached for tree ${params.treeId}`, 'depth');
    }
    
    const childId = this.generateId(params.content);
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
    
    // Return minimal summary
    return { id: childId, content: params.content, state: 'pending' } as Thought;
  }

  /**
   * Add child thought with individual parameters (alias for addChildThought)
   * Tool handlers use this for compatibility with MCP schema that uses individual parameters
   */
  addIdea(treeId: string, parentId: string, content: string, metadata?: Record<string, any>): Thought {
    return this.addChildThought({ treeId, parentId, content, metadata });
  }

  /**
   * Get a thought by ID
   */
  getThought(treeId: string, thoughtId: string): Thought {
    validateId(treeId, 'Tree');
    validateId(thoughtId, 'Thought');
    
    const tree = this.getTree(treeId);
    const thought = tree.thoughts.get(thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(treeId, thoughtId);
    }
    
    return thought;
  }

  /**
   * Evaluate a thought
   */
  evaluateThought(params: {
    treeId: string;
    thoughtId: string;
    score: number;
    creativity?: number;
    risk?: number;
    criteriaScores?: Record<string, number>;
    reasoning?: string;
  }): Thought {
    validateRequiredString(params.treeId, 'treeId');
    validateRequiredString(params.thoughtId, 'thoughtId');
    validateEvaluationScore(params.score);
    
    const tree = this.getTreeFull(params.treeId);
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
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
    
    tree.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    // Return minimal summary
    return { id: thought.id, content: thought.content, state: thought.state, evaluation: thought.evaluation } as Thought;
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
   * Verify a thought
   */
  verifyThought(params: {
    treeId: string;
    thoughtId: string;
    verificationNotes?: string;
  }): Thought {
    const tree = this.getTreeFull(params.treeId);
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }
    
    thought.verified = true;
    if (params.verificationNotes) {
      thought.verificationNotes = params.verificationNotes;
    }
    tree.updatedAt = new Date().toISOString();
    this.triggerSave();
    
    // Return minimal summary
    return { id: thought.id, content: thought.content, state: thought.state, verified: true } as Thought;
  }

  /**
   * Select a thought
   */
  selectThought(params: {
    treeId: string;
    thoughtId: string;
  }): Thought {
    const tree = this.getTreeFull(params.treeId);
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }
    
    if (thought.verified !== true) {
      throw new ValidationError(`Cannot select unverified thought: ${params.thoughtId}. Use verify_thought first.`, 'thoughtId');
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
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }
    
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
    return strategy;
  }

  /**
   * Get all strategies
   */
  getAllStrategies(): Strategy[] {
    return Array.from(this.state.strategies.values());
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
}
