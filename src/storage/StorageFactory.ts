import type { IStorageAdapter } from './IStorageAdapter.js';
import { JsonStorageAdapter } from './JsonStorageAdapter.js';
import { logger } from '../utils/logger.js';

export type StorageBackend = 'json' | 'sqlite';

export interface StorageConfig {
  backend: StorageBackend;
  path: string;
}

/**
 * Factory for creating storage adapters
 */
export class StorageFactory {
  /**
   * Create a storage adapter based on configuration
   */
  static create(config: StorageConfig): IStorageAdapter {
    logger.info(`Creating ${config.backend} storage adapter at ${config.path}`);
    
    switch (config.backend) {
      case 'json':
        return new JsonStorageAdapter(config.path);
      case 'sqlite':
        // TODO: Implement SQLite adapter in v1.1
        throw new Error('SQLite storage not yet implemented. Use json backend.');
      default:
        throw new Error(`Unknown storage backend: ${config.backend}`);
    }
  }
}
