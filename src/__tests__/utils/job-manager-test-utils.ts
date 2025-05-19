/**
 * Utilities for testing job manager and SSE notifier
 */

import { vi } from 'vitest';
import { JobStatus } from '../../services/job-manager/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create a mock job
 * @param id Job ID
 * @param status Job status
 * @param message Job message
 * @param progress Job progress
 * @param result Job result
 * @returns Mock job
 */
export function createMockJob(
  id: string,
  status: JobStatus = JobStatus.PENDING,
  message: string = 'Job created',
  progress: number = 0,
  result: CallToolResult | null = null
) {
  return {
    id,
    toolName: 'test-tool',
    params: {},
    status,
    message,
    progress,
    result,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
}

/**
 * Create a mock job manager
 * @returns Mock job manager
 */
export function createMockJobManager() {
  const jobs = new Map<string, ReturnType<typeof createMockJob>>();

  return {
    createJob: vi.fn((toolName: string, params: Record<string, unknown>) => {
      const id = `job-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const job = createMockJob(id);
      job.toolName = toolName;
      job.params = params;
      jobs.set(id, job);
      return id;
    }),

    getJob: vi.fn((id: string) => {
      return jobs.get(id) || null;
    }),

    getJobWithRateLimit: vi.fn(async (id: string) => {
      const job = jobs.get(id);

      if (job) {
        job.lastAccessedAt = Date.now();

        return {
          job,
          waitTime: job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED ? 0 : 1000,
        };
      }

      return {
        job: null,
        waitTime: 0,
      };
    }),

    updateJobStatus: vi.fn((id: string, status: JobStatus, message: string, progress: number = 0) => {
      const job = jobs.get(id);

      if (job) {
        job.status = status;
        job.message = message;
        job.progress = progress;
        job.updatedAt = Date.now();
        return true;
      }

      return false;
    }),

    setJobResult: vi.fn((id: string, result: CallToolResult) => {
      const job = jobs.get(id);

      if (job) {
        job.result = result;
        job.status = result.isError ? JobStatus.FAILED : JobStatus.COMPLETED;
        job.progress = result.isError ? job.progress : 100;
        job.updatedAt = Date.now();
        return true;
      }

      return false;
    }),

    updateJobAccess: vi.fn((id: string) => {
      const job = jobs.get(id);

      if (job) {
        job.lastAccessedAt = Date.now();
        return true;
      }

      return false;
    }),

    getMinimumWaitTime: vi.fn((job: ReturnType<typeof createMockJob>) => {
      if (!job) return 0;

      if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
        return 0;
      }

      // Calculate wait time based on progress
      if (job.progress < 25) {
        return 2000;
      } else if (job.progress < 50) {
        return 1500;
      } else if (job.progress < 75) {
        return 1000;
      } else {
        return 500;
      }
    }),

    // Utility methods for testing
    _jobs: jobs,

    _reset: () => {
      jobs.clear();
    },

    _addJob: (job: ReturnType<typeof createMockJob>) => {
      jobs.set(job.id, job);
    },

    _removeJob: (id: string) => {
      jobs.delete(id);
    },
  };
}

/**
 * Create a mock SSE notifier
 * @returns Mock SSE notifier
 */
// Define types for SSE connections and messages
type SseResponse = {
  write: (message: string) => void;
  on?: (event: string, listener: () => void) => void;
  writableEnded?: boolean;
};

type SseMessage = {
  type: string;
  data: Record<string, unknown>;
};

export function createMockSseNotifier() {
  const connections = new Map<string, SseResponse>();
  const messages = new Map<string, SseMessage[]>();

  return {
    registerConnection: vi.fn((sessionId: string, res: SseResponse) => {
      connections.set(sessionId, res);
      messages.set(sessionId, []);

      // Add close event listener
      if (res.on && typeof res.on === 'function') {
        res.on('close', () => {
          connections.delete(sessionId);
          messages.delete(sessionId);
        });
      }

      return true;
    }),

    unregisterConnection: vi.fn((sessionId: string) => {
      connections.delete(sessionId);
      messages.delete(sessionId);
      return true;
    }),

    sendProgress: vi.fn((sessionId: string, jobId: string, status: JobStatus, message: string, progress: number = 0) => {
      const res = connections.get(sessionId);

      if (res && !res.writableEnded) {
        const data = {
          jobId,
          status,
          message,
          progress,
        };

        const sseMessage = `event: progress\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(sseMessage);

        // Store message for testing
        const sessionMessages = messages.get(sessionId) || [];
        sessionMessages.push({
          type: 'progress',
          data,
        });
        messages.set(sessionId, sessionMessages);

        return true;
      }

      return false;
    }),

    sendJobResult: vi.fn((sessionId: string, jobId: string, result: CallToolResult) => {
      const res = connections.get(sessionId);

      if (res && !res.writableEnded) {
        const data = {
          jobId,
          result,
        };

        const sseMessage = `event: result\ndata: ${JSON.stringify(data)}\n\n`;
        res.write(sseMessage);

        // Store message for testing
        const sessionMessages = messages.get(sessionId) || [];
        sessionMessages.push({
          type: 'result',
          data,
        });
        messages.set(sessionId, sessionMessages);

        return true;
      }

      return false;
    }),

    // Utility methods for testing
    _connections: connections,
    _messages: messages,

    _reset: () => {
      connections.clear();
      messages.clear();
    },

    _getMessages: (sessionId: string) => {
      return messages.get(sessionId) || [];
    },

    _hasConnection: (sessionId: string) => {
      return connections.has(sessionId);
    },
  };
}

/**
 * Mock job manager and SSE notifier
 * @param mockJobManager Mock job manager
 * @param mockSseNotifier Mock SSE notifier
 */
export function mockJobManagerAndSseNotifier(
  mockJobManager: ReturnType<typeof createMockJobManager>,
  mockSseNotifier: ReturnType<typeof createMockSseNotifier>
) {
  vi.mock('../../services/job-manager/index.js', () => ({
    jobManager: mockJobManager,
    JobStatus,
  }));

  vi.mock('../../services/sse-notifier/index.js', () => ({
    sseNotifier: mockSseNotifier,
  }));
}

/**
 * Restore job manager and SSE notifier
 */
export function restoreJobManagerAndSseNotifier() {
  vi.unmock('../../services/job-manager/index.js');
  vi.unmock('../../services/sse-notifier/index.js');
}
