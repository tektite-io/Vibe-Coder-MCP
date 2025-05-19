/**
 * Integration tests for the Workflow Runner tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runWorkflowTool } from '../index.js';
import * as workflowExecutor from '../../../services/workflows/workflowExecutor.js';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js';
import { sseNotifier } from '../../../services/sse-notifier/index.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';

// Mock dependencies
vi.mock('../../../services/workflows/workflowExecutor.js');
vi.mock('../../../services/job-manager/index.js');
vi.mock('../../../services/sse-notifier/index.js');
vi.mock('../../../logger.js');

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync();
  }
};

describe('Workflow Runner Integration Tests', () => {
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'gemini-model',
    perplexityModel: 'perplexity-model',
  };
  const mockContext = { sessionId: 'test-session' };
  const mockJobId = 'test-job-id';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jobManager.createJob).mockReturnValue(mockJobId);
    vi.mocked(jobManager.updateJobStatus).mockReturnValue(true);
    vi.mocked(jobManager.setJobResult).mockReturnValue(true);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('should create a job and return an immediate response', async () => {
    const params = {
      workflowName: 'test-workflow',
      workflowInput: { key: 'value' },
    };

    // Execute the workflow runner
    const result = await runWorkflowTool(params, mockConfig, mockContext);

    // Verify the response
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toContain(`Job started: ${mockJobId} (Workflow 'test-workflow' Execution)`);
    expect(result.isError).toBe(false);

    // Verify that createJob was called
    expect(jobManager.createJob).toHaveBeenCalledWith('run-workflow', params);
  });

  it('should execute the workflow in the background', async () => {
    const params = {
      workflowName: 'test-workflow',
      workflowInput: { key: 'value' },
    };

    // Mock executeWorkflow to return a successful result
    vi.mocked(workflowExecutor.executeWorkflow).mockResolvedValue({
      success: true,
      message: 'Workflow completed successfully',
      outputs: { result: 'Success' },
    });

    // Execute the workflow runner
    await runWorkflowTool(params, mockConfig, mockContext);

    // Advance timers to allow background job to complete
    await runAsyncTicks(1);

    // Verify that executeWorkflow was called
    expect(workflowExecutor.executeWorkflow).toHaveBeenCalledWith(
      'test-workflow',
      { key: 'value' },
      mockConfig,
      mockContext
    );

    // Verify that setJobResult was called
    expect(jobManager.setJobResult).toHaveBeenCalledWith(
      mockJobId,
      expect.objectContaining({
        isError: false,
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('Workflow Execution: Completed'),
          }),
        ]),
      })
    );
  });

  it('should send progress updates via SSE', async () => {
    const params = {
      workflowName: 'test-workflow',
      workflowInput: { key: 'value' },
    };

    // Mock executeWorkflow to return a successful result
    vi.mocked(workflowExecutor.executeWorkflow).mockResolvedValue({
      success: true,
      message: 'Workflow completed successfully',
      outputs: { result: 'Success' },
    });

    // Execute the workflow runner
    await runWorkflowTool(params, mockConfig, mockContext);

    // Advance timers to allow background job to complete
    await runAsyncTicks(1);

    // Verify that sendProgress was called
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
      mockContext.sessionId,
      mockJobId,
      JobStatus.RUNNING,
      expect.stringContaining('Starting workflow')
    );

    // Second progress update is for completion, not for "Executing workflow"
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
      mockContext.sessionId,
      mockJobId,
      JobStatus.COMPLETED,
      expect.stringContaining('Workflow \'test-workflow\' finished with status: completed')
    );
  });

  it('should handle workflow execution errors', async () => {
    const params = {
      workflowName: 'test-workflow',
      workflowInput: { key: 'value' },
    };

    // Mock executeWorkflow to return a failed result
    vi.mocked(workflowExecutor.executeWorkflow).mockResolvedValue({
      success: false,
      message: 'Workflow failed',
      error: {
        stepId: 'step1',
        toolName: 'test-tool',
        message: 'Tool execution failed',
        details: { error: 'Test error' },
      },
    });

    // Execute the workflow runner
    await runWorkflowTool(params, mockConfig, mockContext);

    // Advance timers to allow background job to complete
    await runAsyncTicks(1);

    // Verify that setJobResult was called with an error
    expect(jobManager.setJobResult).toHaveBeenCalledWith(
      mockJobId,
      expect.objectContaining({
        isError: true,
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('Workflow Execution: Failed'),
          }),
        ]),
        errorDetails: expect.objectContaining({
          message: expect.stringContaining('Tool execution failed'),
        }),
      })
    );
  });

  it('should handle unexpected errors during workflow execution', async () => {
    const params = {
      workflowName: 'test-workflow',
      workflowInput: { key: 'value' },
    };

    // Mock executeWorkflow to throw an error
    vi.mocked(workflowExecutor.executeWorkflow).mockRejectedValue(new Error('Unexpected error'));

    // Execute the workflow runner
    await runWorkflowTool(params, mockConfig, mockContext);

    // Advance timers to allow background job to complete
    await runAsyncTicks(1);

    // Verify that setJobResult was called with an error
    expect(jobManager.setJobResult).toHaveBeenCalledWith(
      mockJobId,
      expect.objectContaining({
        isError: true,
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('Error during background job'),
          }),
        ]),
        errorDetails: expect.objectContaining({
          message: expect.stringContaining('Unexpected error running workflow'),
        }),
      })
    );
  });
});
