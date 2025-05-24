/**
 * Tests for the disposable pattern in import resolvers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DependencyCruiserAdapter } from '../dependencyCruiserAdapter';
import { ExtendedPythonImportResolver } from '../extendedPythonImportResolver';
import { ClangdAdapter } from '../clangdAdapter';
import { SemgrepAdapter } from '../semgrepAdapter';
import { ImportResolverFactory } from '../importResolverFactory';
import * as fs from 'fs';
import path from 'path';
import os from 'os';

// Mock fs
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: {
      promises: {
        unlink: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{}'),
      },
      existsSync: vi.fn().mockReturnValue(true),
      unlinkSync: vi.fn(),
    },
    promises: {
      unlink: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue('{}'),
    },
    existsSync: vi.fn().mockReturnValue(true),
    unlinkSync: vi.fn(),
  };
});

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock exec
vi.mock('util', () => ({
  promisify: vi.fn().mockImplementation(() => vi.fn().mockResolvedValue({ stdout: '{}' })),
}));

describe('Import Resolver Disposable Pattern', () => {
  const allowedDir = '/test/allowed';
  const outputDir = '/test/output';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('DependencyCruiserAdapter', () => {
    it('should dispose resources properly', async () => {
      // Create adapter
      const adapter = new DependencyCruiserAdapter(allowedDir, outputDir);

      // Create a temp file to track
      (adapter as any).tempFiles = ['/test/output/temp1.json', '/test/output/temp2.json'];

      // Mock fs.existsSync to return true for our temp files
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === '/test/output/temp1.json' || filePath === '/test/output/temp2.json';
      });

      // Call dispose
      adapter.dispose();

      // Verify cache is cleared
      expect((adapter as any).cache.size).toBe(0);

      // Verify temp files are deleted
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp1.json');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp2.json');
    });
  });

  describe('ExtendedPythonImportResolver', () => {
    it('should dispose resources properly', async () => {
      // Create resolver
      const resolver = new ExtendedPythonImportResolver(allowedDir, outputDir);

      // Create a temp file to track
      (resolver as any).tempFiles = ['/test/output/temp1.py', '/test/output/temp2.py'];

      // Mock fs.existsSync to return true for our temp files
      vi.mocked(fs.existsSync).mockImplementation((filePath) => {
        return filePath === '/test/output/temp1.py' || filePath === '/test/output/temp2.py';
      });

      // Call dispose
      resolver.dispose();

      // Verify cache is cleared
      expect((resolver as any).cache.size).toBe(0);

      // Verify temp files are deleted
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp1.py');
      expect(fs.unlinkSync).toHaveBeenCalledWith('/test/output/temp2.py');

      // Verify environment variables are reset
      expect((resolver as any).sitePackagesPath).toBeNull();
      expect((resolver as any).pythonPath).toBeNull();
    });
  });

  describe('ImportResolverFactory', () => {
    it('should dispose all adapters', async () => {
      // Create factory
      const factory = new ImportResolverFactory({
        allowedDir,
        outputDir,
        maxDepth: 3
      });

      // Mock adapters
      const mockDependencyCruiserAdapter = { dispose: vi.fn() };
      const mockPythonImportResolver = { dispose: vi.fn() };
      const mockClangdAdapter = { dispose: vi.fn() };
      const mockSemgrepAdapter = { dispose: vi.fn() };

      // Set mock adapters
      (factory as any).dependencyCruiserAdapter = mockDependencyCruiserAdapter;
      (factory as any).pythonImportResolver = mockPythonImportResolver;
      (factory as any).clangdAdapter = mockClangdAdapter;
      (factory as any).semgrepAdapter = mockSemgrepAdapter;

      // Call dispose
      factory.dispose();

      // Verify all adapters are disposed
      expect(mockDependencyCruiserAdapter.dispose).toHaveBeenCalled();
      expect(mockPythonImportResolver.dispose).toHaveBeenCalled();
      expect(mockClangdAdapter.dispose).toHaveBeenCalled();
      expect(mockSemgrepAdapter.dispose).toHaveBeenCalled();

      // Verify all adapters are set to null
      expect((factory as any).dependencyCruiserAdapter).toBeNull();
      expect((factory as any).pythonImportResolver).toBeNull();
      expect((factory as any).clangdAdapter).toBeNull();
      expect((factory as any).semgrepAdapter).toBeNull();
    });

    it('should clean up unused adapters after timeout', async () => {
      vi.useFakeTimers();

      // Create factory
      const factory = new ImportResolverFactory({
        allowedDir,
        outputDir,
        maxDepth: 3
      });

      // Mock adapters
      const mockDependencyCruiserAdapter = { dispose: vi.fn() };
      const mockPythonImportResolver = { dispose: vi.fn() };

      // Set mock adapters
      (factory as any).dependencyCruiserAdapter = mockDependencyCruiserAdapter;
      (factory as any).pythonImportResolver = mockPythonImportResolver;

      // Set last used timestamps (one recent, one old)
      const now = Date.now();
      (factory as any).adapterLastUsed.set('dependencyCruiser', now);
      (factory as any).adapterLastUsed.set('pythonImportResolver', now - 20 * 60 * 1000); // 20 minutes ago

      // Set TTL to 15 minutes
      (factory as any).ADAPTER_TTL = 15 * 60 * 1000;

      // Call cleanupUnusedAdapters
      (factory as any).cleanupUnusedAdapters();

      // Verify only old adapter is disposed
      expect(mockDependencyCruiserAdapter.dispose).not.toHaveBeenCalled();
      expect(mockPythonImportResolver.dispose).toHaveBeenCalled();

      // Verify only old adapter is set to null
      expect((factory as any).dependencyCruiserAdapter).not.toBeNull();
      expect((factory as any).pythonImportResolver).toBeNull();

      vi.useRealTimers();
    });
  });
});
