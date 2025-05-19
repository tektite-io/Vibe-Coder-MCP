// src/tools/code-refactor-generator/tests/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { refactorCode } from '../index.js'; // Executor to test
import * as fileReader from '../../../utils/fileReader.js'; // To mock readFileContent
import { OpenRouterConfig } from '../../../types/workflow.js'; // Import OpenRouterConfig
import logger from '../../../logger.js'; // Adjust path if needed
import { jobManager, JobStatus } from '../../../services/job-manager/index.js'; // Import Job Manager
import { sseNotifier } from '../../../services/sse-notifier/index.js'; // Import SSE Notifier
import { McpError } from '@modelcontextprotocol/sdk/types.js'; // Import McpError for typing

// Mock dependencies
vi.mock('../../../utils/fileReader.js');
vi.mock('axios');
vi.mock('../../../services/job-manager/index.js'); // Mock Job Manager
vi.mock('../../../services/sse-notifier/index.js'); // Mock SSE Notifier
vi.mock('../../../logger.js'); // Mock logger

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync(); // Allow setImmediate/promises to resolve
  }
};

// Define a type for the expected payload structure
interface OpenRouterChatPayload {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

const mockConfig: OpenRouterConfig = { baseUrl: 'http://mock.api', apiKey: 'key', geminiModel: 'gemini-test', perplexityModel: 'perp-test'};
const mockJobId = 'mock-refactor-job-id';

describe('refactorCode (Async)', () => {
  const baseParams: Record<string, unknown> = {
     language: 'javascript',
     codeContent: 'function old(a,b){return a+b;}',
     refactoringInstructions: 'Improve readability and use const',
  };
  const mockContext = { sessionId: 'test-session-refactor' };

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
       vi.restoreAllMocks(); // Restore all mocks after each test
       vi.useRealTimers(); // Restore real timers
   });

