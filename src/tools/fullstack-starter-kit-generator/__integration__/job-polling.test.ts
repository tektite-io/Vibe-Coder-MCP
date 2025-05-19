/**
 * Job status polling integration tests for the Fullstack Starter Kit Generator tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateFullstackStarterKit } from '../index.js';
import { JobStatus } from '../../../services/job-manager/index.js';
import {
  createMockJobManager,
  createMockSseNotifier,
  createMockContext,
  wait
} from '../../../__tests__/utils/job-polling-test-utils.js';
import { createMockFullstackStarterKitGeneratorParams } from '../../../__tests__/utils/mock-factories.js';
import { createTempDir, removeTempDir, waitForCondition } from '../../../__tests__/utils/test-helpers.js';
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
      getJobWithRateLimit: vi.fn(),
      updateJobAccess: vi.fn(),
      getMinimumWaitTime: vi.fn(),
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

// Mock the job result retriever
vi.mock('../../../tools/job-result-retriever/index.js', () => {
  return {
    executeJobResultRetriever: vi.fn().mockImplementation(async (params, context) => {
      const jobId = params.parameters.jobId;
      const job = (global as any).jobManager._jobs.get(jobId);

      if (!job) {
        return {
          error: 'Job not found',
        };
      }

      return {
        job,
        pollInterval: job.status === JobStatus.COMPLETED ? 0 : 1000,
      };
    }),
  };
});

// Mock all other dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js');
vi.mock('fs-extra');
vi.mock('../yaml-composer.js');
vi.mock('../schema.js');
vi.mock('../scripts.js');

describe('Fullstack Starter Kit Generator Job Polling Tests', () => {
  let tempDir: string;
  let mockJobManager: ReturnType<typeof createMockJobManager>;
  let mockSseNotifier: ReturnType<typeof createMockSseNotifier>;
  let mockContext: ReturnType<typeof createMockContext>;
  let mockOpenRouterConfig: OpenRouterConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = createTempDir('fullstack-starter-kit-test-');
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
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should provide adaptive polling recommendations based on job status', async () => {
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    const jobId = result.jobId;

    // Simulate job status updates with different progress values
    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Initializing', 0);
    expect(mockJobManager.getMinimumWaitTime).toHaveBeenCalledWith(expect.objectContaining({ id: jobId }));

    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Researching tech stack', 20);
    expect(mockJobManager.getMinimumWaitTime).toHaveBeenCalledWith(expect.objectContaining({ id: jobId }));

    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Generating project structure', 50);
    expect(mockJobManager.getMinimumWaitTime).toHaveBeenCalledWith(expect.objectContaining({ id: jobId }));

    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Creating setup scripts', 80);
    expect(mockJobManager.getMinimumWaitTime).toHaveBeenCalledWith(expect.objectContaining({ id: jobId }));

    await mockJobManager.setJobResult(jobId as string, { isError: false, content: [{ text: 'Test result' }] });
    expect(mockJobManager.getMinimumWaitTime).toHaveBeenCalledWith(expect.objectContaining({ id: jobId }));
  });

  it('should update job status with progress percentage', async () => {
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    // Wait for the job to complete
    await wait(100);

    // Verify progress percentage updates
    const updateCalls = mockJobManager.updateJobStatus.mock.calls;

    // Find calls with different progress values
    const progressValues = updateCalls.map(call => call[3]);

    // Verify that progress values increase over time
    const sortedProgressValues = [...progressValues].sort((a, b) => (a || 0) - (b || 0));
    expect(progressValues).toEqual(sortedProgressValues);

    // Verify that the final progress value is 100
    const finalProgressValue = progressValues[progressValues.length - 1];
    expect(finalProgressValue).toBe(100);
  });

  it('should handle rate limiting for job status polling', async () => {
    // Mock getJobWithRateLimit to simulate rate limiting
    mockJobManager.getJobWithRateLimit = vi.fn().mockImplementation(async (jobId) => {
      const job = mockJobManager._jobs.get(jobId);

      if (!job) {
        return {
          job: null,
          waitTime: 0,
        };
      }

      // Simulate rate limiting based on job status
      let waitTime = 0;
      if (job.status === JobStatus.PENDING) {
        waitTime = 1000;
      } else if (job.status === JobStatus.RUNNING) {
        waitTime = 500;
      } else {
        waitTime = 0;
      }

      return {
        job,
        waitTime,
      };
    });

    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    // Simulate job status polling
    const jobId = result.jobId;

    // First poll - should get rate limited
    const poll1 = await mockJobManager.getJobWithRateLimit(jobId as string);
    expect(poll1.waitTime).toBe(1000);

    // Update job status to RUNNING
    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Processing', 50);

    // Second poll - should get rate limited with a different value
    const poll2 = await mockJobManager.getJobWithRateLimit(jobId as string);
    expect(poll2.waitTime).toBe(500);

    // Update job status to COMPLETED
    await mockJobManager.setJobResult(jobId as string, { isError: false, content: [{ text: 'Test result' }] });

    // Third poll - should not get rate limited
    const poll3 = await mockJobManager.getJobWithRateLimit(jobId as string);
    expect(poll3.waitTime).toBe(0);
  });

  it('should send progress updates with appropriate polling recommendations', async () => {
    // Mock formatBackgroundJobInitiationResponse to return different polling intervals
    const formatBackgroundJobInitiationResponse = vi.fn().mockImplementation((jobId, status, progress) => {
      let pollInterval = 1000;

      if (status === JobStatus.PENDING) {
        pollInterval = 1000;
      } else if (status === JobStatus.RUNNING) {
        if (progress < 50) {
          pollInterval = 800;
        } else if (progress < 80) {
          pollInterval = 500;
        } else {
          pollInterval = 200;
        }
      } else {
        pollInterval = 0;
      }

      return {
        jobId,
        message: 'Job status',
        pollInterval,
      };
    });

    (global as any).formatBackgroundJobInitiationResponse = formatBackgroundJobInitiationResponse;

    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    // Verify initial polling interval
    expect(result.pollInterval).toBe(1000);

    // Simulate job status updates with different progress values
    const jobId = result.jobId;

    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Initializing', 10);
    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Researching tech stack', 30);
    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Generating project structure', 60);
    await mockJobManager.updateJobStatus(jobId as string, JobStatus.RUNNING, 'Creating setup scripts', 90);
    await mockJobManager.setJobResult(jobId as string, { isError: false, content: [{ text: 'Test result' }] });

    // Verify that formatBackgroundJobInitiationResponse was called with different progress values
    expect(formatBackgroundJobInitiationResponse).toHaveBeenCalled();
  });
});
