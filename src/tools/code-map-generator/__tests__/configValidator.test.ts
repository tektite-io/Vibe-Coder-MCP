import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { extractCodeMapConfig } from '../configValidator.js';
import { CodeMapGeneratorConfig } from '../types.js';
import { createMockConfig } from './testHelpers.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  access: vi.fn(),
  stat: vi.fn(),
}));

describe('configValidator', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Mock fs.access to succeed by default
    (fs.access as any).mockResolvedValue(undefined);

    // Mock fs.stat to return a directory by default
    (fs.stat as any).mockResolvedValue({
      isDirectory: () => true,
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('extractCodeMapConfig', () => {
    it('should extract config from OpenRouterConfig', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            allowedMappingDirectory: '/test/dir',
            cache: {
              enabled: true,
              maxEntries: 1000,
              maxAge: 3600000,
            },
            processing: {
              batchSize: 50,
            },
          },
        },
      });

      // Act
      const result = await extractCodeMapConfig(config);

      // Assert
      expect(result).toEqual({
        allowedMappingDirectory: '/test/dir',
        cache: {
          enabled: true,
          maxEntries: 1000,
          maxAge: 3600000,
        },
        processing: {
          batchSize: 50,
        },
      });
    });

    it('should throw error if allowedMappingDirectory is missing', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            cache: {
              enabled: true,
            },
          },
        },
      });

      // Act & Assert
      await expect(extractCodeMapConfig(config)).rejects.toThrow(
        'allowedMappingDirectory is required in the configuration'
      );
    });

    it('should throw error if allowedMappingDirectory is not a string', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            allowedMappingDirectory: 123 as any,
          },
        },
      });

      // Act & Assert
      await expect(extractCodeMapConfig(config)).rejects.toThrow(
        'allowedMappingDirectory must be a string'
      );
    });

    it('should throw error if allowedMappingDirectory does not exist', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            allowedMappingDirectory: '/nonexistent/dir',
          },
        },
      });

      // Mock fs.access to fail
      (fs.access as any).mockRejectedValue(new Error('ENOENT'));

      // Act & Assert
      await expect(extractCodeMapConfig(config)).rejects.toThrow(
        'allowedMappingDirectory does not exist or is not accessible'
      );
    });

    it('should throw error if allowedMappingDirectory is not a directory', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            allowedMappingDirectory: '/test/file.txt',
          },
        },
      });

      // Mock fs.stat to return a file
      (fs.stat as any).mockResolvedValue({
        isDirectory: () => false,
      });

      // Act & Assert
      await expect(extractCodeMapConfig(config)).rejects.toThrow(
        'allowedMappingDirectory must be a directory'
      );
    });

    it('should use default values for cache and processing if not provided', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            allowedMappingDirectory: '/test/dir',
          },
        },
      });

      // Act
      const result = await extractCodeMapConfig(config);

      // Assert
      expect(result).toEqual({
        allowedMappingDirectory: '/test/dir',
        cache: {
          enabled: true,
        },
        processing: {
          batchSize: 100,
        },
      });
    });

    it('should merge provided cache and processing with defaults', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'map-codebase': {
            allowedMappingDirectory: '/test/dir',
            cache: {
              maxEntries: 2000,
            },
            processing: {
              logMemoryUsage: true,
            },
          },
        },
      });

      // Act
      const result = await extractCodeMapConfig(config);

      // Assert
      expect(result).toEqual({
        allowedMappingDirectory: '/test/dir',
        cache: {
          enabled: true,
          maxEntries: 2000,
        },
        processing: {
          batchSize: 100,
          logMemoryUsage: true,
        },
      });
    });

    it('should handle config from different structure', async () => {
      // Arrange
      const config = createMockConfig({
        config: {
          'map-codebase': {
            allowedMappingDirectory: '/test/dir',
          },
        },
      });

      // Act
      const result = await extractCodeMapConfig(config);

      // Assert
      expect(result).toEqual({
        allowedMappingDirectory: '/test/dir',
        cache: {
          enabled: true,
        },
        processing: {
          batchSize: 100,
        },
      });
    });

    it('should throw error if no map-codebase config is found', async () => {
      // Arrange
      const config = createMockConfig({
        tools: {
          'other-tool': {
            someConfig: 'value',
          },
        },
      });

      // Act & Assert
      await expect(extractCodeMapConfig(config)).rejects.toThrow(
        'No configuration found for map-codebase tool'
      );
    });
  });
});
