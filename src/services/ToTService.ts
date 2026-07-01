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

/**
 * LLM instruction for Strategy usage
 * Provides guidance to the LLM on how to use Strategies correctly
 */
const STRATEGY_LLM_INSTRUCTION = `Strategy Usage Rules:
- One Strategy = one cohesive goal/project area.
- Use create_strategy as get-or-create (idempotent by normalized name).
- Add Trees for divergent reasoning/exploration. Create or use an existing Tree before adding ideas.
- Add Workflows for convergent execution with tasks. Create or use an existing workflow before creating tasks.
- Promote promising thoughts to tasks. If a task blocks, spawn new Tree from it.
- Maintain strict isolation: do not mix tasks or workflows across different Strategies.
- Use Cognitive Bridge for provenance (link/promote/spawn).`;

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

    // Return minimal summary for LLM efficiency
    return { id: treeId, goal: params.goal, rootId } as Tree;
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
   * Get a thought by ID (minimal summary for LLM efficiency)
   */
  getThought(treeId: string, thoughtId: string): Thought {
    validateId(treeId, 'Tree');
    validateId(thoughtId, 'Thought');

    const tree = this.getTreeFull(treeId);
    const thought = tree.thoughts.get(thoughtId);

    if (!thought) {
      throw new ThoughtNotFoundError(treeId, thoughtId);
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
    
    // Auto-evaluate parent if all its children are now evaluated
    this.autoEvaluateParent(tree, params.thoughtId);
    
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
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
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
    
    if (!this.llmProvider) {
      throw new ThoughtflowError('LLM provider not configured', 'LLM_NOT_CONFIGURED');
    }

    const tree = this.getTreeFull(params.treeId);
    const parentThought = tree.thoughts.get(params.parentId);
    
    if (!parentThought) {
      throw new ThoughtNotFoundError(params.treeId, params.parentId);
    }

    const numChildren = params.numChildren || 3;
    const temperature = params.temperature || 0.7;

    // Build context from parent and tree goal
    const context = `Goal: ${tree.goal}\nParent thought: ${parentThought.content}\nDepth: ${parentThought.depth}`;

    // Generate thoughts using LLM
    const generatedContents = await this.llmProvider.generateThoughts(
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
    
    if (!this.llmProvider || !this.llmProvider.evaluateThoughtStructured) {
      throw new ThoughtflowError('LLM provider does not support structured evaluation', 'LLM_NOT_SUPPORTED');
    }

    const tree = this.getTreeFull(params.treeId);
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }

    // Build context for evaluation
    const context = `Goal: ${tree.goal}\nThought: ${thought.content}`;

    // Get structured evaluation from LLM
    const evaluation = await this.llmProvider.evaluateThoughtStructured(
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
    
    if (!this.llmProvider || !this.llmProvider.refineThought) {
      throw new ThoughtflowError('LLM provider does not support thought refinement', 'LLM_NOT_SUPPORTED');
    }

    const tree = this.getTreeFull(params.treeId);
    const thought = tree.thoughts.get(params.thoughtId);
    
    if (!thought) {
      throw new ThoughtNotFoundError(params.treeId, params.thoughtId);
    }

    const goal = params.goal || tree.goal;

    // Refine thought using LLM
    const refinedContent = await this.llmProvider.refineThought(
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
    
    if (!this.llmProvider || !this.llmProvider.synthesizeThoughts) {
      throw new ThoughtflowError('LLM provider does not support thought synthesis', 'LLM_NOT_SUPPORTED');
    }

    const tree = this.getTreeFull(params.treeId);
    
    // Get all thoughts to synthesize
    const thoughtsToSynthesize: string[] = [];
    let parentId: string | null = null;
    
    for (const thoughtId of params.thoughtIds) {
      const thought = tree.thoughts.get(thoughtId);
      if (!thought) {
        throw new ThoughtNotFoundError(params.treeId, thoughtId);
      }
      thoughtsToSynthesize.push(thought.content);
      if (parentId === null) {
        parentId = thought.parentId;
      }
    }

    // Use provided newParentId or common parent
    const finalParentId = params.newParentId || parentId;

    // Synthesize thoughts using LLM
    const synthesizedContent = await this.llmProvider.synthesizeThoughts(
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
