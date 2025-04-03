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
// path is imported but not used

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js'); // Mock the new helper
vi.mock('fs-extra');
vi.mock('../schema.js', async (importOriginal) => {
  const original = await importOriginal<typeof schema>();
  return {
    ...original,
    // Mock safeParse directly on the imported schema object
    starterKitDefinitionSchema: {
      ...original.starterKitDefinitionSchema,
      omit: vi.fn().mockReturnThis(), // Mock omit to return the mocked schema for chaining
      safeParse: vi.fn(), // Mock safeParse
    },
    mainPartsSchema: { // Assuming mainPartsSchema is derived or needs mocking too
       ...original.starterKitDefinitionSchema.omit({ directoryStructure: true }), // Keep original derivation logic if possible
       safeParse: vi.fn(), // Mock safeParse specifically for mainPartsSchema if needed
    }
  };
});


describe('Fullstack Starter Kit Generator', () => {
  // Mock data and responses
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

  // Valid JSON string for main parts
  const mockValidMainPartsJsonString = JSON.stringify({
    projectName: "test-project",
    description: "A test project",
    techStack: {
      frontend: {
        name: "React",
        version: "18.x",
        rationale: "Popular library for UI development"
      },
      backend: {
        name: "Node.js",
        version: "16.x",
        rationale: "JavaScript runtime for server-side code"
      } // Missing closing brace for techStack.backend
    }, // Missing closing brace for techStack
    dependencies: {
      npm: {
        root: {
          dependencies: {
            express: "^4.18.2"
          }
        }
      }
    },
    setupCommands: ["npm install"],
    nextSteps: ["Configure database"]
  });
  
  // Invalid JSON format string
  const mockInvalidJsonFormatString = "{not valid json";

  // Valid JSON string but doesn't match schema
  const mockInvalidSchemaJsonString = JSON.stringify({
    projectName: "test-project",
    // Missing required fields like techStack, dependencies etc.
  });

  // Valid Markdown string for directory structure
  const mockValidDirStructureMarkdown = `
- src/
  - index.ts
- package.json
- tsconfig.json
  `;

  // Invalid Markdown string for directory structure
  const mockInvalidDirStructureMarkdown = `Invalid Structure`;

  // Mock the parsed JSON for validation checks
  const mockParsedValidMainParts = JSON.parse(mockValidMainPartsJsonString);
  const mockParsedInvalidSchema = JSON.parse(mockInvalidSchemaJsonString);

  // Mock the parsed directory structure for validation checks
  const mockParsedValidDirStructure = [{ path: 'src/', type: 'directory', children: [{ path: 'index.ts', type: 'file', content: null, generationPrompt: null }] }, { path: 'package.json', type: 'file', content: null, generationPrompt: null }, { path: 'tsconfig.json', type: 'file', content: null, generationPrompt: null }];


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
        // Return different results based on the query
        if (query.includes('technology stack')) return mockResearchResults[0];
        if (query.includes('best practices')) return mockResearchResults[1];
        if (query.includes('development tooling')) return mockResearchResults[2];
        return "Default mock research";
      });

    // Mock the performDirectLlmCall function
    vi.spyOn(llmHelper, 'performDirectLlmCall')
      .mockImplementation(async (prompt, systemPrompt, config, logicalTaskName) => {
        // First call generates main parts JSON
        if (logicalTaskName === 'fullstack_starter_kit_generation' && prompt.includes('# FINAL INSTRUCTION: Generate the JSON object')) {
          return mockValidMainPartsJsonString;
        }
        // Second call generates directory structure Markdown
        if (logicalTaskName === 'fullstack_starter_kit_generation' && prompt.includes('# FINAL INSTRUCTION: Generate the Markdown list')) {
          return mockValidDirStructureMarkdown;
        }
        // Default fallback for unexpected calls
        return 'Default mock LLM response';
      });

    // Mock schema validation to succeed by default
    // Mock the specific safeParse methods we expect to be called
     vi.mocked(schema.starterKitDefinitionSchema.omit({ directoryStructure: true }).safeParse).mockReturnValue({
       success: true,
       data: mockParsedValidMainParts,
     } as any); // Use 'as any' to bypass complex Zod type issues in mock
     vi.mocked(schema.starterKitDefinitionSchema.safeParse).mockReturnValue({
       success: true,
       data: { ...mockParsedValidMainParts, directoryStructure: mockParsedValidDirStructure }, // Combine parts for final validation mock
     } as any);
  });

  it('should initialize directories on startup', async () => {
    await initDirectories();
    expect(fs.ensureDir).toHaveBeenCalled();
  });

  it('should perform research (Perplexity) when recommendation is requested and validate output', async () => {
    // Call the function under test
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);
    
    // Verify Perplexity research was called 3 times (for 3 different queries)
    expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(3);
    
    // Verify each research query contains appropriate context and uses the correct config
    const researchCalls = vi.mocked(researchHelper.performResearchQuery).mock.calls;
    expect(researchCalls[0][0]).toContain('technology stack');
     expect(researchCalls[0][0]).toContain(mockInput.use_case); // Query 1: Tech stack
     expect(researchCalls[0][1]).toBe(mockConfig); // Should pass full config with perplexityModel
     expect(researchCalls[1][0]).toContain('Best practices and architectural patterns'); // Query 2: More specific assertion
     expect(researchCalls[2][0]).toContain('Modern development tooling and libraries'); // Query 3: More specific assertion
    
    // Verify direct LLM calls were made twice (main parts JSON, dir structure MD)
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(2);

    // Verify the first call (JSON)
    const firstCallArgs = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[0];
    expect(firstCallArgs[0]).toContain("# FINAL INSTRUCTION: Generate the JSON object"); // Check prompt content
    expect(firstCallArgs[3]).toBe('fullstack_starter_kit_generation'); // Check logical task name
    expect(firstCallArgs[1]).toBe(''); // Check system prompt
    expect(firstCallArgs[2]).toBe(mockConfig); // Check config
    expect(firstCallArgs[4]).toBe(0.2); // Check temperature

    // Verify the second call (Markdown)
    const secondCallArgs = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[1];
    expect(secondCallArgs[0]).toContain("# FINAL INSTRUCTION: Generate the Markdown list"); // Check prompt content
    expect(secondCallArgs[3]).toBe('fullstack_starter_kit_generation'); // Check logical task name
     expect(secondCallArgs[1]).toBe(''); // Check system prompt
     expect(secondCallArgs[2]).toBe(mockConfig); // Check config
     expect(secondCallArgs[4]).toBe(0.1); // Check temperature
  });

  it('should skip research when recommendation is not requested', async () => {
    // Create input with recommendation disabled
    const noRecommendationInput: FullstackStarterKitInput = {
      ...mockInput,
      request_recommendation: false
    };
    
    await generateFullstackStarterKit(noRecommendationInput as unknown as Record<string, unknown>, mockConfig);
    
    // Verify Perplexity research was NOT called
    expect(researchHelper.performResearchQuery).not.toHaveBeenCalled();
    
    // Verify direct LLM calls were still made twice
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(2);

    // Verify the first prompt (JSON generation) contains the 'No research context' message in the example section
    const jsonPrompt = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[0][0];
    expect(jsonPrompt).toContain('No research context provided.');
    // Also verify the main prompt body doesn't have the research context header populated
    expect(jsonPrompt).not.toMatch(/## Pre-Generation Research Context \(From Perplexity Sonar Deep Research\):\s*\n\s*###/);

    // Verify the second prompt (Markdown generation) also reflects no research context
    const markdownPrompt = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[1][0];
    expect(markdownPrompt).toContain('Research Context (if provided): N/A');
   });

  it('should handle research failures gracefully', async () => {
    // Mock a failed research query
    vi.mocked(Promise.allSettled).mockResolvedValueOnce([
      { status: 'rejected', reason: new Error('Research failed') },
      { status: 'fulfilled', value: mockResearchResults[1] },
      { status: 'fulfilled', value: mockResearchResults[2] }
    ]);
    
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);
    
    // Verify direct LLM calls were still made
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledTimes(2);

    // Verify the prompt passed to the *first* call (JSON generation) contains the error message
    const jsonPrompt = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[0][0];
    // Ensure the specific header for the failed query is present with the failure message
    expect(jsonPrompt).toContain("### Technology Stack Recommendations:\n*Research on this topic failed.*");

     // Verify the prompt passed to the *second* call (Markdown generation) also contains the error message
     const markdownPrompt = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[1][0];
     expect(markdownPrompt).toContain("Research Context (if provided):");
     expect(markdownPrompt).toContain("*Research on this topic failed.*");
   });
  
  it('should validate JSON output, save it, and generate setup scripts', async () => {
    const result = await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);

    // Verify schema validation was called for main parts and final definition
    expect(schema.starterKitDefinitionSchema.omit({ directoryStructure: true }).safeParse).toHaveBeenCalledWith(mockParsedValidMainParts);
    expect(schema.starterKitDefinitionSchema.safeParse).toHaveBeenCalledWith(
       expect.objectContaining({ ...mockParsedValidMainParts, directoryStructure: expect.any(Array) })
    );

    // Verify the definition file was saved
    expect(fs.writeJson).toHaveBeenCalledWith(
      expect.any(String), // path
      expect.objectContaining({ // content
        projectName: "test-project",
        description: "A test project"
      }),
      expect.objectContaining({ spaces: 2 }) // formatting options
    );
    
    // Verify script generation was called
    expect(scripts.generateSetupScripts).toHaveBeenCalledWith(
      expect.objectContaining({
        projectName: "test-project",
        description: "A test project"
      })
    );
    
    // Verify the script files were saved
    expect(fs.writeFile).toHaveBeenCalledTimes(2); // One for .sh and one for .bat
    
    // Check .sh file was saved as executable
    const writeFileCalls = vi.mocked(fs.writeFile).mock.calls;
    const shCallIndex = writeFileCalls.findIndex(call => 
      typeof call[0] === 'string' && call[0].endsWith('.sh'));
    expect(shCallIndex).not.toBe(-1);
    expect(writeFileCalls[shCallIndex][2]).toEqual(expect.objectContaining({ mode: 0o755 }));
    
    // Verify the response includes script file information
    expect(result.content[0].text).toContain("## Project Structure Generation");
    expect(result.content[0].text).toContain("Linux/macOS Script");
    expect(result.content[0].text).toContain("Windows Script");
    expect(result.content[0].text).toContain("workflow-agent-files/fullstack-starter-kit-generator");
  });
  
  it('should return error on invalid JSON format', async () => {
    // Mock direct LLM call to return invalid JSON format for the first call
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValueOnce(mockInvalidJsonFormatString);

    const result = await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);

    // Verify error response (should be ParsingError, check McpError structure)
    // Verify error response (should be ParsingError, check McpError structure)
    // Verify error response (should be ParsingError, check McpError structure)
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: LLM response could not be parsed as JSON");
    // Check the structure returned by the executor, which wraps errors in McpError
    // Use optional chaining and ensure errorDetails exists and has expected properties
    expect(result.errorDetails).toBeDefined();
    // Add more specific checks to satisfy TS
    // Add more specific checks to satisfy TS, including checking for context and its properties
    if (
      result.errorDetails &&
      typeof result.errorDetails === 'object' &&
      'message' in result.errorDetails &&
      'context' in result.errorDetails &&
      typeof result.errorDetails.context === 'object' &&
      result.errorDetails.context !== null
    ) {
       const context = result.errorDetails.context as Record<string, unknown>; // Assert context as object
       expect(result.errorDetails.message).toContain("LLM response could not be parsed as JSON");
       // Check for the specific property on the asserted context
       expect(context).toHaveProperty('rawText');
       expect(context.rawText).toBe(mockInvalidJsonFormatString);
    } else {
      // Fail the test if errorDetails or context is missing/invalid
      throw new Error('Test failed: errorDetails or its context property is missing or invalid when expecting ParsingError details.');
    }
    
    // Verify the file was not saved
    expect(fs.writeJson).not.toHaveBeenCalled();
  });
  
  it('should return error on JSON that fails schema validation', async () => {
    // Mock direct LLM call to return JSON that fails schema validation
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValueOnce(mockInvalidSchemaJsonString);

    // Create a real ZodError for the mock
    const zodError = new ZodError([
      {
      code: "invalid_type",
      expected: "string",
      received: "undefined",
      path: ["description"],
      message: "Required"
    }]);
    
    // Mock the main parts schema validation to fail
    vi.mocked(schema.starterKitDefinitionSchema.omit({ directoryStructure: true }).safeParse).mockReturnValueOnce({
      success: false,
      error: zodError,
    });

    const result = await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);

    // Verify error response (should be ValidationError, check McpError structure)
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Error: Main parts output failed schema validation.");
    // Use optional chaining and ensure errorDetails exists and has expected properties
    expect(result.errorDetails).toBeDefined();
    // Add more specific checks to satisfy TS, including checking for context and its properties
     if (
       result.errorDetails &&
       typeof result.errorDetails === 'object' &&
       'message' in result.errorDetails &&
       'context' in result.errorDetails &&
       typeof result.errorDetails.context === 'object' &&
       result.errorDetails.context !== null
     ) {
        const context = result.errorDetails.context as Record<string, unknown>; // Assert context as object
        expect(result.errorDetails.message).toContain("Main parts output failed schema validation.");
        // Check for the specific property on the asserted context
        expect(context).toHaveProperty('issues');
        expect(context.issues).toEqual(zodError.issues);
     } else {
        // Fail the test if errorDetails or context is missing/invalid
        throw new Error('Test failed: errorDetails or its context property is missing or invalid when expecting ValidationError details.');
     }
    
    // Verify the file was not saved
    expect(fs.writeJson).not.toHaveBeenCalled();
  });
  
  it('should properly format the JSON prompt with strict instructions', async () => {
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);

    // Get the prompt passed to the first direct LLM call (JSON generation)
    const jsonPrompt = vi.mocked(llmHelper.performDirectLlmCall).mock.calls[0][0];

    // Verify it contains the strict instructions about JSON format from the CONSTRAINTS section
    expect(jsonPrompt).toContain("- **NO Conversational Text:** Output **ONLY** the JSON object."); // Check exact phrasing
     expect(jsonPrompt).toContain("- **Strict JSON:** The response must start with `{` and end with `}` and contain nothing else."); // Check exact phrasing
     expect(jsonPrompt).toContain("- **NO Markdown:** Do not use Markdown formatting (like ```)."); // Check exact phrasing
   });
  
  it('should handle script generation failures gracefully', async () => {
    // Mock script generation to fail
    vi.mocked(scripts.generateSetupScripts).mockImplementationOnce(() => {
      throw new Error('Script generation failed');
    });
    
    const result = await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig);

    // Verify process didn't completely fail - it should return success but log the script error
    expect(result.isError).toBe(false); // Corrected assertion
    
    // Definition JSON should still be saved
    expect(fs.writeJson).toHaveBeenCalled();
    
    // Should still attempt to save placeholder scripts
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
    
    // Response should still include structured definition info
    expect(result.content[0].text).toContain("## Project: test-project");
  });
});
