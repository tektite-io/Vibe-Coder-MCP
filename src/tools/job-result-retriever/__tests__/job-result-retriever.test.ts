// src/tools/job-result-retriever/__tests__/job-result-retriever.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getJobResult } from '../index.js'; // Adjust path to the executor function
import { jobManager, JobStatus, Job } from '../../../services/job-manager/index.js'; // Import singleton and types
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../../types/workflow.js'; // Import config type if needed

// Mock the jobManager singleton
vi.mock('../../../services/job-manager/index.js', () => ({
  jobManager: {
    getJob: vi.fn(),
    getJobWithRateLimit: vi.fn(),
    // Mock other methods if needed, though getJobResult likely only uses getJob
  },
  // Export enums/types needed by the test file
  JobStatus: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
  }
}));

// Mock the logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('getJobResult Tool Executor', () => {
  // Provide minimal valid config to satisfy the type, even if unused by the tool
  const mockConfig: OpenRouterConfig = {
      baseUrl: 'mock-url',
      apiKey: 'mock-key',
      geminiModel: 'mock-gemini',
      perplexityModel: 'mock-perplexity',
      // llm_mapping is optional
  };
  const mockContext = undefined; // Context is not used by this tool

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should return "Job not found" if jobManager.getJobWithRateLimit returns undefined job', async () => {
    const jobId = 'non-existent-job';
    (jobManager.getJobWithRateLimit as any).mockReturnValue({ job: undefined, waitTime: 0, shouldWait: false }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(`Job with ID '${jobId}' not found.`);
    expect(result.errorDetails && (result.errorDetails as any).code).toBe(-32602); // Check existence before access
  });

  it('should return PENDING status if the job is pending', async () => {
    const jobId = 'pending-job';
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.PENDING,
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime: 0,
      shouldWait: false
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(false); // Not an error, just status update
    expect(result.content[0]?.text).toContain(`Job '${jobId}' (${mockJob.toolName}) is pending.`);
  });

  it('should return RUNNING status and progress message if the job is running', async () => {
    const jobId = 'running-job';
    const progressMessage = 'Processing step 2...';
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.RUNNING,
      progressMessage,
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime: 0,
      shouldWait: false
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain(`Job '${jobId}' (${mockJob.toolName}) is running.`);
    expect(result.content[0]?.text).toContain(`Progress: ${progressMessage}`);
  });

   it('should return RUNNING status without progress message if none is set', async () => {
     const jobId = 'running-job-no-msg';
     const mockJob: Partial<Job> = {
       id: jobId,
       status: JobStatus.RUNNING,
       toolName: 'test-tool',
       createdAt: Date.now(),
       updatedAt: Date.now()
     };
     (jobManager.getJobWithRateLimit as any).mockReturnValue({
       job: mockJob,
       waitTime: 0,
       shouldWait: false
     }); // Cast to any

     const result = await getJobResult({ jobId }, mockConfig, mockContext);

     expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
     expect(result.isError).toBe(false);
     expect(result.content[0]?.text).toContain(`Job '${jobId}' (${mockJob.toolName}) is running.`);
     expect(result.content[0]?.text).toContain(`Progress: No progress message available.`);
   });

  it('should return the final result if the job is COMPLETED', async () => {
    const jobId = 'completed-job';
    const finalResultData: CallToolResult = { content: [{ type: 'text', text: 'Final success data!' }], isError: false };
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.COMPLETED,
      result: finalResultData,
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime: 0,
      shouldWait: false
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    // The result of getJobResult *is* the final result from the job with added completion note
    expect(result.content[0]).toEqual(finalResultData.content[0]);
    expect(result.isError).toEqual(finalResultData.isError);
    expect(result.content[1]?.text).toContain('Job Status: COMPLETED');
  });

  it('should return the final error result if the job is FAILED', async () => {
    const jobId = 'failed-job';
    const finalErrorData: CallToolResult = { content: [{ type: 'text', text: 'Job failed message' }], isError: true, errorDetails: { type: 'ToolError', message: 'Something went wrong' } };
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.FAILED,
      result: finalErrorData,
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime: 0,
      shouldWait: false
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    // The result of getJobResult *is* the final error result from the job with added failure note
    expect(result.content[0]).toEqual(finalErrorData.content[0]);
    expect(result.isError).toEqual(finalErrorData.isError);
    expect(result.errorDetails).toEqual(finalErrorData.errorDetails);
    expect(result.content[1]?.text).toContain('Job Status: FAILED');
  });

  it('should return an error if a COMPLETED job has no result stored', async () => {
    const jobId = 'completed-no-result-job';
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.COMPLETED,
      result: undefined, // Missing result
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime: 0,
      shouldWait: false
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain(`Job '${jobId}' (${mockJob.toolName}) completed successfully`);
    expect(result.content[0]?.text).toContain(`However, the final result is missing.`);
  });

  it('should return an error if a FAILED job has no result stored', async () => {
    const jobId = 'failed-no-result-job';
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.FAILED,
      result: undefined, // Missing result
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime: 0,
      shouldWait: false
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain(`Job '${jobId}' (${mockJob.toolName}) failed`);
    expect(result.content[0]?.text).toContain(`Error details are missing.`);
    expect(result.errorDetails && (result.errorDetails as any).code).toBe(-32603); // Check existence before access
  });

  it('should return rate limit message if shouldWait is true', async () => {
    const jobId = 'rate-limited-job';
    const waitTime = 5000; // 5 seconds
    const mockJob: Partial<Job> = {
      id: jobId,
      status: JobStatus.RUNNING,
      toolName: 'test-tool',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    (jobManager.getJobWithRateLimit as any).mockReturnValue({
      job: mockJob,
      waitTime,
      shouldWait: true
    }); // Cast to any

    const result = await getJobResult({ jobId }, mockConfig, mockContext);

    expect(jobManager.getJobWithRateLimit).toHaveBeenCalledWith(jobId);
    expect(result.isError).toBe(false);
    expect(result.content[0]?.text).toContain(`Job '${jobId}' (${mockJob.toolName}) status is being checked too frequently`);
    expect(result.content[0]?.text).toContain(`Please wait 5 seconds before checking again`);
    expect(result.pollInterval).toBeDefined();
    expect(result.pollInterval).toBe(waitTime);
  });
});
