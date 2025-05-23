/**
 * Tests for the ImportResolverFactory.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import { ImportResolverFactory } from '../../importResolvers/importResolverFactory.js';
import { DependencyCruiserAdapter } from '../../importResolvers/dependencyCruiserAdapter.js';
import { ExtendedPythonImportResolver } from '../../importResolvers/extendedPythonImportResolver.js';
import { ClangdAdapter } from '../../importResolvers/clangdAdapter.js';
import { SemgrepAdapter } from '../../importResolvers/semgrepAdapter.js';

// Mock the fs module
vi.mock('fs', () => ({
  statSync: vi.fn().mockReturnValue({
    isFile: () => true
  })
}));

// Mock the DependencyCruiserAdapter
vi.mock('../../importResolvers/dependencyCruiserAdapter.js', () => ({
  DependencyCruiserAdapter: vi.fn().mockImplementation(() => ({
    analyzeImports: vi.fn()
  }))
}));

// Mock the ExtendedPythonImportResolver
vi.mock('../../importResolvers/extendedPythonImportResolver.js', () => ({
  ExtendedPythonImportResolver: vi.fn().mockImplementation(() => ({
    analyzeImports: vi.fn()
  }))
}));

// Mock the ClangdAdapter
vi.mock('../../importResolvers/clangdAdapter.js', () => ({
  ClangdAdapter: vi.fn().mockImplementation(() => ({
    analyzeImports: vi.fn()
  }))
}));

// Mock the SemgrepAdapter
vi.mock('../../importResolvers/semgrepAdapter.js', () => ({
  SemgrepAdapter: vi.fn().mockImplementation(() => ({
    analyzeImports: vi.fn()
  }))
}));

describe('ImportResolverFactory', () => {
  const options = {
    allowedDir: '/test/allowed',
    outputDir: '/test/output',
    maxDepth: 3
  };

  let factory: ImportResolverFactory;

  beforeEach(() => {
    factory = new ImportResolverFactory(options);
    vi.mocked(DependencyCruiserAdapter).mockClear();
    vi.mocked(ExtendedPythonImportResolver).mockClear();
    vi.mocked(ClangdAdapter).mockClear();
    vi.mocked(SemgrepAdapter).mockClear();
  });

  it('should return a DependencyCruiserAdapter for JavaScript files', () => {
    const resolver = factory.getImportResolver('/test/file.js');

    expect(resolver).toBeDefined();
    expect(DependencyCruiserAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a DependencyCruiserAdapter for TypeScript files', () => {
    const resolver = factory.getImportResolver('/test/file.ts');

    expect(resolver).toBeDefined();
    expect(DependencyCruiserAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a DependencyCruiserAdapter for JSX files', () => {
    const resolver = factory.getImportResolver('/test/file.jsx');

    expect(resolver).toBeDefined();
    expect(DependencyCruiserAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a DependencyCruiserAdapter for TSX files', () => {
    const resolver = factory.getImportResolver('/test/file.tsx');

    expect(resolver).toBeDefined();
    expect(DependencyCruiserAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return an ExtendedPythonImportResolver for Python files', () => {
    const resolver = factory.getImportResolver('/test/file.py');

    expect(resolver).toBeDefined();
    expect(ExtendedPythonImportResolver).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return an ExtendedPythonImportResolver for Python wheel files', () => {
    const resolver = factory.getImportResolver('/test/file.pyw');

    expect(resolver).toBeDefined();
    expect(ExtendedPythonImportResolver).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a ClangdAdapter for C files', () => {
    const resolver = factory.getImportResolver('/test/file.c');

    expect(resolver).toBeDefined();
    expect(ClangdAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a ClangdAdapter for C++ files', () => {
    const resolver = factory.getImportResolver('/test/file.cpp');

    expect(resolver).toBeDefined();
    expect(ClangdAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a ClangdAdapter for C++ header files', () => {
    const resolver = factory.getImportResolver('/test/file.hpp');

    expect(resolver).toBeDefined();
    expect(ClangdAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
  });

  it('should return a SemgrepAdapter for unsupported file types when fallback is enabled', () => {
    const resolver = factory.getImportResolver('/test/file.rb');

    expect(resolver).toBeDefined();
    expect(SemgrepAdapter).toHaveBeenCalledWith(options.allowedDir, options.outputDir);
    expect(DependencyCruiserAdapter).not.toHaveBeenCalled();
    expect(ExtendedPythonImportResolver).not.toHaveBeenCalled();
    expect(ClangdAdapter).not.toHaveBeenCalled();
  });

  it('should return null for unsupported file types when fallback is disabled', () => {
    const factoryWithDisabledFallback = new ImportResolverFactory({
      ...options,
      disableSemgrepFallback: true
    });

    const resolver = factoryWithDisabledFallback.getImportResolver('/test/file.rb');

    expect(resolver).toBeNull();
    expect(SemgrepAdapter).not.toHaveBeenCalled();
    expect(DependencyCruiserAdapter).not.toHaveBeenCalled();
    expect(ExtendedPythonImportResolver).not.toHaveBeenCalled();
    expect(ClangdAdapter).not.toHaveBeenCalled();
  });

  it('should reuse the same DependencyCruiserAdapter instance', () => {
    const resolver1 = factory.getImportResolver('/test/file.js');
    const resolver2 = factory.getImportResolver('/test/file.ts');

    expect(resolver1).toBe(resolver2);
    expect(DependencyCruiserAdapter).toHaveBeenCalledTimes(1);
  });

  it('should reuse the same ExtendedPythonImportResolver instance', () => {
    const resolver1 = factory.getImportResolver('/test/file.py');
    const resolver2 = factory.getImportResolver('/test/file.pyw');

    expect(resolver1).toBe(resolver2);
    expect(ExtendedPythonImportResolver).toHaveBeenCalledTimes(1);
  });

  it('should reuse the same ClangdAdapter instance', () => {
    const resolver1 = factory.getImportResolver('/test/file.cpp');
    const resolver2 = factory.getImportResolver('/test/file.h');

    expect(resolver1).toBe(resolver2);
    expect(ClangdAdapter).toHaveBeenCalledTimes(1);
  });

  it('should reuse the same SemgrepAdapter instance', () => {
    const resolver1 = factory.getImportResolver('/test/file.rb');
    const resolver2 = factory.getImportResolver('/test/file.php');

    expect(resolver1).toBe(resolver2);
    expect(SemgrepAdapter).toHaveBeenCalledTimes(1);
  });
});
