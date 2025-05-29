/**
 * Cache manager for the Code-Map Generator tool.
 * This file contains functions for managing multiple cache instances.
 */

import path from 'path';
import logger from '../../../logger.js';
import { FileCache } from './fileCache.js';
import { TieredCache, TieredCacheOptions } from './tieredCache.js';
import { CacheOptions, CacheStats } from './types.js';
import { CodeMapGeneratorConfig } from '../types.js';
import { getCacheDirectory } from '../directoryUtils.js';

// Interface for cache instances with common methods
interface CacheInstance {
  clear(): Promise<void>;
  prune(): Promise<number>;
  getStats(): CacheStats | Promise<CacheStats>;
  close(): void;
}

// Map of cache instances by name
const cacheInstances = new Map<string, CacheInstance>();

/**
 * Creates a cache manager instance.
 * @param config The Code-Map Generator configuration
 * @returns An object with methods for managing caches
 */
export function createCacheManager(config: CodeMapGeneratorConfig) {
  const cacheDir = getCacheDirectory(config);

  /**
   * Gets or creates a file cache instance.
   * @param name The name of the cache
   * @param options Additional cache options
   * @returns A promise that resolves to the cache instance
   */
  async function getFileCache<T>(name: string, options?: Partial<CacheOptions>): Promise<FileCache<T>> {
    // Check if the cache is already created
    if (cacheInstances.has(name)) {
      const cache = cacheInstances.get(name);
      if (cache instanceof FileCache) {
        return cache as FileCache<T>;
      } else {
        throw new Error(`Cache ${name} exists but is not a FileCache`);
      }
    }

    // Create a new cache instance
    const cacheOptions: CacheOptions = {
      name,
      cacheDir: path.join(cacheDir, name),
      maxEntries: options?.maxEntries || config.cache?.maxEntries,
      maxAge: options?.maxAge || config.cache?.maxAge,
      validateOnGet: options?.validateOnGet,
      pruneOnStartup: options?.pruneOnStartup,
      pruneInterval: options?.pruneInterval,
      serialize: options?.serialize,
      deserialize: options?.deserialize,
    };

    const cache = new FileCache<T>(cacheOptions);
    await cache.init();

    // Store the cache instance (cast to CacheInstance interface)
    cacheInstances.set(name, cache as CacheInstance);

    logger.debug(`Created file cache instance: ${name}`);
    return cache;
  }

  /**
   * Gets or creates a tiered cache instance.
   * @param name The name of the cache
   * @param options Additional cache options
   * @returns A promise that resolves to the cache instance
   */
  async function getTieredCache<T>(name: string, options?: Partial<TieredCacheOptions>): Promise<TieredCache<T>> {
    // Check if the cache is already created
    if (cacheInstances.has(name)) {
      const cache = cacheInstances.get(name);
      if (cache instanceof TieredCache) {
        return cache as TieredCache<T>;
      } else {
        throw new Error(`Cache ${name} exists but is not a TieredCache`);
      }
    }

    // Create a new cache instance
    const cacheOptions: TieredCacheOptions = {
      name,
      cacheDir: path.join(cacheDir, name),
      maxEntries: options?.maxEntries || config.cache?.maxEntries,
      maxAge: options?.maxAge || config.cache?.maxAge,
      validateOnGet: options?.validateOnGet,
      pruneOnStartup: options?.pruneOnStartup,
      pruneInterval: options?.pruneInterval,
      serialize: options?.serialize,
      deserialize: options?.deserialize,
      useMemoryCache: options?.useMemoryCache ?? config.cache?.useMemoryCache ?? true,
      memoryMaxEntries: options?.memoryMaxEntries,
      memoryMaxAge: options?.memoryMaxAge,
      memoryThreshold: options?.memoryThreshold,
      memorySizeCalculator: options?.memorySizeCalculator
    };

    const cache = new TieredCache<T>(cacheOptions);
    await cache.init();

    // Store the cache instance (cast to CacheInstance interface)
    cacheInstances.set(name, cache as CacheInstance);

    logger.debug(`Created tiered cache instance: ${name}`);
    return cache;
  }

  /**
   * Gets or creates a cache instance.
   * For backward compatibility, defaults to FileCache.
   * @param name The name of the cache
   * @param options Additional cache options
   * @returns A promise that resolves to the cache instance
   */
  async function getCache<T>(name: string, options?: Partial<CacheOptions>): Promise<FileCache<T>> {
    return getFileCache<T>(name, options);
  }

  /**
   * Clears a specific cache.
   * @param name The name of the cache
   * @returns A promise that resolves when the cache is cleared
   */
  async function clearCache(name: string): Promise<void> {
    const cache = cacheInstances.get(name);
    if (cache) {
      await cache.clear();
      logger.debug(`Cleared cache: ${name}`);
    }
  }

  /**
   * Clears all cache instances.
   * @returns A promise that resolves when all caches are cleared
   */
  async function clearAllCaches(): Promise<void> {
    const clearPromises = Array.from(cacheInstances.entries()).map(async ([name, cache]) => {
      await cache.clear();
      logger.debug(`Cleared cache: ${name}`);
    });

    await Promise.all(clearPromises);
    logger.info(`Cleared all caches (${cacheInstances.size} instances)`);
  }

  /**
   * Prunes a specific cache.
   * @param name The name of the cache
   * @returns A promise that resolves to the number of entries pruned
   */
  async function pruneCache(name: string): Promise<number> {
    const cache = cacheInstances.get(name);
    if (cache) {
      const prunedCount = await cache.prune();
      logger.debug(`Pruned ${prunedCount} entries from cache: ${name}`);
      return prunedCount;
    }
    return 0;
  }

  /**
   * Prunes all cache instances.
   * @returns A promise that resolves to the total number of entries pruned
   */
  async function pruneAllCaches(): Promise<number> {
    let totalPruned = 0;

    const prunePromises = Array.from(cacheInstances.entries()).map(async ([name, cache]) => {
      const prunedCount = await cache.prune();
      logger.debug(`Pruned ${prunedCount} entries from cache: ${name}`);
      return prunedCount;
    });

    const results = await Promise.all(prunePromises);
    totalPruned = results.reduce((total: number, count: number) => total + count, 0);

    logger.info(`Pruned ${totalPruned} entries from all caches (${cacheInstances.size} instances)`);
    return totalPruned;
  }

  /**
   * Gets statistics about a specific cache.
   * @param name The name of the cache
   * @returns The cache statistics, or undefined if the cache doesn't exist
   */
  async function getCacheStats(name: string): Promise<CacheStats | undefined> {
    const cache = cacheInstances.get(name);
    if (cache) {
      const stats = cache.getStats();
      return stats instanceof Promise ? await stats : stats;
    }
    return undefined;
  }

  /**
   * Gets statistics about all cache instances.
   * @returns An object mapping cache names to their statistics
   */
  async function getAllCacheStats(): Promise<Record<string, CacheStats>> {
    const stats: Record<string, CacheStats> = {};

    for (const [name, cache] of cacheInstances.entries()) {
      const cacheStats = cache.getStats();
      stats[name] = cacheStats instanceof Promise ? await cacheStats : cacheStats;
    }

    return stats;
  }

  /**
   * Closes all cache instances.
   */
  function closeAllCaches(): void {
    for (const [name, cache] of cacheInstances.entries()) {
      cache.close();
      logger.debug(`Closed cache: ${name}`);
    }

    cacheInstances.clear();
    logger.info('Closed all cache instances');
  }

  return {
    getCache,
    getFileCache,
    getTieredCache,
    clearCache,
    clearAllCaches,
    pruneCache,
    pruneAllCaches,
    getCacheStats,
    getAllCacheStats,
    closeAllCaches,
  };
}

