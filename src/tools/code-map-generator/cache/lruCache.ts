/**
 * LRU Cache implementation for the Code-Map Generator tool.
 * This file contains a simplified LRU cache implementation for in-memory caching.
 */

import logger from '../../../logger.js';

/**
 * Interface for LRU cache options.
 */
export interface LRUCacheOptions<K, V> {
  /**
   * The name of the cache.
   */
  name: string;

  /**
   * The maximum number of entries allowed in the cache.
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
   * The maximum total size of the cache.
   * Default: 100000
   */
  maxSize?: number;

  /**
   * A function to dispose of a value when it is removed from the cache.
   * Default: () => {}
   */
  dispose?: (key: K, value: V) => void;
}

/**
 * Interface for a cache entry.
 */
interface CacheEntry<K, V> {
  /**
   * The cache key.
   */
  key: K;

  /**
   * The cached value.
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
   * The size of the entry.
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
 * A memory-based LRU cache implementation.
 */
export class LRUCache<K, V> {
  private name: string;
  private map: Map<K, CacheEntry<K, V>> = new Map();
  private head: CacheEntry<K, V> | null = null;
  private tail: CacheEntry<K, V> | null = null;
  private size: number = 0;
  private totalSize: number = 0;
  private hits: number = 0;
  private misses: number = 0;
  private evictions: number = 0;
  private options: Required<LRUCacheOptions<K, V>>;

  /**
   * Default options for the LRUCache.
   */
  private static readonly DEFAULT_OPTIONS: Omit<Required<LRUCacheOptions<unknown, unknown>>, 'name' | 'dispose'> = {
    maxEntries: 1000,
    maxAge: 60 * 60 * 1000, // 1 hour
    sizeCalculator: () => 1,
    maxSize: 100000
  };

  /**
   * Creates a new LRUCache instance.
   * @param options The cache options
   */
  constructor(options: LRUCacheOptions<K, V>) {
    this.name = options.name;

    // Apply default options
    this.options = {
      ...LRUCache.DEFAULT_OPTIONS,
      name: options.name,
      maxEntries: options.maxEntries ?? LRUCache.DEFAULT_OPTIONS.maxEntries,
      maxAge: options.maxAge ?? LRUCache.DEFAULT_OPTIONS.maxAge,
      sizeCalculator: options.sizeCalculator ?? LRUCache.DEFAULT_OPTIONS.sizeCalculator,
      maxSize: options.maxSize ?? LRUCache.DEFAULT_OPTIONS.maxSize,
      dispose: options.dispose ?? ((_key, _value) => {})
    };

    logger.debug(`Created LRU cache "${this.name}" with max entries: ${this.options.maxEntries}, max size: ${this.options.maxSize}`);
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
   * @returns True if the key exists, false otherwise
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

    logger.debug(`Cleared LRU cache "${this.name}"`);
  }

  /**
   * Gets the number of entries in the cache.
   * @returns The number of entries
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * Gets the total size of the cache.
   * @returns The total size
   */
  public getTotalSize(): number {
    return this.totalSize;
  }

  /**
   * Gets the maximum number of entries allowed in the cache.
   * @returns The maximum number of entries
   */
  public getMaxEntries(): number {
    return this.options.maxEntries;
  }

  /**
   * Gets cache statistics.
   * @returns The cache statistics
   */
  public getStats(): { size: number; totalSize: number; hits: number; misses: number; evictions: number } {
    return {
      size: this.size,
      totalSize: this.totalSize,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions
    };
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
   * Evicts the least recently used entry from the cache.
   */
  private evictLRU(): void {
    if (!this.tail) {
      return;
    }

    const key = this.tail.key;
    this.delete(key);
    this.evictions++;
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

    // Remove from current position
    this.removeFromList(entry);

    // Add to the front
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
      if (this.head) {
        this.head.prev = null;
      }
    } else if (entry === this.tail) {
      // Tail of the list
      this.tail = entry.prev;
      if (this.tail) {
        this.tail.next = null;
      }
    } else {
      // Middle of the list
      if (entry.prev) {
        entry.prev.next = entry.next;
      }
      if (entry.next) {
        entry.next.prev = entry.prev;
      }
    }

    // Update tail if necessary
    if (entry === this.tail) {
      this.tail = entry.prev;
    }

    // Reset entry links
    entry.prev = null;
    entry.next = null;
  }
}
