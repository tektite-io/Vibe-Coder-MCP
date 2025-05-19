/**
 * Integration tests for the Job Manager and SSE Notifier services
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jobManager, JobStatus } from '../index.js';
import { sseNotifier } from '../../sse-notifier/index.js';
import { Response } from 'express';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../../logger.js';

// Mock the logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock Express Response object
const createMockResponse = (): Partial<Response> => ({
  write: vi.fn(),
  flushHeaders: vi.fn(),
  on: vi.fn((event, listener) => {
    if (event === 'close') {
      (mockResponse as any)._closeListener = listener;
    }
    return mockResponse as Response;
  }),
  off: vi.fn(),
  writableEnded: false,
});

let mockResponse: Partial<Response> & { _closeListener?: () => void };

describe('Job Manager and SSE Notifier Integration', () => {
  const sessionId = 'test-session';
  const toolName = 'test-tool';
  const params = { input: 'test' };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse = createMockResponse();

    // Clear connections before each test
    (sseNotifier as any).connections.clear();

    // Register a connection
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
  });

  afterEach(() => {
    // Unregister the connection
    sseNotifier.unregisterConnection(sessionId);
  });

  it('should send progress updates to SSE when job status is updated', () => {
    // Create a job
    const jobId = jobManager.createJob(toolName, params);

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job is now running', 50);

    // Verify that SSE notifier was called
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining('event: progress')
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId)
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(JobStatus.RUNNING)
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining('Job is now running')
    );
  });

  it('should send job result to SSE when job result is set', () => {
    // Create a job
    const jobId = jobManager.createJob(toolName, params);

    // Set job result
    const result: CallToolResult = {
      content: [{ type: 'text', text: 'Success!' }],
      isError: false,
    };
    jobManager.setJobResult(jobId, result);

    // Verify that SSE notifier was called
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining('event: progress')
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId)
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(JobStatus.COMPLETED)
    );
  });

  it('should send error result to SSE when job fails', () => {
    // Create a job
    const jobId = jobManager.createJob(toolName, params);

    // Set error result
    const errorResult: CallToolResult = {
      content: [{ type: 'text', text: 'Error!' }],
      isError: true,
      errorDetails: { type: 'TestError', message: 'Test error' },
    };
    jobManager.setJobResult(jobId, errorResult);

    // Verify that SSE notifier was called
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining('event: progress')
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId)
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(JobStatus.FAILED)
    );
  });

  it('should not send progress updates to SSE if session is not registered', () => {
    // Unregister the connection
    sseNotifier.unregisterConnection(sessionId);

    // Create a job
    const jobId = jobManager.createJob(toolName, params);

    // Update job status
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job is now running', 50);

    // Verify that SSE notifier was not called
    expect(mockResponse.write).not.toHaveBeenCalledWith(
      expect.stringContaining('event: progress')
    );
  });

  it('should handle multiple jobs and sessions correctly', () => {
    // Create a second mock response
    const mockResponse2 = createMockResponse();
    const sessionId2 = 'test-session-2';

    // Register a second connection
    sseNotifier.registerConnection(sessionId2, mockResponse2 as Response);

    // Create two jobs
    const jobId1 = jobManager.createJob(toolName, params);
    const jobId2 = jobManager.createJob(toolName, params);

    // Update job statuses
    jobManager.updateJobStatus(jobId1, JobStatus.RUNNING, 'Job 1 is running', 50);
    jobManager.updateJobStatus(jobId2, JobStatus.RUNNING, 'Job 2 is running', 50);

    // Verify that both responses received updates
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId1)
    );
    expect(mockResponse.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId2)
    );
    expect(mockResponse2.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId1)
    );
    expect(mockResponse2.write).toHaveBeenCalledWith(
      expect.stringContaining(jobId2)
    );

    // Unregister the second connection
    sseNotifier.unregisterConnection(sessionId2);
  });
});
