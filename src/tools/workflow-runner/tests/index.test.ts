// src/tools/workflow-runner/tests/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as workflowExecutor from '../../../services/workflows/workflowExecutor.js'; // Module to mock
import { runWorkflowTool } from '../index.js'; // Import the ACTUAL executor
import { OpenRouterConfig } from '../../../types/workflow.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../../logger.js';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js'; // Import Job Manager
import { sseNotifier } from '../../../services/sse-notifier/index.js'; // Import SSE Notifier
import { AppError } from '../../../utils/errors.js'; // Import base error type

// Mock dependencies
vi.mock('../../../services/workflows/workflowExecutor.js');
vi.mock('../../../services/job-manager/index.js'); // Mock Job Manager
vi.mock('../../../services/sse-notifier/index.js'); // Mock SSE Notifier
vi.mock('../../../logger.js'); // Mock logger

// Define helper variables for mocks
const executeWorkflowMock = vi.mocked(workflowExecutor.executeWorkflow);

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync(); // Allow setImmediate/promises to resolve
  }
};

const mockConfig: OpenRouterConfig = { baseUrl: '', apiKey: '', geminiModel: '', perplexityModel: '' };
const mockJobId = 'mock-workflow-job-id';

// No need for specific interface, use Record<string, unknown> directly
// interface WorkflowToolParams { ... }

