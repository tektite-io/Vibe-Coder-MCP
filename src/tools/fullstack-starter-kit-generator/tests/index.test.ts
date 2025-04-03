// src/tools/fullstack-starter-kit-generator/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'; // Keep only one import
import { generateFullstackStarterKit, FullstackStarterKitInput, initDirectories } from '../index.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import * as llmHelper from '../../../utils/llmHelper.js'; // Import the new helper
import * as schema from '../schema.js';
import { ZodError } from 'zod';
import * as scripts from '../scripts.js';
import fs from 'fs-extra';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js'; // Import Job Manager
import { sseNotifier } from '../../../services/sse-notifier/index.js'; // Import SSE Notifier
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Import CallToolResult
// path is imported but not used

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js'); // Mock the new helper
vi.mock('fs-extra');
vi.mock('../../../services/job-manager/index.js'); // Mock Job Manager
vi.mock('../../../services/sse-notifier/index.js'); // Mock SSE Notifier
vi.mock('../../../logger.js'); // Mock logger
vi.mock('../schema.js', async (importOriginal) => {
  const original = await importOriginal<typeof schema>();
  // Return a structure that mocks the necessary parts
  // We need to mock the result of omit().safeParse and the direct safeParse
  const mockOmittedSchema = { safeParse: vi.fn() };
  const mockFullSchema = { safeParse: vi.fn(), omit: vi.fn(() => mockOmittedSchema) }; // Mock omit to return the other mock

  return {
    ...original, // Keep original exports if any
    starterKitDefinitionSchema: mockFullSchema,
    // If mainPartsSchema is derived differently, mock it separately
    // For simplicity, assume it might be derived via omit or needs separate mocking if used directly
    mainPartsSchema: mockOmittedSchema, // Assuming it's derived via omit
  };
});

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync(); // Allow setImmediate/promises to resolve
  }
};

