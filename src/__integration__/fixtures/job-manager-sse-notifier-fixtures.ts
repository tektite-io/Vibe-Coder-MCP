/**
 * Fixtures for job manager and SSE notifier integration tests
 */

import { JobStatus } from '../../services/job-manager/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { vi } from 'vitest';

/**
 * Create a job update sequence for testing
 * @param jobId Job ID
 * @returns Array of job updates
 */
export function createJobUpdateSequence(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Job started',
      progress: 10,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Processing data',
      progress: 30,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Generating output',
      progress: 70,
    },
    {
      jobId,
      status: JobStatus.COMPLETED,
      message: 'Job completed',
      progress: 100,
    },
  ];
}

/**
 * Create a job error sequence for testing
 * @param jobId Job ID
 * @returns Array of job updates
 */
export function createJobErrorSequence(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Job started',
      progress: 10,
    },
    {
      jobId,
      status: JobStatus.FAILED,
      message: 'An error occurred',
      progress: 10,
    },
  ];
}

/**
 * Create a mock job result for testing
 * @param jobId Job ID
 * @returns Mock job result
 */
export function createMockJobResult(jobId: string) {
  return {
    jobId,
    result: {
      message: 'Job completed successfully',
      data: {
        id: jobId,
        timestamp: Date.now(),
        value: 'test-value',
      },
    },
  };
}

/**
 * Create a mock job error result for testing
 * @param jobId Job ID
 * @returns Mock job error result
 */
export function createMockJobErrorResult(jobId: string) {
  return {
    jobId,
    error: {
      message: 'An error occurred',
      code: 'ERROR_CODE',
      details: {
        id: jobId,
        timestamp: Date.now(),
      },
    },
  };
}

/**
 * Create a mock SSE message for testing
 * @param data Message data
 * @returns Mock SSE message
 */
export function createMockSseMessage(data: Record<string, unknown>) {
  return `data: ${JSON.stringify(data)}\n\n`;
}

/**
 * Create a mock SSE response for testing
 * @returns Mock SSE response
 */
export function createMockSseResponse() {
  const messages: string[] = [];

  return {
    writeHead: vi.fn(),
    write: vi.fn((message: string) => {
      messages.push(message);
    }),
    end: vi.fn(),
    _messages: messages,
    _getLastMessage: () => {
      return messages[messages.length - 1];
    },
    _getAllMessages: () => {
      return messages;
    },
  };
}

/**
 * Create a mock SSE connection for testing
 * @param sessionId Session ID
 * @returns Mock SSE connection
 */
export function createMockSseConnection(sessionId: string = 'test-session') {
  return {
    sessionId,
    response: createMockSseResponse(),
    connected: true,
    timestamp: Date.now(),
  };
}

/**
 * Create a mock SSE notifier for testing
 * @returns Mock SSE notifier
 */
// Define a type for SSE connections
type SseConnection = {
  sessionId: string;
  response: ReturnType<typeof createMockSseResponse>;
  connected?: boolean;
  timestamp?: number;
};

export function createMockSseNotifier() {
  const connections = new Map<string, SseConnection>();

  return {
    registerConnection: vi.fn().mockImplementation((sessionId, response) => {
      connections.set(sessionId, { sessionId, response });
    }),
    unregisterConnection: vi.fn().mockImplementation((sessionId) => {
      connections.delete(sessionId);
    }),
    sendProgress: vi.fn(),
    sendMessage: vi.fn(),
    closeAllConnections: vi.fn(),
    _connections: connections,
    _hasConnection: (sessionId: string) => connections.has(sessionId),
    _getConnection: (sessionId: string) => connections.get(sessionId),
  };
}

/**
 * Create a mock job manager for testing
 * @returns Mock job manager
 */
// Define a type for job objects
type Job = {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  progressMessage: string;
  result?: CallToolResult;
  progress?: number;
};

export function createMockJobManager() {
  const jobs = new Map<string, Job>();

  return {
    createJob: vi.fn().mockImplementation((toolName, params) => {
      const jobId = `job-${Date.now()}`;
      jobs.set(jobId, {
        id: jobId,
        toolName,
        params,
        status: JobStatus.PENDING,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progressMessage: 'Job created',
      });
      return jobId;
    }),
    getJob: vi.fn().mockImplementation((jobId) => {
      return jobs.get(jobId);
    }),
    getJobWithRateLimit: vi.fn().mockImplementation((jobId) => {
      return {
        job: jobs.get(jobId),
        waitTime: 0,
        shouldWait: false,
      };
    }),
    updateJobStatus: vi.fn().mockImplementation((jobId, status, progressMessage) => {
      const job = jobs.get(jobId);
      if (job) {
        job.status = status;
        job.progressMessage = progressMessage;
        job.updatedAt = Date.now();
      }
      return !!job;
    }),
    setJobResult: vi.fn().mockImplementation((jobId, result: CallToolResult) => {
      const job = jobs.get(jobId);
      if (job) {
        job.result = result;
        job.status = result.isError ? JobStatus.FAILED : JobStatus.COMPLETED;
        job.updatedAt = Date.now();
      }
      return !!job;
    }),
    updateJobAccess: vi.fn(),
    getMinimumWaitTime: vi.fn().mockReturnValue(0),
    _jobs: jobs,
  };
}

/**
 * Create a mock job status message for testing
 * @param jobId Job ID
 * @param status Job status
 * @param message Progress message
 * @param progress Progress percentage
 * @param pollInterval Poll interval
 * @returns Mock job status message
 */
export function createMockJobStatusMessage(
  jobId: string,
  status: JobStatus = JobStatus.PENDING,
  message: string = 'Job created',
  progress: number = 0,
  pollInterval: number = 1000
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
      interval: pollInterval,
      nextCheckTime: now + pollInterval,
    },
  };
}
