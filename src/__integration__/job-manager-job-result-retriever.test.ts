/**
 * Cross-module integration tests for job manager and job result retriever
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jobManager, JobStatus } from '../services/job-manager/index.js';
import { getJobResult } from '../tools/job-result-retriever/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

// Mock the job manager
vi.mock('../services/job-manager/index.js', () => {
  const mockJobs = new Map();

  return {
    jobManager: {
      createJob: vi.fn((toolName, params) => {
        const jobId = `job-${Date.now()}`;
        mockJobs.set(jobId, {
          id: jobId,
          toolName,
          params,
          status: 'pending',
          message: 'Job created',
          progress: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastAccessedAt: new Date(),
        });
        return jobId;
      }),
      getJob: vi.fn((jobId) => {
        return mockJobs.get(jobId) || null;
      }),
      getJobWithRateLimit: vi.fn(async (jobId) => {
        const job = mockJobs.get(jobId) || null;
        if (job) {
          job.lastAccessedAt = new Date();
          return {
            job,
            waitTime: job.status === 'completed' ? 0 : 1000,
            shouldWait: false
          };
        }
        return {
          job: null,
          waitTime: 0,
          shouldWait: false
        };
      }),
      updateJobStatus: vi.fn((jobId, status, message, progress = 0) => {
        const job = mockJobs.get(jobId);
        if (job) {
          job.status = status;
          job.message = message;
          job.progress = progress;
          job.updatedAt = new Date();
          return true;
        }
        return false;
      }),
      setJobResult: vi.fn((jobId, result) => {
        const job = mockJobs.get(jobId);
        if (job) {
          job.status = 'completed';
          job.result = result;
          job.updatedAt = new Date();
          return true;
        }
        return false;
      }),
      updateJobAccess: vi.fn((jobId) => {
        const job = mockJobs.get(jobId);
        if (job) {
          job.lastAccessedAt = new Date();
        }
      }),
      _mockJobs: mockJobs,
    },
    JobStatus: {
      PENDING: 'pending',
      RUNNING: 'running',
      COMPLETED: 'completed',
      FAILED: 'failed',
    },
  };
});

// Mock the logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Job Manager and Job Result Retriever Integration', () => {
  const mockContext = { sessionId: 'test-session' };
  const mockConfig = {
    baseUrl: 'https://mock-openrouter.ai/api',
    apiKey: 'mock-api-key',
    geminiModel: 'gemini-pro',
    perplexityModel: 'perplexity-pro'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (jobManager as unknown as { _mockJobs: Map<string, unknown> })._mockJobs.clear();
  });

  it('should retrieve a pending job', async () => {
    // Create a job
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });

    // Retrieve the job
    const params = { jobId };
    const result = await getJobResult(params, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('job');
    expect(result.job).toHaveProperty('id', jobId);
    expect(result.job).toHaveProperty('status', JobStatus.PENDING);
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBeGreaterThan(0);

    // Verify that updateJobAccess was called
    expect(jobManager.updateJobAccess).toHaveBeenCalledWith(jobId);
  });

  it('should retrieve an in-progress job', async () => {
    // Create a job
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);

    // Retrieve the job
    const params = { jobId };
    const result = await getJobResult(params, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('job');
    expect(result.job).toHaveProperty('id', jobId);
    expect(result.job).toHaveProperty('status', JobStatus.RUNNING);
    expect(result.job).toHaveProperty('progress', 50);
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBeGreaterThan(0);
  });

  it('should retrieve a completed job', async () => {
    // Create a job
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });

    // Set job result
    const jobResult: CallToolResult = {
      content: [{ type: 'text', text: 'Success!' }],
      isError: false,
    };
    jobManager.setJobResult(jobId, jobResult);

    // Retrieve the job
    const params = { jobId };
    const result = await getJobResult(params, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('job');
    expect(result.job).toHaveProperty('id', jobId);
    expect(result.job).toHaveProperty('status', JobStatus.COMPLETED);
    expect(result.job).toHaveProperty('result');
    expect((result.job as any).result).toEqual(jobResult);
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBe(0);
  });

  it('should handle non-existent jobs', async () => {
    // Retrieve a non-existent job
    const params = { jobId: 'non-existent-job' };
    const result = await getJobResult(params, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('error');
    expect(result.error).toContain('not found');
  });

  it('should handle rate limiting', async () => {
    // Create a job
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });

    // Mock getJobWithRateLimit to simulate rate limiting
    vi.mocked(jobManager.getJobWithRateLimit).mockResolvedValueOnce({
      job: {
        id: jobId,
        status: JobStatus.RUNNING,
        progressPercentage: 50,
        progressMessage: 'Processing',
        toolName: 'test-tool',
        params: { param1: 'value1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any,
      waitTime: 2000,
      shouldWait: true
    });

    // Retrieve the job
    const params = { jobId };
    const result = await getJobResult(params, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('job');
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBe(2000);
  });

  it('should provide adaptive polling recommendations based on job status', async () => {
    // Create a job
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });

    // Retrieve the job (pending)
    const params = { jobId };
    const pendingResult = await getJobResult(params, mockConfig, mockContext);

    // Verify the polling interval for pending job
    expect(pendingResult.pollInterval).toBeGreaterThan(0);

    // Update job status to in-progress
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);

    // Mock getJobWithRateLimit to return a different wait time
    vi.mocked(jobManager.getJobWithRateLimit).mockResolvedValueOnce({
      job: {
        id: jobId,
        status: JobStatus.RUNNING,
        progressPercentage: 50,
        progressMessage: 'Processing',
        toolName: 'test-tool',
        params: { param1: 'value1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      } as any,
      waitTime: 500,
      shouldWait: false
    });

    // Retrieve the job (in-progress)
    const inProgressResult = await getJobResult(params, mockConfig, mockContext);

    // Verify the polling interval for in-progress job
    expect(inProgressResult.pollInterval).toBe(500);

    // Set job result
    jobManager.setJobResult(jobId, { content: [{ type: 'text', text: 'Success!' }], isError: false });

    // Mock getJobWithRateLimit to return zero wait time
    vi.mocked(jobManager.getJobWithRateLimit).mockResolvedValueOnce({
      job: {
        id: jobId,
        status: JobStatus.COMPLETED,
        progressPercentage: 100,
        progressMessage: 'Completed',
        toolName: 'test-tool',
        params: { param1: 'value1' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        result: { content: [{ type: 'text', text: 'Success!' }], isError: false },
      } as any,
      waitTime: 0,
      shouldWait: false
    });

    // Retrieve the job (completed)
    const completedResult = await getJobResult(params, mockConfig, mockContext);

    // Verify the polling interval for completed job
    expect(completedResult.pollInterval).toBe(0);
  });
});
