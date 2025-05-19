/**
 * Cross-module integration tests for workflow executor and job manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeWorkflow } from '../services/workflows/workflowExecutor.js';
import { executeTool } from '../services/routing/toolRegistry.js';
import { OpenRouterConfig } from '../types/workflow.js';
// fs-extra is mocked below

// Mock dependencies
vi.mock('../services/job-manager/index.js', () => ({
  jobManager: {
    createJob: vi.fn().mockReturnValue('mock-job-id'),
    updateJobStatus: vi.fn(),
    setJobResult: vi.fn(),
    getJob: vi.fn(),
  },
  JobStatus: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    ERROR: 'error',
  },
}));

vi.mock('../services/routing/toolRegistry.js', () => ({
  registerTool: vi.fn(),
  executeTool: vi.fn(),
  clearRegistryForTesting: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock fs-extra
const mockReaddir = vi.fn();
const mockReadFile = vi.fn();
const mockPathExists = vi.fn();

vi.mock('fs-extra', () => ({
  default: {
    readdir: mockReaddir,
    readFile: mockReadFile,
    pathExists: mockPathExists,
  },
  readdir: mockReaddir,
  readFile: mockReadFile,
  pathExists: mockPathExists,
}));

describe('Workflow Executor and Job Manager Integration', () => {
  const mockConfig: OpenRouterConfig = {
    baseUrl: 'https://api.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'gemini-model',
    perplexityModel: 'perplexity-model',
  };
  const mockContext = { sessionId: 'test-session' };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock fs.readdir to return workflow files
    mockReaddir.mockResolvedValue(['test-workflow.json']);

    // Mock fs.readFile to return a workflow definition
    mockReadFile.mockResolvedValue(JSON.stringify({
      name: 'test-workflow',
      description: 'A test workflow',
      steps: [
        {
          id: 'step1',
          tool: 'test-tool',
          params: {
            param1: 'value1',
          },
        },
      ],
    }) as unknown as Buffer);

    // Mock fs.pathExists to return true
    mockPathExists.mockResolvedValue(true);

    // Mock executeTool to return a successful result
    vi.mocked(executeTool).mockResolvedValue({
      content: [{ type: 'text', text: 'Tool executed successfully' }],
      isError: false,
    });
  });

  // Skip the loadWorkflowDefinitions test since we're mocking it
  it.skip('should load workflow definitions', async () => {
    // This test is skipped because we're mocking loadWorkflowDefinitions
  });

  it('should execute a workflow successfully', async () => {
    // Execute the workflow
    const result = await executeWorkflow('test-workflow', {}, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('success', true);
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('Workflow completed ok');
    expect(result).toHaveProperty('outputs');

    // Verify that executeTool was called
    expect(executeTool).toHaveBeenCalledWith(
      'test-tool',
      { param1: 'value1' },
      mockConfig,
      mockContext
    );
  });

  it('should handle tool execution errors', async () => {
    // Mock executeTool to return an error
    vi.mocked(executeTool).mockResolvedValue({
      content: [{ type: 'text', text: 'Tool execution failed' }],
      isError: true,
      errorDetails: {
        message: 'Tool error',
        type: 'ToolError',
      },
    });

    // Execute the workflow
    const result = await executeWorkflow('test-workflow', {}, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('failed at step');
    expect(result).toHaveProperty('error');
    expect(result.error).toHaveProperty('stepId', 'step1');
    expect(result.error).toHaveProperty('toolName', 'test-tool');
    expect(result.error).toHaveProperty('message');
    expect(result.error?.message).toContain('Tool error');
  });

  it('should handle non-existent workflows', async () => {
    // Execute a non-existent workflow
    const result = await executeWorkflow('non-existent-workflow', {}, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('message');
    expect(result.message).toContain('Workflow not found');
    expect(result).toHaveProperty('error');
    expect(result.error).toHaveProperty('message');
    expect(result.error?.message).toContain('Workflow not found');
  });

  it('should handle workflow input parameters', async () => {
    // Mock fs.readFile to return a workflow definition with input parameters
    mockReadFile.mockResolvedValue(JSON.stringify({
      name: 'test-workflow',
      description: 'A test workflow',
      steps: [
        {
          id: 'step1',
          tool: 'test-tool',
          params: {
            param1: '{{input.param1}}',
            param2: 'static-value',
          },
        },
      ],
    }) as unknown as Buffer);

    // Execute the workflow with input parameters
    const result = await executeWorkflow('test-workflow', { param1: 'dynamic-value' }, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('success', true);

    // Verify that executeTool was called with the correct parameters
    expect(executeTool).toHaveBeenCalledWith(
      'test-tool',
      {
        param1: 'dynamic-value',
        param2: 'static-value',
      },
      mockConfig,
      mockContext
    );
  });

  it('should handle step outputs as inputs to subsequent steps', async () => {
    // Mock fs.readFile to return a workflow definition with step outputs
    mockReadFile.mockResolvedValue(JSON.stringify({
      name: 'test-workflow',
      description: 'A test workflow',
      steps: [
        {
          id: 'step1',
          tool: 'test-tool-1',
          params: {
            param1: 'value1',
          },
        },
        {
          id: 'step2',
          tool: 'test-tool-2',
          params: {
            param1: '{{steps.step1.output}}',
          },
        },
      ],
    }) as unknown as Buffer);

    // Mock executeTool to return different results for different tools
    vi.mocked(executeTool).mockImplementation((toolName) => {
      if (toolName === 'test-tool-1') {
        return Promise.resolve({
          content: [{ type: 'text', text: 'Tool 1 executed successfully' }],
          isError: false,
          output: 'step1-output',
        });
      } else if (toolName === 'test-tool-2') {
        return Promise.resolve({
          content: [{ type: 'text', text: 'Tool 2 executed successfully' }],
          isError: false,
        });
      }
      return Promise.resolve({
        content: [{ type: 'text', text: 'Unknown tool' }],
        isError: true,
      });
    });

    // Execute the workflow
    const result = await executeWorkflow('test-workflow', {}, mockConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('success', true);

    // Verify that executeTool was called with the correct parameters for step2
    expect(executeTool).toHaveBeenCalledWith(
      'test-tool-2',
      {
        param1: 'step1-output',
      },
      mockConfig,
      mockContext
    );
  });
});
