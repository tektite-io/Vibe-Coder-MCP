/**
 * File-based cache implementation for the Code-Map Generator tool.
 * This file contains the FileCache class for storing and retrieving cached data.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../../../logger.js';
import { CacheEntry, CacheMetadata, CacheOptions, CacheStats } from './types.js';

/**
 * A file-based cache implementation that stores entries as files.
 */
export class FileCache<T> {
  private name: string;
  private cacheDir: string;
  private metadataPath: string;
  private metadata: CacheMetadata;
  private options: Required<CacheOptions>;
  private stats: CacheStats;
  private initialized: boolean = false;
  private pruneTimer: NodeJS.Timeout | null = null;

  /**
   * Default options for the cache.
   */
  private static readonly DEFAULT_OPTIONS: Omit<Required<CacheOptions>, 'name' | 'cacheDir'> = {
    maxEntries: 10000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    validateOnGet: true,
    pruneOnStartup: true,
    pruneInterval: 60 * 60 * 1000, // 1 hour
    serialize: JSON.stringify,
    deserialize: JSON.parse,
  };

  /**
   * Creates a new FileCache instance.
   * @param options The cache options
   */
  constructor(options: CacheOptions) {
    this.name = options.name;
    this.cacheDir = path.resolve(options.cacheDir);
    this.metadataPath = path.join(this.cacheDir, `${this.name}-metadata.json`);
    
    // Apply default options
    this.options = {
      ...FileCache.DEFAULT_OPTIONS,
      name: options.name,
      cacheDir: this.cacheDir,
      maxEntries: options.maxEntries ?? FileCache.DEFAULT_OPTIONS.maxEntries,
      maxAge: options.maxAge ?? FileCache.DEFAULT_OPTIONS.maxAge,
      validateOnGet: options.validateOnGet ?? FileCache.DEFAULT_OPTIONS.validateOnGet,
      pruneOnStartup: options.pruneOnStartup ?? FileCache.DEFAULT_OPTIONS.pruneOnStartup,
      pruneInterval: options.pruneInterval ?? FileCache.DEFAULT_OPTIONS.pruneInterval,
      serialize: options.serialize ?? FileCache.DEFAULT_OPTIONS.serialize,
      deserialize: options.deserialize ?? FileCache.DEFAULT_OPTIONS.deserialize,
    };
    
    // Initialize metadata
    this.metadata = {
      name: this.name,
      size: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      keys: [],
      maxEntries: this.options.maxEntries,
      maxAge: this.options.maxAge,
    };
    
    // Initialize stats
    this.stats = {
      name: this.name,
      size: 0,
      hits: 0,
      misses: 0,
      hitRatio: 0,
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      sizeInBytes: 0,
    };
  }

  /**
   * Initializes the cache.
   * Creates the cache directory if it doesn't exist and loads metadata.
   * @returns A promise that resolves when the cache is initialized
   */
  public async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    try {
      // Create the cache directory if it doesn't exist
      await fs.mkdir(this.cacheDir, { recursive: true });
      
      // Load metadata if it exists
      try {
        const metadataContent = await fs.readFile(this.metadataPath, 'utf-8');
        this.metadata = JSON.parse(metadataContent) as CacheMetadata;
        logger.debug(`Loaded cache metadata for ${this.name} with ${this.metadata.size} entries`);
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          // Metadata file doesn't exist, create it
          await this.saveMetadata();
          logger.debug(`Created new cache metadata for ${this.name}`);
        } else {
          // Other error, log and re-throw
          logger.error({ err: error, metadataPath: this.metadataPath }, `Error loading cache metadata for ${this.name}`);
          throw error;
        }
      }
      
      // Prune expired entries if enabled
      if (this.options.pruneOnStartup) {
        await this.prune();
      }
      
      // Start automatic pruning if enabled
      if (this.options.pruneInterval > 0) {
        this.pruneTimer = setInterval(() => {
          this.prune().catch(error => {
            logger.error({ err: error }, `Error pruning cache ${this.name}`);
          });
        }, this.options.pruneInterval);
      }
      
