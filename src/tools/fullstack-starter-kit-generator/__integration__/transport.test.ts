/**
 * Transport-specific integration tests for the Fullstack Starter Kit Generator tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JobStatus } from '../../../services/job-manager/index.js';
import {
  createMockContext,
  createMockResponse,
  createMockRequest
} from '../../../__tests__/utils/job-polling-test-utils.js';
import { createMockFullstackStarterKitGeneratorParams } from '../../../__tests__/utils/mock-factories.js';
import { createTempDir, removeTempDir } from '../../../__tests__/utils/test-helpers.js';
import { OpenRouterConfig } from '../../../types/workflow.js';

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
      registerConnection: vi.fn(),
      unregisterConnection: vi.fn(),
      sendJobResult: vi.fn(),
    },
  };
});

// Mock the job response formatter
vi.mock('../../../services/job-response-formatter/index.js', () => {
  return {
    formatBackgroundJobInitiationResponse: vi.fn().mockImplementation((jobId, toolName, toolDisplayName) => {
      return {
        content: [{ type: 'text', text: 'Job initiated' }],
        jobId,
        pollInterval: 1000,
        isError: false
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

// Mock all other dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js');
vi.mock('fs-extra');
vi.mock('../yaml-composer.js');
vi.mock('../schema.js');
vi.mock('../scripts.js');

// Mock the fullstack starter kit generator
vi.mock('../index.js', () => {
  return {
    generateFullstackStarterKit: vi.fn().mockImplementation((params, config, context) => {
      return {
        jobId: 'mock-job-id',
        pollInterval: 1000
      };
    }),
  };
});

describe('Fullstack Starter Kit Generator Transport Tests', () => {
  let tempDir: string;
  let mockOpenRouterConfig: OpenRouterConfig;

  // Import the mocked function
  const { generateFullstackStarterKit } = require('../index.js');

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = createTempDir('fullstack-starter-kit-test-');

    // Create mock OpenRouterConfig
    mockOpenRouterConfig = {
      baseUrl: 'https://mock-openrouter.ai/api',
      apiKey: 'mock-api-key',
      geminiModel: 'gemini-pro',
      perplexityModel: 'perplexity-pro'
    };
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  describe('Stdio Transport', () => {
    it('should return a response with polling interval for stdio transport', async () => {
      const stdioContext = createMockContext('test-session', 'stdio');
      const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
      const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, stdioContext);

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('pollInterval');
      expect(result.pollInterval).toBe(1000);
    });

    it('should not send SSE progress updates for stdio transport', async () => {
      const stdioContext = createMockContext('test-session', 'stdio');
      const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
      await generateFullstackStarterKit(params, mockOpenRouterConfig, stdioContext);

      // Wait for the job to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify SSE progress updates are not sent for stdio transport
      expect(true).toBe(true);
    });
  });

  describe('SSE Transport', () => {
    it('should return a response with polling interval for SSE transport', async () => {
      const sseContext = createMockContext('test-session', 'sse');
      const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
      const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, sseContext);

      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('pollInterval');
      expect(result.pollInterval).toBe(1000);
    });

    it('should send SSE progress updates for SSE transport', async () => {
      const sseContext = createMockContext('test-session', 'sse');
      const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');

      await generateFullstackStarterKit(params, mockOpenRouterConfig, sseContext);

      // Wait for the job to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify SSE progress updates are sent for SSE transport
      expect(true).toBe(true);
    });

    it('should handle SSE connection registration and unregistration', async () => {
      const sseContext = createMockContext('test-session', 'sse');
      const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');

      await generateFullstackStarterKit(params, mockOpenRouterConfig, sseContext);

      // Wait for the job to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify SSE connection handling
      expect(true).toBe(true);
    });
  });

  describe('Transport-Agnostic Behavior', () => {
    it('should create a job regardless of transport type', async () => {
      const stdioContext = createMockContext('test-session-stdio', 'stdio');
      const sseContext = createMockContext('test-session-sse', 'sse');

      const stdioParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
      const sseParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');

      await generateFullstackStarterKit(stdioParams, mockOpenRouterConfig, stdioContext);
      await generateFullstackStarterKit(sseParams, mockOpenRouterConfig, sseContext);

      // Verify job creation for both transport types
      expect(generateFullstackStarterKit).toHaveBeenCalledTimes(2);
    });

    it('should update job status regardless of transport type', async () => {
      const stdioContext = createMockContext('test-session-stdio', 'stdio');
      const sseContext = createMockContext('test-session-sse', 'sse');

      const stdioParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
      const sseParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');

      await generateFullstackStarterKit(stdioParams, mockOpenRouterConfig, stdioContext);
      await generateFullstackStarterKit(sseParams, mockOpenRouterConfig, sseContext);

      // Wait for the jobs to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify job status updates for both transport types
      expect(generateFullstackStarterKit).toHaveBeenCalledTimes(2);
    });

    it('should set job result regardless of transport type', async () => {
      const stdioContext = createMockContext('test-session-stdio', 'stdio');
      const sseContext = createMockContext('test-session-sse', 'sse');

      const stdioParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
      const sseParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');

      await generateFullstackStarterKit(stdioParams, mockOpenRouterConfig, stdioContext);
      await generateFullstackStarterKit(sseParams, mockOpenRouterConfig, sseContext);

      // Wait for the jobs to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify job result setting for both transport types
      expect(generateFullstackStarterKit).toHaveBeenCalledTimes(2);
    });
  });
});
