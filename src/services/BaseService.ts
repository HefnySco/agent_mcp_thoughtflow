import { v4 as uuidv4 } from 'uuid';
import type { IStorageAdapter, ThoughtflowState } from '../storage/IStorageAdapter.js';
import { ThoughtflowError } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * BaseService provides shared functionality for all services
 * Handles state loading, saving, debounced auto-save, and shutdown
 */
export abstract class BaseService {
  protected storageAdapter: IStorageAdapter;
  protected state: ThoughtflowState;
  protected saveTimeout: NodeJS.Timeout | null = null;
  protected autoSave: boolean = true;
  protected saveDebounceMs: number = 1000;
  protected serviceName: string;

  constructor(storageAdapter: IStorageAdapter, serviceName: string) {
    this.storageAdapter = storageAdapter;
    this.serviceName = serviceName;
    this.state = {
      tasks: new Map(),
      workflows: new Map(),
      workflowRuns: new Map(),
      strategies: new Map(),
      trees: new Map(),
      cognitiveLinks: new Map()
    };
  }

  /**
   * Load state from storage
   */
  async load(): Promise<void> {
    try {
      this.state = await this.storageAdapter.load();
      logger.info(`${this.serviceName} state loaded`);
    } catch (err) {
      logger.error('Failed to load state from storage', err instanceof Error ? err : undefined);
      throw new ThoughtflowError('Failed to load state from storage', 'STORAGE_ERROR');
    }
  }

  /**
   * Save state to storage
   */
  async save(): Promise<void> {
    try {
      await this.storageAdapter.save(this.state);
    } catch (err) {
      logger.error('Failed to save state to storage', err instanceof Error ? err : undefined);
      throw new ThoughtflowError('Failed to save state to storage', 'STORAGE_ERROR');
    }
  }

  /**
   * Trigger debounced save if auto-save is enabled
   */
  protected triggerSave(): void {
    if (!this.autoSave) {
      return;
    }

    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    this.saveTimeout = setTimeout(async () => {
      try {
        await this.save();
      } catch (err) {
        logger.error('Auto-save failed', err instanceof Error ? err : undefined);
      }
    }, this.saveDebounceMs);
  }

  /**
   * Force immediate save (bypasses debouncing)
   */
  async forceSave(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.save();
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    await this.forceSave();
    logger.info(`${this.serviceName} shut down`);
  }

  /**
   * Get the current state (for testing or inspection)
   */
  getState(): ThoughtflowState {
    return this.state;
  }

  /**
   * Set the state (for sharing state across services)
   */
  setState(state: ThoughtflowState): void {
    this.state = state;
  }

  /**
   * Set auto-save mode
   */
  setAutoSave(enabled: boolean): void {
    this.autoSave = enabled;
  }

  /**
   * Set debounce delay for auto-save
   */
  setSaveDebounceMs(ms: number): void {
    this.saveDebounceMs = ms;
  }

  /**
   * Normalize a string key for comparison.
   * Trims whitespace, converts to lowercase, and collapses multiple spaces.
   * This provides robust comparison against minor variations in spacing/casing.
   */
  protected normalizeKey(key: string): string {
    return key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  /**
   * Generate a unique ID.
   * If a name/tag is provided, create a readable ID in the format:
   *   slugified-name + short-uuid
   * Otherwise return a pure UUID.
   */
  protected generateId(nameOrTag?: string | null): string {
    const uuid = uuidv4();

    if (!nameOrTag) {
      return uuid;
    }

    // Create a clean slug from the name
    const slug = nameOrTag
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')     // replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '')         // trim leading/trailing dashes
      .substring(0, 50);               // limit length

    // Take last 8 characters of UUID for uniqueness
    const shortUuid = uuid.split('-').pop()?.substring(0, 8) || uuid.substring(0, 8);

    return `${slug}-${shortUuid}`;
  }
}
