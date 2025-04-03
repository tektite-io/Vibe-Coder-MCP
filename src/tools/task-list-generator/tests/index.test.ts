// src/tools/task-list-generator/tests/index.test.ts
// Removed @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Keep only one import
import { generateTaskList } from '../index.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import * as llmHelper from '../../../utils/llmHelper.js'; // Import the new helper
import fs from 'fs-extra';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js'; // Import Job Manager
import { sseNotifier } from '../../../services/sse-notifier/index.js'; // Import SSE Notifier
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Import CallToolResult

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js'); // Mock the new helper
vi.mock('fs-extra');
vi.mock('../../../services/job-manager/index.js'); // Mock Job Manager
vi.mock('../../../services/sse-notifier/index.js'); // Mock SSE Notifier
vi.mock('../../../logger.js'); // Mock logger as it's used internally now

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync(); // Allow setImmediate/promises to resolve
  }
};

describe('Task List Generator', () => {
  // Mock data and responses
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-pro-exp-03-25:free', 
    perplexityModel: 'perplexity/sonar-deep-research'
  };
  
  const mockProductDescription = "A project management tool with task tracking";
  const mockUserStories = 'US-001: As a user, I want to create tasks\nUS-002: As a user, I want to assign tasks';
  
  const mockResearchResults = [
    "Mock development lifecycle research data",
    "Mock task estimation research data",
    "Mock team structure research data"
  ];

  const mockGeneratedHighLevelTaskList = `
# Task List: Mock Project
## Phase: Setup
- **ID:** T-101
  **Title:** Init Repo
  *(Description):* Setup git.
  *(User Story):* N/A
  *(Priority):* High
  *(Dependencies):* None
  *(Est. Effort):* Small
## Phase: Backend
- **ID:** T-201
  **Title:** Create API
  *(Description):* Build the core API.
  *(User Story):* US-001
  *(Priority):* High
  *(Dependencies):* T-101
  *(Est. Effort):* Medium
`;
  const mockGeneratedSubTasksT101 = `- **Sub-Task ID:** T-101.1\n  **Goal:** Init git repo\n  ...`;
  const mockGeneratedSubTasksT201 = `- **Sub-Task ID:** T-201.1\n  **Goal:** Define routes\n  ...`;


  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    
    // Mock initDirectories to avoid file system operations
    vi.spyOn(fs, 'ensureDir').mockResolvedValue();
    vi.spyOn(fs, 'writeFile').mockResolvedValue();
    
    // Mock the Promise.allSettled for research results
    vi.spyOn(Promise, 'allSettled').mockResolvedValue([
      { status: 'fulfilled', value: mockResearchResults[0] },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] }
    ]);
    
    // Mock the performResearchQuery function
    vi.spyOn(researchHelper, 'performResearchQuery')
      .mockImplementation(async (query: string) => {
        // Return different results based on the query
        if (query.includes('lifecycle')) return mockResearchResults[0];
        if (query.includes('estimation')) return mockResearchResults[1];
        if (query.includes('team structure')) return mockResearchResults[2];
        return "Default mock research";
      });
    
    // Mock the performDirectLlmCall function
    vi.spyOn(llmHelper, 'performDirectLlmCall')
      .mockImplementation(async (prompt, systemPrompt, config, logicalTaskName) => {
         if (logicalTaskName === 'task_list_initial_generation') {
           return mockGeneratedHighLevelTaskList;
         }
         if (logicalTaskName === 'task_list_decomposition') {
           if (prompt.includes('T-101')) return mockGeneratedSubTasksT101;
           if (prompt.includes('T-201')) return mockGeneratedSubTasksT201;
         }
         return 'Default mock LLM response';
      });

    // Mock Job Manager methods
    vi.mocked(jobManager.createJob).mockReturnValue('mock-job-id');
    vi.mocked(jobManager.updateJobStatus).mockReturnValue(true);
    vi.mocked(jobManager.setJobResult).mockReturnValue(true);

    // Enable fake timers
    vi.useFakeTimers();
  });

  it('should return job ID immediately and complete job asynchronously', async () => {
    const params = {
      productDescription: mockProductDescription,
      userStories: mockUserStories
    };
    const mockContext = { sessionId: 'test-session-123' };

    // --- Initial Call ---
    const initialResult = await generateTaskList(params, mockConfig, mockContext);

    // Verify initial response
    expect(initialResult.isError).toBe(false);
    expect(initialResult.content[0]?.text).toContain('Task list generation started. Job ID: mock-job-id');

    // Verify job creation
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-task-list', params);

    // Verify mocks for underlying logic were NOT called yet
    expect(researchHelper.performResearchQuery).not.toHaveBeenCalled();
    expect(llmHelper.performDirectLlmCall).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(jobManager.setJobResult).not.toHaveBeenCalled();

    // --- Advance Timers to run setImmediate ---
    await runAsyncTicks(5); // Allow multiple async operations if needed

    // --- Verify Async Operations ---
    // Verify research was called
    expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(3);
    const researchCalls = vi.mocked(researchHelper.performResearchQuery).mock.calls;
    expect(researchCalls[0][0]).toContain('lifecycle');
    expect(researchCalls[1][0]).toContain('estimation');
    expect(researchCalls[2][0]).toContain('team structure');

    // Verify LLM calls
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(3);
    const llmCalls = vi.mocked(llmHelper.performDirectLlmCall).mock.calls;
    expect(llmCalls[0][3]).toBe('task_list_initial_generation'); // Initial generation
    expect(llmCalls[1][3]).toBe('task_list_decomposition'); // Decomp T-101
    expect(llmCalls[2][3]).toBe('task_list_decomposition'); // Decomp T-201

    // Verify file write
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('task-list-detailed.md'), expect.any(String), 'utf8');

    // Verify final job result was set
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe('mock-job-id'); // Correct job ID
    expect(finalResultArgs[1].isError).toBe(false); // Success
    expect(finalResultArgs[1].content[0]?.text).toContain('## Phase: Setup'); // Check for some expected content
    expect(finalResultArgs[1].content[0]?.text).toContain('Sub-Task ID: T-101.1');
    expect(finalResultArgs[1].content[0]?.text).toContain('Sub-Task ID: T-201.1');

    // Verify SSE progress calls (basic checks)
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, 'mock-job-id', JobStatus.RUNNING, expect.any(String)); // Initial running status
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, 'mock-job-id', JobStatus.RUNNING, expect.stringContaining('Research complete'));
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, 'mock-job-id', JobStatus.RUNNING, expect.stringContaining('Decomposition finished'));
    // Note: Verifying the final COMPLETED call might depend on whether setJobResult triggers it.
  });

  // Note: Tests like 'should include product description' and 'should handle research failures'
  // now need to be adapted to check the arguments passed to the *mocked* helpers
  // (researchHelper, llmHelper) *after* advancing timers, rather than checking the direct output.
  // The core logic remains the same, but the verification point changes.

  it('should handle research failures gracefully within the async job', async () => {
     // Mock a failed research query
     vi.mocked(Promise.allSettled).mockResolvedValueOnce([
       { status: 'rejected', reason: new Error('Research failed') },
       { status: 'fulfilled', value: mockResearchResults[1] },
       { status: 'fulfilled', value: mockResearchResults[2] }
     ]);

     const params = {
       productDescription: mockProductDescription,
       userStories: mockUserStories
     };
     const mockContext = { sessionId: 'test-session-fail' };

     // Initial call
     const initialResult = await generateTaskList(params, mockConfig, mockContext);
     expect(initialResult.content[0]?.text).toContain('Job ID: mock-job-id');
     expect(jobManager.createJob).toHaveBeenCalledWith('generate-task-list', params);

     // Advance timers
     await runAsyncTicks(5);

     // Verify LLM call for initial generation was still made
     expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
         expect.stringContaining("### Development Lifecycle & Milestones:\n*Research on this topic failed.*\n\n"), // Check prompt contains failure message
         expect.stringContaining("# Task List Generator - High-Level Tasks"), // system prompt
         mockConfig,
         'task_list_initial_generation' // logical task name
     );

     // Verify results are still written to file
     expect(fs.writeFile).toHaveBeenCalledTimes(1);

     // Verify job completed successfully despite research failure
     expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
     const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
     expect(finalResultArgs[0]).toBe('mock-job-id');
     expect(finalResultArgs[1].isError).toBe(false); // Should still succeed overall
   });


  // --- Snapshot Test (Adapted for Async) ---
  it('should set final job result content matching snapshot', async () => {
    const productDescription = "A project tracking app";
    const userStories = `
US-101: As a user, I want to create task items
US-102: As a user, I want to assign tasks to team members
US-103: As a user, I want to track task progress
`;
    const consistentMockTaskList = `
## Phase: Project Setup
- **ID:** T-101
  **Title:** Initialize project repository
  *(Description):* Set up version control and project structure
  *(User Story):* US-101, US-102, US-103
  *(Priority):* High
  *(Dependencies):* None
  *(Est. Effort):* Small

## Phase: Backend Development
- **ID:** T-201
  **Title:** Create task model
  *(Description):* Define data structure for tasks
  *(User Story):* US-101
  *(Priority):* High
  *(Dependencies):* T-101
  *(Est. Effort):* Medium
`; // Renamed this variable for clarity
    const consistentMockSubTasksT101 = `- **Sub-Task ID:** T-101.1\n  **Goal:** Init git\n  ...`;
    const consistentMockSubTasksT201 = `- **Sub-Task ID:** T-201.1\n  **Goal:** Define models\n  ...`;

    // Variable to capture the file path argument directly
    let capturedFilePath: string | undefined;

    // Reset mocks with consistent values for snapshot stability
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue("Consistent mock research.");
    vi.mocked(llmHelper.performDirectLlmCall)
      .mockImplementation(async (prompt, systemPrompt, config, logicalTaskName) => {
         if (logicalTaskName === 'task_list_initial_generation') {
           return consistentMockTaskList; // Correct variable name used here
         }
         if (logicalTaskName === 'task_list_decomposition') {
           if (prompt.includes('T-101')) return consistentMockSubTasksT101;
           if (prompt.includes('T-201')) return consistentMockSubTasksT201;
         }
         return 'Default mock LLM response';
      });


    // Override writeFile to capture the path directly
    vi.mocked(fs.writeFile).mockImplementation(async (pathArg: fs.PathOrFileDescriptor) => {
        capturedFilePath = pathArg as string;
    });
    
    // Call the function under test with params object
    const params = { 
      productDescription,
      userStories
    };
    const mockContext = { sessionId: 'test-session-snap' };

    // Reset mocks with consistent values for snapshot stability
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue("Consistent mock research.");
    vi.mocked(llmHelper.performDirectLlmCall)
      .mockImplementation(async (prompt, systemPrompt, config, logicalTaskName) => {
         if (logicalTaskName === 'task_list_initial_generation') {
           return consistentMockTaskList;
         }
         if (logicalTaskName === 'task_list_decomposition') {
           if (prompt.includes('T-101')) return consistentMockSubTasksT101;
           if (prompt.includes('T-201')) return consistentMockSubTasksT201;
         }
         return 'Default mock LLM response';
      });
    vi.mocked(fs.writeFile).mockResolvedValue(); // Mock writefile

    // Initial call
    const initialResult = await generateTaskList(params, mockConfig, mockContext);
    expect(initialResult.content[0]?.text).toContain('Job ID: mock-job-id');

    // Advance timers
    await runAsyncTicks(5);

    // Verify setJobResult was called
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    const finalResult = finalResultArgs[1] as CallToolResult; // Get the result object

    // Snapshot assertion for the final result content passed to setJobResult
    const resultText = finalResult.content?.[0]?.text;
    const contentToSnapshot = typeof resultText === 'string' ? resultText.trim() : '';
    expect(contentToSnapshot).toMatchSnapshot('Detailed Task List Generator Content');

    // Verify file write was called (redundant check, but good practice)
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('task-list-detailed.md'), expect.any(String), 'utf8');
  });

  // Test error handling within the async block
  it('should set job result to FAILED if LLM call fails', async () => {
      const params = { productDescription: 'test', userStories: 'test' };
      const mockContext = { sessionId: 'test-session-err' };
      const error = new Error("LLM API Error");

      // Mock LLM to throw an error
      vi.mocked(llmHelper.performDirectLlmCall).mockRejectedValue(error);

      // Initial call
      await generateTaskList(params, mockConfig, mockContext);

      // Advance timers
      await runAsyncTicks(5);

      // Verify setJobResult was called with an error
      expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
      const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
      expect(finalResultArgs[0]).toBe('mock-job-id');
      expect(finalResultArgs[1].isError).toBe(true);
      expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
      // Safely check errorDetails and its message property
      const errorDetails = finalResultArgs[1].errorDetails as any; // Cast to any for simplicity or define a more specific type
      expect(errorDetails?.message).toContain('LLM API Error');
  });

});
