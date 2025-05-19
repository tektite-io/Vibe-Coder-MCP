// src/tools/git-summary-generator/__tests__/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as gitHelper from '../../../utils/gitHelper.js'; // Module to mock
import { generateGitSummary } from '../index.js'; // Import the actual executor
import { AppError } from '../../../utils/errors.js'; // Adjust path if necessary
import { OpenRouterConfig } from '../../../types/workflow.js'; // Adjust path if necessary
import logger from '../../../logger.js'; // Adjust path if necessary
import { jobManager, JobStatus } from '../../../services/job-manager/index.js'; // Import Job Manager
import { sseNotifier } from '../../../services/sse-notifier/index.js'; // Import SSE Notifier
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Import CallToolResult

// Mock dependencies
vi.mock('../../../utils/gitHelper.js');
vi.mock('../../../services/job-manager/index.js'); // Mock Job Manager
vi.mock('../../../services/sse-notifier/index.js'); // Mock SSE Notifier
vi.mock('../../../logger.js'); // Mock logger

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync(); // Allow setImmediate/promises to resolve
  }
};

const mockConfig: OpenRouterConfig = { baseUrl: '', apiKey: '', geminiModel: '', perplexityModel: '' }; // Not used by this tool
const mockJobId = 'mock-git-job-id';

describe('generateGitSummary Tool (Async)', () => {
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

  it('should return job ID and call getGitDiffSummary with staged: false by default', async () => {
    const mockContext = { sessionId: 'test-session-git-1' };
    const params = {}; // Empty params
    vi.mocked(gitHelper.getGitDiffSummary).mockResolvedValue('Unstaged diff');

    // --- Initial Call ---
    const initialResult = await generateGitSummary(params, mockConfig, mockContext);
    expect(initialResult.isError).toBe(false);
    expect(initialResult.content[0]?.text).toContain(`Git summary generation started. Job ID: ${mockJobId}`);
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-git-summary', params);

    // --- Advance Timers ---
    await runAsyncTicks(1);

    // --- Verify Async Operations ---
    expect(gitHelper.getGitDiffSummary).toHaveBeenCalledTimes(1);
    // Check the options object passed - default should be undefined if not provided
    expect(gitHelper.getGitDiffSummary).toHaveBeenCalledWith(expect.objectContaining({ staged: undefined }));
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
    expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].content[0]?.text).toBe('Unstaged diff');
  });

  it('should return job ID and call getGitDiffSummary with staged: true if specified', async () => {
    const mockContext = { sessionId: 'test-session-git-2' };
    const params = { staged: true };
    vi.mocked(gitHelper.getGitDiffSummary).mockResolvedValue('Staged diff');

    // --- Initial Call ---
    const initialResult = await generateGitSummary(params, mockConfig, mockContext);
    expect(initialResult.isError).toBe(false);
    expect(initialResult.content[0]?.text).toContain(`Git summary generation started. Job ID: ${mockJobId}`);
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-git-summary', params);

    // --- Advance Timers ---
    await runAsyncTicks(1);

    // --- Verify Async Operations ---
    expect(gitHelper.getGitDiffSummary).toHaveBeenCalledTimes(1);
    expect(gitHelper.getGitDiffSummary).toHaveBeenCalledWith(expect.objectContaining({ staged: true }));
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
    expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].content[0]?.text).toBe('Staged diff');
  });

  it('should set job result with diff content on success', async () => {
    const mockContext = { sessionId: 'test-session-git-3' };
    const mockDiff = 'Index: file.txt\n--- a/file.txt\n+++ b/file.txt\n@@ ... @@\n+added';
    vi.mocked(gitHelper.getGitDiffSummary).mockResolvedValue(mockDiff);

    // --- Initial Call ---
    await generateGitSummary({}, mockConfig, mockContext);
    // --- Advance Timers ---
    await runAsyncTicks(1);
    // --- Verify Async Operations ---
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe(mockJobId);
    expect(finalResultArgs[1].isError).toBe(false);
    expect(finalResultArgs[1].content[0]?.text).toBe(mockDiff);
  });

  it('should set job result to FAILED if getGitDiffSummary throws', async () => {
     const mockContext = { sessionId: 'test-session-git-4' };
     const error = new AppError('Not a repo');
     vi.mocked(gitHelper.getGitDiffSummary).mockRejectedValue(error);

     // --- Initial Call ---
     await generateGitSummary({}, mockConfig, mockContext);
     // --- Advance Timers ---
     await runAsyncTicks(1);
     // --- Verify Async Operations ---
     expect(gitHelper.getGitDiffSummary).toHaveBeenCalledTimes(1);
     expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
     const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
     expect(finalResultArgs[0]).toBe(mockJobId);
     expect(finalResultArgs[1].isError).toBe(true);
     expect(finalResultArgs[1].content[0]?.text).toContain(`Error during background job ${mockJobId}`);
     const errorDetails = finalResultArgs[1].errorDetails as any;
     expect(errorDetails?.message).toBe(error.message);
     expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, mockJobId, JobStatus.FAILED, expect.stringContaining('Job failed:'));
  });

   // Test that the tool correctly returns the message from the helper
   it('should set job result with specific message if diff helper returns "No unstaged changes found."', async () => {
       const mockContext = { sessionId: 'test-session-git-5' };
       const noChangesMsg = 'No unstaged changes found.';
       vi.mocked(gitHelper.getGitDiffSummary).mockResolvedValue(noChangesMsg); // Helper returns specific string

       // --- Initial Call ---
       await generateGitSummary({ staged: false }, mockConfig, mockContext);
       // --- Advance Timers ---
       await runAsyncTicks(1);
       // --- Verify Async Operations ---
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
       expect(finalResultArgs[1].isError).toBe(false);
       expect(finalResultArgs[1].content[0]?.text).toBe(noChangesMsg); // Tool should return the helper's message directly
   });

   // Test that the tool correctly returns the message from the helper
   it('should set job result with specific message if diff helper returns "No staged changes found."', async () => {
       const mockContext = { sessionId: 'test-session-git-6' };
       const noChangesMsg = 'No staged changes found.';
       vi.mocked(gitHelper.getGitDiffSummary).mockResolvedValue(noChangesMsg); // Helper returns specific string

       // --- Initial Call ---
       await generateGitSummary({ staged: true }, mockConfig, mockContext);
       // --- Advance Timers ---
       await runAsyncTicks(1);
       // --- Verify Async Operations ---
       expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
       const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
       expect(finalResultArgs[1].isError).toBe(false);
       expect(finalResultArgs[1].content[0]?.text).toBe(noChangesMsg); // Tool should return the helper's message directly
   });
});
