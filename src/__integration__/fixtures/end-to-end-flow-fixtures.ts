/**
 * Fixtures for end-to-end flow integration tests
 */

import { JobStatus } from '../../services/job-manager/index.js';
import { vi } from 'vitest';

/**
 * Create a mock HTTP request for testing
 * @param toolName Tool name
 * @param params Tool parameters
 * @param sessionId Session ID
 * @param transportType Transport type
 * @returns Mock HTTP request
 */
export function createMockRequest(
  toolName: string,
  params: Record<string, unknown> = {},
  sessionId: string = 'test-session',
  transportType: 'stdio' | 'sse' = 'stdio'
) {
  return {
    body: {
      name: toolName,
      parameters: params,
    },
    headers: {
      'x-session-id': sessionId,
      'x-transport-type': transportType,
    },
    query: {},
    params: {},
  };
}

/**
 * Create a mock HTTP response for testing
 * @returns Mock HTTP response
 */
export function createMockResponse() {
  const response: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    writeHead: vi.fn().mockReturnThis(),
    write: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    getHeader: vi.fn(),
    _status: 200,
    _json: {},
    _headers: {},
  };

  response.status.mockImplementation((code: number) => {
    response._status = code;
    return response;
  });

  response.json.mockImplementation((data: unknown) => {
    response._json = data;
    return response;
  });

  response.send.mockImplementation((data: unknown) => {
    response._data = data;
    return response;
  });

  response.setHeader.mockImplementation((name: string, value: string) => {
    response._headers[name] = value;
    return response;
  });

  response.getHeader.mockImplementation((name: string) => {
    return response._headers[name];
  });

  return response;
}

/**
 * Create a mock SSE client for testing
 * @param sessionId Session ID
 * @returns Mock SSE client
 */
export function createMockSseClient(sessionId: string = 'test-session') {
  const events: any[] = [];

  return {
    addEventListener: vi.fn().mockImplementation((event, callback) => {
      events.push({ event, callback });
    }),
    removeEventListener: vi.fn(),
    close: vi.fn(),
    _events: events,
    _triggerEvent: (event: string, data: any) => {
      const eventObj = events.find(e => e.event === event);
      if (eventObj) {
        eventObj.callback({ data: JSON.stringify(data) });
      }
    },
    sessionId,
  };
}

/**
 * Create a mock job status sequence for testing
 * @param jobId Job ID
 * @param transportType Transport type
 * @returns Array of job status updates
 */
export function createMockJobStatusSequence(
  jobId: string,
  transportType: 'stdio' | 'sse' = 'stdio'
) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: transportType === 'stdio' ? 1000 : 0,
      timestamp: Date.now(),
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Job started',
      progress: 10,
      pollInterval: transportType === 'stdio' ? 800 : 0,
      timestamp: Date.now() + 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Processing data',
      progress: 50,
      pollInterval: transportType === 'stdio' ? 500 : 0,
      timestamp: Date.now() + 2000,
    },
    {
      jobId,
      status: JobStatus.COMPLETED,
      message: 'Job completed',
      progress: 100,
      pollInterval: 0,
      timestamp: Date.now() + 3000,
    },
  ];
}

/**
 * Create a mock job error sequence for testing
 * @param jobId Job ID
 * @param transportType Transport type
 * @returns Array of job status updates
 */
export function createMockJobErrorSequence(
  jobId: string,
  transportType: 'stdio' | 'sse' = 'stdio'
) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: transportType === 'stdio' ? 1000 : 0,
      timestamp: Date.now(),
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Job started',
      progress: 10,
      pollInterval: transportType === 'stdio' ? 800 : 0,
      timestamp: Date.now() + 1000,
    },
    {
      jobId,
      status: JobStatus.FAILED,
      message: 'Job failed',
      progress: 10,
      pollInterval: 0,
      timestamp: Date.now() + 2000,
    },
  ];
}

/**
 * Create a mock file system for testing
 * @returns Mock file system
 */
export function createMockFileSystem() {
  const files = new Map<string, string>();

  return {
    readFile: vi.fn().mockImplementation((path) => {
      if (files.has(path)) {
        return Promise.resolve(files.get(path));
      }
      return Promise.reject(new Error(`File not found: ${path}`));
    }),
    writeFile: vi.fn().mockImplementation((path, content) => {
      files.set(path, content);
      return Promise.resolve();
    }),
    exists: vi.fn().mockImplementation((path) => {
      return Promise.resolve(files.has(path));
    }),
    mkdir: vi.fn().mockResolvedValue(undefined),
    _files: files,
    _addFile: (path: string, content: string) => {
      files.set(path, content);
    },
  };
}
