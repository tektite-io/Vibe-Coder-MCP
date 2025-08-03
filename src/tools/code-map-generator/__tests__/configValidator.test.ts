/**
 * Tests for configValidator - Configuration validation for Code-Map Generator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateCodeMapConfig, validateCacheConfig, extractCodeMapConfig } from '../configValidator.js';
import { getCacheDirectory } from '../directoryUtils.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { stat, access } from 'fs/promises';
import fs from 'fs';
import path from 'path';

// Mock modules
vi.mock('../directoryUtils.js');
vi.mock('fs/promises');
vi.mock('fs');

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
const mockStat = vi.mocked(stat);
const mockAccess = vi.mocked(access);
const mockExistsSync = vi.mocked(fs.existsSync);

describe('configValidator', () => {
  const mockAllowedDir = '/test/allowed/dir';
  const mockCacheDir = '/test/cache/dir';

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockGetCacheDirectory.mockReturnValue(mockCacheDir);
    mockStat.mockResolvedValue({ 
      isDirectory: () => true,
      isFile: () => false,
      isBlockDevice: () => false,
      isCharacterDevice: () => false,
      isSymbolicLink: () => false,
      isFIFO: () => false,
      isSocket: () => false,
      size: 0,
      mode: 0o755,
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
      mtimeMs: Date.now(),
      ctimeMs: Date.now(),
      birthtimeMs: Date.now()
    } as fs.Stats);
    mockAccess.mockResolvedValue(undefined);
    mockExistsSync.mockReturnValue(true);
  });

  describe('validateCacheConfig', () => {
    it('should compute cacheDir using getCacheDirectory when not provided', () => {
      const config = {
        enabled: true,
        maxEntries: 1000
      };

      const result = validateCacheConfig(config, mockAllowedDir);

      expect(getCacheDirectory).toHaveBeenCalledWith({ allowedMappingDirectory: mockAllowedDir });
      expect(result.cacheDir).toBe(mockCacheDir);
    });

    it('should not compute cacheDir when already provided', () => {
      vi.clearAllMocks(); // Clear mocks before this specific test
      
      const providedCacheDir = '/custom/cache/dir';
      const config = {
        enabled: true,
        cacheDir: providedCacheDir
      };

      const result = validateCacheConfig(config, mockAllowedDir);

      // Even though allowedMappingDirectory is provided, it should not compute cacheDir
      // because cacheDir is already provided
      expect(getCacheDirectory).not.toHaveBeenCalled();
      expect(result.cacheDir).toBe(providedCacheDir);
    });

    it('should not compute cacheDir when no allowedMappingDirectory is provided', () => {
      const config = {
        enabled: true,
        maxEntries: 1000
      };

      const result = validateCacheConfig(config);

      expect(getCacheDirectory).not.toHaveBeenCalled();
      expect(result.cacheDir).toBeUndefined();
    });

    it('should return default config when no config is provided', () => {
      const result = validateCacheConfig();

      expect(result).toMatchObject({
        enabled: true,
        maxEntries: 10000,
        maxAge: 24 * 60 * 60 * 1000,
        useFileBasedAccess: true,
        useFileHashes: true,
        maxCachedFiles: 0,
        useMemoryCache: false
      });
      expect(result.cacheDir).toBeUndefined();
    });

    it('should handle disabled cache configuration', () => {
      const config = {
        enabled: false
      };

      const result = validateCacheConfig(config, mockAllowedDir);

      // Should not compute cacheDir when cache is disabled
      expect(getCacheDirectory).not.toHaveBeenCalled();
      expect(result.enabled).toBe(false);
      expect(result.cacheDir).toBeUndefined();
    });
  });

  describe('validateCodeMapConfig', () => {
    it('should validate config with allowedMappingDirectory and compute cacheDir', async () => {
      const config = {
        allowedMappingDirectory: mockAllowedDir,
        cache: {
          enabled: true
        }
      };

      const result = await validateCodeMapConfig(config);

      expect(result.allowedMappingDirectory).toBe(mockAllowedDir);
      expect(result.cache.cacheDir).toBe(mockCacheDir);
      expect(getCacheDirectory).toHaveBeenCalledWith({ allowedMappingDirectory: mockAllowedDir });
    });

    it('should use environment variable CODE_MAP_ALLOWED_DIR when config does not provide allowedMappingDirectory', async () => {
      const envDir = '/env/allowed/dir';
      process.env.CODE_MAP_ALLOWED_DIR = envDir;

      // Need to mock stat for the env directory
      mockStat.mockResolvedValueOnce({ 
        isDirectory: () => true,
        isFile: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        size: 0,
        mode: 0o755,
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
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        birthtimeMs: Date.now()
      } as fs.Stats);

      try {
        const config = {
          cache: { enabled: true }
        };

        const result = await validateCodeMapConfig(config);

        expect(result.allowedMappingDirectory).toBe(envDir);
        expect(result.cache.cacheDir).toBe(mockCacheDir);
      } finally {
        delete process.env.CODE_MAP_ALLOWED_DIR;
      }
    });

    it('should throw error when no allowedMappingDirectory is provided', async () => {
      const config = {};

      await expect(validateCodeMapConfig(config)).rejects.toThrow(
        'allowedMappingDirectory is required in the configuration or CODE_MAP_ALLOWED_DIR environment variable'
      );
    });

    it('should preserve custom cacheDir when provided', async () => {
      const customCacheDir = '/custom/cache';
      const config = {
        allowedMappingDirectory: mockAllowedDir,
        cache: {
          enabled: true,
          cacheDir: customCacheDir
        }
      };

      const result = await validateCodeMapConfig(config);

      expect(result.cache.cacheDir).toBe(customCacheDir);
      expect(getCacheDirectory).not.toHaveBeenCalled();
    });
  });

  describe('extractCodeMapConfig', () => {
    it('should extract config from env section first (MCP client environment variables)', async () => {
      const envAllowedDir = '/env/allowed/dir';
      const envOutputDir = '/env/output/dir';
      
      mockStat.mockResolvedValue({ isDirectory: () => true });
      mockAccess.mockResolvedValue(undefined);
      
      const openRouterConfig: OpenRouterConfig = {
        apiKey: 'test-key',
        defaultModel: 'test-model',
        env: {
          CODE_MAP_ALLOWED_DIR: envAllowedDir,
          VIBE_CODER_OUTPUT_DIR: envOutputDir
        },
        tools: {
          'map-codebase': {
            allowedMappingDirectory: mockAllowedDir, // This should be overridden by env
            cache: { enabled: true }
          }
        }
      };

      const result = await extractCodeMapConfig(openRouterConfig);

      expect(result.allowedMappingDirectory).toBe(envAllowedDir); // env takes precedence
      expect(result.output.outputDir).toBe(path.join(envOutputDir, 'code-map-generator'));
      expect(result.cache.enabled).toBe(true);
    });

    it('should extract config from tools["map-codebase"] section', async () => {
      const openRouterConfig: OpenRouterConfig = {
        apiKey: 'test-key',
        defaultModel: 'test-model',
        tools: {
          'map-codebase': {
            allowedMappingDirectory: mockAllowedDir,
            cache: { enabled: true }
          }
        }
      };

      const result = await extractCodeMapConfig(openRouterConfig);

      expect(result.allowedMappingDirectory).toBe(mockAllowedDir);
      expect(result.cache.enabled).toBe(true);
    });

    it('should extract config from config["map-codebase"] section', async () => {
      const openRouterConfig: OpenRouterConfig = {
        apiKey: 'test-key',
        defaultModel: 'test-model',
        config: {
          'map-codebase': {
            allowedMappingDirectory: mockAllowedDir,
            cache: { enabled: false }
          }
        }
      };

      const result = await extractCodeMapConfig(openRouterConfig);

      expect(result.allowedMappingDirectory).toBe(mockAllowedDir);
      expect(result.cache.enabled).toBe(false);
    });

    it('should merge configs with tools taking precedence over config section', async () => {
      const openRouterConfig: OpenRouterConfig = {
        apiKey: 'test-key',
        defaultModel: 'test-model',
        config: {
          'map-codebase': {
            allowedMappingDirectory: '/config/dir',
            cache: { enabled: false, maxEntries: 500 }
          }
        },
        tools: {
          'map-codebase': {
            allowedMappingDirectory: mockAllowedDir,
            cache: { enabled: true, maxEntries: 1000 }
          }
        }
      };

      const result = await extractCodeMapConfig(openRouterConfig);

      expect(result.allowedMappingDirectory).toBe(mockAllowedDir);
      expect(result.cache.enabled).toBe(true);
      expect(result.cache.maxEntries).toBe(1000); // Tools section takes precedence
    });

    it('should handle undefined config and use environment variable', async () => {
      vi.clearAllMocks(); // Clear mocks before this test
      
      // Re-setup getCacheDirectory mock
      mockGetCacheDirectory.mockReturnValue(mockCacheDir);
      
      // Setup access mock to succeed
      mockAccess.mockResolvedValue(undefined);
      
      process.env.CODE_MAP_ALLOWED_DIR = mockAllowedDir;

      // Need to mock stat for the environment directory
      mockStat.mockResolvedValueOnce({ 
        isDirectory: () => true,
        isFile: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        size: 0,
        mode: 0o755,
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
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        birthtimeMs: Date.now()
      } as fs.Stats);

      try {
        const result = await extractCodeMapConfig(undefined);

        expect(result.allowedMappingDirectory).toBe(mockAllowedDir);
        expect(result.cache.enabled).toBe(true); // Default
        expect(result.cache.cacheDir).toBe(mockCacheDir); // Should compute since enabled by default
      } finally {
        delete process.env.CODE_MAP_ALLOWED_DIR;
      }
    });

    it('should handle empty config object', async () => {
      process.env.CODE_MAP_ALLOWED_DIR = mockAllowedDir;

      // Need to mock stat for the environment directory
      mockStat.mockResolvedValueOnce({ 
        isDirectory: () => true,
        isFile: () => false,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        size: 0,
        mode: 0o755,
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
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        birthtimeMs: Date.now()
      } as fs.Stats);

      try {
        const openRouterConfig: OpenRouterConfig = {
          apiKey: 'test-key',
          defaultModel: 'test-model'
        };

        const result = await extractCodeMapConfig(openRouterConfig);

        expect(result.allowedMappingDirectory).toBe(mockAllowedDir);
        expect(result.cache.enabled).toBe(true); // Default
        expect(result.cache.cacheDir).toBe(mockCacheDir); // Should compute since enabled by default
      } finally {
        delete process.env.CODE_MAP_ALLOWED_DIR;
      }
    });
  });
});