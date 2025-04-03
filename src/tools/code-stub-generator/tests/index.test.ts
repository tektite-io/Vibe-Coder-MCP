// src/tools/code-stub-generator/tests/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import { generateCodeStub } from '../index.js'; // Executor to test
import { OpenRouterConfig } from '../../../types/workflow.js'; // Import OpenRouterConfig
import * as fileReader from '../../../utils/fileReader.js'; // Import the module to mock
import { AppError } from '../../../utils/errors.js'; // Import AppError for testing error cases
import logger from '../../../logger.js';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js'; // Import Job Manager
import { sseNotifier } from '../../../services/sse-notifier/index.js'; // Import SSE Notifier
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Import CallToolResult

// Mock dependencies
vi.mock('axios');
vi.mock('../../../utils/fileReader.js');
vi.mock('../../../services/job-manager/index.js'); // Mock Job Manager
vi.mock('../../../services/sse-notifier/index.js'); // Mock SSE Notifier
vi.mock('../../../logger.js'); // Mock logger

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync(); // Allow setImmediate/promises to resolve
  }
};

const mockConfig: OpenRouterConfig = { baseUrl: 'http://mock.api', apiKey: 'key', geminiModel: 'gemini-test', perplexityModel: 'perp-test'};
const mockJobId = 'mock-stub-job-id';

// Define a type for the expected payload structure
interface OpenRouterChatPayload {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens?: number;
  temperature?: number;
}

