/**
 * Tests for the import resolver utility.
 */

import { resolveImport, clearImportCache, getImportCacheSize } from '../importResolver.js';
import * as path from 'path';
import * as fs from 'fs';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the modules to mock
import resolve from 'resolve';
import logger from '../../../../logger.js';

// Mock the modules
vi.mock('resolve', () => ({
  __esModule: true,
  default: {
    sync: vi.fn()
  },
  sync: vi.fn()
}));

vi.mock('../../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('Import Resolver', () => {
  beforeEach(() => {
    // Clear the cache before each test
    clearImportCache();

    // Clear all mocks
    vi.clearAllMocks();
  });

  it('should resolve an import path', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/to/resolved/file.js');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript'
    };

    const result = resolveImport('./module', options);

    expect(result).toBe('/path/to/resolved/file.js');
    expect(resolve.sync).toHaveBeenCalledWith('./module', {
      basedir: path.dirname(options.fromFile),
      extensions: ['.js', '.json', '.node', '.mjs', '.cjs'],
      preserveSymlinks: false
    });
  });

  it('should resolve imports outside the allowed directory when expandSecurityBoundary is true', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/outside/allowed/dir/module.js');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      expandSecurityBoundary: true
    };

    const result = resolveImport('../outside/allowed/dir/module', options);

    expect(result).toBe('/path/outside/allowed/dir/module.js');
    expect(resolve.sync).toHaveBeenCalled();
  });

  it('should return the original path for built-in modules', () => {
    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript'
    };

    const result = resolveImport('fs', options);

    expect(result).toBe('fs');
    expect(resolve.sync).not.toHaveBeenCalled();
  });

  it('should use the cache when enabled', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/to/resolved/file.js');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      useCache: true
    };

    // First call should use resolve.sync
    const result1 = resolveImport('./module', options);

    // Second call should use the cache
    const result2 = resolveImport('./module', options);

    expect(result1).toBe('/path/to/resolved/file.js');
    expect(result2).toBe('/path/to/resolved/file.js');
    expect(resolve.sync).toHaveBeenCalledTimes(1);
  });

  it('should not use the cache when disabled', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/to/resolved/file.js');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      useCache: false
    };

    // First call should use resolve.sync
    const result1 = resolveImport('./module', options);

    // Second call should also use resolve.sync
    const result2 = resolveImport('./module', options);

    expect(result1).toBe('/path/to/resolved/file.js');
    expect(result2).toBe('/path/to/resolved/file.js');
    expect(resolve.sync).toHaveBeenCalledTimes(2);
  });

  it('should handle errors and return the original path', () => {
    // Mock the resolve.sync function to throw an error
    resolve.sync = vi.fn().mockImplementation(() => {
      throw new Error('Module not found');
    });

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript'
    };

    const result = resolveImport('./module', options);

    expect(result).toBe('./module');
    expect(logger.debug).toHaveBeenCalled();
  });

  it('should use language-specific extensions', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/to/resolved/file.ts');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.ts',
      language: 'typescript'
    };

    const result = resolveImport('./module', options);

    expect(result).toBe('/path/to/resolved/file.ts');
    expect(resolve.sync).toHaveBeenCalledWith('./module', {
      basedir: path.dirname(options.fromFile),
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'],
      preserveSymlinks: false
    });
  });

  it('should use custom extensions when provided', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockReturnValue('/path/to/resolved/file.custom');

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript',
      extensions: ['.custom', '.js']
    };

    const result = resolveImport('./module', options);

    expect(result).toBe('/path/to/resolved/file.custom');
    expect(resolve.sync).toHaveBeenCalledWith('./module', {
      basedir: path.dirname(options.fromFile),
      extensions: ['.custom', '.js'],
      preserveSymlinks: false
    });
  });

  it('should manage cache size', () => {
    // Mock the resolve.sync function
    resolve.sync = vi.fn().mockImplementation((importPath: string) => {
      return `/path/to/resolved/${importPath}.js`;
    });

    const options = {
      projectRoot: '/path/to/project',
      fromFile: '/path/to/project/src/file.js',
      language: 'javascript'
    };

    // Add many entries to the cache
    for (let i = 0; i < 10001; i++) {
      resolveImport(`./module${i}`, options);
    }

    // Check that the cache size is limited
    expect(getImportCacheSize()).toBeLessThanOrEqual(10000);
  });
});