      this.initialized = true;
    } catch (error) {
      logger.error({ err: error, cacheDir: this.cacheDir }, `Error initializing cache ${this.name}`);
      throw error;
    }
  }

  /**
   * Ensures the cache is initialized.
   * @throws Error if the cache is not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`Cache ${this.name} is not initialized. Call init() first.`);
    }
  }

  /**
   * Saves the cache metadata to disk.
   * @returns A promise that resolves when the metadata is saved
   */
  private async saveMetadata(): Promise<void> {
    try {
      await fs.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2), 'utf-8');
    } catch (error) {
      logger.error({ err: error, metadataPath: this.metadataPath }, `Error saving cache metadata for ${this.name}`);
      throw error;
    }
  }

  /**
   * Generates a cache key for a given key.
   * @param key The key to hash
   * @returns The hashed key
   */
  private hashKey(key: string): string {
    return crypto.createHash('md5').update(key).digest('hex');
  }

  /**
   * Gets the file path for a cache entry.
   * @param key The cache key
   * @returns The file path
   */
  private getEntryPath(key: string): string {
    const hashedKey = this.hashKey(key);
    return path.join(this.cacheDir, `${hashedKey}.json`);
  }

  /**
   * Gets a value from the cache.
   * @param key The cache key
   * @returns A promise that resolves to the cached value, or undefined if not found
   */
  public async get(key: string): Promise<T | undefined> {
    this.ensureInitialized();
    
    const entryPath = this.getEntryPath(key);
    
    try {
      // Check if the entry exists
      try {
        await fs.access(entryPath, fsSync.constants.R_OK);
      } catch (error) {
        // Entry doesn't exist
        this.stats.misses++;
        return undefined;
      }
      
      // Read the entry
      const entryContent = await fs.readFile(entryPath, 'utf-8');
      const entry = this.options.deserialize<CacheEntry<T>>(entryContent);
      
      // Validate the entry if enabled
      if (this.options.validateOnGet && entry.expiry < Date.now()) {
        // Entry is expired, delete it
        await this.delete(key);
        this.stats.misses++;
        return undefined;
      }
      
      // Entry is valid
      this.stats.hits++;
      this.stats.hitRatio = this.stats.hits / (this.stats.hits + this.stats.misses);
      return entry.value;
    } catch (error) {
      logger.error({ err: error, key, entryPath }, `Error getting cache entry for ${key}`);
      this.stats.misses++;
      return undefined;
    }
  }

  /**
   * Sets a value in the cache.
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Optional TTL in milliseconds (overrides the default maxAge)
   * @returns A promise that resolves when the value is cached
   */
  public async set(key: string, value: T, ttl?: number): Promise<void> {
    this.ensureInitialized();
    
    const entryPath = this.getEntryPath(key);
    const now = Date.now();
    const expiry = now + (ttl ?? this.options.maxAge);
    
    // Create the cache entry
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: now,
      expiry,
    };
    
    try {
      // Write the entry to disk
      await fs.writeFile(entryPath, this.options.serialize(entry), 'utf-8');
      
      // Update metadata
      if (!this.metadata.keys.includes(key)) {
        this.metadata.keys.push(key);
        this.metadata.size++;
      }
      this.metadata.lastUpdated = now;
      
      // Save metadata
      await this.saveMetadata();
      
      // Update stats
      this.stats.size = this.metadata.size;
      this.stats.lastUpdated = now;
      
      // Prune if we've exceeded maxEntries
      if (this.metadata.size > this.options.maxEntries) {
        await this.prune();
      }
    } catch (error) {
      logger.error({ err: error, key, entryPath }, `Error setting cache entry for ${key}`);
      throw error;
    }
  }

  /**
   * Checks if a key exists in the cache.
   * @param key The cache key
   * @returns A promise that resolves to true if the key exists, false otherwise
   */
  public async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    
    const entryPath = this.getEntryPath(key);
    
    try {
      await fs.access(entryPath, fsSync.constants.R_OK);
      
      // If validateOnGet is enabled, check if the entry is expired
      if (this.options.validateOnGet) {
        const entryContent = await fs.readFile(entryPath, 'utf-8');
        const entry = this.options.deserialize<CacheEntry<T>>(entryContent);
        
        if (entry.expiry < Date.now()) {
          // Entry is expired, delete it
          await this.delete(key);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Deletes a key from the cache.
   * @param key The cache key
   * @returns A promise that resolves to true if the key was deleted, false otherwise
   */
  public async delete(key: string): Promise<boolean> {
    this.ensureInitialized();
    
    const entryPath = this.getEntryPath(key);
    
    try {
      // Delete the entry file
      await fs.unlink(entryPath);
      
      // Update metadata
      const keyIndex = this.metadata.keys.indexOf(key);
      if (keyIndex !== -1) {
        this.metadata.keys.splice(keyIndex, 1);
        this.metadata.size--;
        this.metadata.lastUpdated = Date.now();
        
        // Save metadata
        await this.saveMetadata();
        
        // Update stats
        this.stats.size = this.metadata.size;
        this.stats.lastUpdated = Date.now();
      }
      
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // Entry doesn't exist, that's fine
        return false;
      }
      
      logger.error({ err: error, key, entryPath }, `Error deleting cache entry for ${key}`);
      throw error;
    }
  }

  /**
   * Clears the entire cache.
   * @returns A promise that resolves when the cache is cleared
   */
  public async clear(): Promise<void> {
    this.ensureInitialized();
    
    try {
      // Delete all entry files
      for (const key of this.metadata.keys) {
        const entryPath = this.getEntryPath(key);
        try {
          await fs.unlink(entryPath);
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
            logger.warn({ err: error, key, entryPath }, `Error deleting cache entry for ${key}`);
          }
        }
      }
      
      // Reset metadata
      this.metadata.keys = [];
      this.metadata.size = 0;
      this.metadata.lastUpdated = Date.now();
      
      // Save metadata
      await this.saveMetadata();
      
      // Reset stats
      this.stats.size = 0;
      this.stats.lastUpdated = Date.now();
      
      logger.debug(`Cleared cache ${this.name}`);
    } catch (error) {
      logger.error({ err: error }, `Error clearing cache ${this.name}`);
      throw error;
    }
  }

  /**
   * Removes old entries from the cache.
   * @returns A promise that resolves to the number of entries pruned
   */
  public async prune(): Promise<number> {
    this.ensureInitialized();
    
    const now = Date.now();
    const prunedKeys: string[] = [];
    
    try {
      // Check each entry for expiration
      for (const key of this.metadata.keys) {
        const entryPath = this.getEntryPath(key);
        
        try {
          const entryContent = await fs.readFile(entryPath, 'utf-8');
          const entry = this.options.deserialize<CacheEntry<T>>(entryContent);
          
          if (entry.expiry < now) {
            // Entry is expired, delete it
            await fs.unlink(entryPath);
            prunedKeys.push(key);
          }
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            // Entry doesn't exist, add it to pruned keys
            prunedKeys.push(key);
          } else {
            logger.warn({ err: error, key, entryPath }, `Error checking cache entry for ${key}`);
          }
        }
      }
      
      // Update metadata
      for (const key of prunedKeys) {
        const keyIndex = this.metadata.keys.indexOf(key);
        if (keyIndex !== -1) {
          this.metadata.keys.splice(keyIndex, 1);
        }
      }
      
      this.metadata.size = this.metadata.keys.length;
      this.metadata.lastUpdated = now;
      
      // Save metadata
      await this.saveMetadata();
      
      // Update stats
      this.stats.size = this.metadata.size;
      this.stats.lastUpdated = now;
      
      logger.debug(`Pruned ${prunedKeys.length} entries from cache ${this.name}`);
      return prunedKeys.length;
    } catch (error) {
      logger.error({ err: error }, `Error pruning cache ${this.name}`);
      throw error;
    }
  }

  /**
   * Gets statistics about the cache.
   * @returns The cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Closes the cache, stopping any automatic pruning.
   */
  public close(): void {
    if (this.pruneTimer) {
      clearInterval(this.pruneTimer);
      this.pruneTimer = null;
    }
  }
}
