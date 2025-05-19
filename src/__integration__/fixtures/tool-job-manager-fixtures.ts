/**
 * Fixtures for tool and job manager integration tests
 */

import { JobStatus } from '../../services/job-manager/index.js';
import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { vi } from 'vitest';

/**
 * Create a mock tool execution context for testing
 * @param sessionId Session ID
 * @param transportType Transport type (stdio or sse)
 * @returns Mock tool execution context
 */
export function createMockToolExecutionContext(
  sessionId: string = 'test-session',
  transportType: 'stdio' | 'sse' = 'stdio'
): ToolExecutionContext {
  return {
    sessionId,
    transportType,
    timestamp: Date.now(),
  };
}

/**
 * Create mock tool parameters for testing
 * @param toolName Tool name
 * @param params Custom parameters
 * @returns Mock tool parameters
 */
export function createMockToolParameters(
  toolName: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  // Default parameters for different tools
  const defaultParams: Record<string, Record<string, unknown>> = {
    'map-codebase': {
      targetDirectory: './src',
      includePatterns: ['**/*.ts', '**/*.js'],
      excludePatterns: ['**/node_modules/**', '**/build/**'],
      maxDepth: 3,
      generateDiagrams: true,
    },
    'get-job-result': {
      jobId: 'mock-job-id',
    },
    'research': {
      query: 'test query',
    },
    'generate-task-list': {
      projectName: 'Test Project',
      description: 'A test project',
      features: ['Feature 1', 'Feature 2'],
    },
    'fullstack-starter-kit-generator': {
      projectName: 'test-project',
      description: 'A test project',
      techStack: 'react-node',
      outputDirectory: './output',
    },
    'workflow-runner': {
      workflowName: 'test-workflow',
      inputs: {},
    },
  };

  // Return default parameters for the tool or empty object if not found
  return {
    ...defaultParams[toolName] || {},
    ...params,
  };
}

/**
 * Create a mock job for testing
 * @param toolName Tool name
 * @param params Tool parameters
 * @param status Job status
 * @returns Mock job
 */
export function createMockJob(
  toolName: string,
  params: Record<string, unknown> = {},
  status: JobStatus = JobStatus.PENDING
) {
  const now = Date.now();
  return {
    id: 'mock-job-id',
    toolName,
    params: createMockToolParameters(toolName, params),
    status,
    createdAt: now,
    updatedAt: now,
    progressMessage: status === JobStatus.PENDING ? 'Job created' : 'Job in progress',
    accessCount: 0,
    lastAccessTime: now,
  };
}

/**
 * Create a mock tool result for testing
 * @param isError Whether the result is an error
 * @param content Result content
 * @returns Mock tool result
 */
export function createMockToolResult(
  isError: boolean = false,
  content: string = 'Tool executed successfully'
): CallToolResult {
  return {
    content: [{ type: 'text', text: content }],
    isError,
    errorDetails: isError ? {
      message: 'Error executing tool',
      type: 'ToolExecutionError',
    } : undefined,
  };
}

/**
 * Create a mock background job initiation response
 * @param jobId Job ID
 * @param transportType Transport type
 * @returns Mock background job initiation response
 */
export function createMockBackgroundJobResponse(
  jobId: string = 'mock-job-id',
  transportType: 'stdio' | 'sse' = 'stdio'
) {
  return {
    jobId,
    message: 'Job initiated',
    pollInterval: transportType === 'stdio' ? 1000 : 0,
  };
}

/**
 * Create a mock tool registry for testing
 * @returns Mock tool registry
 */
export function createMockToolRegistry() {
  return {
    registerTool: vi.fn(),
    getTool: vi.fn(),
    getAllTools: vi.fn().mockReturnValue([
      {
        name: 'map-codebase',
        description: 'Mock code map generator',
        inputSchema: {},
        executor: vi.fn(),
      },
      {
        name: 'get-job-result',
        description: 'Mock job result retriever',
        inputSchema: {},
        executor: vi.fn(),
      },
    ]),
    executeTool: vi.fn(),
  };
}

/**
 * Create a mock job manager for testing
 * @returns Mock job manager
 */
export function createMockJobManager() {
  const jobs = new Map();
  
  return {
    createJob: vi.fn().mockImplementation((toolName, params) => {
      const jobId = 'mock-job-id';
      jobs.set(jobId, createMockJob(toolName, params));
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
    setJobResult: vi.fn().mockImplementation((jobId, result) => {
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
