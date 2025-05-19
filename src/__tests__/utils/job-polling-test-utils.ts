/**
 * Utilities for testing job status polling
 */

import { JobStatus } from '../../services/job-manager/index.js';
import { vi, Mock } from 'vitest';

/**
 * Create a mock job for testing
 * @param id Job ID
 * @param status Job status
 * @param message Job message
 * @param result Job result
 * @returns Mock job object
 */
export function createMockJob(
  id: string,
  status: JobStatus = JobStatus.PENDING,
  message: string = 'Job created',
  result: Record<string, unknown> | null = null
) {
  return {
    id,
    toolName: 'test-tool',
    params: {
      use_case: 'Test use case',
      tech_stack_preferences: {
        frontend: 'React',
        backend: 'Node.js'
      }
    },
    status,
    progressMessage: message,
    result,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
    progress: 0,
  };
}

/**
 * Create a mock job manager for testing
 * @returns Mock job manager object
 */
export function createMockJobManager() {
  const jobs = new Map<string, ReturnType<typeof createMockJob>>();

  return {
    createJob: vi.fn((toolName: string, params: Record<string, unknown>) => {
      const id = `job-${Date.now()}`;
      const job = createMockJob(id);
      job.toolName = toolName;
      job.params = params as {
        use_case: string;
        tech_stack_preferences: {
          frontend: string;
          backend: string;
        }
      };
      jobs.set(id, job);
      return id;
    }),
    getJob: vi.fn((id: string) => {
      return jobs.get(id) || null;
    }),
    updateJobStatus: vi.fn((id: string, status: JobStatus, message: string, progress: number = 0) => {
      const job = jobs.get(id);
      if (job) {
        job.status = status;
        job.progressMessage = message;
        job.progress = progress;
        job.updatedAt = Date.now();
        return job;
      }
      return null;
    }),
    setJobResult: vi.fn((id: string, result: Record<string, unknown>) => {
      const job = jobs.get(id);
      if (job) {
        job.result = result;
        job.status = JobStatus.COMPLETED;
        job.updatedAt = Date.now();
        return job;
      }
      return null;
    }),
    getJobWithRateLimit: vi.fn((id: string) => {
      const job = jobs.get(id);
      if (job) {
        job.lastAccessedAt = Date.now();
        return {
          job,
          waitTime: 0,
          shouldWait: false
        };
      }
      return {
        job: undefined,
        waitTime: 0,
        shouldWait: false
      };
    }),
    updateJobAccess: vi.fn((id: string) => {
      const job = jobs.get(id);
      if (job) {
        job.lastAccessedAt = Date.now();
      }
    }),
    getMinimumWaitTime: vi.fn((_job: ReturnType<typeof createMockJob> | null) => {
      return 0;
    }),
    _jobs: jobs,
  };
}

/**
 * Create a mock SSE notifier for testing
 * @returns Mock SSE notifier object
 */
// Define a type for SSE response objects
type SseResponse = {
  write: (message: string) => void;
  end?: () => void;
  writableEnded?: boolean;
};

export function createMockSseNotifier() {
  const connections = new Map<string, SseResponse>();

  return {
    registerConnection: vi.fn((sessionId: string, res: SseResponse) => {
      connections.set(sessionId, res);
    }),
    unregisterConnection: vi.fn((sessionId: string) => {
      connections.delete(sessionId);
    }),
    sendProgress: vi.fn((sessionId: string, jobId: string, status: string, message: string, progress: number = 0) => {
      const res = connections.get(sessionId);
      if (res) {
        res.write(`data: ${JSON.stringify({ jobId, status, message, progress })}\n\n`);
      }
    }),
    sendJobResult: vi.fn((sessionId: string, jobId: string, result: Record<string, unknown>) => {
      const res = connections.get(sessionId);
      if (res) {
        res.write(`data: ${JSON.stringify({ jobId, result })}\n\n`);
      }
    }),
    _connections: connections,
  };
}

/**
 * Create a mock context object for testing
 * @param sessionId Session ID
 * @param transportType Transport type (stdio or sse)
 * @returns Mock context object
 */
export function createMockContext(sessionId: string = 'test-session', transportType: 'stdio' | 'sse' = 'stdio') {
  return {
    sessionId,
    transportType,
  };
}

/**
 * Wait for a specified time
 * @param ms Time to wait in milliseconds
 * @returns Promise that resolves after the specified time
 */
export function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a mock response object for testing
 * @returns Mock response object
 */
// Define a type for mock HTTP response objects
type MockHttpResponse = {
  write: Mock;
  end: Mock;
  status: Mock;
  json: Mock;
  headers: Record<string, string>;
  set: Mock;
};

export function createMockResponse(): MockHttpResponse {
  const res = {
    write: vi.fn(),
    end: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    headers: {} as Record<string, string>,
    set: vi.fn((key: string, value: string) => {
      if (res.headers) {
        res.headers[key] = value;
      }
      return res;
    }),
  };
  return res;
}

/**
 * Create a mock request object for testing
 * @param sessionId Session ID
 * @param body Request body
 * @returns Mock request object
 */
export function createMockRequest(sessionId: string = 'test-session', body: Record<string, unknown> = {}) {
  return {
    headers: {
      'x-session-id': sessionId,
    },
    body,
  };
}
