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
   * Create a slug from a string for ID generation.
   * Converts to lowercase, replaces non-alphanumeric with dashes, trims.
   */
  protected slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')     // replace non-alphanumeric with dash
      .replace(/^-+|-+$/g, '')         // trim leading/trailing dashes
      .substring(0, 100);              // limit length to 100 chars
  }

  /**
   * Generate a slug-based ID with collision detection.
   * First tries to use the slug directly. If collision exists in the provided set,
   * appends a short suffix.
   * 
   * @param content - The content to slugify
   * @param existingIds - Set of existing IDs to check for collisions
   * @param shortSuffix - Optional short suffix to use if collision (e.g., from UUID)
   * @returns A unique ID based on the slug
   */
  protected generateSlugId(content: string, existingIds: Set<string>, shortSuffix?: string): string {
    const slug = this.slugify(content);
    
    // If slug is not in existing IDs, use it directly
    if (!existingIds.has(slug)) {
      return slug;
    }
    
    // Collision exists - append suffix
    const suffix = shortSuffix || uuidv4().split('-').pop()?.substring(0, 8) || 'xyz';
    const slugWithSuffix = `${slug}-${suffix}`;
    
    // If the suffixed version also collides, keep trying with different suffixes
    if (existingIds.has(slugWithSuffix)) {
      let counter = 1;
      while (existingIds.has(`${slug}-${suffix}-${counter}`)) {
        counter++;
      }
      return `${slug}-${suffix}-${counter}`;
    }
    
    return slugWithSuffix;
  }

  /**
   * Soft-delete an entity by marking it as deleted
   * @param entity - The entity to soft-delete (must have isDeleted and deletedAt fields)
   */
  protected softDeleteEntity(entity: any): void {
    if (!entity) return;
    entity.isDeleted = true;
    entity.deletedAt = new Date().toISOString();
  }

  /**
   * Filter out soft-deleted entities from an array
   * @param entities - Array of entities to filter
   * @param includeDeleted - Whether to include deleted entities (default: false)
   * @returns Filtered array
   */
  protected filterDeleted<T extends { isDeleted?: boolean }>(
    entities: T[],
    includeDeleted: boolean = false
  ): T[] {
    if (includeDeleted) {
      return entities;
    }
    return entities.filter(e => !e.isDeleted);
  }

  /**
   * Filter out soft-deleted entities from a Map values
   * @param map - Map of entities to filter
   * @param includeDeleted - Whether to include deleted entities (default: false)
   * @returns Filtered array
   */
  protected filterDeletedFromMap<T extends { isDeleted?: boolean }>(
    map: Map<string, T>,
    includeDeleted: boolean = false
  ): T[] {
    if (includeDeleted) {
      return Array.from(map.values());
    }
    return Array.from(map.values()).filter(e => !e.isDeleted);
  }

  /**
   * Check if an entity is soft-deleted
   * @param entity - The entity to check
   * @returns True if the entity is deleted
   */
  protected isDeleted(entity: any): boolean {
    return entity?.isDeleted === true;
  }
}
