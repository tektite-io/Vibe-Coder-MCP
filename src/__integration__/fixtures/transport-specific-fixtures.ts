/**
 * Fixtures for transport-specific integration tests
 */

import { JobStatus } from '../../services/job-manager/index.js';
import { vi } from 'vitest';

/**
 * Create a mock stdio transport context for testing
 * @param sessionId Session ID
 * @returns Mock stdio transport context
 */
export function createMockStdioContext(sessionId: string = 'stdio-session') {
  return {
    sessionId,
    transportType: 'stdio',
    timestamp: Date.now(),
  };
}

/**
 * Create a mock SSE transport context for testing
 * @param sessionId Session ID
 * @returns Mock SSE transport context
 */
export function createMockSseContext(sessionId: string = 'sse-session') {
  return {
    sessionId,
    transportType: 'sse',
    timestamp: Date.now(),
  };
}

/**
 * Create a mock stdio job status message for testing
 * @param jobId Job ID
 * @param status Job status
 * @param message Progress message
 * @param progress Progress percentage
 * @returns Mock stdio job status message
 */
export function createMockStdioJobStatusMessage(
  jobId: string,
  status: JobStatus = JobStatus.PENDING,
  message: string = 'Job created',
  progress: number = 0
) {
  const now = Date.now();
  
  return {
    jobId,
    status,
    message,
    progress,
    timestamp: now,
    createdAt: now - 1000,
    updatedAt: now,
    pollingRecommendation: {
      interval: 1000,
      nextCheckTime: now + 1000,
    },
  };
}

/**
 * Create a mock SSE job status message for testing
 * @param jobId Job ID
 * @param status Job status
 * @param message Progress message
 * @param progress Progress percentage
 * @returns Mock SSE job status message
 */
export function createMockSseJobStatusMessage(
  jobId: string,
  status: JobStatus = JobStatus.PENDING,
  message: string = 'Job created',
  progress: number = 0
) {
  const now = Date.now();
  
  return {
    jobId,
    status,
    message,
    progress,
    timestamp: now,
    createdAt: now - 1000,
    updatedAt: now,
    // No polling recommendation for SSE
  };
}

/**
 * Create a mock stdio job result for testing
 * @param jobId Job ID
 * @param isError Whether the result is an error
 * @param content Result content
 * @returns Mock stdio job result
 */
export function createMockStdioJobResult(
  jobId: string,
  isError: boolean = false,
  content: string = 'Job completed successfully'
) {
  return {
    jobId,
    result: {
      content: [{ type: 'text', text: content }],
      isError,
      errorDetails: isError ? {
        message: 'Error executing job',
        type: 'JobExecutionError',
      } : undefined,
    },
    pollInterval: 0,
  };
}

/**
 * Create a mock SSE job result for testing
 * @param jobId Job ID
 * @param isError Whether the result is an error
 * @param content Result content
 * @returns Mock SSE job result
 */
export function createMockSseJobResult(
  jobId: string,
  isError: boolean = false,
  content: string = 'Job completed successfully'
) {
  return {
    jobId,
    result: {
      content: [{ type: 'text', text: content }],
      isError,
      errorDetails: isError ? {
        message: 'Error executing job',
        type: 'JobExecutionError',
      } : undefined,
    },
    // No pollInterval for SSE
  };
}

/**
 * Create a mock stdio background job initiation response
 * @param jobId Job ID
 * @returns Mock stdio background job initiation response
 */
export function createMockStdioBackgroundJobResponse(jobId: string) {
  return {
    jobId,
    message: 'Job initiated',
    pollInterval: 1000,
  };
}

/**
 * Create a mock SSE background job initiation response
 * @param jobId Job ID
 * @returns Mock SSE background job initiation response
 */
export function createMockSseBackgroundJobResponse(jobId: string) {
  return {
    jobId,
    message: 'Job initiated',
    pollInterval: 0,
  };
}

/**
 * Create a mock stdio job polling sequence for testing
 * @param jobId Job ID
 * @returns Array of job polling responses
 */
export function createMockStdioJobPollingSequence(jobId: string) {
  const now = Date.now();
  
  return [
    {
      job: {
        id: jobId,
        status: JobStatus.PENDING,
        message: 'Job created',
        progress: 0,
        createdAt: now - 3000,
        updatedAt: now - 3000,
      },
      pollInterval: 1000,
      shouldWait: false,
    },
    {
      job: {
        id: jobId,
        status: JobStatus.RUNNING,
        message: 'Job started',
        progress: 10,
        createdAt: now - 3000,
        updatedAt: now - 2000,
      },
      pollInterval: 800,
      shouldWait: false,
    },
    {
      job: {
        id: jobId,
        status: JobStatus.RUNNING,
        message: 'Processing data',
        progress: 50,
        createdAt: now - 3000,
        updatedAt: now - 1000,
      },
      pollInterval: 500,
      shouldWait: false,
    },
    {
      job: {
        id: jobId,
        status: JobStatus.COMPLETED,
        message: 'Job completed',
        progress: 100,
        createdAt: now - 3000,
        updatedAt: now,
        result: {
          content: [{ type: 'text', text: 'Job completed successfully' }],
          isError: false,
        },
      },
      pollInterval: 0,
      shouldWait: false,
    },
  ];
}
