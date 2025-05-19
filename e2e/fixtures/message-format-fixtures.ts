/**
 * Fixtures for message format end-to-end tests
 */

import { JobStatus } from '../../src/services/job-manager/index.js';

/**
 * Create expected background job initiation response
 * @param jobId Job ID
 * @param transportType Transport type
 * @returns Expected background job initiation response
 */
export function createExpectedBackgroundJobInitiationResponse(jobId: string, transportType: 'stdio' | 'sse') {
  return {
    jobId,
    message: 'Job initiated',
    pollInterval: transportType === 'stdio' ? 1000 : 0,
  };
}

/**
 * Create expected job result response for pending job
 * @param jobId Job ID
 * @returns Expected job result response for pending job
 */
export function createExpectedPendingJobResponse(jobId: string) {
  return {
    job: {
      id: jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
    },
    pollInterval: 1000,
  };
}

/**
 * Create expected job result response for in-progress job
 * @param jobId Job ID
 * @param progress Progress percentage
 * @returns Expected job result response for in-progress job
 */
export function createExpectedInProgressJobResponse(jobId: string, progress: number) {
  return {
    job: {
      id: jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Processing',
      progress,
    },
    pollInterval: 1000,
  };
}

/**
 * Create expected job result response for completed job
 * @param jobId Job ID
 * @returns Expected job result response for completed job
 */
export function createExpectedCompletedJobResponse(jobId: string) {
  return {
    job: {
      id: jobId,
      status: JobStatus.COMPLETED,
      message: 'Completed',
      progress: 100,
      result: {
        content: [{ text: 'Success!' }],
        isError: false,
      },
    },
    pollInterval: 0,
  };
}

/**
 * Create expected job result response for error job
 * @param jobId Job ID
 * @returns Expected job result response for error job
 */
export function createExpectedErrorJobResponse(jobId: string) {
  return {
    job: {
      id: jobId,
      status: JobStatus.ERROR,
      message: 'Error',
      progress: 0,
      result: {
        content: [{ text: 'Error!' }],
        isError: true,
        errorDetails: {
          message: 'Error message',
          type: 'ErrorType',
        },
      },
    },
    pollInterval: 0,
  };
}

/**
 * Create expected SSE progress message
 * @param jobId Job ID
 * @param status Job status
 * @param message Job message
 * @param progress Progress percentage
 * @returns Expected SSE progress message
 */
export function createExpectedSseProgressMessage(jobId: string, status: string, message: string, progress: number) {
  return {
    event: 'progress',
    data: {
      jobId,
      status,
      message,
      progress,
    },
  };
}

/**
 * Create expected SSE result message
 * @param jobId Job ID
 * @param result Job result
 * @returns Expected SSE result message
 */
export function createExpectedSseResultMessage(jobId: string, result: any) {
  return {
    event: 'result',
    data: {
      jobId,
      result,
    },
  };
}
