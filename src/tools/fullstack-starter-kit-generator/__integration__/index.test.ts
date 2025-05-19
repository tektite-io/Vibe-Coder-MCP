/**
 * Integration tests for the Fullstack Starter Kit Generator tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateFullstackStarterKit } from '../index.js';
import { JobStatus, jobManager } from '../../../services/job-manager/index.js';
import { sseNotifier } from '../../../services/sse-notifier/index.js';
import { createMockContext } from '../../../__tests__/utils/job-polling-test-utils.js';
import { createMockFullstackStarterKitGeneratorParams } from '../../../__tests__/utils/mock-factories.js';
import { createTempDir, removeTempDir } from '../../../__tests__/utils/test-helpers.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import fs from 'fs-extra';
import path from 'path';

// Mock the job manager and SSE notifier
vi.mock('../../../services/job-manager/index.js');
vi.mock('../../../services/sse-notifier/index.js');

// Mock the job response formatter
vi.mock('../../../services/job-response-formatter/index.js', () => {
  return {
    formatBackgroundJobInitiationResponse: vi.fn().mockImplementation((jobId) => {
      return {
        content: [{ type: 'text', text: 'Job initiated' }],
        isError: false,
        jobId,
        jobStatus: {
          jobId,
          toolName: 'generate-fullstack-starter-kit',
          status: 'pending',
          message: 'Job initiated',
          progress: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          pollingRecommendation: {
            interval: 1000,
            strategy: 'constant'
          }
        },
        pollInterval: 1000
      };
    }),
  };
});

// Mock the logger
vi.mock('../../../logger.js', () => {
  return {
    default: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

// Mock the research helper
vi.mock('../../../utils/researchHelper.js', () => {
  return {
    performResearchQuery: vi.fn().mockResolvedValue('Mock research results'),
  };
});

// Mock the LLM helper
vi.mock('../../../utils/llmHelper.js', () => {
  return {
    performDirectLlmCall: vi.fn().mockResolvedValue(JSON.stringify({
      globalParams: {
        projectName: "test-project",
        projectDescription: "A test project",
        frontendPath: "client",
        backendPath: "server",
      },
      moduleSelections: [
        { modulePath: "frontend/react-vite", moduleKey: "frontendPath", params: {} },
        { modulePath: "backend/nodejs-express", moduleKey: "backendPath", params: {} },
      ]
    })),
    normalizeJsonResponse: vi.fn().mockImplementation((response) => response),
  };
});

// Mock fs-extra
vi.mock('fs-extra', () => {
  const mockFsExtra = {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    writeJson: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(true),
    readFile: vi.fn().mockResolvedValue('mock yaml content'),
    ensureDirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    removeSync: vi.fn(),
  };
  return {
    default: mockFsExtra,
    ...mockFsExtra
  };
});

// Mock the YAML composer
vi.mock('../yaml-composer.js', () => {
  return {
    YAMLComposer: vi.fn().mockImplementation(() => ({
      compose: vi.fn().mockResolvedValue({
        projectName: "test-project",
        description: "A test project",
        techStack: {
          frontendFramework: { name: "React", version: "18.x", rationale: "Popular frontend framework" },
          backendFramework: { name: "Express", version: "4.x", rationale: "Popular Node.js framework" },
        },
        directoryStructure: [],
        dependencies: { npm: {} },
        setupCommands: [],
        nextSteps: [],
      }),
    })),
  };
});

// Mock the schema
vi.mock('../schema.js', () => {
  return {
    starterKitDefinitionSchema: {
      safeParse: vi.fn().mockReturnValue({
        success: true,
        data: {
          projectName: "test-project",
          description: "A test project",
          techStack: {
            frontendFramework: { name: "React", version: "18.x", rationale: "Popular frontend framework" },
            backendFramework: { name: "Express", version: "4.x", rationale: "Popular Node.js framework" },
          },
          directoryStructure: [],
          dependencies: { npm: {} },
          setupCommands: [],
          nextSteps: [],
        },
      }),
    },
  };
});

// Mock the scripts
vi.mock('../scripts.js', () => {
  return {
    generateSetupScripts: vi.fn().mockReturnValue({
      sh: '#!/bin/bash\necho "Mock shell script"',
      bat: '@echo off\necho Mock batch script',
    }),
  };
});

describe('Fullstack Starter Kit Generator Integration Tests', () => {
  let tempDir: string;
  let mockContext: ReturnType<typeof createMockContext>;
  let mockOpenRouterConfig: OpenRouterConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = createTempDir('fullstack-starter-kit-test-');
    mockContext = createMockContext('test-session', 'stdio');

    // Setup spies on the mocked modules
    vi.spyOn(jobManager, 'createJob');
    vi.spyOn(jobManager, 'updateJobStatus');
    vi.spyOn(jobManager, 'setJobResult');
    vi.spyOn(sseNotifier, 'sendProgress');

    // Create mock OpenRouterConfig
    mockOpenRouterConfig = {
      baseUrl: 'https://mock-openrouter.ai/api',
      apiKey: 'mock-api-key',
      geminiModel: 'gemini-pro',
      perplexityModel: 'perplexity-pro'
    };
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should create a job and return an immediate response', async () => {
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    expect(result).toHaveProperty('jobId');
    expect(result).toHaveProperty('content');
    expect(result).toHaveProperty('pollInterval');
    expect(jobManager.createJob).toHaveBeenCalled();
  });

  it('should update job status with progress percentage', async () => {
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    // Wait for the job to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify job status updates
    expect(jobManager.updateJobStatus).toHaveBeenCalledWith(
      undefined,
      JobStatus.RUNNING,
      expect.any(String)
    );

    // Verify SSE progress updates
    expect(sseNotifier.sendProgress).toHaveBeenCalled();
  });

  it('should handle both stdio and SSE transport types', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('test-session', 'stdio');
    const stdioParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const stdioResult = await generateFullstackStarterKit(stdioParams, mockOpenRouterConfig, stdioContext);

    expect(stdioResult).toHaveProperty('jobId');

    // Test with SSE transport
    const sseContext = createMockContext('test-session', 'sse');
    const sseParams = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    const sseResult = await generateFullstackStarterKit(sseParams, mockOpenRouterConfig, sseContext);

    expect(sseResult).toHaveProperty('jobId');

    // Wait for the jobs to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify SSE progress updates were sent
    expect(sseNotifier.sendProgress).toHaveBeenCalled();
  });

  it('should handle errors gracefully', async () => {
    // Mock YAMLComposer to throw an error
    vi.mock('../yaml-composer.js', () => {
      return {
        YAMLComposer: vi.fn().mockImplementation(() => ({
          compose: vi.fn().mockRejectedValue(new Error('Simulated error')),
        })),
      };
    });

    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node');
    await generateFullstackStarterKit(params, mockOpenRouterConfig, mockContext);

    // Wait for the job to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify error handling
    expect(jobManager.setJobResult).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        isError: true,
        content: expect.arrayContaining([
          expect.objectContaining({
            text: expect.stringContaining('Error')
          })
        ])
      })
    );
  });
});
