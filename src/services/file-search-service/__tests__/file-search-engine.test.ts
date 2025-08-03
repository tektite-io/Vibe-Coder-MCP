import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { FileSearchService } from '../file-search-engine.js';
import { FileSearchOptions, PriorityQueue } from '../search-strategies.js';

// Mock fs module
vi.mock('fs/promises');
const mockFs = vi.mocked(fs);

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Create mock filesystem security instance
const mockFilesystemSecurity = {
  checkPathSecurity: vi.fn().mockResolvedValue({ allowed: true }),
  statSecure: vi.fn().mockImplementation(() => Promise.resolve({
    isDirectory: () => true,
    isFile: () => false,
    size: 1024,
    mtime: new Date('2025-01-01T00:00:00.000Z') // Fixed date for consistent tests
  })),
  readDirSecure: vi.fn().mockResolvedValue([
    { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
    { name: 'file2.js', isDirectory: () => false, isFile: () => true },
    { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
    { name: 'subdir', isDirectory: () => true, isFile: () => false }
  ])
};

// Mock FilesystemSecurity
vi.mock('../../tools/vibe-task-manager/security/filesystem-security.js', () => ({
  FilesystemSecurity: {
    getInstance: vi.fn(() => mockFilesystemSecurity)
  }
}));

describe('FileSearchService', () => {
  let fileSearchService: FileSearchService;
  // Use a path within the allowed directory for testing
  const testProjectPath = process.cwd() + '/test/project';

  beforeEach(() => {
    fileSearchService = FileSearchService.getInstance();
    vi.clearAllMocks();

    // Reset filesystem security mocks
    mockFilesystemSecurity.checkPathSecurity.mockResolvedValue({ allowed: true });
    mockFilesystemSecurity.statSecure.mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
      size: 1024,
      mtime: new Date('2025-01-01T00:00:00.000Z')
    });
    mockFilesystemSecurity.readDirSecure.mockResolvedValue([
      { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
      { name: 'file2.js', isDirectory: () => false, isFile: () => true },
      { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
      { name: 'subdir', isDirectory: () => true, isFile: () => false }
    ]);
  });

  afterEach(async () => {
    await fileSearchService.clearCache();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = FileSearchService.getInstance();
      const instance2 = FileSearchService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('searchFiles', () => {
    beforeEach(() => {
      // Mock fs.stat for project path validation
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 0,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      } as import('fs').Stats);

      // Mock fs.readdir for directory scanning
      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true },
        { name: 'file2.js', isDirectory: () => false, isFile: () => true },
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true },
        { name: 'subdir', isDirectory: () => true, isFile: () => false }
      ] as import('fs').Dirent[]);
    });

    it('should perform fuzzy search by default', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(mockFs.stat).toHaveBeenCalledWith(testProjectPath);
    });

    it('should filter by file types', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        fileTypes: ['.ts'],
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      // Results should only include .ts files
      results.forEach(result => {
        expect(path.extname(result.filePath)).toBe('.ts');
      });
    });

    it('should limit results when maxResults is specified', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        maxResults: 1,
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should handle invalid project path', async () => {
      mockFs.stat.mockRejectedValue(new Error('Path not found'));

      await expect(
        fileSearchService.searchFiles('/invalid/path', { pattern: 'test' })
      ).rejects.toThrow('Invalid or inaccessible project path');
    });
  });

  describe('search strategies', () => {
    beforeEach(() => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      } as import('fs').Stats);

      mockFs.readdir.mockResolvedValue([
        { name: 'component.tsx', isDirectory: () => false, isFile: () => true },
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
        { name: 'test.spec.ts', isDirectory: () => false, isFile: () => true }
      ] as import('fs').Dirent[]);
    });

    it('should perform exact search', async () => {
      const options: FileSearchOptions = {
        pattern: 'component',
        searchStrategy: 'exact',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('exact');
      });
    });

    it('should perform glob search', async () => {
      const options: FileSearchOptions = {
        glob: '*.ts',
        searchStrategy: 'glob',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('glob');
      });
    });

    it('should perform regex search', async () => {
      const options: FileSearchOptions = {
        pattern: '.*\\.ts$',
        searchStrategy: 'regex',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('name');
      });
    });

    it('should perform content search', async () => {
      // Mock file reading for content search
      mockFs.readFile.mockResolvedValue('function test() { return "hello"; }');

      const options: FileSearchOptions = {
        content: 'function',
        searchStrategy: 'content',
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      results.forEach(result => {
        expect(result.matchType).toBe('content');
        expect(result.lineNumbers).toBeDefined();
      });
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      // Clear all mock call counts
      vi.clearAllMocks();
      
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      } as import('fs').Stats);

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true }
      ] as import('fs').Dirent[]);
      
      // Reset filesystem security mocks
      mockFilesystemSecurity.checkPathSecurity.mockResolvedValue({ allowed: true });
      mockFilesystemSecurity.statSecure.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      });
      mockFilesystemSecurity.readDirSecure.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true }
      ]);
    });

    it('should cache results when enabled', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: true
      };

      // First search
      const results1 = await fileSearchService.searchFiles(testProjectPath, options);

      // Second search should use cache
      const results2 = await fileSearchService.searchFiles(testProjectPath, options);

      // Compare results without metadata.lastModified to avoid timing issues
      const compareResults = (results: FileSearchResult[]) => results.map(r => ({
        ...r,
        metadata: r.metadata ? { ...r.metadata, lastModified: undefined } : undefined
      }));
      
      expect(compareResults(results1)).toEqual(compareResults(results2));

      // readDirSecure should only be called once (for first search)
      expect(mockFilesystemSecurity.readDirSecure).toHaveBeenCalledTimes(1);
    });

    it('should not cache when disabled', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: false
      };

      // First search
      await fileSearchService.searchFiles(testProjectPath, options);

      // Second search
      await fileSearchService.searchFiles(testProjectPath, options);

      // readDirSecure should be called twice (no caching)
      expect(mockFilesystemSecurity.readDirSecure).toHaveBeenCalledTimes(2);
    });

    it('should clear cache', async () => {
      const options: FileSearchOptions = {
        pattern: 'file',
        cacheResults: true
      };

      // Search and cache
      await fileSearchService.searchFiles(testProjectPath, options);

      // Clear cache
      await fileSearchService.clearCache();

      // Search again should not use cache
      await fileSearchService.searchFiles(testProjectPath, options);

      // readDirSecure should be called twice (once before clear, once after)
      expect(mockFilesystemSecurity.readDirSecure).toHaveBeenCalledTimes(2);
    });
  });

  describe('performance metrics', () => {
    it('should provide performance metrics', async () => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      } as import('fs').Stats);

      mockFs.readdir.mockResolvedValue([
        { name: 'file1.ts', isDirectory: () => false, isFile: () => true }
      ] as import('fs').Dirent[]);

      await fileSearchService.searchFiles(testProjectPath, {
        pattern: 'file',
        cacheResults: false
      });

      const metrics = fileSearchService.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics.searchTime).toBeGreaterThanOrEqual(0);
      expect(metrics.filesScanned).toBeGreaterThanOrEqual(0);
      expect(metrics.resultsFound).toBeGreaterThanOrEqual(0);
      expect(metrics.strategy).toBe('fuzzy');
    });

    it('should provide cache statistics', () => {
      const stats = fileSearchService.getCacheStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalEntries).toBe('number');
      expect(typeof stats.hitRate).toBe('number');
      expect(typeof stats.memoryUsage).toBe('number');
    });
  });

  describe('streaming implementation', () => {
    beforeEach(() => {
      // Clear all mock call counts
      vi.clearAllMocks();
      
      // Reset filesystem security mocks
      mockFilesystemSecurity.checkPathSecurity.mockResolvedValue({ allowed: true });
      mockFilesystemSecurity.statSecure.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      });
    });
    
    it('should handle large directories without file limit', async () => {
      // Create mock entries for a large directory (more than old 500 limit)
      const largeEntries = Array.from({ length: 1000 }, (_, i) => ({
        name: `file${i}.ts`,
        isDirectory: () => false,
        isFile: () => true
      }));

      mockFilesystemSecurity.readDirSecure.mockResolvedValue(largeEntries);
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date()
      } as import('fs').Stats);

      const options: FileSearchOptions = {
        pattern: 'file',
        searchStrategy: 'fuzzy',
        cacheResults: false,
        maxResults: 50
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      // Should process all files and return maxResults
      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(50);
      
      // Check that metrics show all files were scanned
      const metrics = fileSearchService.getPerformanceMetrics();
      expect(metrics.filesScanned).toBeGreaterThan(500); // More than old limit
    });

    it('should stream files efficiently without loading all in memory', async () => {
      // Create nested directory structure
      const rootEntries = [
        { name: 'dir1', isDirectory: () => true, isFile: () => false },
        { name: 'dir2', isDirectory: () => true, isFile: () => false },
        { name: 'file0.ts', isDirectory: () => false, isFile: () => true }
      ];

      const subEntries = Array.from({ length: 100 }, (_, i) => ({
        name: `file${i}.ts`,
        isDirectory: () => false,
        isFile: () => true
      }));

      // Mock different responses for different directories
      mockFilesystemSecurity.readDirSecure
        .mockResolvedValueOnce(rootEntries)
        .mockResolvedValue(subEntries);

      const options: FileSearchOptions = {
        pattern: 'file5', // Will match file5, file50-59, etc.
        searchStrategy: 'fuzzy',
        cacheResults: false,
        maxResults: 10
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(10);
      
      // Verify results are sorted by score
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it('should respect exclude directories during streaming', async () => {
      const entries = [
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: 'src', isDirectory: () => true, isFile: () => false },
        { name: 'README.md', isDirectory: () => false, isFile: () => true }
      ];

      const srcEntries = [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true }
      ];

      mockFilesystemSecurity.readDirSecure
        .mockResolvedValueOnce(entries)
        .mockResolvedValueOnce(srcEntries); // Only called for src, not node_modules

      const options: FileSearchOptions = {
        pattern: 'index',
        excludeDirs: ['node_modules'],
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      // Should find index.ts but not explore node_modules
      expect(results.some(r => r.filePath.includes('index.ts'))).toBe(true);
      expect(results.every(r => !r.filePath.includes('node_modules'))).toBe(true);
      
      // Verify node_modules was not explored
      expect(mockFilesystemSecurity.readDirSecure).toHaveBeenCalledTimes(2); // root + src only
    });
  });

  describe('priority queue', () => {
    it('should maintain top N results by score', () => {
      const queue = new PriorityQueue<{ score: number; name: string }>(
        (a, b) => b.score - a.score, // Higher scores first
        3 // Keep top 3
      );

      // Add items with different scores
      queue.add({ score: 0.5, name: 'item1' });
      queue.add({ score: 0.8, name: 'item2' });
      queue.add({ score: 0.3, name: 'item3' });
      queue.add({ score: 0.9, name: 'item4' });
      queue.add({ score: 0.6, name: 'item5' });

      const results = queue.toArray();
      
      // Should have exactly 3 items
      expect(results.length).toBe(3);
      
      // Should be the top 3 scores
      expect(results[0].score).toBe(0.9);
      expect(results[1].score).toBe(0.8);
      expect(results[2].score).toBe(0.6);
    });

    it('should handle empty queue correctly', () => {
      const queue = new PriorityQueue<{ value: number }>(
        (a, b) => b.value - a.value,
        10
      );

      expect(queue.size).toBe(0);
      expect(queue.isFull).toBe(false);
      expect(queue.getMinScore(item => item.value)).toBeUndefined();
      expect(queue.toArray()).toEqual([]);
    });

    it('should provide correct min score for filtering', () => {
      const queue = new PriorityQueue<{ score: number }>(
        (a, b) => b.score - a.score,
        2
      );

      // Add items to fill queue
      queue.add({ score: 0.8 });
      queue.add({ score: 0.6 });

      // Queue is full, min score should be 0.6
      expect(queue.getMinScore(item => item.score)).toBe(0.6);
      expect(queue.isFull).toBe(true);

      // Add higher score item
      queue.add({ score: 0.9 });

      // Min score should now be 0.8 (0.6 was removed)
      expect(queue.getMinScore(item => item.score)).toBe(0.8);
      expect(queue.size).toBe(2);
    });
  });

  describe('backward compatibility', () => {
    beforeEach(() => {
      mockFs.stat.mockResolvedValue({
        isDirectory: () => true,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      } as import('fs').Stats);

      mockFilesystemSecurity.readDirSecure.mockResolvedValue([
        { name: 'app.ts', isDirectory: () => false, isFile: () => true },
        { name: 'config.json', isDirectory: () => false, isFile: () => true },
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true }
      ]);
    });

    it('should maintain same API surface', async () => {
      // All existing search methods should still work
      const testCases: FileSearchOptions[] = [
        { pattern: 'app', searchStrategy: 'fuzzy' },
        { pattern: 'config', searchStrategy: 'exact' },
        { glob: '*.ts', searchStrategy: 'glob' },
        { pattern: '.*\\.json$', searchStrategy: 'regex' }
      ];

      for (const options of testCases) {
        const results = await fileSearchService.searchFiles(testProjectPath, {
          ...options,
          cacheResults: false
        });

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);
        results.forEach(result => {
          expect(result).toHaveProperty('filePath');
          expect(result).toHaveProperty('score');
          expect(result).toHaveProperty('matchType');
          expect(result).toHaveProperty('relevanceFactors');
        });
      }
    });

    it('should still support all options', async () => {
      const options: FileSearchOptions = {
        pattern: 'test',
        fileTypes: ['.ts'],
        maxResults: 10,
        includeContent: false,
        searchStrategy: 'fuzzy',
        cacheResults: true,
        excludeDirs: ['node_modules'],
        caseSensitive: false,
        minScore: 0.3
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      // All options should be respected without errors
    });
  });

  describe('memory efficiency', () => {
    beforeEach(() => {
      // Clear all mock call counts
      vi.clearAllMocks();
      
      // Reset filesystem security mocks
      mockFilesystemSecurity.checkPathSecurity.mockResolvedValue({ allowed: true });
      mockFilesystemSecurity.statSecure.mockResolvedValue({
        isDirectory: () => true,
        isFile: () => false,
        size: 1024,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      });
    });
    
    it('should handle content search with large files efficiently', async () => {
      // Mock large file content
      const largeContent = 'function test() {\n'.repeat(10000) + '  return true;\n}';
      
      mockFs.readFile.mockResolvedValue(largeContent);
      
      // Mock statSecure for the project directory check
      mockFilesystemSecurity.statSecure.mockResolvedValueOnce({
        isDirectory: () => true,
        isFile: () => false,
        size: 0,
        mtime: new Date('2025-01-01T00:00:00.000Z')
      });
      
      // Mock fs.stat for individual files in content search
      mockFs.stat.mockResolvedValue({
        size: largeContent.length,
        mtime: new Date('2025-01-01T00:00:00.000Z'),
        isDirectory: () => false
      } as import('fs').Stats);

      const options: FileSearchOptions = {
        content: 'function',
        searchStrategy: 'content',
        maxResults: 5,
        cacheResults: false
      };

      const results = await fileSearchService.searchFiles(testProjectPath, options);

      expect(results).toBeDefined();
      expect(results.length).toBeLessThanOrEqual(5);
      
      // Should find multiple matches in the large file
      results.forEach(result => {
        expect(result.lineNumbers).toBeDefined();
        expect(result.lineNumbers!.length).toBeGreaterThan(0);
      });
    });

    it('should skip files exceeding maxFileSize in content search', async () => {
      const entries = [
        { name: 'small.txt', isDirectory: () => false, isFile: () => true },
        { name: 'large.txt', isDirectory: () => false, isFile: () => true }
      ];

      mockFilesystemSecurity.readDirSecure.mockResolvedValue(entries);
      
      // Mock file stats
      mockFs.stat
        .mockResolvedValueOnce({ 
          isDirectory: () => true,
          size: 0,
          mtime: new Date()
        } as import('fs').Stats)
        .mockResolvedValueOnce({ 
          size: 1000, // small file
          mtime: new Date()
        } as import('fs').Stats)
        .mockResolvedValueOnce({ 
          size: 2 * 1024 * 1024, // large file (2MB)
          mtime: new Date()
        } as import('fs').Stats);

      mockFs.readFile.mockResolvedValue('test content');

      const options: FileSearchOptions = {
        content: 'test',
        searchStrategy: 'content',
        maxFileSize: 1024 * 1024, // 1MB limit
        cacheResults: false
      };

      await fileSearchService.searchFiles(testProjectPath, options);

      // Should only read the small file, not the large one
      expect(mockFs.readFile).toHaveBeenCalledTimes(1);
    });
  });
});
