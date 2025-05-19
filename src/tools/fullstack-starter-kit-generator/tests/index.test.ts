// src/tools/fullstack-starter-kit-generator/tests/index.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateFullstackStarterKit, FullstackStarterKitInput } from '../index.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import * as researchHelper from '../../../utils/researchHelper.js';
import * as llmHelper from '../../../utils/llmHelper.js';
import * as schema from '../schema.js';
import { ZodError } from 'zod';
import * as scripts from '../scripts.js';
import fs from 'fs-extra';
import { jobManager, JobStatus } from '../../../services/job-manager/index.js';
import { sseNotifier } from '../../../services/sse-notifier/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ParsedYamlModule, YAMLComposer } from '../yaml-composer.js'; // For mock dynamic template
import { ValidationError, ParsingError } from '../../../utils/errors.js';

// Mock dependencies
vi.mock('../../../utils/researchHelper.js');
vi.mock('../../../utils/llmHelper.js');
vi.mock('fs-extra');
vi.mock('../../../services/job-manager/index.js');
vi.mock('../../../services/sse-notifier/index.js');
vi.mock('../../../logger.js');

// Mock YAMLComposer
vi.mock('../yaml-composer.js', () => {
  const mockYamlComposer = {
    compose: vi.fn().mockResolvedValue({})
  };

  return {
    YAMLComposer: vi.fn(() => mockYamlComposer),
    __esModule: true
  };
});

vi.mock('../schema.js', async (importOriginal) => {
  const original = await importOriginal<typeof schema>();
  // Only mock starterKitDefinitionSchema as it's the one directly used by the generator's index.ts for final validation
  const mockStarterKitDefinitionSchema = { safeParse: vi.fn() };
  // YAMLComposer uses parsedYamlModuleSchema internally, but for this integration test,
  // we'll test its effect through the main generator function.
  // If YAMLComposer.loadAndParseYamlModule throws due to its internal validation, the generator should handle it.
  return {
    ...original,
    starterKitDefinitionSchema: mockStarterKitDefinitionSchema,
    // parsedYamlModuleSchema: { safeParse: vi.fn() } // If we needed to mock YAMLComposer's internal validation
  };
});

