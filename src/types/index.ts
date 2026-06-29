/**
 * Unified Cognitive Scaffold Types
 * Combines Task Orchestrator and Tree of Thoughts with Bridge Layer metadata
 */

// ============================================================================
// Cognitive Metadata (Bridge Layer)
// ============================================================================

/**
 * Cognitive metadata namespace for bridge layer provenance tracking
 * All bridge-related data MUST live under metadata.cognitive
 */
export interface CognitiveMetadata {
  /**
   * Links to tasks created from this thought
   */
  promotedToTaskIds?: string[];
  
  /**
   * Link to the workflow containing promoted tasks
   */
  workflowId?: string;
  
  /**
   * Timestamp when thought was promoted to tasks
   */
  promotedAt?: string;
  
  /**
   * Links to ToT trees spawned from this task
   */
  explorationTreeIds?: string[];
  
  /**
   * Timestamp when tree was spawned from task
   */
  spawnedAt?: string;
  
  /**
   * Explicit links between thoughts and tasks (lightweight)
   */
  linkedTaskIds?: string[];
  linkedThoughtIds?: string[];
  
  /**
   * Sync status between thought and task
   */
  syncStatus?: 'synced' | 'outdated' | 'conflict';
  
  /**
   * Last sync timestamp
   */
  lastSyncedAt?: string;
  
  /**
   * Provenance chain for auditability
   */
  provenanceChain?: ProvenanceEntry[];
}

/**
 * Single entry in the provenance chain
 */
export interface ProvenanceEntry {
  type: 'thought_to_task' | 'task_to_thought' | 'link';
  fromId: string;
  toId: string;
  timestamp: string;
  reason?: string;
}

// ============================================================================
// Task Orchestrator Types
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export interface Task {
  id: string;
  name: string;
  description?: string;
  status: TaskStatus;
  dependencies: string[];
  parentTaskId?: string;
  order?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  metadata?: Record<string, any>;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  taskIds: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, any>;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
  taskExecutionOrder: string[];
}

// ============================================================================
// Tree of Thoughts Types
// ============================================================================

export type ThoughtState = 'pending' | 'evaluated' | 'selected' | 'pruned';

export interface Thought {
  id: string;
  content: string;
  parentId: string | null;
  children: string[];
  evaluation: number | null;
  
  // Multi-criteria evaluation fields
  creativity?: number | null;
  risk?: number | null;
  criteriaScores?: Record<string, number>;
  
  state: ThoughtState;
  depth: number;
  createdAt: string;
  updatedAt: string;
  verified?: boolean;
  verificationNotes?: string;
  movedAt?: string;
  metadata?: Record<string, any>;
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  requestCount: number;
}

export interface Strategy {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed' | 'archived';
  treeIds: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface Tree {
  id: string;
  rootId: string;
  thoughts: Map<string, Thought>;
  goal: string;
  createdAt: string;
  updatedAt: string;
  maxDepth: number;
  strategyId?: string;
  metadata?: Record<string, any>;
  usageStats?: UsageStats;
}

// ============================================================================
// Bridge Layer Types
// ============================================================================

export interface PromoteThoughtToTasksParams {
  treeId: string;
  thoughtId: string;
  includeDescendants?: boolean;
  flattenHierarchy?: boolean;
  workflowId?: string;
  taskNamePrefix?: string;
}

export interface PromoteThoughtToTasksResult {
  taskIds: string[];
  workflowId?: string;
  thoughtsPromoted: number;
  hierarchyPreserved: boolean;
}

export interface SpawnTotFromTaskParams {
  taskId: string;
  goal: string;
  rootContent: string;
  maxDepth?: number;
  autoExplore?: boolean;
}

export interface SpawnTotFromTaskResult {
  treeId: string;
  rootThoughtId: string;
}

export interface LinkThoughtToTaskParams {
  treeId: string;
  thoughtId: string;
  taskId: string;
  reason?: string;
}

export interface CognitiveProvenanceEntry {
  id: string;
  type: 'thought' | 'task';
  data: Thought | Task;
  cognitiveMetadata?: CognitiveMetadata;
  relatedEntries: CognitiveProvenanceEntry[];
}

export interface GetCognitiveProvenanceParams {
  id: string;
  type: 'thought' | 'task';
  maxDepth?: number;
}

// ============================================================================
// Error Classes
// ============================================================================

export class ThoughtflowError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ThoughtflowError';
    Object.setPrototypeOf(this, ThoughtflowError.prototype);
  }
}

export class TaskNotFoundError extends ThoughtflowError {
  constructor(taskId: string) {
    super(`Task with ID '${taskId}' not found`, 'TASK_NOT_FOUND');
    this.name = 'TaskNotFoundError';
    Object.setPrototypeOf(this, TaskNotFoundError.prototype);
  }
}

export class WorkflowNotFoundError extends ThoughtflowError {
  constructor(workflowId: string) {
    super(`Workflow with ID '${workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    this.name = 'WorkflowNotFoundError';
    Object.setPrototypeOf(this, WorkflowNotFoundError.prototype);
  }
}

export class TreeNotFoundError extends ThoughtflowError {
  constructor(treeId: string) {
    super(`Tree with ID '${treeId}' not found`, 'TREE_NOT_FOUND');
    this.name = 'TreeNotFoundError';
    Object.setPrototypeOf(this, TreeNotFoundError.prototype);
  }
}

export class ThoughtNotFoundError extends ThoughtflowError {
  constructor(treeId: string, thoughtId: string) {
    super(`Thought '${thoughtId}' not found in tree '${treeId}'`, 'THOUGHT_NOT_FOUND');
    this.name = 'ThoughtNotFoundError';
    Object.setPrototypeOf(this, ThoughtNotFoundError.prototype);
  }
}

export class ValidationError extends ThoughtflowError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class BridgeError extends ThoughtflowError {
  constructor(message: string) {
    super(message, 'BRIDGE_ERROR');
    this.name = 'BridgeError';
    Object.setPrototypeOf(this, BridgeError.prototype);
  }
}

export class CycleDetectionError extends BridgeError {
  constructor(message: string) {
    super(message);
    this.name = 'CycleDetectionError';
    Object.setPrototypeOf(this, CycleDetectionError.prototype);
  }
}

// ============================================================================
// LLM Provider Types (for ToT integration)
// ============================================================================

/**
 * Structured evaluation result from LLM for thought evaluation
 */
export interface StructuredEvaluationResult {
  overallScore: number;
  reasoning: string;
  criteriaScores: Record<string, number>;
  creativity?: number;
  risk?: number;
}

/**
 * LLM Provider interface for Tree of Thoughts
 * Allows pluggable LLM backends (Grok, Ollama, Mock, etc.)
 */
export interface LLMProvider {
  generateThoughts(prompt: string, count: number, context?: string, temperature?: number): Promise<string[]>;
  generateThoughtsAdvanced?(prompt: string, count: number, context?: string, temperature?: number, fewShotExamples?: string[]): Promise<string[]>;
  evaluateThoughtStructured?(thought: string, goal: string, context?: string): Promise<StructuredEvaluationResult>;
  getLastUsageStats?(): { promptTokens: number; completionTokens: number; totalTokens: number } | null;
  selfReflect?(thought: string, feedback: string): Promise<string>;
  refineThought?(thought: string, goal: string): Promise<string>;
  synthesizeThoughts?(thoughts: string[], goal: string): Promise<string>;
}
