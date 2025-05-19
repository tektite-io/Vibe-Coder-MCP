/**
 * Fixtures for job polling optimization integration tests
 */

import { JobStatus } from '../../services/job-manager/index.js';
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
      pollInterval: 800,
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
 * Create a mock job result for testing
 * @param jobId Job ID
 * @returns Mock job result
 */
export function createMockJobResult(jobId: string) {
  return {
    jobId,
    result: {
      content: [{ text: 'Job completed successfully' }],
      isError: false,
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
    result: {
      content: [{ text: 'An error occurred' }],
      isError: true,
      errorDetails: {
        message: 'Error message',
        type: 'ErrorType',
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
 * Create a mock tool for testing
 * @param name Tool name
 * @param isAsync Whether the tool is asynchronous
 * @returns Mock tool
 */
export function createMockTool(name: string, isAsync: boolean = false) {
  return {
    name,
    description: `Mock ${isAsync ? 'asynchronous' : 'synchronous'} tool`,
    execute: vi.fn().mockImplementation((_params: Record<string, unknown>, _config: Record<string, unknown>, _context: Record<string, unknown>) => {
      if (isAsync) {
        return {
          jobId: 'mock-job-id',
          message: `${name} execution started`,
          pollInterval: 1000,
        };
      } else {
        return {
          content: [{ text: `${name} executed successfully` }],
          isError: false,
        };
      }
    }),
    isAsync,
  };
}

/**
 * Create a mock workflow definition for testing
 * @param name Workflow name
 * @returns Mock workflow definition
 */
export function createMockWorkflowDefinition(name: string) {
  return {
    name,
    description: `Mock workflow ${name}`,
    steps: [
      {
        id: 'step1',
        tool: 'mock-tool',
        params: {
          param1: 'value1',
        },
      },
    ],
  };
}