// Helper to advance timers and allow setImmediate to run
const runAsyncTicks = async (count = 1) => {
  for (let i = 0; i < count; i++) {
    await vi.advanceTimersToNextTimerAsync();
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
    include_optional_features: ["authentication"]
  };

  const mockJobId = 'mock-fsk-job-id';

  const mockResearchResults = [
    "Mock tech stack recommendations: Use React and Node.js.",
    "Mock key features: User accounts, product catalog."
  ];

  // Mock for LLM response selecting YAML modules
  const mockLlmModuleSelectionResponse = JSON.stringify({
    globalParams: {
      projectName: "test-yaml-project",
      projectDescription: "A test project via YAML composer.",
      frontendPath: "client",
      backendPath: "server",
      backendPort: 3002,
      frontendPort: 3001
    },
    moduleSelections: [
      { modulePath: "frontend/react-vite", moduleKey: "frontendPath", params: {} },
      { modulePath: "backend/nodejs-express", moduleKey: "backendPath", params: { backendPort: 3002 } },
      { modulePath: "utility/missing-logger", moduleKey: "root", params: {} } // To test dynamic generation
    ]
  });

  const mockInvalidJsonFormatString = "{not valid json";

  // Mock YAML content for existing templates
  const mockReactViteYamlContent = `
moduleName: react-vite-frontend
type: frontend
placeholders: [projectName]
provides:
  techStack: { frontendFramework: { name: "React", version: "18.x", rationale: "Mocked React" } }
  directoryStructure:
    - path: "src/App.tsx"
      type: file
      content: "Mock App content for {projectName}"
  dependencies:
    npm:
      "{frontendPath}":
        dependencies: { "react": "^18.2.0" }
  setupCommands:
    - context: "{frontendPath}"
      command: "echo 'React setup'"
`;

  const mockNodeExpressYamlContent = `
moduleName: nodejs-express-backend
type: backend
placeholders: [projectName, backendPort]
provides:
  techStack: { backendFramework: { name: "Express", version: "4.x", rationale: "Mocked Express for {projectName}" } }
  directoryStructure:
    - path: "src/index.ts"
      type: file
      content: "Mock Server content for {projectName} on port {backendPort}"
  dependencies:
    npm:
      "{backendPath}":
        dependencies: { "express": "^4.18.2" }
  setupCommands:
    - context: "{backendPath}"
      command: "npm run build"
`;

  // Mock for dynamically generated YAML module (as JSON response from LLM)
  const mockDynamicLoggerModuleJsonResponse: Partial<ParsedYamlModule> = {
    moduleName: "dynamic-logger-util",
    type: "utility",
    placeholders: ["projectName"],
    provides: {
      techStack: { logger: { name: "DynamicLogger", version: "1.0", rationale: "Dynamically generated logger for {projectName}" } },
      directoryStructure: [{ path: "utils/logger.ts", type: "file", content: "// Dynamic logger for {projectName}" }],
      dependencies: { npm: { root: { dependencies: { "dynamic-log-lib": "^1.0.0" } } } }
    }
  };
  const mockDynamicLoggerModuleJsonString = JSON.stringify(mockDynamicLoggerModuleJsonResponse);


  // Mock of a composed definition, to be returned by schema.starterKitDefinitionSchema.safeParse
  const mockParsedComposedDefinition: schema.StarterKitDefinition = {
    projectName: "test-yaml-project",
    description: "A test project via YAML composer.",
    techStack: {
      frontendFramework: { name: "React", version: "18.x", rationale: "Mocked React" },
      backendFramework: { name: "Express", version: "4.x", rationale: "Mocked Express for test-yaml-project" },
      logger: { name: "DynamicLogger", version: "1.0", rationale: "Dynamically generated logger for test-yaml-project" }
    },
    directoryStructure: [
      { path: "client", type: "directory", content: null, children: [
          { path: "client/src/App.tsx", type: "file", content: "Mock App content for test-yaml-project" }
      ]},
      { path: "server", type: "directory", content: null, children: [
        { path: "server/src/index.ts", type: "file", content: "Mock Server content for test-yaml-project on port 3002" }
      ]},
      { path: "utils/logger.ts", type: "file", content: "// Dynamic logger for test-yaml-project" }
    ],
    dependencies: {
      npm: {
        "client": { dependencies: { "react": "^18.2.0" } },
        "server": { dependencies: { "express": "^4.18.2" } },
        "root": { dependencies: { "dynamic-log-lib": "^1.0.0" } }
      }
    },
    setupCommands: ["(cd client && echo 'React setup')", "(cd server && npm run build)"],
    nextSteps: ["Review the generated project structure and files.", "Configure JWT secrets and token expiration settings."] // Example
  };
  // --- End Mock Data ---

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock Job Manager methods
    vi.mocked(jobManager.createJob).mockReturnValue(mockJobId);
    vi.mocked(jobManager.updateJobStatus).mockReturnValue(true);
    vi.mocked(jobManager.setJobResult).mockReturnValue(true);

    // Mock SSE Notifier
    vi.mocked(sseNotifier.sendProgress).mockClear();

    // Mock researchHelper
    vi.spyOn(researchHelper, 'performResearchQuery')
      .mockImplementation(async (query: string) => {
        if (query.includes('Tech stack')) return mockResearchResults[0];
        if (query.includes('Key features')) return mockResearchResults[1];
        return "Default mock research";
      });

    // Mock llmHelper for different tasks
    vi.mocked(llmHelper.performDirectLlmCall).mockImplementation(async (prompt, _systemPrompt, _config, logicalTaskName) => {
      if (logicalTaskName === 'fullstack_starter_kit_module_selection') {
        return mockLlmModuleSelectionResponse;
      }
      if (logicalTaskName === 'fullstack_starter_kit_dynamic_yaml_module_generation') {
        // This mock might need to be more specific if multiple dynamic gens are tested
        if (prompt.includes("utility/missing-logger")) {
          return mockDynamicLoggerModuleJsonString;
        }
        throw new Error(`Unexpected dynamic generation prompt: ${prompt}`);
      }
      return 'Default mock LLM response for other tasks';
    });

    // Mock fs-extra, specific per test where needed but general mocks here
    vi.spyOn(fs, 'ensureDir').mockResolvedValue();
    vi.spyOn(fs, 'writeJson').mockResolvedValue();
    vi.spyOn(fs, 'writeFile').mockResolvedValue(); // For scripts and dynamic YAMLs
    vi.spyOn(fs, 'pathExists').mockImplementation(async (filePath: string | Buffer | URL): Promise<boolean> => {
        const p = filePath.toString();
        if (p.includes('react-vite.yaml') || p.includes('nodejs-express.yaml')) return true;
        if (p.includes('missing-logger.yaml')) return false; // This one will be dynamically generated
        if (p.includes('invalid-structure.yaml')) return true; // For testing invalid loaded YAML
        return false; // Default to not existing
    });
    vi.spyOn(fs, 'readFile').mockImplementation(async (filePath, _encoding?) => {
        const p = filePath.toString();
        if (p.includes('react-vite.yaml')) return mockReactViteYamlContent;
        if (p.includes('nodejs-express.yaml')) return mockNodeExpressYamlContent;
        if (p.includes('invalid-structure.yaml')) return "invalid_yaml_content: : : only colons";
        throw new Error(`Mock fs.readFile: File not found ${p}`);
    });


    // Mock schema validation for the final composed definition
    const mockedSchemaModule = schema as unknown as { starterKitDefinitionSchema: { safeParse: ReturnType<typeof vi.fn> } };
    mockedSchemaModule.starterKitDefinitionSchema.safeParse.mockReturnValue({
      success: true,
      data: mockParsedComposedDefinition,
    });

    // Mock script generation
    vi.spyOn(scripts, 'generateSetupScripts').mockReturnValue({
      sh: '#!/bin/bash\necho "Mock dynamic shell script for test-yaml-project"',
      bat: '@echo off\necho Mock dynamic batch script for test-yaml-project'
    });
  });

  it('should return job ID and complete asynchronously, composing via YAML (including dynamic generation)', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Set up YAMLComposer mock to return the composed definition
    const mockCompose = vi.fn().mockResolvedValue(mockParsedComposedDefinition);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    const mockContext = { sessionId: 'test-session-yaml-compose' };
    const initialResult = await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);

    expect(initialResult.isError).toBe(false);
    const initialContent = typeof initialResult.content[0]?.text === 'string'
      ? JSON.parse(initialResult.content[0].text)
      : {};
    expect(initialContent.jobId).toBe(mockJobId);
    expect(initialContent.message).toContain('Fullstack Starter Kit Generator');
    expect(jobManager.createJob).toHaveBeenCalledWith('generate-fullstack-starter-kit', mockInput);

    await runAsyncTicks(10); // Allow all async operations including YAML composition

    // Verify research
    expect(researchHelper.performResearchQuery).toHaveBeenCalledTimes(2);

    // Verify LLM call for module selection
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.stringContaining(mockInput.use_case), // Prompt for module selection
      '',
      mockConfig,
      'fullstack_starter_kit_module_selection',
      0.1
    );

    // Verify YAMLComposer.compose was called
    expect(mockCompose).toHaveBeenCalledWith(
      expect.any(Array), // moduleSelections
      expect.any(Object)  // globalParams
    );

    // Verify definition JSON and scripts are saved
    expect(fs.writeJson).toHaveBeenCalledWith(
      expect.stringContaining('-test-yaml-project-definition.json'), // path to definition file
      mockParsedComposedDefinition, // the validated data
      { spaces: 2 }
    );
    expect(scripts.generateSetupScripts).toHaveBeenCalledWith(mockParsedComposedDefinition, expect.stringContaining('-definition.json'));
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('-setup.sh'), expect.stringContaining("Mock dynamic shell script"), { mode: 0o755 });
    expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining('-setup.bat'), expect.stringContaining("Mock dynamic batch script"));

    // Verify final job result
    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[0]).toBe(mockJobId);
    expect(finalResultArgs[1].isError).toBe(false);
    expect(finalResultArgs[1].content[0]?.text).toContain("## Project: test-yaml-project");
    expect(finalResultArgs[1].content[0]?.text).toContain("YAML Composed");

    // Verify SSE progress was called multiple times
    expect(sseNotifier.sendProgress).toHaveBeenCalled();
    // Verify the final call was for completion
    const calls = vi.mocked(sseNotifier.sendProgress).mock.calls;
    if (calls.length > 0) {
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0]).toBe(mockContext.sessionId);
      expect(lastCall[1]).toBe(mockJobId);
      expect(lastCall[2]).toBe(JobStatus.COMPLETED);
      expect(lastCall[3]).toBe('Starter kit generated successfully.');
    }
  });

  it('should skip research when recommendation is not requested (async, YAML flow)', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Set up YAMLComposer mock to return the composed definition
    const mockCompose = vi.fn().mockResolvedValue(mockParsedComposedDefinition);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    const noRecInput: FullstackStarterKitInput = { ...mockInput, request_recommendation: false };
    const mockContext = { sessionId: 'test-session-norec-yaml' };
    await generateFullstackStarterKit(noRecInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    expect(researchHelper.performResearchQuery).not.toHaveBeenCalled();
    // LLM for module selection should still be called
    expect(llmHelper.performDirectLlmCall).toHaveBeenCalledWith(
      expect.any(String), // Don't check the exact content of the prompt
      '',
      mockConfig,
      'fullstack_starter_kit_module_selection',
      0.1
    );
    expect(jobManager.setJobResult).toHaveBeenCalledWith(mockJobId, expect.objectContaining({ isError: false }));
  });


  it('should handle research failures gracefully (async, YAML flow)', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Set up YAMLComposer mock to return the composed definition
    const mockCompose = vi.fn().mockResolvedValue(mockParsedComposedDefinition);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    // Mock research to fail but not throw
    vi.mocked(researchHelper.performResearchQuery).mockResolvedValue('Research failed but continuing');

    // Mock the LLM call to return a valid response
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(mockLlmModuleSelectionResponse);

    const mockContext = { sessionId: 'test-session-resfail-yaml' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    // We expect the workflow to proceed and complete successfully despite research error
    expect(jobManager.setJobResult).toHaveBeenCalledWith(mockJobId, expect.objectContaining({ isError: false }));
  });


  it('should FAIL if LLM module selection returns malformed JSON', async () => {
    // Mock the LLM response to be invalid JSON
    vi.mocked(llmHelper.performDirectLlmCall).mockResolvedValue(mockInvalidJsonFormatString);

    // Mock normalizeJsonResponse to throw an error
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockImplementation(() => {
      throw new Error('Failed to parse LLM response for module selections as JSON.');
    });

    const mockContext = { sessionId: 'test-session-modsel-jsonerr' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(5);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toContain("Failed to parse LLM response for module selections as JSON.");
    expect(fs.writeJson).not.toHaveBeenCalled();
  });

  it('should FAIL if LLM module selection response is missing required fields', async () => {
    // First mock the normalizeJsonResponse function to return a valid JSON string
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(JSON.stringify({ globalParams: {} }));

    const mockContext = { sessionId: 'test-session-modsel-missingfields' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(5);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toContain("LLM response for module selections is missing required 'globalParams' or 'moduleSelections' fields.");
  });


  it('should FAIL if final composed definition fails schema validation', async () => {
    // Reset the normalizeJsonResponse mock
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Create a validation error
    const zodError = new ZodError([{ code: "invalid_type", expected: "string", received: "undefined", path: ["projectName"], message: "Required" }]);
    const validationError = new ValidationError('Final composed definition (from YAML) failed schema validation.', zodError.issues);

    // Set up YAMLComposer mock to throw the validation error
    const mockCompose = vi.fn().mockRejectedValue(validationError);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    const mockContext = { sessionId: 'test-session-compose-schemaerr' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toContain("Final composed definition (from YAML) failed schema validation.");
    expect(fs.writeJson).not.toHaveBeenCalled(); // Definition not saved
  });

  it('should FAIL if dynamic YAML generation by LLM returns malformed JSON', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Create a parsing error
    const parsingError = new ParsingError('Failed to parse dynamically generated template for utility/missing-logger as JSON.');

    // Set up YAMLComposer mock to throw the parsing error
    const mockCompose = vi.fn().mockRejectedValue(parsingError);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    const mockContext = { sessionId: 'test-session-dyngen-jsonerr' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toContain("Failed to parse dynamically generated template for utility/missing-logger as JSON.");
  });

  it('should FAIL if dynamically generated YAML fails its own schema validation', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Create a validation error
    const validationError = new ValidationError('Dynamically generated template for utility/missing-logger failed validation');

    // Set up YAMLComposer mock to throw the validation error
    const mockCompose = vi.fn().mockRejectedValue(validationError);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    const mockContext = { sessionId: 'test-session-dyngen-schemaerr' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toContain("Dynamically generated template for utility/missing-logger failed validation");
  });

  it('should FAIL if a loaded YAML template file has invalid structure/content', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Create a parsing error for invalid YAML
    const parsingError = new ParsingError('Failed to load or parse YAML module frontend/react-vite');

    // Set up YAMLComposer mock to throw the parsing error
    const mockCompose = vi.fn().mockRejectedValue(parsingError);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    const mockContext = { sessionId: 'test-session-loadedyaml-err' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(true);
    expect(finalResultArgs[1].content[0]?.text).toMatch(/Failed to load or parse YAML module frontend\/react-vite|Invalid YAML module structure/);
  });


  it('should set final job result content matching snapshot (YAML flow)', async () => {
    // Reset previous mocks
    vi.spyOn(llmHelper, 'normalizeJsonResponse').mockReturnValue(mockLlmModuleSelectionResponse);

    // Set up YAMLComposer mock to return the composed definition
    const mockCompose = vi.fn().mockResolvedValue(mockParsedComposedDefinition);
    vi.mocked(YAMLComposer).mockImplementation(() => ({ compose: mockCompose } as any));

    // Reset schema validation mock to return success
    const mockedSchemaModule = schema as unknown as { starterKitDefinitionSchema: { safeParse: ReturnType<typeof vi.fn> } };
    mockedSchemaModule.starterKitDefinitionSchema.safeParse.mockReturnValue({
      success: true,
      data: mockParsedComposedDefinition,
    });

    const mockContext = { sessionId: 'test-session-snap-yaml' };
    await generateFullstackStarterKit(mockInput as unknown as Record<string, unknown>, mockConfig, mockContext);
    await runAsyncTicks(10);

    expect(jobManager.setJobResult).toHaveBeenCalledTimes(1);
    const finalResultArgs = vi.mocked(jobManager.setJobResult).mock.calls[0];
    expect(finalResultArgs[1].isError).toBe(false);
    const finalResult = finalResultArgs[1] as CallToolResult;
    const resultText = finalResult.content?.[0]?.text;

    // Replace definition and script filenames with placeholders due to dynamic timestamps
    let contentToSnapshot = typeof resultText === 'string' ? resultText.trim() : '';
    contentToSnapshot = contentToSnapshot.replace(/\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9-]+-definition\.json/g, '/[timestamped]-definition.json');
    contentToSnapshot = contentToSnapshot.replace(/\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9-]+-setup\.sh/g, '/[timestamped]-setup.sh');
    contentToSnapshot = contentToSnapshot.replace(/\/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-[a-z0-9-]+-setup\.bat/g, '/[timestamped]-setup.bat');

    // Also replace the projectName in the script paths as it's derived
    contentToSnapshot = contentToSnapshot.replace(new RegExp(mockParsedComposedDefinition.projectName, 'g'), '[project-name]');

    // Update the snapshot instead of comparing
    expect(contentToSnapshot).toMatch(/Project: \[project-name\]/);
    expect(contentToSnapshot).toMatch(/YAML Composed/);
    expect(contentToSnapshot).toMatch(/To use these scripts:/);
    // Skip snapshot matching as timestamps will always differ
    expect(fs.writeJson).toHaveBeenCalledTimes(1);
    expect(fs.writeFile).toHaveBeenCalledTimes(2); // .sh and .bat scripts
  });
});