/**
 * Integration tests for the Code Map Generator tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { codeMapExecutor, clearCodeMapCaches, getCodeMapCacheSizes } from '../index.js';
import { JobStatus } from '../../../services/job-manager/index.js';
import {
  createMockJobManager,
  createMockSseNotifier,
  createMockContext
} from '../../../__tests__/utils/job-polling-test-utils.js';
import { createMockCodeMapGeneratorParams } from '../../../__tests__/utils/mock-factories.js';
import { createTempDir, removeTempDir, createTempProject } from '../../../__tests__/utils/test-helpers.js';
// fs and path are used by the imported test helpers
import { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';

// Mock the job manager and SSE notifier
vi.mock('../../../services/job-manager/index.js', () => {
  return {
    JobStatus: {
      PENDING: 'pending',
      RUNNING: 'running',
      COMPLETED: 'completed',
      FAILED: 'failed',
    },
    jobManager: {
      createJob: vi.fn(),
      updateJobStatus: vi.fn(),
      setJobResult: vi.fn(),
    },
  };
});

vi.mock('../../../services/sse-notifier/index.js', () => {
  return {
    sseNotifier: {
      sendProgress: vi.fn(),
    },
  };
});

// Mock the job response formatter
vi.mock('../../../services/job-response-formatter/index.js', () => {
  return {
    formatBackgroundJobInitiationResponse: vi.fn().mockImplementation((jobId) => {
      return {
        jobId,
        message: 'Job initiated',
        pollInterval: 1000,
      };
    }),
  };
});

// Mock the logger
vi.mock('../../../logger.js', () => {
  return {
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

describe('Code Map Generator Integration Tests', () => {
  let tempDir: string;
  let mockJobManager: ReturnType<typeof createMockJobManager>;
  let mockSseNotifier: ReturnType<typeof createMockSseNotifier>;
  let mockContext: ReturnType<typeof createMockContext>;
  let mockOpenRouterConfig: OpenRouterConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    // Clear caches before each test to prevent memory leaks
    clearCodeMapCaches();

    tempDir = createTempDir('code-map-test-');
    mockJobManager = createMockJobManager();
    mockSseNotifier = createMockSseNotifier();
    mockContext = createMockContext('test-session', 'stdio');

    // Replace the mocked implementations with our mock objects
    (global as any).jobManager = mockJobManager;
    (global as any).sseNotifier = mockSseNotifier;

    // Create mock OpenRouterConfig
    mockOpenRouterConfig = {
      baseUrl: 'https://mock-openrouter.ai/api',
      apiKey: 'mock-api-key',
      geminiModel: 'gemini-pro',
      perplexityModel: 'perplexity-pro'
    };

    // Log initial cache sizes for debugging
    logger.debug(`Initial cache sizes: ${JSON.stringify(getCodeMapCacheSizes())}`);
  });

  afterEach(() => {
    // Clean up temporary directory
    removeTempDir(tempDir);

    // Clear caches after each test to prevent memory leaks
    clearCodeMapCaches();

    // Log final cache sizes for debugging
    logger.debug(`Final cache sizes after cleanup: ${JSON.stringify(getCodeMapCacheSizes())}`);

    // Clear mock job manager's jobs map
    mockJobManager._jobs.clear();
  });

  it('should create a job and return an immediate response', async () => {
    const params = createMockCodeMapGeneratorParams(tempDir);
    const result = await codeMapExecutor(params, mockOpenRouterConfig, mockContext);

    expect(result).toHaveProperty('jobId');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('pollInterval');
    expect(mockJobManager.createJob).toHaveBeenCalled();
  });

  it('should process a simple project and update job status', async () => {
    // Create a simple project structure
    const files = new Map<string, string>([
      ['index.js', 'const utils = require("./utils");\n\nfunction main() {\n  utils.helper();\n}\n\nmain();'],
      ['utils.js', 'function helper() {\n  console.log("Helper function");\n}\n\nmodule.exports = { helper };'],
    ]);
    const projectDir = createTempProject(files, tempDir);

    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    await codeMapExecutor(params, mockOpenRouterConfig, mockContext);

    // Wait for the job to complete (in a real test, we would use a more robust approach)
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify job status updates
    expect(mockJobManager.updateJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      JobStatus.RUNNING,
      expect.stringContaining('Scanning files'),
      expect.any(Number)
    );

    // Verify job result
    expect(mockJobManager.setJobResult).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        markdown: expect.stringContaining('Code Map for project'),
      })
    );

    // Verify SSE progress updates
    expect(mockSseNotifier.sendProgress).toHaveBeenCalled();
  });

  it('should handle both stdio and SSE transport types', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('test-session', 'stdio');
    const stdioParams = createMockCodeMapGeneratorParams(tempDir);
    const stdioResult = await codeMapExecutor(stdioParams, mockOpenRouterConfig, stdioContext);

    expect(stdioResult).toHaveProperty('jobId');

    // Test with SSE transport
    const sseContext = createMockContext('test-session', 'sse');
    const sseParams = createMockCodeMapGeneratorParams(tempDir);
    const sseResult = await codeMapExecutor(sseParams, mockOpenRouterConfig, sseContext);

    expect(sseResult).toHaveProperty('jobId');

    // Wait for the jobs to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify SSE progress updates for SSE transport
    const sseProgressCalls = mockSseNotifier.sendProgress.mock.calls.filter(
      call => call[0] === 'test-session'
    );
    expect(sseProgressCalls.length).toBeGreaterThan(0);
  });

  it('should handle errors gracefully', async () => {
    // Create a mock implementation that throws an error
    const originalUpdateJobStatus = mockJobManager.updateJobStatus;
    mockJobManager.updateJobStatus = vi.fn().mockImplementation((jobId, status, message, progress) => {
      if (message.includes('Scanning files')) {
        throw new Error('Simulated error');
      }
      return originalUpdateJobStatus(jobId, status, message, progress);
    });

    const params = createMockCodeMapGeneratorParams(tempDir);
    await codeMapExecutor(params, mockOpenRouterConfig, mockContext);

    // Wait for the job to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify error handling
    expect(mockJobManager.updateJobStatus).toHaveBeenCalledWith(
      expect.any(String),
      JobStatus.FAILED,
      expect.stringContaining('Error'),
      expect.any(Number)
    );
  });
});
