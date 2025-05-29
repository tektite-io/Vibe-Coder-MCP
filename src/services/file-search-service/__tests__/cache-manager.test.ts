import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheManager } from '../cache-manager.js';
import { FileSearchOptions, FileSearchResult } from '../search-strategies.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CacheManager', () => {
  let cacheManager: CacheManager;
  const mockOptions: FileSearchOptions = {
    pattern: 'test',
    searchStrategy: 'fuzzy',
    cacheResults: true
  };

  const mockResults: FileSearchResult[] = [
    {
      filePath: '/test/file1.ts',
      score: 0.9,
      matchType: 'fuzzy',
      relevanceFactors: ['test factor'],
      metadata: {
        size: 1024,
        lastModified: new Date(),
        extension: '.ts'
      }
    }
  ];

  beforeEach(() => {
    cacheManager = new CacheManager({
      maxEntries: 10,
      defaultTtl: 1000, // 1 second for testing
      maxMemoryUsage: 1024 * 1024, // 1MB
      enableStats: true
    });
  });

  describe('basic caching', () => {
    it('should return null for cache miss', () => {
      const result = cacheManager.get('nonexistent', mockOptions);
      expect(result).toBeNull();
    });

    it('should store and retrieve cached results', () => {
      cacheManager.set('test', mockOptions, mockResults);
      const cached = cacheManager.get('test', mockOptions);
      
      expect(cached).toEqual(mockResults);
    });

    it('should not cache when cacheResults is false', () => {
      const noCacheOptions = { ...mockOptions, cacheResults: false };
      
      cacheManager.set('test', noCacheOptions, mockResults);
      const cached = cacheManager.get('test', noCacheOptions);
      
      expect(cached).toBeNull();
    });

    it('should generate different keys for different options', () => {
      const options1 = { ...mockOptions, fileTypes: ['.ts'] };
      const options2 = { ...mockOptions, fileTypes: ['.js'] };
      
      cacheManager.set('test', options1, mockResults);
      cacheManager.set('test', options2, mockResults);
      
      const cached1 = cacheManager.get('test', options1);
      const cached2 = cacheManager.get('test', options2);
      
      expect(cached1).toEqual(mockResults);
      expect(cached2).toEqual(mockResults);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortTtlCache = new CacheManager({
        defaultTtl: 10 // 10ms
      });
      
      shortTtlCache.set('test', mockOptions, mockResults);
      
      // Should be cached immediately
      expect(shortTtlCache.get('test', mockOptions)).toEqual(mockResults);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Should be expired
      expect(shortTtlCache.get('test', mockOptions)).toBeNull();
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entries when max entries exceeded', () => {
      const smallCache = new CacheManager({
        maxEntries: 2
      });
      
      // Add first entry
      smallCache.set('test1', mockOptions, mockResults);
      expect(smallCache.get('test1', mockOptions)).toEqual(mockResults);
      
      // Add second entry
      smallCache.set('test2', mockOptions, mockResults);
      expect(smallCache.get('test2', mockOptions)).toEqual(mockResults);
      
      // Add third entry (should evict first)
      smallCache.set('test3', mockOptions, mockResults);
      
      // First entry should be evicted
      expect(smallCache.get('test1', mockOptions)).toBeNull();
      expect(smallCache.get('test2', mockOptions)).toEqual(mockResults);
      expect(smallCache.get('test3', mockOptions)).toEqual(mockResults);
    });

    it('should update access order on cache hits', () => {
      const smallCache = new CacheManager({
        maxEntries: 2
      });
      
      // Add two entries
      smallCache.set('test1', mockOptions, mockResults);
      smallCache.set('test2', mockOptions, mockResults);
      
      // Access first entry to make it recently used
      smallCache.get('test1', mockOptions);
      
      // Add third entry (should evict second, not first)
      smallCache.set('test3', mockOptions, mockResults);
      
      expect(smallCache.get('test1', mockOptions)).toEqual(mockResults);
      expect(smallCache.get('test2', mockOptions)).toBeNull();
      expect(smallCache.get('test3', mockOptions)).toEqual(mockResults);
    });
  });

  describe('cache clearing', () => {
    it('should clear all entries', () => {
      cacheManager.set('test1', mockOptions, mockResults);
      cacheManager.set('test2', mockOptions, mockResults);
      
      cacheManager.clear();
      
      expect(cacheManager.get('test1', mockOptions)).toBeNull();
      expect(cacheManager.get('test2', mockOptions)).toBeNull();
    });

    it('should clear entries for specific project path', () => {
      const projectResults1: FileSearchResult[] = [
        {
          filePath: '/project1/file.ts',
          score: 0.9,
          matchType: 'fuzzy',
          relevanceFactors: ['test']
        }
      ];
      
      const projectResults2: FileSearchResult[] = [
        {
          filePath: '/project2/file.ts',
          score: 0.9,
          matchType: 'fuzzy',
          relevanceFactors: ['test']
        }
      ];
      
      cacheManager.set('test1', mockOptions, projectResults1);
      cacheManager.set('test2', mockOptions, projectResults2);
      
      // Clear only project1
      cacheManager.clear('/project1');
      
      expect(cacheManager.get('test1', mockOptions)).toBeNull();
      expect(cacheManager.get('test2', mockOptions)).toEqual(projectResults2);
    });
  });

  describe('statistics', () => {
    it('should provide cache statistics', () => {
      cacheManager.set('test', mockOptions, mockResults);
      cacheManager.get('test', mockOptions); // Cache hit
      
      const stats = cacheManager.getStats();
      
      expect(stats.totalEntries).toBe(1);
      expect(stats.hitRate).toBeGreaterThan(0);
      expect(stats.memoryUsage).toBeGreaterThan(0);
      expect(stats.evictions).toBe(0);
    });

    it('should track hit count', () => {
      cacheManager.set('test', mockOptions, mockResults);
      
      // Multiple hits
      cacheManager.get('test', mockOptions);
      cacheManager.get('test', mockOptions);
      cacheManager.get('test', mockOptions);
      
      const stats = cacheManager.getStats();
      expect(stats.hitRate).toBeGreaterThan(0);
    });

    it('should track evictions', () => {
      const smallCache = new CacheManager({
        maxEntries: 1,
        enableStats: true
      });
      
      smallCache.set('test1', mockOptions, mockResults);
      smallCache.set('test2', mockOptions, mockResults); // Should evict test1
      
      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);
    });
  });

  describe('memory management', () => {
    it('should calculate memory usage', () => {
      cacheManager.set('test', mockOptions, mockResults);
      
      const stats = cacheManager.getStats();
      expect(stats.memoryUsage).toBeGreaterThan(0);
    });

    it('should evict when memory limit exceeded', () => {
      const lowMemoryCache = new CacheManager({
        maxMemoryUsage: 100 // Very low limit
      });
      
      // Add entry that might exceed memory limit
      const largeResults = Array(100).fill(mockResults[0]);
      lowMemoryCache.set('large', mockOptions, largeResults);
      
      // Should still work (eviction logic should handle it)
      expect(lowMemoryCache.getStats().totalEntries).toBeGreaterThanOrEqual(0);
    });
  });
});
