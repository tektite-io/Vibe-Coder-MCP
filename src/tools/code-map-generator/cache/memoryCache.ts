/**
 * Memory-based LRU cache implementation for the Code-Map Generator tool.
 * This file contains the MemoryCache class for storing and retrieving cached data in memory.
 */

import logger from '../../../logger.js';

/**
 * Options for the MemoryCache.
 */
export interface MemoryCacheOptions<K, V> {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The maximum number of entries to store in the cache.
   * Default: 1000
   */
  maxEntries?: number;

  /**
   * The maximum age of entries in milliseconds.
   * Default: 1 hour
   */
  maxAge?: number;

  /**
   * A function to calculate the size of a value.
   * Default: () => 1
   */
  sizeCalculator?: (value: V) => number;

  /**
   * The maximum size of the cache in arbitrary units.
   * Default: 100000
   */
  maxSize?: number;

  /**
   * A function to dispose of a value when it is evicted from the cache.
   */
  dispose?: (key: K, value: V) => void;
}

/**
 * A cache entry with metadata.
 */
interface CacheEntry<K, V> {
  /**
   * The key for the cache entry.
   */
  key: K;

  /**
   * The value stored in the cache.
   */
  value: V;

  /**
   * The timestamp when the entry was created or last updated.
   */
  timestamp: number;

  /**
   * The expiration timestamp for the entry.
   */
  expiry: number;

  /**
   * The size of the entry in arbitrary units.
   */
  size: number;

  /**
   * The previous entry in the LRU list.
   */
  prev: CacheEntry<K, V> | null;

  /**
   * The next entry in the LRU list.
   */
  next: CacheEntry<K, V> | null;
}

/**
 * Statistics for the cache.
 */
export interface MemoryCacheStats {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The number of entries in the cache.
   */
  size: number;

  /**
   * The total size of the cache in arbitrary units.
   */
  totalSize: number;

  /**
   * The maximum size of the cache in arbitrary units.
   */
  maxSize: number;

  /**
   * The number of hits (successful gets).
   */
  hits: number;

  /**
   * The number of misses (unsuccessful gets).
   */
  misses: number;

  /**
   * The hit ratio (hits / (hits + misses)).
   */
  hitRatio: number;

  /**
   * The number of evictions.
   */
  evictions: number;
}

/**
 * A memory-based LRU cache implementation.
 */
export class MemoryCache<K, V> {
  private name: string;
  private map: Map<K, CacheEntry<K, V>> = new Map();
  private head: CacheEntry<K, V> | null = null;
  private tail: CacheEntry<K, V> | null = null;
  private size: number = 0;
  private totalSize: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private options: Required<MemoryCacheOptions<K, V>>;

  /**
   * Default options for the MemoryCache.
   */
  private static readonly DEFAULT_OPTIONS: Omit<Required<MemoryCacheOptions<any, any>>, 'name' | 'dispose'> = {
    maxEntries: 1000,
    maxAge: 60 * 60 * 1000, // 1 hour
    sizeCalculator: () => 1,
    maxSize: 100000
  };

  /**
   * Creates a new MemoryCache instance.
   * @param options The cache options
   */
  constructor(options: MemoryCacheOptions<K, V>) {
    this.name = options.name;

    // Apply default options
    this.options = {
      ...MemoryCache.DEFAULT_OPTIONS,
      name: options.name,
      maxEntries: options.maxEntries ?? MemoryCache.DEFAULT_OPTIONS.maxEntries,
      maxAge: options.maxAge ?? MemoryCache.DEFAULT_OPTIONS.maxAge,
      sizeCalculator: options.sizeCalculator ?? MemoryCache.DEFAULT_OPTIONS.sizeCalculator,
      maxSize: options.maxSize ?? MemoryCache.DEFAULT_OPTIONS.maxSize,
      dispose: options.dispose ?? ((key, value) => {})
    };

    logger.debug(`Created memory cache "${this.name}" with max entries: ${this.options.maxEntries}, max size: ${this.options.maxSize}`);
  }

  /**
   * Gets a value from the cache.
   * @param key The cache key
   * @returns The cached value, or undefined if not found
   */
  public get(key: K): V | undefined {
    const entry = this.map.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check if the entry is expired
    if (entry.expiry < Date.now()) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Move the entry to the front of the LRU list
    this.moveToFront(entry);

    this.hits++;
    return entry.value;
  }

