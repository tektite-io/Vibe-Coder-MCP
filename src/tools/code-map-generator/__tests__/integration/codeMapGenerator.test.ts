import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import os from 'os';
import { executeCodeMapGeneration } from '../../index.js';
import { createMockConfig } from '../testHelpers.js';

// Define JobStatus enum for testing
enum JobStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

// Mock dependencies
vi.mock('../../../../jobManager.js', () => ({
  JobStatus,
  jobManager: {
    updateJobStatus: vi.fn(),
    setJobResult: vi.fn(),
  },
}));

vi.mock('../../../../sseNotifier.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn(),
  },
}));

vi.mock('../../parser.js', () => {
  const originalModule = vi.importActual('../../parser.js');
  return {
    ...originalModule,
    initializeParser: vi.fn(),
    initializeCaches: vi.fn(),
    clearCaches: vi.fn(),
  };
});

describe('Code Map Generator Integration Tests', () => {
  let tempDir: string;
  let projectDir: string;
  let cacheDir: string;
  let outputDir: string;

  beforeAll(async () => {
    // Create temporary directories for testing
    tempDir = path.join(os.tmpdir(), `code-map-test-${Date.now()}`);
    projectDir = path.join(tempDir, 'project');
    cacheDir = path.join(tempDir, 'cache');
    outputDir = path.join(tempDir, 'output');

    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Create some test files
    await fs.writeFile(
      path.join(projectDir, 'test.js'),
      'function hello() { console.log("Hello, world!"); }'
    );

    await fs.writeFile(
      path.join(projectDir, 'test.ts'),
      'class TestClass { constructor() {} }'
    );

    // Create a subdirectory with files
    await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, 'src', 'index.js'),
      'import { hello } from "./hello"; hello();'
    );

    await fs.writeFile(
      path.join(projectDir, 'src', 'hello.js'),
      'export function hello() { console.log("Hello from module!"); }'
    );
  });

  afterAll(async () => {
    // Clean up temporary directories
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should process a simple project with file-based caching', async () => {
    // Arrange
    const params = {};
    const config = createMockConfig({
      tools: {
        'map-codebase': {
          allowedMappingDirectory: projectDir,
          cache: {
            enabled: true,
            cacheDir: cacheDir,
          },
          output: {
            outputDir: outputDir,
          },
        },
      },
    });
    const context = { sessionId: 'test-session' };
    const jobId = 'test-job';

    // Act
    const result = await executeCodeMapGeneration(params, config, context, jobId);

    // Assert
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('Codebase Overview');

    // Check if output files were created
    const outputFiles = await fs.readdir(outputDir);
    expect(outputFiles.length).toBeGreaterThan(0);

    // Check if cache files were created
    const cacheFiles = await fs.readdir(cacheDir);
    expect(cacheFiles.length).toBeGreaterThan(0);
  });

  it('should handle invalid configuration', async () => {
    // Arrange
    const params = {};
    const config = createMockConfig({
      tools: {
        'map-codebase': {
          // Missing allowedMappingDirectory
        },
      },
    });
    const context = { sessionId: 'test-session' };
    const jobId = 'test-job';

    // Act
    const result = await executeCodeMapGeneration(params, config, context, jobId);

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Configuration error');
  });

  it('should handle non-existent directory', async () => {
    // Arrange
    const params = {};
    const config = createMockConfig({
      tools: {
        'map-codebase': {
          allowedMappingDirectory: path.join(tempDir, 'nonexistent'),
        },
      },
    });
    const context = { sessionId: 'test-session' };
    const jobId = 'test-job';

    // Act
    const result = await executeCodeMapGeneration(params, config, context, jobId);

    // Assert
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cannot access allowed mapping directory');
  });

  it('should respect ignored file patterns', async () => {
    // Arrange
    const params = {
      ignored_files_patterns: ['test\\.ts$'],
    };
    const config = createMockConfig({
      tools: {
        'map-codebase': {
          allowedMappingDirectory: projectDir,
          cache: {
            enabled: true,
            cacheDir: cacheDir,
          },
          output: {
            outputDir: outputDir,
          },
        },
      },
    });
    const context = { sessionId: 'test-session' };
    const jobId = 'test-job-ignored';

    // Act
    const result = await executeCodeMapGeneration(params, config, context, jobId);

    // Assert
    expect(result.isError).toBe(false);
    expect(result.content[0].text).not.toContain('test.ts');
    expect(result.content[0].text).toContain('test.js');
  });

  it('should handle empty directories', async () => {
    // Arrange
    const emptyDir = path.join(tempDir, 'empty');
    await fs.mkdir(emptyDir, { recursive: true });

    const params = {};
    const config = createMockConfig({
      tools: {
        'map-codebase': {
          allowedMappingDirectory: emptyDir,
        },
      },
    });
    const context = { sessionId: 'test-session' };
    const jobId = 'test-job-empty';

    // Act
    const result = await executeCodeMapGeneration(params, config, context, jobId);

    // Assert
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('No supported source files found');
  });
});
