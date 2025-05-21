/**
 * Tests for the ImportResolverManager class.
 */

import { ImportResolverManager } from '../ImportResolverManager.js';
import * as importResolver from '../importResolver.js';
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import the modules to mock
import logger from '../../../../logger.js';

// Mock the importResolver module
vi.mock('../importResolver.js');
vi.mock('../../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

describe('ImportResolverManager', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset the singleton instance
    // @ts-ignore - Accessing private property for testing
    ImportResolverManager.instance = undefined;
  });
  
  it('should be a singleton', () => {
    const instance1 = ImportResolverManager.getInstance();
    const instance2 = ImportResolverManager.getInstance();
    
    expect(instance1).toBe(instance2);
  });
  
  it('should initialize with the given configuration', () => {
    const manager = ImportResolverManager.getInstance();
    const config = {
      enabled: true,
      useCache: true,
      extensions: {
        javascript: ['.js', '.json']
      }
    };
    
    manager.initialize(config);
    
    expect(manager.isEnabled()).toBe(true);
    expect(manager.getConfig()).toEqual(config);
    expect(logger.debug).toHaveBeenCalled();
  });
  
  it('should not resolve imports when disabled', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({ enabled: false });
    
    const result = manager.resolveImport(
      './module',
      '/path/to/file.js',
      'javascript',
      '/path/to/project'
    );
    
    expect(result).toBe('./module');
    expect(importResolver.resolveImport).not.toHaveBeenCalled();
  });
  
  it('should not resolve "unknown" imports', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({ enabled: true });
    
    const result = manager.resolveImport(
      'unknown',
      '/path/to/file.js',
      'javascript',
      '/path/to/project'
    );
    
    expect(result).toBe('unknown');
    expect(importResolver.resolveImport).not.toHaveBeenCalled();
  });
  
  it('should resolve imports when enabled', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({ 
      enabled: true,
      extensions: {
        javascript: ['.js', '.json']
      }
    });
    
    // Mock the resolveImport function
    vi.mocked(importResolver.resolveImport).mockReturnValue('/path/to/resolved/module.js');
    
    const result = manager.resolveImport(
      './module',
      '/path/to/file.js',
      'javascript',
      '/path/to/project'
    );
    
    expect(result).toBe('/path/to/resolved/module.js');
    expect(importResolver.resolveImport).toHaveBeenCalledWith(
      './module',
      {
        projectRoot: '/path/to/project',
        fromFile: '/path/to/file.js',
        language: 'javascript',
        useCache: true,
        extensions: ['.js', '.json']
      }
    );
  });
  
  it('should handle errors during resolution', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({ enabled: true });
    
    // Mock the resolveImport function to throw an error
    vi.mocked(importResolver.resolveImport).mockImplementation(() => {
      throw new Error('Resolution error');
    });
    
    const result = manager.resolveImport(
      './module',
      '/path/to/file.js',
      'javascript',
      '/path/to/project'
    );
    
    expect(result).toBe('./module');
    expect(logger.warn).toHaveBeenCalled();
  });
  
  it('should clear the cache', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({ enabled: true });
    
    manager.clearCache();
    
    expect(importResolver.clearImportCache).toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalled();
  });
  
  it('should get the cache size', () => {
    const manager = ImportResolverManager.getInstance();
    manager.initialize({ enabled: true });
    
    // Mock the getImportCacheSize function
    vi.mocked(importResolver.getImportCacheSize).mockReturnValue(42);
    
    const size = manager.getCacheSize();
    
    expect(size).toBe(42);
    expect(importResolver.getImportCacheSize).toHaveBeenCalled();
  });
});
