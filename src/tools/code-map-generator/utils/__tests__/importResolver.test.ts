/**
 * Tests for the import resolver with absolute paths.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveImport } from '../importResolver.no-cache.js';
import * as path from 'path';
import * as fs from 'fs';

// Mock fs and path
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn()
}));

describe('Import Resolver with Absolute Paths', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  
  it('should resolve relative imports with absolute paths', () => {
    // Arrange
    const currentFilePath = '/project/src/components/Button.js';
    const importPath = '../utils/helpers';
    const resolvedRelativePath = '../utils/helpers.js';
    const resolvedAbsolutePath = '/project/src/utils/helpers.js';
    
    // Mock fs.existsSync to return true for the resolved path
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === resolvedAbsolutePath;
    });
    
    // Act
    const result = resolveImport(importPath, currentFilePath, {
      includeAbsolutePath: true,
      allowedMappingDirectory: '/project'
    });
    
    // Assert
    expect(result).toEqual({
      resolvedPath: resolvedRelativePath,
      absolutePath: resolvedAbsolutePath,
      success: true
    });
    expect(fs.existsSync).toHaveBeenCalledWith(resolvedAbsolutePath);
  });
  
  it('should resolve absolute imports with absolute paths', () => {
    // Arrange
    const currentFilePath = '/project/src/components/Button.js';
    const importPath = '@/utils/helpers';
    const resolvedRelativePath = '../../utils/helpers.js';
    const resolvedAbsolutePath = '/project/src/utils/helpers.js';
    
    // Mock fs.existsSync to return true for the resolved path
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === resolvedAbsolutePath;
    });
    
    // Act
    const result = resolveImport(importPath, currentFilePath, {
      includeAbsolutePath: true,
      allowedMappingDirectory: '/project',
      aliases: {
        '@': '/project/src'
      }
    });
    
    // Assert
    expect(result).toEqual({
      resolvedPath: resolvedRelativePath,
      absolutePath: resolvedAbsolutePath,
      success: true
    });
    expect(fs.existsSync).toHaveBeenCalledWith(resolvedAbsolutePath);
  });
  
  it('should respect security boundaries when resolving absolute paths', () => {
    // Arrange
    const currentFilePath = '/project/src/components/Button.js';
    const importPath = '../../secrets/config';
    const resolvedRelativePath = '../../secrets/config.js';
    const resolvedAbsolutePath = '/project/secrets/config.js';
    
    // Mock fs.existsSync to return true for the resolved path
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === resolvedAbsolutePath;
    });
    
    // Act
    const result = resolveImport(importPath, currentFilePath, {
      includeAbsolutePath: true,
      allowedMappingDirectory: '/project/src', // Only allow access to /project/src
      expandSecurityBoundary: false
    });
    
    // Assert
    expect(result).toEqual({
      resolvedPath: resolvedRelativePath,
      absolutePath: undefined, // Should be undefined because it's outside the security boundary
      success: true
    });
  });
  
  it('should expand security boundaries when allowed', () => {
    // Arrange
    const currentFilePath = '/project/src/components/Button.js';
    const importPath = '../../secrets/config';
    const resolvedRelativePath = '../../secrets/config.js';
    const resolvedAbsolutePath = '/project/secrets/config.js';
    
    // Mock fs.existsSync to return true for the resolved path
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === resolvedAbsolutePath;
    });
    
    // Act
    const result = resolveImport(importPath, currentFilePath, {
      includeAbsolutePath: true,
      allowedMappingDirectory: '/project/src',
      expandSecurityBoundary: true // Allow expansion
    });
    
    // Assert
    expect(result).toEqual({
      resolvedPath: resolvedRelativePath,
      absolutePath: resolvedAbsolutePath, // Should include the absolute path
      success: true
    });
  });
  
  it('should sanitize absolute paths', () => {
    // Arrange
    const currentFilePath = '/home/user/project/src/components/Button.js';
    const importPath = '../utils/helpers';
    const resolvedRelativePath = '../utils/helpers.js';
    const resolvedAbsolutePath = '/home/user/project/src/utils/helpers.js';
    
    // Mock fs.existsSync to return true for the resolved path
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      return filePath === resolvedAbsolutePath;
    });
    
    // Act
    const result = resolveImport(importPath, currentFilePath, {
      includeAbsolutePath: true,
      allowedMappingDirectory: '/home/user/project',
      sanitizeAbsolutePath: true
    });
    
    // Assert
    expect(result).toEqual({
      resolvedPath: resolvedRelativePath,
      absolutePath: '/home/user/project/src/utils/helpers.js', // Should be sanitized
      success: true
    });
  });
});
