/**
 * Fixtures for job status polling end-to-end tests
 */

import { JobStatus } from '../../src/services/job-manager';

/**
 * Create a mock tool request for testing
 * @param toolName Tool name
 * @param parameters Tool parameters
 * @param sessionId Session ID
 * @returns Mock tool request
 */
export function createMockToolRequest(
  toolName: string,
  parameters: any = {},
  sessionId: string = 'test-session'
) {
  return {
    name: toolName,
    parameters,
    headers: {
      'x-session-id': sessionId,
    },
  };
}

/**
 * Create a mock job result request for testing
 * @param jobId Job ID
 * @param sessionId Session ID
 * @returns Mock job result request
 */
export function createMockJobResultRequest(
  jobId: string,
  sessionId: string = 'test-session'
) {
  return createMockToolRequest('get-job-result', { jobId }, sessionId);
}

/**
 * Create expected job status updates for testing
 * @param jobId Job ID
 * @returns Expected job status updates
 */
export function createExpectedJobStatusUpdates(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Job started',
      progress: 10,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Processing data',
      progress: 30,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Generating output',
      progress: 70,
      pollInterval: 500,
    },
    {
      jobId,
      status: JobStatus.COMPLETED,
      message: 'Job completed',
      progress: 100,
      pollInterval: 0,
    },
  ];
}

/**
 * Create expected job error updates for testing
 * @param jobId Job ID
 * @returns Expected job error updates
 */
export function createExpectedJobErrorUpdates(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Job started',
      progress: 10,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.FAILED,
      message: 'An error occurred',
      progress: 10,
      pollInterval: 0,
    },
  ];
}

/**
 * Create a mock server response for testing
 * @returns Mock server response
 */
export function createMockServerResponse() {
  const headers: Record<string, string> = {};
  const body: any = {};

  return {
    status: vi.fn().mockReturnThis(),
    set: vi.fn((key: string, value: string) => {
      headers[key] = value;
      return this;
    }),
    json: vi.fn((data: any) => {
      Object.assign(body, data);
      return this;
    }),
    send: vi.fn((data: any) => {
      if (typeof data === 'object') {
        Object.assign(body, data);
      } else {
        body.data = data;
      }
      return this;
    }),
    _headers: headers,
    _body: body,
  };
}