describe('runWorkflowTool (Async)', () => {
    const mockContext = { sessionId: 'test-session-workflow' };

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock Job Manager methods
        vi.mocked(jobManager.createJob).mockReturnValue(mockJobId);
        vi.mocked(jobManager.updateJobStatus).mockReturnValue(true);
        vi.mocked(jobManager.setJobResult).mockReturnValue(true);
        // Enable fake timers
        vi.useFakeTimers();
    });

    afterEach(() => {
       vi.restoreAllMocks();
       vi.useRealTimers();
    });

    it('should return job ID and call executeWorkflow in background', async () => {
        const mockSuccessResult: workflowExecutor.WorkflowResult = {
            success: true,
            message: 'Workflow completed ok.',
            outputs: { summary: 'Workflow completed ok.' }
        };
        executeWorkflowMock.mockResolvedValue(mockSuccessResult);

        const params = { workflowName: 'myFlow', workflowInput: { key: 'value' } };

        // --- Initial Call ---
        const initialResult = await runWorkflowTool(params as Record<string, unknown>, mockConfig, mockContext);
        expect(initialResult.isError).toBe(false);
        expect(initialResult.content[0]?.text).toContain(`Workflow 'myFlow' execution started. Job ID: ${mockJobId}`);
        expect(jobManager.createJob).toHaveBeenCalledWith('run-workflow', params as Record<string, unknown>);

        // Verify underlying logic not called yet
        expect(executeWorkflowMock).not.toHaveBeenCalled();
        expect(jobManager.setJobResult).not.toHaveBeenCalled();

        // --- Advance Timers ---
        await runAsyncTicks(1);

        // --- Verify Async Operations ---
        expect(executeWorkflowMock).toHaveBeenCalledTimes(1);
        expect(executeWorkflowMock).toHaveBeenCalledWith(
            'myFlow',           // workflowName
            { key: 'value' },   // workflowInput
            mockConfig,         // config
            mockContext         // context (including sessionId)
        );
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1); // Job should complete
    });

    it('should set job result with formatted successful workflow output', async () => {
         const mockSuccessResult: workflowExecutor.WorkflowResult = {
             success: true,
             message: 'Workflow completed ok.',
             outputs: { finalMsg: 'All done!' }
         };
         executeWorkflowMock.mockResolvedValue(mockSuccessResult);
         const params = { workflowName: 'myFlow' };

         // --- Initial Call ---
         await runWorkflowTool(params as Record<string, unknown>, mockConfig, mockContext);
         // --- Advance Timers ---
         await runAsyncTicks(1);
         // --- Verify Async Operations ---
         expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
         const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
         expect(finalResultArgs[0]).toBe(mockJobId);
         const finalCallResult = finalResultArgs[1];

         expect(finalCallResult.isError).toBe(false); // Workflow success means tool success
         expect(finalCallResult.content[0]?.text).toContain('## Workflow Execution: Completed');
         expect(finalCallResult.content[0]?.text).toContain('**Status:** Workflow completed ok.');
         expect(finalCallResult.content[0]?.text).toContain('**Workflow Output Summary:**');
         expect(finalCallResult.content[0]?.text).toContain(`- finalMsg: ${JSON.stringify('All done!')}`);
    });

    it('should set job result with formatted failed workflow output', async () => {
         const mockFailResult: workflowExecutor.WorkflowResult = {
             success: false,
             message: 'Workflow "myFlow" failed at step 1 (toolA): Tool Error',
             error: { stepId: 'step1', toolName: 'toolA', message: 'Tool Error', details: { code: 123 } }
         };
         executeWorkflowMock.mockResolvedValue(mockFailResult);
         const params = { workflowName: 'myFlow' };

         // --- Initial Call ---
         await runWorkflowTool(params as Record<string, unknown>, mockConfig, mockContext);
         // --- Advance Timers ---
         await runAsyncTicks(1);
         // --- Verify Async Operations ---
         expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
         const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
         expect(finalResultArgs[0]).toBe(mockJobId);
         const finalCallResult = finalResultArgs[1];

         expect(finalCallResult.isError).toBe(true); // Workflow fail means tool error result
         expect(finalCallResult.content[0]?.text).toContain('## Workflow Execution: Failed');
         expect(finalCallResult.content[0]?.text).toContain('**Status:** Workflow "myFlow" failed at step 1 (toolA): Tool Error');
         expect(finalCallResult.content[0]?.text).toContain('**Error Details:**');
         expect(finalCallResult.content[0]?.text).toContain('- Step ID: step1');
         expect(finalCallResult.content[0]?.text).toContain('- Tool: toolA');
         expect(finalCallResult.content[0]?.text).toContain('- Message: Tool Error');
         expect(finalCallResult.content[0]?.text).toContain('- Context:'); // Check context is included
         expect(finalCallResult.content[0]?.text).toContain('"code": 123');
         // The errorDetails passed to setJobResult should be the McpError wrapping the workflow error
         expect(finalCallResult.errorDetails).toBeDefined();
         expect((finalCallResult.errorDetails as any)?.message).toBe(mockFailResult.error?.message);
         expect((finalCallResult.errorDetails as any)?.context).toEqual(mockFailResult.error?.details);
    });

     it('should set job to FAILED if executeWorkflow itself throws an unexpected error', async () => {
          const unexpectedError = new Error('Executor service crashed');
          executeWorkflowMock.mockRejectedValue(unexpectedError);
          const params = { workflowName: 'myFlow' };

          // --- Initial Call ---
          await runWorkflowTool(params as Record<string, unknown>, mockConfig, mockContext);
          // --- Advance Timers ---
          await runAsyncTicks(1);
          // --- Verify Async Operations ---
          expect(executeWorkflowMock).toHaveBeenCalledTimes(1); // executeWorkflow was called
          expect(jobManager.setJobResult).toHaveBeenCalledTimes(1); // Job should fail
          const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
          expect(finalResultArgs[0]).toBe(mockJobId);
          const finalCallResult = finalResultArgs[1];

          expect(finalCallResult.isError).toBe(true);
          expect(finalCallResult.content[0]?.text).toContain(`Error during background job ${mockJobId}`);
          const errorDetails = finalCallResult.errorDetails as any;
          expect(errorDetails?.message).toContain(`Unexpected error running workflow 'myFlow': ${unexpectedError.message}`);
          expect(errorDetails?.type).toBe('ToolExecutionError');
     });
});
