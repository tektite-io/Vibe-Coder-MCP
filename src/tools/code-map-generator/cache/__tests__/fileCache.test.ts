/**
 * Tests for the FileCache class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileCache } from '../fileCache.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock fs
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockImplementation(async (path) => {
    if (path.includes('metadata')) {
      return JSON.stringify({
        name: 'test-cache',
        size: 2,
        createdAt: Date.now() - 1000,
        lastUpdated: Date.now() - 500,
        keys: ['key1', 'key2'],
        maxEntries: 100,
        maxAge: 3600000,
        sizeInBytes: 0
      });
    }

    if (path.includes('expired')) {
      return JSON.stringify({
        key: 'expired-key',
        value: 'expired-value',
        timestamp: Date.now() - 2000,
        expiry: Date.now() - 1000
      });
    }

    return JSON.stringify({
      key: 'key1',
      value: 'value1',
      timestamp: Date.now() - 1000,
      expiry: Date.now() + 1000
    });
  }),
  access: vi.fn().mockImplementation(async (path) => {
    if (path.includes('nonexistent') || path.includes('error')) {
      const error = new Error('ENOENT');
      (error as any).code = 'ENOENT';
      throw error;
    }
    return undefined;
  }),
  unlink: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue(['file1.json', 'file2.json']),
  stat: vi.fn().mockResolvedValue({ size: 1024, mtime: new Date() })
}));

// Mock fs constants
vi.mock('fs', () => ({
  constants: {
    R_OK: 4
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('FileCache', () => {
  let tempDir: string;
  let cache: FileCache<any>;

  beforeEach(async () => {
    // Create a temporary directory path for the cache
    tempDir = path.join(os.tmpdir(), `file-cache-test-${Date.now()}`);

    // Create a new cache instance
    cache = new FileCache<any>({
      name: 'test-cache',
      cacheDir: tempDir,
      maxEntries: 100,
      maxAge: 3600000, // 1 hour
      validateOnGet: true,
      pruneOnStartup: true,
      pruneInterval: 60000 // 1 minute
    });

    await cache.init();
  });

  afterEach(() => {
    // Clear mocks
    vi.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize correctly', async () => {
      // Verify the cache directory was created
      expect(fs.mkdir).toHaveBeenCalledWith(tempDir, { recursive: true });

      // Verify the metadata file was read
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('test-cache-metadata.json'),
        'utf-8'
      );
    });

    it('should create new metadata if none exists', async () => {
      // Mock readFile to throw ENOENT
      vi.mocked(fs.readFile).mockRejectedValueOnce({ code: 'ENOENT' } as any);

      // Create a new cache instance
      const newCache = new FileCache<any>({
        name: 'new-cache',
        cacheDir: tempDir
      });

      await newCache.init();

      // Verify metadata was saved
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('new-cache-metadata.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should prune on startup if enabled', async () => {
      // Mock the prune method
      const pruneSpy = vi.spyOn(FileCache.prototype as any, 'prune').mockResolvedValue(undefined);

      // Create a new cache instance with pruneOnStartup enabled
      const pruneCache = new FileCache<any>({
        name: 'prune-cache',
        cacheDir: tempDir,
        pruneOnStartup: true
      });

      await pruneCache.init();

      // Verify prune was called
      expect(pruneSpy).toHaveBeenCalled();

      // Restore the original method
      pruneSpy.mockRestore();
    });
  });

  describe('Basic Operations', () => {
    it('should get a value from the cache', async () => {
      const value = await cache.get('key1');

      // Verify the value was retrieved
      expect(value).toBe('value1');

      // Verify the file was accessed
      expect(fs.access).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.any(Number)
      );

      // Verify the file was read
      expect(fs.readFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        'utf-8'
      );
    });

    it('should return undefined for nonexistent keys', async () => {
      const value = await cache.get('nonexistent');

      // Verify undefined was returned
      expect(value).toBeUndefined();
    });

    it('should set a value in the cache', async () => {
      await cache.set('key3', 'value3');

      // Verify the file was written
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.stringContaining('value3'),
        'utf-8'
      );

      // Verify metadata was updated
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should check if a key exists', async () => {
      const exists = await cache.has('key1');

      // Verify the key exists
      expect(exists).toBe(true);

      // Verify the file was accessed
      expect(fs.access).toHaveBeenCalledWith(
        expect.stringContaining('.json'),
        expect.any(Number)
      );
    });

    it('should return false for nonexistent keys', async () => {
      const exists = await cache.has('nonexistent');

      // Verify the key doesn't exist
      expect(exists).toBe(false);
    });

    it('should delete a key from the cache', async () => {
      const deleted = await cache.delete('key1');

      // Verify the key was deleted
      expect(deleted).toBe(true);

      // Verify the file was deleted
      expect(fs.unlink).toHaveBeenCalledWith(
        expect.stringContaining('.json')
      );

      // Verify metadata was updated
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.any(String),
        'utf-8'
      );
    });

    it('should clear the entire cache', async () => {
      await cache.clear();

      // Verify files were deleted
      expect(fs.unlink).toHaveBeenCalled();

      // Verify metadata was updated
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('metadata.json'),
        expect.stringContaining('"keys":[]'),
        'utf-8'
      );
    });
  });

  describe('Cache Validation and Pruning', () => {
    it('should not return expired entries', async () => {
      // Mock readFile to return an expired entry
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        key: 'expired-key',
        value: 'expired-value',
        timestamp: Date.now() - 2000,
        expiry: Date.now() - 1000
      }));

      const value = await cache.get('expired-key');

      // Verify undefined was returned
      expect(value).toBeUndefined();

      // Verify the file was deleted
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should prune expired entries', async () => {
      // Mock the private prune method to be accessible for testing
      const pruneSpy = vi.spyOn(cache as any, 'prune');

      // Call prune through a public method that triggers it
      await cache.set('key4', 'value4');

      // Verify prune was called
      expect(pruneSpy).toHaveBeenCalled();

      // Restore the original method
      pruneSpy.mockRestore();
    });

    it('should prune LRU entries when maxEntries is exceeded', async () => {
      // Create a cache with a small maxEntries
      const smallCache = new FileCache<any>({
        name: 'small-cache',
        cacheDir: tempDir,
        maxEntries: 2
      });

      await smallCache.init();

      // Mock the metadata to have more entries than maxEntries
      vi.mocked(fs.readFile).mockResolvedValueOnce(JSON.stringify({
        name: 'small-cache',
        size: 3,
        createdAt: Date.now() - 1000,
        lastUpdated: Date.now() - 500,
        keys: ['key1', 'key2', 'key3'],
        maxEntries: 2,
        maxAge: 3600000,
        sizeInBytes: 0
      }));

      // Set a new value to trigger pruning
      await smallCache.set('key4', 'value4');

      // Verify files were deleted
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should get cache statistics', () => {
      const stats = cache.getStats();

      // Verify stats were returned
      expect(stats).toBeDefined();
      expect(stats.name).toBe('test-cache');
      expect(stats.size).toBeGreaterThanOrEqual(0);
      expect(stats.hits).toBeGreaterThanOrEqual(0);
      expect(stats.misses).toBeGreaterThanOrEqual(0);
    });

    it('should track hit/miss ratio', async () => {
      // Get a value that exists
      await cache.get('key1');

      // Get a value that doesn't exist
      await cache.get('nonexistent');

      // Get stats
      const stats = cache.getStats();

      // Verify hit/miss ratio
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRatio).toBe(0.5);
    });
  });

  describe('Serialization and Deserialization', () => {
    it('should use custom serializer and deserializer', async () => {
      // Create a cache with custom serializer/deserializer
      const customCache = new FileCache<any>({
        name: 'custom-cache',
        cacheDir: tempDir,
        serialize: (data) => JSON.stringify(data, null, 2),
        deserialize: (data) => JSON.parse(data)
      });

      await customCache.init();

      // Set a value
      await customCache.set('custom-key', { foo: 'bar' });

      // Verify the serializer was used
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('  "foo": "bar"'),
        'utf-8'
      );
    });
  });
});
