/**
 * Unit tests for Codemap Cache Manager
 * Tests intelligent caching functionality for Context Curator
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import { CodemapCacheManager } from '../../../utils/codemap-cache.js';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
    constants: {
      R_OK: 4
    }
  },
  constants: {
    R_OK: 4
  }
}));

// Mock logger
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CodemapCacheManager', () => {
  const mockOutputDir = '/test/output';
  const mockCodemapDir = path.join(mockOutputDir, 'code-map-generator');

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    delete process.env.VIBE_CODER_OUTPUT_DIR;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findRecentCodemap', () => {
    it('should return null when codemap directory does not exist', async () => {
      const mockError = new Error('ENOENT: no such file or directory') as NodeJS.ErrnoException;
      mockError.code = 'ENOENT';
      (fs.access as Mock).mockRejectedValue(mockError);

      const result = await CodemapCacheManager.findRecentCodemap(60, mockOutputDir);

      expect(result).toBeNull();
      expect(fs.access).toHaveBeenCalledWith(mockCodemapDir);
    });

    it('should return null when no codemap files exist', async () => {
      (fs.access as Mock).mockResolvedValue(undefined);
      (fs.readdir as Mock).mockResolvedValue(['other-file.txt', 'not-a-codemap.md']);

      const result = await CodemapCacheManager.findRecentCodemap(60, mockOutputDir);

      expect(result).toBeNull();
      expect(fs.readdir).toHaveBeenCalledWith(mockCodemapDir);
    });

    it('should return null when codemap files are too old', async () => {
      const oldFilename = '2025-01-01T10-00-00-000Z-code-map.md';

      (fs.access as Mock).mockResolvedValue(undefined);
      (fs.readdir as Mock).mockResolvedValue([oldFilename]);

      const result = await CodemapCacheManager.findRecentCodemap(60, mockOutputDir); // 1 hour max age

      expect(result).toBeNull();
    });

    it('should return cached codemap when recent file exists', async () => {
      const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const recentFilename = recentTimestamp.toISOString().replace(/[:.]/g, '-') + '-code-map.md';
      const mockContent = '# Code Map\n\nThis is a test codemap content.';

      (fs.access as Mock).mockResolvedValue(undefined);
      (fs.readdir as Mock).mockResolvedValue([recentFilename]);
      (fs.readFile as Mock).mockResolvedValue(mockContent);

      const result = await CodemapCacheManager.findRecentCodemap(60, mockOutputDir);

      expect(result).not.toBeNull();
      expect(result?.content).toBe(mockContent);
      expect(result?.path).toBe(path.join(mockCodemapDir, recentFilename));
      expect(result?.fromCache).toBe(true);
      expect(result?.timestamp).toBeInstanceOf(Date);
    });

    it('should return most recent codemap when multiple files exist', async () => {
      const olderTimestamp = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const newerTimestamp = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const olderFilename = olderTimestamp.toISOString().replace(/[:.]/g, '-') + '-code-map.md';
      const newerFilename = newerTimestamp.toISOString().replace(/[:.]/g, '-') + '-code-map.md';
      const mockContent = '# Code Map\n\nNewest codemap content.';

      (fs.access as Mock).mockResolvedValue(undefined);
      (fs.readdir as Mock).mockResolvedValue([olderFilename, newerFilename]);
      (fs.readFile as Mock).mockResolvedValue(mockContent);

      const result = await CodemapCacheManager.findRecentCodemap(120, mockOutputDir); // 2 hour max age

      expect(result).not.toBeNull();
      expect(result?.path).toBe(path.join(mockCodemapDir, newerFilename));
      expect(fs.readFile).toHaveBeenCalledWith(path.join(mockCodemapDir, newerFilename), 'utf-8');
    });

    it('should use default output directory when not provided', async () => {
      process.env.VIBE_CODER_OUTPUT_DIR = '/env/output';
      const expectedDir = path.join('/env/output', 'code-map-generator');

      (fs.access as Mock).mockResolvedValue(undefined);
      (fs.readdir as Mock).mockResolvedValue([]);

      await CodemapCacheManager.findRecentCodemap(60);

      expect(fs.access).toHaveBeenCalledWith(expectedDir);
    });

    it.skip('should handle file read errors with retry logic', async () => {
      const recentTimestamp = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
      const recentFilename = recentTimestamp.toISOString().replace(/[:.]/g, '-') + '-code-map.md';
      const filePath = path.join(mockCodemapDir, recentFilename);

      // Reset all mocks completely
      vi.clearAllMocks();
      
      // Set up mocks with specific behavior
      // Directory access should always succeed
      (fs.access as Mock).mockImplementation((path: string, flags?: number) => {
        // Directory check (no flags)
        if (path === mockCodemapDir && flags === undefined) {
          return Promise.resolve(undefined);
        }
        
        // File access check with R_OK flag - simulate retry behavior
        if (path === filePath && flags === fs.constants.R_OK) {
          // Use a counter outside the mock to track attempts
          const currentAttempt = (fs.access as Mock).mock.calls.filter(
            call => call[0] === filePath && call[1] === fs.constants.R_OK
          ).length;
          
          if (currentAttempt <= 2) {
            // First two attempts fail
            return Promise.reject(new Error('File locked'));
          } else {
            // Third attempt succeeds
            return Promise.resolve(undefined);
          }
        }
        
        return Promise.reject(new Error('Unexpected path'));
      });

      (fs.readdir as Mock).mockResolvedValue([recentFilename]);
      (fs.readFile as Mock).mockResolvedValue('# Code Map\n\nContent');

      const result = await CodemapCacheManager.findRecentCodemap(60, mockOutputDir);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('# Code Map\n\nContent');
      expect(result?.fromCache).toBe(true);
      
      // Verify retry logic was triggered
      const fileAccessCalls = (fs.access as Mock).mock.calls.filter(
        call => call[0] === filePath && call[1] === fs.constants.R_OK
      );
      expect(fileAccessCalls.length).toBe(3); // 3 retry attempts
      expect(fs.readFile).toHaveBeenCalledTimes(1); // Only called once after successful access
    });
  });

  describe('extractTimestampFromFilename', () => {
    it('should extract valid timestamp from filename', () => {
      const filename = '2025-01-01T12-30-45-123Z-code-map.md';
      const result = CodemapCacheManager.extractTimestampFromFilename(filename);

      expect(result).toBeInstanceOf(Date);
      expect(result?.getUTCFullYear()).toBe(2025);
      expect(result?.getUTCMonth()).toBe(0); // January (0-indexed)
      expect(result?.getUTCDate()).toBe(1);
      expect(result?.getUTCHours()).toBe(12);
      expect(result?.getUTCMinutes()).toBe(30);
      expect(result?.getUTCSeconds()).toBe(45);
      expect(result?.getUTCMilliseconds()).toBe(123);
    });

    it('should return null for invalid filename format', () => {
      const invalidFilenames = [
        'invalid-filename.md',
        '2025-01-01-code-map.md',
        'code-map.md',
        '2025-13-01T12-30-45-123Z-code-map.md', // Invalid month
        ''
      ];

      invalidFilenames.forEach(filename => {
        const result = CodemapCacheManager.extractTimestampFromFilename(filename);
        expect(result).toBeNull();
      });
    });

    it('should handle edge cases gracefully', () => {
      const edgeCases = [
        '2025-01-01T00-00-00-000Z-code-map.md', // Midnight
        '2025-12-31T23-59-59-999Z-code-map.md', // End of year
        '2025-02-28T12-30-45-500Z-code-map.md'  // February
      ];

      edgeCases.forEach(filename => {
        const result = CodemapCacheManager.extractTimestampFromFilename(filename);
        expect(result).toBeInstanceOf(Date);
        expect(result?.getTime()).toBeGreaterThan(0);
      });
    });
  });

  describe('getCacheStats', () => {
    it('should return empty stats when no codemaps exist', async () => {
      (fs.readdir as Mock).mockResolvedValue([]);

      const stats = await CodemapCacheManager.getCacheStats(mockOutputDir);

      expect(stats).toEqual({
        totalCodemaps: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
        totalSizeBytes: 0,
        averageAgeMinutes: 0
      });
    });

    it('should calculate stats correctly for multiple codemaps', async () => {
      const files = [
        '2025-01-01T10-00-00-000Z-code-map.md',
        '2025-01-01T11-00-00-000Z-code-map.md',
        '2025-01-01T12-00-00-000Z-code-map.md'
      ];
      
      (fs.readdir as Mock).mockResolvedValue(files);
      (fs.stat as Mock).mockResolvedValue({ size: 1000 });

      const stats = await CodemapCacheManager.getCacheStats(mockOutputDir);

      expect(stats.totalCodemaps).toBe(3);
      expect(stats.totalSizeBytes).toBe(3000);
      expect(stats.oldestTimestamp).toBeInstanceOf(Date);
      expect(stats.newestTimestamp).toBeInstanceOf(Date);
      expect(stats.averageAgeMinutes).toBeGreaterThan(0);
    });

    it('should handle file system errors gracefully', async () => {
      (fs.readdir as Mock).mockRejectedValue(new Error('Permission denied'));

      const stats = await CodemapCacheManager.getCacheStats(mockOutputDir);

      expect(stats).toEqual({
        totalCodemaps: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
        totalSizeBytes: 0,
        averageAgeMinutes: 0
      });
    });
  });
});