describe('Fullstack Starter Kit Generator', () => {
  // --- Mock Data Definitions ---
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-pro-exp-03-25:free',
    perplexityModel: 'perplexity/sonar-deep-research'
  };

  const mockInput: FullstackStarterKitInput = {
    use_case: "E-commerce platform",
    tech_stack_preferences: {
      frontend: "React",
      backend: "Node.js"
    },
    request_recommendation: true,
    include_optional_features: ["authentication", "payment-processing"]
  };

  const mockResearchResults = [
    "Mock technology stack recommendations data",
    "Mock best practices and architectural patterns data",
    "Mock development tooling and libraries data"
  ];

  const mockValidMainPartsJsonString = JSON.stringify({
    projectName: "test-project",
    description: "A test project",
    techStack: {
      frontend: { name: "React", version: "18.x", rationale: "Popular library for UI development" },
      backend: { name: "Node.js", version: "16.x", rationale: "JavaScript runtime for server-side code" }
    },
    dependencies: { npm: { root: { dependencies: { express: "^4.18.2" } } } },
    setupCommands: ["npm install"],
    nextSteps: ["Configure database"]
  });

  const mockInvalidJsonFormatString = "{not valid json";
  const mockInvalidSchemaJsonString = JSON.stringify({ projectName: "test-project" });
  const mockValidDirStructureMarkdown = `- src/\n  - index.ts\n- package.json\n- tsconfig.json`;
  const mockInvalidDirStructureMarkdown = `Invalid Structure`;
  const mockParsedValidMainParts = JSON.parse(mockValidMainPartsJsonString);
  const mockParsedInvalidSchema = JSON.parse(mockInvalidSchemaJsonString);
  const mockParsedValidDirStructure = [{ path: 'src/', type: 'directory', children: [{ path: 'index.ts', type: 'file', content: null, generationPrompt: null }] }, { path: 'package.json', type: 'file', content: null, generationPrompt: null }, { path: 'tsconfig.json', type: 'file', content: null, generationPrompt: null }];
  // --- End Mock Data ---


  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Mock filesystem operations
    vi.spyOn(fs, 'ensureDir').mockResolvedValue();
    vi.spyOn(fs, 'writeJson').mockResolvedValue();
    vi.spyOn(fs, 'writeFile').mockResolvedValue();

    // Mock the script generation
    vi.spyOn(scripts, 'generateSetupScripts').mockReturnValue({
      sh: '#!/bin/bash\necho "Mock shell script"',
      bat: '@echo off\necho "Mock batch script"'
    });

    // Mock the Promise.allSettled for research results
    vi.spyOn(Promise, 'allSettled').mockResolvedValue([
      { status: 'fulfilled', value: mockResearchResults[0] },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] }
    ]);

    // Mock the performResearchQuery function
    vi.spyOn(researchHelper, 'performResearchQuery')
      .mockImplementation(async (query: string) => {
        if (query.includes('technology stack')) return mockResearchResults[0];
        if (query.includes('best practices')) return mockResearchResults[1];
        if (query.includes('development tooling')) return mockResearchResults[2];
        return "Default mock research";
      });

    // Mock the performDirectLlmCall function
    vi.spyOn(llmHelper, 'performDirectLlmCall')
      .mockImplementation(async (prompt, systemPrompt, config, logicalTaskName) => {
        if (logicalTaskName === 'fullstack_starter_kit_generation' && prompt.includes('# FINAL INSTRUCTION: Generate the JSON object')) {
          return mockValidMainPartsJsonString;
        }
        if (logicalTaskName === 'fullstack_starter_kit_generation' && prompt.includes('# FINAL INSTRUCTION: Generate the Markdown list')) {
          return mockValidDirStructureMarkdown;
        }
        return 'Default mock LLM response';
      });

    // Reset schema validation mocks for each test
    // Use the mocked schema objects from the vi.mock setup
    const mockedSchemaModule = schema as any; // Cast to access mocked methods
    mockedSchemaModule.mainPartsSchema.safeParse.mockReturnValue({
       success: true,
       data: mockParsedValidMainParts,
     });
    mockedSchemaModule.starterKitDefinitionSchema.safeParse.mockReturnValue({
       success: true,
       data: { ...mockParsedValidMainParts, directoryStructure: mockParsedValidDirStructure },
     });
     // Ensure omit mock is reset if needed, though it returns the other mock
     mockedSchemaModule.starterKitDefinitionSchema.omit.mockClear();


    // Mock Job Manager methods
    vi.mocked(jobManager.createJob).mockReturnValue('mock-job-id-fsk');
    vi.mocked(jobManager.updateJobStatus).mockReturnValue(true);
    vi.mocked(jobManager.setJobResult).mockReturnValue(true);

    // Enable fake timers
    vi.useFakeTimers();
  });

  it('should initialize directories on startup', async () => {
    // Note: initDirectories might be called implicitly by the tool now.
    // This test might need adjustment or removal depending on final implementation.
    // For now, assume it's called internally and verify ensureDir was called after running the tool.
    const mockContext = { sessionId: 'test-init' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(5); // Allow async operations
    expect(fs.ensureDir).toHaveBeenCalled();
  });

  it('should return job ID and complete asynchronously when recommendation is requested', async () => {
    const mockContext = { sessionId: 'test-session-rec' };
    // --- Initial Call ---
    const initialResult = await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);

    // Verify initial response
    expect(initialResult.isError).toBe(false);
    expect(initialResult.content[0]?.text).toContain('Fullstack starter kit generation started. Job ID: mock-job-id-fsk');
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-fullstack-starter-kit', mockInput);

    // Verify underlying logic not called yet
    expect(researchHelper.performResearchQuery).not.toHaveBeenCalled();
    expect(llmHelper.performDirectLlmCall).not.toHaveBeenCalled();
    expect(fs.writeJson).not.toHaveBeenCalled();
    expect(jobManager.setJobResult).not.toHaveBeenCalled();

    // --- Advance Timers ---
    await runAsyncTicks(5);

    // --- Verify Async Operations ---
    // Verify research was called
    expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(3);
    const researchCalls = vi.mocked(researchHelper.performResearchQuery).mock.calls;
    expect(researchCalls[0][0]).toContain('technology stack');
    expect(researchCalls[1][0]).toContain('Best practices');
    expect(researchCalls[2][0]).toContain('development tooling');

    // Verify LLM calls
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(2);
    const llmCalls = vi.mocked(llmHelper.performDirectLlmCall).mock.calls;
    expect(llmCalls[0][0]).toContain("# FINAL INSTRUCTION: Generate the JSON object"); // JSON call
    expect(llmCalls[1][0]).toContain("# FINAL INSTRUCTION: Generate the Markdown list"); // Markdown call

    // Verify validation calls
    const mockedSchemaModule = schema as any; // Cast to access mocked methods
    expect(mockedSchemaModule.mainPartsSchema.safeParse).toHaveBeenCalled();
    expect(mockedSchemaModule.starterKitDefinitionSchema.safeParse).toHaveBeenCalled();


    // Verify file writes
    expect(fs.writeJson).toHaveBeenCalledTimes(1); // Definition file
    expect(fs.writeFile).toHaveBeenCalledTimes(2); // .sh and .bat scripts

    // Verify final job result
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe('mock-job-id-fsk');
    expect(finalResultArgs[1].isError).toBe(false);
    expect(finalResultArgs[1].content[0]?.text).toContain("## Project Structure Generation"); // Check final output format

    // Verify SSE calls (basic)
    expect(sseNotifier.sendProgress).toHaveBeenCalledWith(mockContext.sessionId, 'mock-job-id-fsk', JobStatus.RUNNING, expect.any(String));
  });

  it('should skip research when recommendation is not requested (async)', async () => {
    const noRecommendationInput: FullstackStarterKitInput = {
      ...mockInput,
      request_recommendation: false
    };
    const mockContext = { sessionId: 'test-session-norec' };

    // Initial call
    await generateFullstackStarterKit(noRecommendationInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-fullstack-starter-kit', noRecommendationInput);

    // Advance timers
    await runAsyncTicks(5);

    // Verify research NOT called
    expect(researchHelper.performResearchQuery).not.toHaveBeenCalled();

    // Verify LLM calls still made
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(2);
    const llmCalls = vi.mocked(llmHelper.performDirectLlmCall).mock.calls;
    expect(llmCalls[0][0]).toContain('No research context provided.'); // Check JSON prompt
    expect(llmCalls[1][0]).toContain('Research Context (if provided): N/A'); // Check Markdown prompt

    // Verify job completed successfully
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
  });

  it('should handle research failures gracefully (async)', async () => {
    vi.mocked(Promise.allSettled).mockResolvedValueOnce([
      { status: 'rejected', reason: new Error('Research failed') },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] }
    ]);
    const mockContext = { sessionId: 'test-session-resfail' };

    // Initial call
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    expect(jobManager.createJob).toHaveBeenCalled();

    // Advance timers
    await runAsyncTicks(5);

    // Verify LLM calls made
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(2);
    const llmCalls = vi.mocked(llmHelper.performDirectLlmCall).mock.calls;
    // Check prompts contain failure message
    expect(llmCalls[0][0]).toContain("### Technology Stack Recommendations:\n*Research on this topic failed.*");
    expect(llmCalls[1][0]).toContain("*Research on this topic failed.*");

    // Verify job completed successfully
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    expect(vi.mocked(jobManager.setJobResult).mock.calls[0][1].isError).toBe(false);
  });

  it('should set job to FAILED on invalid JSON format (async)', async () => {
    vi.mocked(llmHelper.performDirectLlmCall).mockImplementation(async (prompt, systemPrompt, config, logicalTaskName) => {
        if (logicalTaskName === 'fullstack_starter_kit_generation' && prompt.includes('# FINAL INSTRUCTION: Generate the JSON object')) {
          return mockInvalidJsonFormatString; // Return invalid JSON first
        }
        return mockValidDirStructureMarkdown; // Return valid MD second (though it might not be reached)
      });
    const mockContext = { sessionId: 'test-session-jsonerr' };

    // Initial call
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    expect(jobManager.createJob).toHaveBeenCalled();

    // Advance timers
    await runAsyncTicks(5);

    // Verify job failed
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe('mock-job-id-fsk');
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
    // Safely check errorDetails and its message property
    const errorDetailsJson = finalResultArgs[1].errorDetails as any;
    expect(errorDetailsJson?.message).toContain("LLM response could not be parsed as JSON");

    // Verify files not saved
    expect(fs.writeJson).not.toHaveBeenCalled();
    expect(fs.writeFile).not.toHaveBeenCalled(); // No scripts should be written either
  });

  it('should set job to FAILED on schema validation failure (async)', async () => {
     // Mock LLM to return JSON that fails schema
     vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValueOnce(mockInvalidSchemaJsonString);
     // Mock schema validation to fail
     const zodError = new ZodError([{ code: "invalid_type", expected: "string", received: "undefined", path: ["description"], message: "Required" }]);
     // Use the mocked schema objects from the vi.mock setup
     const mockedSchemaModule = schema as any; // Cast to access mocked methods
     mockedSchemaModule.mainPartsSchema.safeParse.mockReturnValueOnce({ success: false, error: zodError });

     const mockContext = { sessionId: 'test-session-schemaerr' };

     // Initial call
     await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
     expect(jobManager.createJob).toHaveBeenCalled();

     // Advance timers
     await runAsyncTicks(5);

     // Verify job failed
     expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
     const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
     expect(finalResultArgs[0]).toBe('mock-job-id-fsk');
     expect(finalResultArgs[1].isError).toBe(true);
     expect(finalResultArgs[1].content[0]?.text).toContain('Error during background job');
     // Safely check errorDetails and its message property
     const errorDetailsSchema = finalResultArgs[1].errorDetails as any;
     expect(errorDetailsSchema?.message).toContain("Main parts output failed schema validation.");

     // Verify files not saved
     expect(fs.writeJson).not.toHaveBeenCalled();
     expect(fs.writeFile).not.toHaveBeenCalled();
   });

  // Note: Snapshot test needs adaptation similar to task-list-generator test
  it('should set final job result content matching snapshot (async)', async () => {
      const mockContext = { sessionId: 'test-session-snap-fsk' };
      // Mocks are set up in beforeEach to return valid data

      // Initial call
      await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
      expect(jobManager.createJob).toHaveBeenCalled();

      // Advance timers
      await runAsyncTicks(5);

      // Verify job succeeded and capture result
      expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
      const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
      expect(finalResultArgs[1].isError).toBe(false);
      const finalResult = finalResultArgs[1] as CallToolResult;

      // Snapshot the formatted text content
      const resultText = finalResult.content?.[0]?.text;
      const contentToSnapshot = typeof resultText === 'string' ? resultText.trim() : '';
      expect(contentToSnapshot).toMatchSnapshot('Fullstack Starter Kit Generator Content');

      // Verify file writes happened
      expect(fs.writeJson).toHaveBeenCalledTimes(1);
      expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });

});
