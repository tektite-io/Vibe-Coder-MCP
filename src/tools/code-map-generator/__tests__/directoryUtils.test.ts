import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { createDirectoryStructure } from '../directoryUtils.js';
import { CodeMapGeneratorConfig } from '../types.js';

// Mock fs/promises and fs
vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  access: vi.fn(),
}));

vi.mock('fs', () => ({
  constants: {
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
  },
  existsSync: vi.fn(),
}));

describe('directoryUtils', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Mock fs.mkdir to succeed by default
    (fs.mkdir as any).mockResolvedValue(undefined);

    // Mock fs.access to succeed by default
    (fs.access as any).mockResolvedValue(undefined);

    // Mock fs.existsSync to return false by default
    (fsSync.existsSync as any).mockReturnValue(false);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createDirectoryStructure', () => {
    it('should create directory structure with default paths', async () => {
      // Arrange
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/project',
      };
      const jobId = 'test-job';

      // Act
      const result = await createDirectoryStructure(config, jobId);

      // Assert
      expect(fs.mkdir).toHaveBeenCalledTimes(3);
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('VibeCoderOutput'), { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('code-map-generator'), { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.cache'), { recursive: true });

      expect(result).toEqual({
        baseDir: expect.stringContaining('VibeCoderOutput'),
        outputDir: expect.stringContaining('code-map-generator'),
        cacheDir: expect.stringContaining('.cache'),
      });
    });

    it('should create directory structure with custom paths', async () => {
      // Arrange
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/project',
        output: {
          outputDir: '/custom/output',
        },
        cache: {
          enabled: true,
          cacheDir: '/custom/cache',
        },
      };
      const jobId = 'test-job';

      // Act
      const result = await createDirectoryStructure(config, jobId);

      // Assert
      expect(fs.mkdir).toHaveBeenCalledTimes(2);
      expect(fs.mkdir).toHaveBeenCalledWith('/custom/output', { recursive: true });
      expect(fs.mkdir).toHaveBeenCalledWith('/custom/cache', { recursive: true });

      expect(result).toEqual({
        baseDir: expect.stringContaining('VibeCoderOutput'),
        outputDir: '/custom/output',
        cacheDir: '/custom/cache',
      });
    });

    it('should not create cache directory if cache is disabled', async () => {
      // Arrange
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/project',
        cache: {
          enabled: false,
        },
      };
      const jobId = 'test-job';

      // Act
      const result = await createDirectoryStructure(config, jobId);

      // Assert
      expect(fs.mkdir).toHaveBeenCalledTimes(2);
      expect(fs.mkdir).not.toHaveBeenCalledWith(expect.stringContaining('.cache'), { recursive: true });

      expect(result).toEqual({
        baseDir: expect.stringContaining('VibeCoderOutput'),
        outputDir: expect.stringContaining('code-map-generator'),
        cacheDir: null,
      });
    });

    it('should handle existing directories', async () => {
      // Arrange
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/project',
      };
      const jobId = 'test-job';

      // Mock fs.existsSync to return true
      (fsSync.existsSync as any).mockReturnValue(true);

      // Act
      const result = await createDirectoryStructure(config, jobId);

      // Assert
      expect(fs.mkdir).not.toHaveBeenCalled();

      expect(result).toEqual({
        baseDir: expect.stringContaining('VibeCoderOutput'),
        outputDir: expect.stringContaining('code-map-generator'),
        cacheDir: expect.stringContaining('.cache'),
      });
    });

    it('should handle directory creation errors', async () => {
      // Arrange
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/project',
      };
      const jobId = 'test-job';

      // Mock fs.mkdir to fail
      (fs.mkdir as any).mockRejectedValue(new Error('Permission denied'));

      // Act & Assert
      await expect(createDirectoryStructure(config, jobId)).rejects.toThrow(
        'Failed to create directory structure'
      );
    });

    it('should use job ID in output directory name', async () => {
      // Arrange
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/project',
      };
      const jobId = 'special-job-id';

      // Act
      const result = await createDirectoryStructure(config, jobId);

      // Assert
      expect(result.outputDir).toContain('special-job-id');
    });
  });
});
