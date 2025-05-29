/**
 * Cache Manager for File Search Service
 *
 * Provides intelligent caching with TTL, LRU eviction, and memory management.
 */

import logger from '../../logger.js';
import { CacheEntry, CacheStats, FileSearchOptions, FileSearchResult } from './search-strategies.js';

/**
 * Cache configuration
 */
interface CacheConfig {
  /** Maximum number of entries to cache */
  maxEntries: number;
  /** Default TTL in milliseconds */
  defaultTtl: number;
  /** Maximum memory usage in bytes */
  maxMemoryUsage: number;
  /** Enable cache statistics */
  enableStats: boolean;
}

/**
 * Cache Manager implementation with LRU eviction and TTL
 */
export class CacheManager {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private stats: CacheStats;
  private config: CacheConfig;
  private accessCounter = 0;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = {
      maxEntries: config.maxEntries || 1000,
      defaultTtl: config.defaultTtl || 5 * 60 * 1000, // 5 minutes
      maxMemoryUsage: config.maxMemoryUsage || 50 * 1024 * 1024, // 50MB
      enableStats: config.enableStats !== false
    };

    this.stats = {
      totalEntries: 0,
      hitRate: 0,
      memoryUsage: 0,
      evictions: 0,
      avgQueryTime: 0
    };

    logger.debug({ config: this.config }, 'Cache manager initialized');
  }

  /**
   * Generate cache key from query and options
   */
  private generateKey(query: string, options: FileSearchOptions): string {
    const keyData = {
      query,
      strategy: options.searchStrategy || 'fuzzy',
      fileTypes: options.fileTypes?.sort(),
      maxResults: options.maxResults,
      caseSensitive: options.caseSensitive,
      minScore: options.minScore,
      excludeDirs: options.excludeDirs?.sort()
    };

    return JSON.stringify(keyData);
  }

  /**
   * Get cached results if available and not expired
   */
  get(query: string, options: FileSearchOptions): FileSearchResult[] | null {
    if (!options.cacheResults) return null;

    const key = this.generateKey(query, options);
    const entry = this.cache.get(key);

    if (!entry) {
      logger.debug({ query }, 'Cache miss');
      return null;
    }

    // Check if entry has expired
    const now = Date.now();
    if (now - entry.timestamp.getTime() > entry.ttl) {
      logger.debug({ query }, 'Cache entry expired');
      this.cache.delete(key);
      this.accessOrder.delete(key);
      this.updateStats();
      return null;
    }

    // Update access order for LRU
    entry.hitCount++;
    this.accessOrder.set(key, ++this.accessCounter);

    // Update stats after hit
    this.updateStats();

    logger.debug({ query, hitCount: entry.hitCount }, 'Cache hit');
    return entry.results;
  }

  /**
   * Store results in cache
   */
  set(query: string, options: FileSearchOptions, results: FileSearchResult[]): void {
    if (!options.cacheResults) return;

    const key = this.generateKey(query, options);
    const ttl = this.config.defaultTtl;

    const entry: CacheEntry = {
      query,
      options: { ...options },
      results: [...results], // Deep copy to prevent mutations
      timestamp: new Date(),
      ttl,
      hitCount: 0
    };

    // Check if we need to evict entries
    this.evictIfNecessary();

    this.cache.set(key, entry);
    this.accessOrder.set(key, ++this.accessCounter);

    this.updateStats();
    logger.debug({ query, resultsCount: results.length }, 'Results cached');
  }

  /**
   * Clear cache for specific project path or all entries
   */
  clear(projectPath?: string): void {
    if (projectPath) {
      // Clear entries related to specific project
      const keysToDelete: string[] = [];

      for (const [key, entry] of this.cache.entries()) {
        if (entry.results.some(result => result.filePath.startsWith(projectPath))) {
          keysToDelete.push(key);
        }
      }

      keysToDelete.forEach(key => {
        this.cache.delete(key);
        this.accessOrder.delete(key);
      });

      logger.info({ projectPath, clearedEntries: keysToDelete.length }, 'Cache cleared for project');
    } else {
      // Clear all entries
      const totalEntries = this.cache.size;
      this.cache.clear();
      this.accessOrder.clear();
      this.accessCounter = 0;

      logger.info({ clearedEntries: totalEntries }, 'Cache cleared completely');
    }

    this.updateStats();
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Evict entries if cache limits are exceeded
   */
  private evictIfNecessary(): void {
    // Check entry count limit
    if (this.cache.size >= this.config.maxEntries) {
      this.evictLRU();
    }

    // Check memory usage limit
    const memoryUsage = this.calculateMemoryUsage();
    if (memoryUsage > this.config.maxMemoryUsage) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, accessTime] of this.accessOrder.entries()) {
      if (accessTime < oldestAccess) {
        oldestAccess = accessTime;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessOrder.delete(oldestKey);
      this.stats.evictions++;

      logger.debug({ evictedKey: oldestKey }, 'Evicted LRU cache entry');
    }
  }

  /**
   * Calculate approximate memory usage
   */
  private calculateMemoryUsage(): number {
    let totalSize = 0;

    for (const entry of this.cache.values()) {
      // Rough estimation of memory usage
      totalSize += JSON.stringify(entry).length * 2; // UTF-16 encoding
    }

    return totalSize;
  }

  /**
   * Update cache statistics
   */
  private updateStats(): void {
    if (!this.config.enableStats) return;

    this.stats.totalEntries = this.cache.size;
    this.stats.memoryUsage = this.calculateMemoryUsage();

    // Calculate hit rate
    let totalHits = 0;
    let totalAccesses = 0;

    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
      totalAccesses += entry.hitCount + 1; // +1 for initial cache set
    }

    this.stats.hitRate = totalAccesses > 0 ? totalHits / totalAccesses : 0;
  }
}
