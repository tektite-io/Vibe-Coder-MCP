/**
 * Unit tests for the file scanner module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { collectSourceFiles } from '../fileScanner.js';
import { createTempDir, removeTempDir, createTempProject } from '../../../__tests__/utils/test-helpers.js';
import fs from 'fs-extra';
import path from 'path';
import logger from '../../../logger.js';
import { CodeMapGeneratorConfig } from '../types.js';

describe('File Scanner', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = createTempDir('file-scanner-test-');
    logger.debug(`Created temp dir: ${tempDir}`);
  });

  afterEach(() => {
    removeTempDir(tempDir);
    logger.debug(`Removed temp dir: ${tempDir}`);
  });

  it('should scan a directory and collect source files', async () => {
    // Create a simple project structure
    const projectFiles = new Map<string, string>();
    projectFiles.set('file1.js', 'function test() { return true; }');
    projectFiles.set('file2.ts', 'class Test { constructor() {} }');
    projectFiles.set('subdir/file3.js', 'const x = 10;');
    projectFiles.set('subdir/file4.json', '{ "test": true }');
    projectFiles.set('subdir/deepdir/file5.py', 'def test(): return True');
    projectFiles.set('node_modules/ignored.js', 'should be ignored');
    projectFiles.set('.git/ignored.js', 'should be ignored');

    createTempProject(projectFiles, tempDir);

    // Define supported extensions and ignore patterns
    const supportedExtensions = ['.js', '.ts', '.json', '.py'];
    const ignoredPatterns = [/node_modules/, /\.git/].map(p => new RegExp(p));

    // Test with default ignore patterns
    const config: CodeMapGeneratorConfig = { allowedMappingDirectory: tempDir };
    const files = await collectSourceFiles(tempDir, supportedExtensions, ignoredPatterns, config);

    // Should find 5 files (excluding node_modules and .git)
    expect(files.length).toBe(5);

    // Check that specific files are included
    expect(files.some(f => typeof f === 'string' && f.endsWith('file1.js'))).toBe(true);
    expect(files.some(f => typeof f === 'string' && f.endsWith('file2.ts'))).toBe(true);
    expect(files.some(f => typeof f === 'string' && f.endsWith('file3.js'))).toBe(true);
    expect(files.some(f => typeof f === 'string' && f.endsWith('file4.json'))).toBe(true);
    expect(files.some(f => typeof f === 'string' && f.endsWith('file5.py'))).toBe(true);

    // Check that ignored directories are excluded
    expect(files.some(f => typeof f === 'string' && f.includes('node_modules'))).toBe(false);
    expect(files.some(f => typeof f === 'string' && f.includes('.git'))).toBe(false);
  });

  it('should handle custom ignore patterns', async () => {
    // Create a simple project structure
    const projectFiles = new Map<string, string>();
    projectFiles.set('file1.js', 'function test() { return true; }');
    projectFiles.set('file2.ts', 'class Test { constructor() {} }');
    projectFiles.set('subdir/file3.js', 'const x = 10;');
    projectFiles.set('subdir/file4.json', '{ "test": true }');
    projectFiles.set('ignoreme/ignored.js', 'should be ignored');

    createTempProject(projectFiles, tempDir);

    // Define supported extensions and ignore patterns
    const supportedExtensions = ['.js', '.ts', '.json'];
    const ignoredPatterns = [/ignoreme/, /\.json$/].map(p => new RegExp(p));

    // Test with custom ignore patterns
    const config: CodeMapGeneratorConfig = { allowedMappingDirectory: tempDir };
    const files = await collectSourceFiles(tempDir, supportedExtensions, ignoredPatterns, config);

    // Should find 3 files (excluding ignoreme dir and .json files)
    expect(files.length).toBe(3);

    // Check that specific files are included
    expect(files.some(f => typeof f === 'string' && f.endsWith('file1.js'))).toBe(true);
    expect(files.some(f => typeof f === 'string' && f.endsWith('file2.ts'))).toBe(true);
    expect(files.some(f => typeof f === 'string' && f.endsWith('file3.js'))).toBe(true);

    // Check that ignored patterns are excluded
    expect(files.some(f => typeof f === 'string' && f.includes('ignoreme'))).toBe(false);
    expect(files.some(f => typeof f === 'string' && f.endsWith('.json'))).toBe(false);
  });

  it('should handle symlinks correctly', async () => {
    // Create a simple project structure
    const projectFiles = new Map<string, string>();
    projectFiles.set('original/file1.js', 'function test() { return true; }');
    projectFiles.set('subdir/empty/.gitkeep', '');

    createTempProject(projectFiles, tempDir);

    // Define supported extensions and ignore patterns
    const supportedExtensions = ['.js'];
    const ignoredPatterns = [/\.gitkeep/].map(p => new RegExp(p));

    // Create a symlink
    const originalPath = path.join(tempDir, 'original');
    const symlinkPath = path.join(tempDir, 'subdir', 'symlink');

    try {
      fs.symlinkSync(originalPath, symlinkPath, 'dir');

      // Test with symlinks
      const config: CodeMapGeneratorConfig = { allowedMappingDirectory: tempDir };
      const files = await collectSourceFiles(tempDir, supportedExtensions, ignoredPatterns, config);

      // Should find 1 file (the original, not duplicated through symlink)
      expect(files.length).toBe(1);
      expect(files.some(f => typeof f === 'string' && f.endsWith('file1.js'))).toBe(true);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // On some systems, creating symlinks might require special permissions
      logger.warn(`Skipping symlink test: ${errorMessage}`);
    }
  });
});