  it('should return job ID and refactor code successfully in background', async () => {
    const mockRefactoredCode = 'const newFunc = (a, b) => {\n  return a + b;\n};';
    vi.mocked(axios.post).mockResolvedValueOnce({
      data: { choices: [{ message: { content: mockRefactoredCode } }] }
    });

    // --- Initial Call ---
    const initialResult = await refactorCode(baseParams, mockConfig, mockContext);
    expect(initialResult.isError).toBe(false);
    expect(initialResult.content[0]?.text).toContain(`Code refactoring job started. Job ID: ${mockJobId}`);
    expect(jobManager.createJob).toHaveBeenCalledWith('code-refactor-generator', baseParams);

    // Verify underlying logic not called yet
    expect(axios.post).not.toHaveBeenCalled();
    expect(jobManager.setJobResult).not.toHaveBeenCalled();

    // --- Advance Timers ---
    await runAsyncTicks(1);

    // --- Verify Async Operations ---
    expect(axios.post).toHaveBeenCalledTimes(1);
    const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
    expect(requestData.messages[1].content).toContain('Refactor the following javascript code snippet:');
    expect(requestData.messages[1].content).toContain(baseParams.codeContent);
    expect(requestData.messages[1].content).toContain(`Refactoring Instructions: ${baseParams.refactoringInstructions}`);
    expect(fileReader.readFileContent).not.toHaveBeenCalled(); // No context file requested

    // Verify final job result was set
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe(mockJobId);
    expect(finalResultArgs[1].isError).toBe(false);
    expect(finalResultArgs[1].content[0]?.text).toBe(mockRefactoredCode);

    // Verify SSE calls
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.RUNNING, expect.stringContaining('Starting code refactoring...'));
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.RUNNING, expect.stringContaining('Generating refactored code via LLM...'));
    // Final status notification might be implicit via jobManager or explicit
  });

  it('should include context from file in the prompt (async)', async () => {
     const contextFilePath = 'src/context.js';
     const mockFileContent = '// Surrounding context code';
     vi.mocked(fileReader.readFileContent).mockResolvedValue(mockFileContent); // Mock successful read
     const paramsWithContext = { ...baseParams, contextFilePath };
     const mockRefactoredCode = '// refactored code';
     vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockRefactoredCode } }] } });

     // --- Initial Call ---
     await refactorCode(paramsWithContext, mockConfig, mockContext);
     expect(jobManager.createJob).toHaveBeenCalledWith('code-refactor-generator', paramsWithContext);

     // --- Advance Timers ---
     await runAsyncTicks(1);

     // --- Verify Async Operations ---
     expect(fileReader.readFileContent).toHaveBeenCalledTimes(1);
     expect(fileReader.readFileContent).toHaveBeenCalledWith(contextFilePath);
     expect(axios.post).toHaveBeenCalledTimes(1);
     const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
     expect(requestData.messages[1].content).toContain('Consider the following surrounding code context:');
     expect(requestData.messages[1].content).toContain(mockFileContent);
     expect(jobManager.setJobResult).toHaveBeenCalledTimes(1); // Should still complete
     expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
   });

   it('should proceed without context if file reading fails (async)', async () => {
       const contextFilePath = 'src/bad_context.js';
       const readError = new Error('File not found');
       vi.mocked(fileReader.readFileContent).mockRejectedValue(readError); // Mock failed read
       const paramsWithContext = { ...baseParams, contextFilePath };
       const mockRefactoredCode = '// refactored code without context';
       vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockRefactoredCode } }] } });

       // --- Initial Call ---
       await refactorCode(paramsWithContext, mockConfig, mockContext);
       expect(jobManager.createJob).toHaveBeenCalled();

       // --- Advance Timers ---
       await runAsyncTicks(1);

       // --- Verify Async Operations ---
       expect(fileReader.readFileContent).toHaveBeenCalledTimes(1);
       expect(fileReader.readFileContent).toHaveBeenCalledWith(contextFilePath);
       expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ jobId: mockJobId, err: readError }), expect.stringContaining('Could not read context file'));
       expect(axios.post).toHaveBeenCalledTimes(1);
       const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
       expect(requestData.messages[1].content).toContain(`[Warning: Failed to read context file '${contextFilePath}'`);
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false); // Still completes successfully
       expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].content[0]?.text).toBe(mockRefactoredCode);
       // Verify SSE warning was sent
       expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.RUNNING, expect.stringContaining('Warning: Could not read context file'));
   });

   it('should clean markdown fences from the output (async)', async () => {
        const mockCodeWithFences = '```javascript\nconst newFunc = (a, b) => {\n  return a + b;\n};\n```';
        const expectedCleanCode = 'const newFunc = (a, b) => {\n  return a + b;\n};';
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockCodeWithFences } }] } });

        // --- Initial Call ---
        await refactorCode(baseParams, mockConfig, mockContext);
        // --- Advance Timers ---
        await runAsyncTicks(1);
        // --- Verify Async Operations ---
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
        const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
        expect(finalResultArgs[1].isError).toBe(false);
        expect(finalResultArgs[1].content[0]?.text).toBe(expectedCleanCode);
    });

   it('should set job to FAILED on API failure (async)', async () => {
       const apiError = { isAxiosError: true, response: { status: 400 }, message: 'Bad request' };
       vi.mocked(axios.post).mockRejectedValueOnce(apiError);

       // --- Initial Call ---
       await refactorCode(baseParams, mockConfig, mockContext);
       // --- Advance Timers ---
       await runAsyncTicks(1);
       // --- Verify Async Operations ---
       expect(axios.post).toHaveBeenCalledTimes(1);
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
       expect(finalResultArgs[0]).toBe(mockJobId);
       expect(finalResultArgs[1].isError).toBe(true);
       expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
       const errorDetailsApi = finalResultArgs[1].errorDetails as McpError; // Cast to McpError
       expect(errorDetailsApi?.message).toContain('Code refactoring API Error: Status 400');
       expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.FAILED, expect.stringContaining('Job failed:'));
   });

    it('should set job to FAILED if LLM returns empty content after cleanup (async)', async () => {
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: '```\n\n```' } }] } });

        // --- Initial Call ---
        await refactorCode(baseParams, mockConfig, mockContext);
        // --- Advance Timers ---
        await runAsyncTicks(1);
        // --- Verify Async Operations ---
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
        const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
        expect(finalResultArgs[1].isError).toBe(true); // Should now correctly be an error
        expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
        const errorDetailsEmpty = finalResultArgs[1].errorDetails as McpError; // Cast to McpError
        expect(errorDetailsEmpty?.message).toContain('LLM returned empty code content after cleanup');
    });

    it('should set job to FAILED if LLM response is not structured as expected (async)', async () => {
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { message: 'Wrong format' } }); // Invalid structure

        // --- Initial Call ---
        await refactorCode(baseParams, mockConfig, mockContext);
        // --- Advance Timers ---
        await runAsyncTicks(1);
        // --- Verify Async Operations ---
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
        const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
        expect(finalResultArgs[1].isError).toBe(true);
        expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
        const errorDetailsStruct = finalResultArgs[1].errorDetails as McpError; // Cast to McpError
        expect(errorDetailsStruct?.message).toContain('No valid content received from LLM');
    });
});