/**
 * Clears all cache instances.
 * @returns A promise that resolves when all caches are cleared
 */
export async function clearAllCaches(): Promise<void> {
  const clearPromises = Array.from(cacheInstances.entries()).map(async ([name, cache]) => {
    await cache.clear();
    logger.debug(`Cleared cache: ${name}`);
  });

  await Promise.all(clearPromises);
  logger.info(`Cleared all caches (${cacheInstances.size} instances)`);
}

/**
 * Prunes all cache instances.
 * @returns A promise that resolves to the total number of entries pruned
 */
export async function pruneAllCaches(): Promise<number> {
  let totalPruned = 0;

  const prunePromises = Array.from(cacheInstances.entries()).map(async ([name, cache]) => {
    const prunedCount = await cache.prune();
    logger.debug(`Pruned ${prunedCount} entries from cache: ${name}`);
    return prunedCount;
  });

  const results = await Promise.all(prunePromises);
  totalPruned = results.reduce((total: number, count: number) => total + count, 0);

  logger.info(`Pruned ${totalPruned} entries from all caches (${cacheInstances.size} instances)`);
  return totalPruned;
}

/**
 * Gets statistics about all cache instances.
 * @returns An object mapping cache names to their statistics
 */
export async function getCacheStats(): Promise<Record<string, CacheStats>> {
  const stats: Record<string, CacheStats> = {};

  for (const [name, cache] of cacheInstances.entries()) {
    const cacheStats = cache.getStats();
    stats[name] = cacheStats instanceof Promise ? await cacheStats : cacheStats;
  }

  return stats;
}

/**
 * Closes all cache instances.
 */
export function closeAllCaches(): void {
  for (const [name, cache] of cacheInstances.entries()) {
    cache.close();
    logger.debug(`Closed cache: ${name}`);
  }

  cacheInstances.clear();
  logger.info('Closed all cache instances');
}