  /**
   * Sets a value in the cache.
   * @param key The cache key
   * @param value The value to cache
   * @param ttl Optional TTL in milliseconds (overrides the default maxAge)
   */
  public set(key: K, value: V, ttl?: number): void {
    // Check if the key already exists
    const existingEntry = this.map.get(key);
    if (existingEntry) {
      // Update the existing entry
      this.totalSize -= existingEntry.size;
      existingEntry.value = value;
      existingEntry.timestamp = Date.now();
      existingEntry.expiry = Date.now() + (ttl ?? this.options.maxAge);
      existingEntry.size = this.options.sizeCalculator(value);
      this.totalSize += existingEntry.size;

      // Move the entry to the front of the LRU list
      this.moveToFront(existingEntry);
    } else {
      // Create a new entry
      const now = Date.now();
      const entry: CacheEntry<K, V> = {
        key,
        value,
        timestamp: now,
        expiry: now + (ttl ?? this.options.maxAge),
        size: this.options.sizeCalculator(value),
        prev: null,
        next: null
      };

      // Add the entry to the map
      this.map.set(key, entry);

      // Add the entry to the front of the LRU list
      this.addToFront(entry);

      // Update size
      this.size++;
      this.totalSize += entry.size;
    }

    // Prune if necessary
    this.prune();
  }

  /**
   * Checks if a key exists in the cache.
   * @param key The cache key
   * @returns True if the key exists and is not expired, false otherwise
   */
  public has(key: K): boolean {
    const entry = this.map.get(key);

    if (!entry) {
      return false;
    }

    // Check if the entry is expired
    if (entry.expiry < Date.now()) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Deletes a key from the cache.
   * @param key The cache key
   * @returns True if the key was deleted, false otherwise
   */
  public delete(key: K): boolean {
    const entry = this.map.get(key);

    if (!entry) {
      return false;
    }

    // Remove the entry from the map
    this.map.delete(key);

    // Remove the entry from the LRU list
    this.removeFromList(entry);

    // Update size
    this.size--;
    this.totalSize -= entry.size;

    // Dispose of the value
    this.options.dispose(key, entry.value);

    return true;
  }

  /**
   * Clears the entire cache.
   */
  public clear(): void {
    // Dispose of all values
    for (const [key, entry] of this.map.entries()) {
      this.options.dispose(key, entry.value);
    }

    // Reset the cache
    this.map.clear();
    this.head = null;
    this.tail = null;
    this.size = 0;
    this.totalSize = 0;

    logger.debug(`Cleared memory cache "${this.name}"`);
  }

  /**
   * Prunes the cache to stay within size limits.
   */
  private prune(): void {
    // Prune by max entries
    while (this.size > this.options.maxEntries) {
      this.evictLRU();
    }

    // Prune by max size
    while (this.totalSize > this.options.maxSize && this.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * Evicts the least recently used entry.
   */
  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    const key = this.tail.key;
    this.delete(key);
    this.evictions++;

    logger.debug(`Evicted entry with key ${String(key)} from memory cache "${this.name}"`);
  }

  /**
   * Adds an entry to the front of the LRU list.
   * @param entry The entry to add
   */
  private addToFront(entry: CacheEntry<K, V>): void {
    if (!this.head) {
      // Empty list
      this.head = entry;
      this.tail = entry;
    } else {
      // Non-empty list
      entry.next = this.head;
      this.head.prev = entry;
      this.head = entry;
    }
  }

  /**
   * Moves an entry to the front of the LRU list.
   * @param entry The entry to move
   */
  private moveToFront(entry: CacheEntry<K, V>): void {
    if (entry === this.head) {
      // Already at the front
      return;
    }

    // Remove the entry from its current position
    this.removeFromList(entry);

    // Add the entry to the front
    this.addToFront(entry);
  }

  /**
   * Removes an entry from the LRU list.
   * @param entry The entry to remove
   */
  private removeFromList(entry: CacheEntry<K, V>): void {
    if (entry === this.head) {
      // Head of the list
      this.head = entry.next;
    } else if (entry.prev) {
      // Middle of the list
      entry.prev.next = entry.next;
    }

    if (entry === this.tail) {
      // Tail of the list
      this.tail = entry.prev;
    } else if (entry.next) {
      // Middle of the list
      entry.next.prev = entry.prev;
    }

    // Clear references
    entry.prev = null;
    entry.next = null;
  }

  /**
   * Gets statistics about the cache.
   * @returns The cache statistics
   */
  public getStats(): MemoryCacheStats {
    return {
      name: this.name,
      size: this.size,
      totalSize: this.totalSize,
      maxSize: this.options.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRatio: this.hits / (this.hits + this.misses) || 0,
      evictions: this.evictions
    };
  }

  /**
   * Gets all entries in the cache.
   * This method returns a Map of all non-expired entries in the cache.
   * Note: This can be an expensive operation for large caches.
   *
   * @returns A Map of all non-expired entries in the cache
   */
  public getAll(): Map<K, V> {
    const result = new Map<K, V>();
    const now = Date.now();

    // Iterate through all entries in the map
    for (const [key, entry] of this.map.entries()) {
      // Skip expired entries
      if (entry.expiry < now) {
        // Delete expired entries as we go
        this.delete(key);
        continue;
      }

      // Add the entry to the result map
      result.set(key, entry.value);
    }

    return result;
  }
}
