import type {
  Task,
  Workflow,
  WorkflowRun,
  Strategy,
  Tree
} from '../types/index.js';

/**
 * Unified storage state for Thoughtflow
 * Combines Task Orchestrator and Tree of Thoughts data
 */
export interface ThoughtflowState {
  tasks: Map<string, Task>;
  workflows: Map<string, Workflow>;
  workflowRuns: Map<string, WorkflowRun>;
  strategies: Map<string, Strategy>;
  trees: Map<string, Tree>;
  // cognitiveLinks stored separately for bridge layer provenance
  cognitiveLinks: Map<string, CognitiveLink>;
}

/**
 * Cognitive link for bridge layer provenance tracking
 */
export interface CognitiveLink {
  id: string;
  type: 'thought_to_task' | 'task_to_thought' | 'link';
  fromId: string;
  toId: string;
  fromType: 'thought' | 'task';
  toType: 'thought' | 'task';
  createdAt: string;
  reason?: string;
  metadata?: Record<string, any>;
  isDeleted?: boolean;
  deletedAt?: string | null;
}

/**
 * Abstract storage adapter interface
 * Defines the contract for different storage backends
 */
export interface IStorageAdapter {
  /**
   * Load state from storage
   * @returns The loaded state
   */
  load(): Promise<ThoughtflowState>;

  /**
   * Save state to storage
   * @param state - The state to save
   */
  save(state: ThoughtflowState): Promise<void>;

  /**
   * Initialize the storage backend
   * Called once when the adapter is first created
   */
  initialize(): Promise<void>;

  /**
   * Close the storage backend
   * Called when shutting down
   */
  close(): Promise<void>;

  /**
   * Clear all data from storage
   */
  clear(): Promise<void>;
}
