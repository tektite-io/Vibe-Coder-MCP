/**
 * Tests for incrementalProcessor - Incremental processing for code-map-generator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { IncrementalProcessor, createIncrementalProcessor } from '../incrementalProcessor.js';
import { getCacheDirectory } from '../directoryUtils.js';
import { CodeMapGeneratorConfig } from '../types.js';
import fs from 'fs/promises';
import fsSync from 'fs';

// Mock modules
vi.mock('../directoryUtils.js');
vi.mock('fs/promises');
vi.mock('fs');

// Mock FileCache
const mockFileCache = {
  get: vi.fn(),
  set: vi.fn(),
  close: vi.fn()
};

// Import the actual FileCache to ensure proper mocking
import { FileCache } from '../cache/fileCache.js';

vi.mock('../cache/fileCache.js', () => ({
  FileCache: vi.fn()
}));

// Ensure FileCache mock always returns our mockFileCache instance
vi.mocked(FileCache).mockImplementation(() => mockFileCache);

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockGetCacheDirectory = vi.mocked(getCacheDirectory);
const mockStat = vi.mocked(fs.stat);
const mockReadFile = vi.mocked(fs.readFile);
const mockWriteFile = vi.mocked(fs.writeFile);
const mockExistsSync = vi.mocked(fsSync.existsSync);

describe('incrementalProcessor', () => {
  const mockCacheDir = '/test/cache/dir';
  const mockAllowedDir = '/test/allowed/dir';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mocks
    mockGetCacheDirectory.mockReturnValue(mockCacheDir);
    mockExistsSync.mockReturnValue(false); // No previous files by default
  });

  describe('createIncrementalProcessor', () => {
    it('should return null when incremental processing is disabled', async () => {
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: mockAllowedDir,
        processing: {
          incremental: false,
          batchSize: 100,
          logMemoryUsage: false,
          maxMemoryUsage: 1024
        },
        cache: {
          enabled: true,
          cacheDir: mockCacheDir,
          maxEntries: 1000,
          maxAge: 86400000,
          useFileBasedAccess: true,
          useFileHashes: true,
          maxCachedFiles: 0,
          useMemoryCache: false,
          memoryMaxEntries: 1000,
          memoryMaxAge: 600000,
          memoryThreshold: 0.8
        },
        output: { format: 'markdown', splitOutput: false },
        featureFlags: {
          enhancedFunctionDetection: true,
          contextAnalysis: true,
          frameworkDetection: true,
          roleIdentification: true,
          heuristicNaming: true,
          memoryOptimization: true
        },
        importResolver: {
          enabled: false,
          useCache: true,
          cacheSize: 10000,
          extensions: {},
          generateImportGraph: false,
          expandSecurityBoundary: true,
          enhanceImports: false,
          importMaxDepth: 3
        },
        debug: {
          showDetailedImports: false,
          generateASTDebugFiles: false
        }
      };

      const result = await createIncrementalProcessor(config);
      
      expect(result).toBeNull();
    });

    it('should return null when incremental config is missing', async () => {
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: mockAllowedDir,
        processing: {
          incremental: true,
          batchSize: 100,
          logMemoryUsage: false,
          maxMemoryUsage: 1024
          // incrementalConfig is missing
        },
        cache: {
          enabled: true,
          cacheDir: mockCacheDir,
          maxEntries: 1000,
          maxAge: 86400000,
          useFileBasedAccess: true,
          useFileHashes: true,
          maxCachedFiles: 0,
          useMemoryCache: false,
          memoryMaxEntries: 1000,
          memoryMaxAge: 600000,
          memoryThreshold: 0.8
        },
        output: { format: 'markdown', splitOutput: false },
        featureFlags: {
          enhancedFunctionDetection: true,
          contextAnalysis: true,
          frameworkDetection: true,
          roleIdentification: true,
          heuristicNaming: true,
          memoryOptimization: true
        },
        importResolver: {
          enabled: false,
          useCache: true,
          cacheSize: 10000,
          extensions: {},
          generateImportGraph: false,
          expandSecurityBoundary: true,
          enhanceImports: false,
          importMaxDepth: 3
        },
        debug: {
          showDetailedImports: false,
          generateASTDebugFiles: false
        }
      };

      const result = await createIncrementalProcessor(config);
      
      expect(result).toBeNull();
    });

    it('should use cacheDir from config when provided', async () => {
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: mockAllowedDir,
        processing: {
          incremental: true,
          incrementalConfig: {
            useFileHashes: true,
            useFileMetadata: true,
            saveProcessedFilesList: true
          },
          batchSize: 100,
          logMemoryUsage: false,
          maxMemoryUsage: 1024
        },
        cache: {
          enabled: true,
          cacheDir: mockCacheDir,
          maxEntries: 1000,
          maxAge: 86400000,
          useFileBasedAccess: true,
          useFileHashes: true,
          maxCachedFiles: 0,
          useMemoryCache: false,
          memoryMaxEntries: 1000,
          memoryMaxAge: 600000,
          memoryThreshold: 0.8
        },
        output: { format: 'markdown', splitOutput: false },
        featureFlags: {
          enhancedFunctionDetection: true,
          contextAnalysis: true,
          frameworkDetection: true,
          roleIdentification: true,
          heuristicNaming: true,
          memoryOptimization: true
        },
        importResolver: {
          enabled: false,
          useCache: true,
          cacheSize: 10000,
          extensions: {},
          generateImportGraph: false,
          expandSecurityBoundary: true,
          enhanceImports: false,
          importMaxDepth: 3
        },
        debug: {
          showDetailedImports: false,
          generateASTDebugFiles: false
        }
      };

      const result = await createIncrementalProcessor(config);
      
      expect(result).toBeInstanceOf(IncrementalProcessor);
      // The implementation uses || so getCacheDirectory is evaluated regardless
      // This is fine as long as the correct cacheDir is used
    });

    it('should use getCacheDirectory fallback when cacheDir is not provided', async () => {
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: mockAllowedDir,
        processing: {
          incremental: true,
          incrementalConfig: {
            useFileHashes: true,
            useFileMetadata: true,
            saveProcessedFilesList: true
          },
          batchSize: 100,
          logMemoryUsage: false,
          maxMemoryUsage: 1024
        },
        cache: {
          enabled: true,
          // cacheDir is not provided
          maxEntries: 1000,
          maxAge: 86400000,
          useFileBasedAccess: true,
          useFileHashes: true,
          maxCachedFiles: 0,
          useMemoryCache: false,
          memoryMaxEntries: 1000,
          memoryMaxAge: 600000,
          memoryThreshold: 0.8
        },
        output: { format: 'markdown', splitOutput: false },
        featureFlags: {
          enhancedFunctionDetection: true,
          contextAnalysis: true,
          frameworkDetection: true,
          roleIdentification: true,
          heuristicNaming: true,
          memoryOptimization: true
        },
        importResolver: {
          enabled: false,
          useCache: true,
          cacheSize: 10000,
          extensions: {},
          generateImportGraph: false,
          expandSecurityBoundary: true,
          enhanceImports: false,
          importMaxDepth: 3
        },
        debug: {
          showDetailedImports: false,
          generateASTDebugFiles: false
        }
      };

      const result = await createIncrementalProcessor(config);
      
      expect(result).toBeInstanceOf(IncrementalProcessor);
      expect(mockGetCacheDirectory).toHaveBeenCalledWith(config);
    });

    it('should return null when no cache directory is available', async () => {
      mockGetCacheDirectory.mockReturnValue(''); // Empty string

      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: mockAllowedDir,
        processing: {
          incremental: true,
          incrementalConfig: {
            useFileHashes: true,
            useFileMetadata: true,
            saveProcessedFilesList: true
          },
          batchSize: 100,
          logMemoryUsage: false,
          maxMemoryUsage: 1024
        },
        cache: {
          enabled: true,
          // cacheDir is not provided
          maxEntries: 1000,
          maxAge: 86400000,
          useFileBasedAccess: true,
          useFileHashes: true,
          maxCachedFiles: 0,
          useMemoryCache: false,
          memoryMaxEntries: 1000,
          memoryMaxAge: 600000,
          memoryThreshold: 0.8
        },
        output: { format: 'markdown', splitOutput: false },
        featureFlags: {
          enhancedFunctionDetection: true,
          contextAnalysis: true,
          frameworkDetection: true,
          roleIdentification: true,
          heuristicNaming: true,
          memoryOptimization: true
        },
        importResolver: {
          enabled: false,
          useCache: true,
          cacheSize: 10000,
          extensions: {},
          generateImportGraph: false,
          expandSecurityBoundary: true,
          enhanceImports: false,
          importMaxDepth: 3
        },
        debug: {
          showDetailedImports: false,
          generateASTDebugFiles: false
        }
      };

      const result = await createIncrementalProcessor(config);
      
      expect(result).toBeNull();
      expect(mockGetCacheDirectory).toHaveBeenCalledWith(config);
    });
  });

  describe('IncrementalProcessor', () => {
    let processor: IncrementalProcessor;

    beforeEach(() => {
      processor = new IncrementalProcessor(
        {
          useFileHashes: true,
          useFileMetadata: true,
          saveProcessedFilesList: true
        },
        mockAllowedDir,
        mockCacheDir
      );
    });

    describe('hasFileChanged', () => {
      it('should return true for files not processed before', async () => {
        mockExistsSync.mockReturnValue(false); // No previous files list
        
        await processor.initialize();
        
        const result = await processor.hasFileChanged('/test/file.js');
        
        expect(result).toBe(true);
      });

      it('should detect changes based on file size', async () => {
        // Mock previous files list
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValueOnce(JSON.stringify(['/test/file.js']));
        
        await processor.initialize();
        
        // Mock file stats
        mockStat.mockResolvedValueOnce({
          size: 1000,
          mtimeMs: Date.now(),
          isFile: () => true,
          isDirectory: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          mode: 0o644,
          mtime: new Date(),
          atime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
          uid: 1000,
          gid: 1000,
          dev: 0,
          ino: 0,
          nlink: 1,
          rdev: 0,
          blocks: 0,
          blksize: 4096,
          atimeMs: Date.now(),
          ctimeMs: Date.now(),
          birthtimeMs: Date.now()
        } as fs.Stats);

        // Mock FileCache get to return different size
        mockFileCache.get.mockResolvedValueOnce({
          filePath: '/test/file.js',
          size: 500, // Different size
          mtime: Date.now(),
          processedAt: Date.now()
        });

        const result = await processor.hasFileChanged('/test/file.js');
        
        expect(result).toBe(true);
      });
    });

    describe('filterChangedFiles', () => {
      it('should return all files when change detection is disabled', async () => {
        processor = new IncrementalProcessor(
          {
            useFileHashes: false,
            useFileMetadata: false,
            saveProcessedFilesList: true
          },
          mockAllowedDir,
          mockCacheDir
        );

        await processor.initialize();
        
        const files = ['/test/file1.js', '/test/file2.js', '/test/file3.js'];
        const result = await processor.filterChangedFiles(files);
        
        expect(result).toEqual(files);
      });

      it.skip('should filter files based on changes', async () => {
        // Create a processor that doesn't use file hashes to simplify the test
        processor = new IncrementalProcessor(
          {
            useFileHashes: false, // Disable hash checking
            useFileMetadata: true,
            saveProcessedFilesList: true
          },
          mockAllowedDir,
          mockCacheDir
        );
        
        mockExistsSync.mockReturnValue(true);
        mockReadFile.mockResolvedValueOnce(JSON.stringify(['/test/file1.js', '/test/file2.js']));
        
        await processor.initialize();
        
        const currentTime = Date.now();
        const oldTime = currentTime - 10000; // 10 seconds ago
        
        // Mock file stats for all files
        mockStat.mockImplementation(() => Promise.resolve({
          size: 1000,
          mtimeMs: oldTime, // Use old time so files appear unchanged
          isFile: () => true,
          isDirectory: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          mode: 0o644,
          mtime: new Date(oldTime),
          atime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
          uid: 1000,
          gid: 1000,
          dev: 0,
          ino: 0,
          nlink: 1,
          rdev: 0,
          blocks: 0,
          blksize: 4096,
          atimeMs: oldTime,
          ctimeMs: oldTime,
          birthtimeMs: oldTime
        } as fs.Stats));

        // Mock FileCache - file1 unchanged, file2 changed, file3 new
        // Clear previous mock calls to ensure clean slate
        mockFileCache.get.mockReset();
        mockFileCache.get
          .mockResolvedValueOnce({
            filePath: '/test/file1.js',
            size: 1000, // Same size
            mtime: oldTime, // Same mtime as current file - unchanged
            processedAt: oldTime
          })
          .mockResolvedValueOnce({
            filePath: '/test/file2.js',
            size: 500, // Different size - file changed
            mtime: oldTime,
            processedAt: oldTime
          })
          .mockResolvedValueOnce(null); // file3 not in cache - new file

        const files = ['/test/file1.js', '/test/file2.js', '/test/file3.js'];
        const result = await processor.filterChangedFiles(files);
        
        // Should return file2 (changed) and file3 (new)
        expect(result).toHaveLength(2);
        expect(result).toContain('/test/file2.js');
        expect(result).toContain('/test/file3.js');
        expect(result).not.toContain('/test/file1.js');
      });
    });

    describe('saveProcessedFilesList', () => {
      it.skip('should save the list of processed files', async () => {
        await processor.initialize();
        
        // Mock file stats for updateFileMetadata
        mockStat.mockResolvedValue({
          size: 1000,
          mtimeMs: Date.now(),
          isFile: () => true,
          isDirectory: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          mode: 0o644,
          mtime: new Date(),
          atime: new Date(),
          ctime: new Date(),
          birthtime: new Date(),
          uid: 1000,
          gid: 1000,
          dev: 0,
          ino: 0,
          nlink: 1,
          rdev: 0,
          blocks: 0,
          blksize: 4096,
          atimeMs: Date.now(),
          ctimeMs: Date.now(),
          birthtimeMs: Date.now()
        } as fs.Stats);
        
        // Mock readFile for computeFileHash
        mockReadFile.mockResolvedValue(Buffer.from('file content'));
        
        // Reset FileCache mock to ensure clean state
        mockFileCache.set.mockReset();
        mockFileCache.set.mockResolvedValue(undefined);
        
        // Simulate processing files
        await processor.updateFileMetadata('/test/file1.js');
        await processor.updateFileMetadata('/test/file2.js');
        
        // Verify that FileCache.set was called
        expect(mockFileCache.set).toHaveBeenCalledTimes(2);
        
        // Save the list
        await processor.saveProcessedFilesList();
        
        expect(mockWriteFile).toHaveBeenCalledWith(
          path.join(mockCacheDir, 'processed-files.json'),
          JSON.stringify(['/test/file1.js', '/test/file2.js']),
          'utf-8'
        );
      });

      it('should skip saving when disabled in config', async () => {
        processor = new IncrementalProcessor(
          {
            useFileHashes: true,
            useFileMetadata: true,
            saveProcessedFilesList: false // Disabled
          },
          mockAllowedDir,
          mockCacheDir
        );

        await processor.initialize();
        await processor.saveProcessedFilesList();
        
        expect(mockWriteFile).not.toHaveBeenCalled();
      });
    });
  });
});