describe('generateCodeStub (Async)', () => {
  const baseParams: Record<string, unknown> = {
     language: 'typescript',
     stubType: 'function',
     name: 'myFunction',
     description: 'Does a thing.',
  };
  const mockContext = { sessionId: 'test-session-stub' };

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
     vi.restoreAllMocks(); // Ensure mocks are clean after each test
     vi.useRealTimers(); // Restore real timers
  });

  it('should return job ID and generate stub successfully in background', async () => {
    const mockCode = `function myFunction() {\n  // TODO: Implement logic\n}`;
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockCode } }] } });

    // --- Initial Call ---
    const initialResult = await generateCodeStub(baseParams, mockConfig, mockContext);
    expect(initialResult.isError).toBe(false);
    expect(initialResult.content[0]?.text).toContain(`Code stub generation started. Job ID: ${mockJobId}`);
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-code-stub', baseParams);

    // Verify underlying logic not called yet
    expect(axios.post).not.toHaveBeenCalled();
    expect(jobManager.setJobResult).not.toHaveBeenCalled();

    // --- Advance Timers ---
    await runAsyncTicks(1);

    // --- Verify Async Operations ---
    expect(axios.post).toHaveBeenCalledTimes(1);
    const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
    expect(requestData.messages[1].content).toContain('- Language: typescript');
    expect(requestData.messages[1].content).toContain('- Name: myFunction');
    expect(fileReader.readFileContent).not.toHaveBeenCalled();

    // Verify final job result was set
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe(mockJobId);
    expect(finalResultArgs[1].isError).toBe(false);
    expect(finalResultArgs[1].content[0]?.text).toBe(mockCode);

    // Verify SSE calls
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.RUNNING, expect.stringContaining('Starting code stub generation...'));
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.RUNNING, expect.stringContaining('Calling LLM'));
  });

  it('should clean markdown fences from the output (async)', async () => {
    const mockCodeWithFences = '```typescript\nfunction myFunction() {\n  // TODO: Implement logic\n}\n```';
    const expectedCleanCode = `function myFunction() {\n  // TODO: Implement logic\n}`;
    vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockCodeWithFences } }] } });

    // --- Initial Call ---
    await generateCodeStub(baseParams, mockConfig, mockContext);
    // --- Advance Timers ---
    await runAsyncTicks(1);
    // --- Verify Async Operations ---
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(false);
    expect(finalResultArgs[1].content[0]?.text).toBe(expectedCleanCode);
  });

   it('should handle complex parameters in prompt (async)', async () => {
       const complexParams: Record<string, unknown> = {
           ...baseParams,
           stubType: 'class',
           name: 'MyClass',
           description: 'A complex class.',
           classProperties: [{name: 'prop1', type: 'string'}],
           methods: [{name: 'method1'}],
       };
       const mockCode = `class MyClass { prop1: string; method1() {} }`;
       vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockCode } }] } });

       // --- Initial Call ---
       await generateCodeStub(complexParams, mockConfig, mockContext);
       expect(jobManager.createJob).toHaveBeenCalledWith('generate-code-stub', complexParams);
       // --- Advance Timers ---
       await runAsyncTicks(1);
       // --- Verify Async Operations ---
       expect(axios.post).toHaveBeenCalledTimes(1);
       const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
       expect(requestData.messages[1].content).toContain('- Type: class');
       expect(requestData.messages[1].content).toContain('- Properties (for class):');
       expect(requestData.messages[1].content).toContain('- Methods (for class/interface):');
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
       expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].content[0]?.text).toBe(mockCode);
   });

   it('should include context from file in prompt (async)', async () => {
        const contextFilePath = 'src/context.txt';
        const fileContent = 'This is the context from the file.';
        const paramsWithContext = { ...baseParams, contextFilePath };
        const mockCode = `function myFunction() {\n  // TODO: Implement logic based on context\n}`;
        vi.mocked(fileReader.readFileContent).mockResolvedValue(fileContent);
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockCode } }] } });

        // --- Initial Call ---
        await generateCodeStub(paramsWithContext, mockConfig, mockContext);
        // --- Advance Timers ---
        await runAsyncTicks(1);
        // --- Verify Async Operations ---
        expect(fileReader.readFileContent).toHaveBeenCalledWith(contextFilePath);
        expect(axios.post).toHaveBeenCalledTimes(1);
        const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
        expect(requestData.messages[1].content).toContain('Consider the following file content as additional context:');
        expect(requestData.messages[1].content).toContain(fileContent);
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
        expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
   });

    it('should include warning in prompt when context file read fails (async)', async () => {
        const contextFilePath = 'src/nonexistent.txt';
        const readErrorMessage = 'File not found';
        const paramsWithContext = { ...baseParams, contextFilePath };
        const mockCode = `function myFunction() {\n  // TODO: Implement logic\n}`;
        vi.mocked(fileReader.readFileContent).mockRejectedValue(new AppError(readErrorMessage));
        vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: mockCode } }] } });

        // --- Initial Call ---
        await generateCodeStub(paramsWithContext, mockConfig, mockContext);
        // --- Advance Timers ---
        await runAsyncTicks(1);
        // --- Verify Async Operations ---
        expect(fileReader.readFileContent).toHaveBeenCalledWith(contextFilePath);
        expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ jobId: mockJobId }), expect.stringContaining('Could not read context file'));
        expect(axios.post).toHaveBeenCalledTimes(1);
        const requestData = vi.mocked(axios.post).mock.calls[0][1] as OpenRouterChatPayload;
        expect(requestData.messages[1].content).toContain(`[Warning: Failed to read context file '${contextFilePath}'. Error: ${readErrorMessage}]`);
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
        expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false); // Still completes successfully
        expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.RUNNING, expect.stringContaining('Warning: Could not read context file'));
    });


   it('should set job to FAILED on API failure (async)', async () => {
       const apiError = { isAxiosError: true, response: { status: 500 }, message: 'Server Error' };
       vi.mocked(axios.post).mockRejectedValueOnce(apiError);

       // --- Initial Call ---
       await generateCodeStub(baseParams, mockConfig, mockContext);
       // --- Advance Timers ---
       await runAsyncTicks(1);
       // --- Verify Async Operations ---
       expect(axios.post).toHaveBeenCalledTimes(1);
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
       expect(finalResultArgs[0]).toBe(mockJobId);
       expect(finalResultArgs[1].isError).toBe(true);
       expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
       const errorDetails = finalResultArgs[1].errorDetails as any;
       expect(errorDetails?.message).toContain('Code stub generation API Error: Status 500');
       expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.FAILED, expect.stringContaining('Job failed:'));
   });

   it('should set job to FAILED if LLM returns empty content after cleanup (async)', async () => {
       vi.mocked(axios.post).mockResolvedValueOnce({ data: { choices: [{ message: { content: '```\n\n```' } }] } });

       // --- Initial Call ---
       await generateCodeStub(baseParams, mockConfig, mockContext);
       // --- Advance Timers ---
       await runAsyncTicks(1);
       // --- Verify Async Operations ---
       expect(axios.post).toHaveBeenCalledTimes(1);
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
       expect(finalResultArgs[1].isError).toBe(true);
       expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
       const errorDetails = finalResultArgs[1].errorDetails as any;
       expect(errorDetails?.message).toContain('LLM returned empty code content after cleanup');
   });

    it('should set job to FAILED if LLM response is not structured as expected (async)', async () => {
         vi.mocked(axios.post).mockResolvedValueOnce({ data: { message: 'Wrong format' } }); // Invalid structure

        // --- Initial Call ---
        await generateCodeStub(baseParams, mockConfig, mockContext);
        // --- Advance Timers ---
        await runAsyncTicks(1);
        // --- Verify Async Operations ---
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
        const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
        expect(finalResultArgs[1].isError).toBe(true);
        expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
        const errorDetails = finalResultArgs[1].errorDetails as any;
        expect(errorDetails?.message).toContain('No valid content received from LLM');
    });
});
