import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { ToolExecutionContext } from '../../../services/routing/toolRegistry.js';

// Mock the job manager
const mockJobManager = {
  createJob: vi.fn(),
  updateJobStatus: vi.fn(),
  setJobResult: vi.fn(),
  getJob: vi.fn()
};

vi.mock('../../../services/job-manager/index.js', () => ({
  jobManager: mockJobManager,
  JobStatus: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

// Also mock the job manager import path used by Context Curator
vi.mock('../../services/job-manager/index.js', () => ({
  jobManager: mockJobManager,
  JobStatus: {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

// Mock the tool registry
const mockRegisterTool = vi.fn();
const mockToolRegistry = {
  getInstance: vi.fn(() => ({
    registerTool: mockRegisterTool
  }))
};

vi.mock('../../../services/routing/toolRegistry.js', async () => {
  const actual = await vi.importActual('../../../services/routing/toolRegistry.js');
  return {
    ...actual,
    registerTool: mockRegisterTool,
    ToolRegistry: mockToolRegistry
  };
});

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock the validation function and other exports
vi.mock('../../types/context-curator.js', async () => {
  const actual = await vi.importActual('../../types/context-curator.js');
  return {
    ...actual,
    validateContextCuratorInput: vi.fn((input) => {
      // Return a valid ContextCuratorInput object regardless of input
      return {
        userPrompt: input.userPrompt || 'Test prompt',
        projectPath: input.projectPath || '/test/project',
        taskType: input.taskType || 'general',
        maxFiles: input.maxFiles || 100,
        includePatterns: input.includePatterns || ['**/*'],
        excludePatterns: input.excludePatterns || ['node_modules/**'],
        focusAreas: input.focusAreas || [],
        useCodeMapCache: input.useCodeMapCache !== false
      };
    })
  };
});

// Mock fs-extra
vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn().mockResolvedValue(undefined)
  }
}));

// Mock the Context Curator service to prevent actual workflow execution
vi.mock('../services/context-curator-service.js', () => ({
  ContextCuratorService: {
    getInstance: vi.fn(() => ({
      executeWorkflow: vi.fn().mockResolvedValue({
        id: 'test-package-id',
        files: [],
        metaPrompt: {},
        statistics: { totalTokens: 0, processingTimeMs: 1000 }
      })
    }))
  }
}));

describe('Context Curator Tool Registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockJobManager.createJob.mockReturnValue('test-job-id-123');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the curate-context tool with correct definition', async () => {
      // Import the module to get the tool definition
      const { contextCuratorToolDefinition } = await import('../../index.js');

      expect(contextCuratorToolDefinition).toMatchObject({
        name: 'curate-context',
        description: expect.stringContaining('Intelligently analyzes codebases'),
        inputSchema: expect.any(Object),
        executor: expect.any(Function)
      });
    });

    it('should have correct input schema structure', async () => {
      const { contextCuratorInputSchemaShape } = await import('../../index.js');

      // Check required fields
      expect(contextCuratorInputSchemaShape).toHaveProperty('prompt');
      expect(contextCuratorInputSchemaShape.prompt).toBeInstanceOf(z.ZodString);

      // Check optional fields with defaults
      expect(contextCuratorInputSchemaShape).toHaveProperty('target_directory');
      expect(contextCuratorInputSchemaShape).toHaveProperty('max_token_budget');
      expect(contextCuratorInputSchemaShape).toHaveProperty('task_type');
      expect(contextCuratorInputSchemaShape).toHaveProperty('include_meta_prompt');
      expect(contextCuratorInputSchemaShape).toHaveProperty('output_format');
    });

    it('should validate input schema correctly', async () => {
      const { contextCuratorInputSchemaShape } = await import('../../index.js');
      const schema = z.object(contextCuratorInputSchemaShape);

      // Valid input
      const validInput = {
        prompt: 'Implement user authentication system'
      };
      expect(() => schema.parse(validInput)).not.toThrow();

      // Valid input with all fields
      const fullInput = {
        prompt: 'Add login functionality',
        target_directory: '/path/to/project',
        max_token_budget: 30000,
        task_type: 'feature_addition',
        include_meta_prompt: true,
        output_format: 'package'
      };
      expect(() => schema.parse(fullInput)).not.toThrow();

      // Invalid input - empty prompt
      const invalidInput = {
        prompt: ''
      };
      expect(() => schema.parse(invalidInput)).toThrow();

      // Invalid input - invalid task type
      const invalidTaskType = {
        prompt: 'test',
        task_type: 'invalid_type'
      };
      expect(() => schema.parse(invalidTaskType)).toThrow();
    });

    it('should apply default values correctly', async () => {
      const { contextCuratorInputSchemaShape } = await import('../../index.js');
      const schema = z.object(contextCuratorInputSchemaShape);

      const minimalInput = {
        prompt: 'Test prompt'
      };

      const parsed = schema.parse(minimalInput);
      expect(parsed.task_type).toBe('auto_detect');
      expect(parsed.include_meta_prompt).toBe(true);
      expect(parsed.output_format).toBe('package');
    });
  });

  describe('Tool Executor', () => {
    let executor: any;
    let mockConfig: OpenRouterConfig;
    let mockContext: ToolExecutionContext;

    beforeEach(async () => {
      // Clear all mocks before each test
      vi.clearAllMocks();
      mockJobManager.createJob.mockReturnValue('test-job-id-123');

      const { contextCuratorExecutor } = await import('../../index.js');
      executor = contextCuratorExecutor;

      mockConfig = {
        apiKey: 'test-api-key',
        baseURL: 'https://openrouter.ai/api/v1',
        llm_mapping: {}
      };

      mockContext = {
        sessionId: 'test-session-123',
        conversationId: 'test-conversation-456'
      };
    });

    it('should create a job and return job ID', async () => {
      const params = {
        prompt: 'Implement authentication',
        target_directory: '/test/project'
      };

      const result = await executor(params, mockConfig, mockContext);

      expect(mockJobManager.createJob).toHaveBeenCalledWith('curate-context', expect.any(Object));
      expect(result.isError).toBe(false);
      expect(result.content[0].type).toBe('text');

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.jobId).toBe('test-job-id-123');
      expect(responseData.status).toBe('initiated');
    });

    it('should handle minimal parameters', async () => {
      const params = {
        prompt: 'Fix login bug'
      };

      const result = await executor(params, mockConfig, mockContext);

      expect(mockJobManager.createJob).toHaveBeenCalledWith('curate-context', expect.any(Object));
      expect(result.isError).toBe(false);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.jobId).toBe('test-job-id-123');
      expect(responseData.status).toBe('initiated');
    });

    it('should handle all parameters', async () => {
      const params = {
        prompt: 'Add user management',
        target_directory: '/path/to/project',
        max_token_budget: 40000,
        task_type: 'feature_addition',
        include_meta_prompt: true,
        output_format: 'structured'
      };

      const result = await executor(params, mockConfig, mockContext);

      expect(mockJobManager.createJob).toHaveBeenCalledWith('curate-context', expect.any(Object));
      expect(result.isError).toBe(false);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.jobId).toBe('test-job-id-123');
      expect(responseData.status).toBe('initiated');
    });

    it('should handle job manager errors gracefully', async () => {
      mockJobManager.createJob.mockImplementation(() => {
        throw new Error('Job creation failed');
      });

      const params = {
        prompt: 'Test prompt'
      };

      const result = await executor(params, mockConfig, mockContext);
      expect(result.isError).toBe(true);

      const responseData = JSON.parse(result.content[0].text);
      expect(responseData.error).toBe('Context curation failed');
    });

    it('should pass correct tool name to job manager', async () => {
      const params = {
        prompt: 'Refactor authentication module'
      };

      await executor(params, mockConfig, mockContext);

      expect(mockJobManager.createJob).toHaveBeenCalledWith('curate-context', expect.any(Object));
    });
  });

  describe('Input Schema Validation Edge Cases', () => {
    let schema: z.ZodObject<any>;

    beforeEach(async () => {
      const { contextCuratorInputSchemaShape } = await import('../../index.js');
      schema = z.object(contextCuratorInputSchemaShape);
    });

    it('should reject prompts that are too short', () => {
      const shortPrompt = {
        prompt: 'a' // Too short
      };
      expect(() => schema.parse(shortPrompt)).toThrow();
    });

    it('should accept valid task types', () => {
      const validTaskTypes = ['feature_addition', 'refactoring', 'bug_fix', 'performance_optimization', 'auto_detect'];
      
      validTaskTypes.forEach(taskType => {
        const input = {
          prompt: 'Test prompt',
          task_type: taskType
        };
        expect(() => schema.parse(input)).not.toThrow();
      });
    });

    it('should accept valid output formats', () => {
      const validFormats = ['package', 'structured'];
      
      validFormats.forEach(format => {
        const input = {
          prompt: 'Test prompt',
          output_format: format
        };
        expect(() => schema.parse(input)).not.toThrow();
      });
    });

    it('should validate token budget ranges', () => {
      // Valid token budget
      const validBudget = {
        prompt: 'Test prompt',
        max_token_budget: 25000
      };
      expect(() => schema.parse(validBudget)).not.toThrow();

      // Invalid token budget - too low
      const lowBudget = {
        prompt: 'Test prompt',
        max_token_budget: 500 // Too low
      };
      expect(() => schema.parse(lowBudget)).toThrow();

      // Invalid token budget - too high
      const highBudget = {
        prompt: 'Test prompt',
        max_token_budget: 600000 // Too high (max is 500000)
      };
      expect(() => schema.parse(highBudget)).toThrow();
    });

    it('should handle boolean values correctly', () => {
      const booleanInput = {
        prompt: 'Test prompt',
        include_meta_prompt: false
      };
      const parsed = schema.parse(booleanInput);
      expect(parsed.include_meta_prompt).toBe(false);
    });
  });

  describe('Tool Description and Metadata', () => {
    it('should have comprehensive tool description', async () => {
      const { contextCuratorToolDefinition } = await import('../../index.js');

      expect(contextCuratorToolDefinition.description).toContain('Intelligently analyzes codebases');
      expect(contextCuratorToolDefinition.description).toContain('context packages');
      expect(contextCuratorToolDefinition.description).toContain('AI-driven development');
      expect(contextCuratorToolDefinition.description).toContain('meta-prompts');
    });

    it('should have correct tool name', async () => {
      const { contextCuratorToolDefinition } = await import('../../index.js');

      expect(contextCuratorToolDefinition.name).toBe('curate-context');
    });
  });
});
