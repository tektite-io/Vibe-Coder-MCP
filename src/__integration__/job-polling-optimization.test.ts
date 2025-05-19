/**
 * Cross-module integration tests for job status polling optimization
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jobManager, JobStatus } from '../services/job-manager/index.js';
import { sseNotifier } from '../services/sse-notifier/index.js';
import { formatBackgroundJobInitiationResponse } from '../services/job-response-formatter/index.js';
import { Response } from 'express';

// Mock the logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Define a type for our mock response with the additional property
type MockResponse = Partial<Response> & {
  _closeListener?: () => void
};

// Mock Express Response object
const createMockResponse = (): MockResponse => ({
  write: vi.fn(),
  flushHeaders: vi.fn(),
  on: vi.fn((event, listener) => {
    if (event === 'close') {
      mockResponse._closeListener = listener;
    }
    return mockResponse as Response;
  }),
  off: vi.fn(),
  writableEnded: false,
});

let mockResponse: MockResponse;

describe('Job Status Polling Optimization Integration', () => {
  const sessionId = 'test-session';
  const toolName = 'test-tool';
  const params = { input: 'test' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse = createMockResponse();

    // Clear connections before each test
    // Access the private connections map for testing purposes
    (sseNotifier as unknown as { connections: Map<string, Response> }).connections.clear();

    // Register a connection
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
  });

  afterEach(() => {
    // Unregister the connection
    sseNotifier.unregisterConnection(sessionId);
  });

  describe('Job Status Updates', () => {
    it('should update job status with progress percentage', () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Update job status with different progress values
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting', 10);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Finalizing', 90);
      jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'Completed', 100);

      // Get the job
      const job = jobManager.getJob(jobId);

      // Verify progress values
      expect(job).not.toBeNull();
      expect(job?.progressPercentage).toBe(100);
    });

    it('should send progress updates with percentage to SSE', () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Update job status with progress
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that SSE notifier was called with progress
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('"progress":50')
      );
    });
  });

  describe('Adaptive Polling Recommendations', () => {
    it('should provide adaptive polling recommendations based on job status', () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Format response for different job statuses
      const pendingResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job initiated');
      expect(pendingResponse.pollInterval).toBeGreaterThan(0);

      // Update job status to RUNNING
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);

      // Format response for RUNNING
      const inProgressResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job in progress');
      expect(inProgressResponse.pollInterval).toBeGreaterThan(0);

      // Update job status to COMPLETED
      jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'Completed', 100);

      // Format response for COMPLETED
      const completedResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job completed');
      expect(completedResponse.pollInterval).toBe(0);
    });

    it('should provide different polling recommendations for different transport types', () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Format response for stdio transport
      const stdioResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job initiated');
      expect(stdioResponse.pollInterval).toBeGreaterThan(0);

      // Format response for SSE transport
      const sseResponse = formatBackgroundJobInitiationResponse(jobId, 'sse', 'Job initiated');
      expect(sseResponse.pollInterval).toBe(0);
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to job status polling', async () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Get job with rate limit
      const result1 = await jobManager.getJobWithRateLimit(jobId);
      expect(result1.job).not.toBeNull();
      expect(result1.waitTime).toBeGreaterThanOrEqual(0);

      // Get job again immediately
      const result2 = await jobManager.getJobWithRateLimit(jobId);
      expect(result2.job).not.toBeNull();
      expect(result2.waitTime).toBeGreaterThan(0);
    });

    it('should adjust rate limiting based on job status', async () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Get job with rate limit (initial call to establish baseline)
      await jobManager.getJobWithRateLimit(jobId);

      // Update job status to RUNNING
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);

      // Get job again
      const result2 = await jobManager.getJobWithRateLimit(jobId);

      // Update job status to COMPLETED
      jobManager.updateJobStatus(jobId, JobStatus.COMPLETED, 'Completed', 100);

      // Get job again
      const result3 = await jobManager.getJobWithRateLimit(jobId);

      // Verify that rate limiting is adjusted based on job status
      expect(result3.waitTime).toBeLessThanOrEqual(result2.waitTime);
    });
  });

  describe('Transport-Specific Behavior', () => {
    it('should handle both stdio and SSE transport types', () => {
      // Create a job
      const jobId = jobManager.createJob(toolName, params);

      // Format response for stdio transport
      const stdioResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job initiated');
      expect(stdioResponse.pollInterval).toBeGreaterThan(0);

      // Format response for SSE transport
      const sseResponse = formatBackgroundJobInitiationResponse(jobId, 'sse', 'Job initiated');
      expect(sseResponse.pollInterval).toBe(0);

      // Update job status
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that SSE notifier was called
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
    });
  });
});
