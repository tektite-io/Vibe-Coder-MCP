/**
 * Cross-module integration tests for routing service and tools
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { registerTool, executeTool, clearRegistryForTesting } from '../services/routing/toolRegistry.js';
import { jobManager } from '../services/job-manager/index.js';
import { OpenRouterConfig } from '../types/workflow.js';
// JobStatus is imported for the mock but not directly used in tests
// import { sseNotifier } from '../services/sse-notifier/index.js';
// import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
// import logger from '../logger.js';

// Mock the job manager and SSE notifier
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

vi.mock('../services/sse-notifier/index.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('Routing Service and Tools Integration', () => {
  const mockContext = { sessionId: 'test-session' };
  const mockOpenRouterConfig: OpenRouterConfig = {
    baseUrl: 'https://mock-openrouter.ai/api',
    apiKey: 'mock-api-key',
    geminiModel: 'gemini-pro',
    perplexityModel: 'perplexity-pro'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearRegistryForTesting();
  });

  afterEach(() => {
    clearRegistryForTesting();
  });

  it('should register and execute a synchronous tool', async () => {
    // Define a mock synchronous tool
    const mockSyncTool = vi.fn().mockImplementation(() => {
      return {
        content: [{ text: 'Sync tool executed successfully' }],
        isError: false,
      };
    });

    // Register the tool
    registerTool({
      name: 'mock-sync-tool',
      description: 'A mock synchronous tool',
      inputSchema: {}, // Empty schema for testing
      executor: mockSyncTool,
    });

    // Execute the tool
    const params = { param1: 'value1' };
    const result = await executeTool('mock-sync-tool', params, mockOpenRouterConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toBe('Sync tool executed successfully');
    expect(result.isError).toBe(false);

    // Verify that the tool was called
    expect(mockSyncTool).toHaveBeenCalledWith(params, mockOpenRouterConfig, mockContext);

    // Verify that job manager was not called
    expect(jobManager.createJob).not.toHaveBeenCalled();
  });

  it('should register and execute an asynchronous tool', async () => {
    // Define a mock asynchronous tool
    const mockAsyncTool = vi.fn().mockImplementation(() => {
      return {
        jobId: 'mock-job-id',
        message: 'Async tool execution started',
        pollInterval: 1000,
      };
    });

    // Register the tool
    registerTool({
      name: 'mock-async-tool',
      description: 'A mock asynchronous tool',
      inputSchema: {}, // Empty schema for testing
      executor: mockAsyncTool,

    });

    // Execute the tool
    const params = { param1: 'value1' };
    const result = await executeTool('mock-async-tool', params, mockOpenRouterConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('jobId');
    expect(result.jobId).toBe('mock-job-id');
    expect(result).toHaveProperty('message');
    expect(result.message).toBe('Async tool execution started');
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBe(1000);

    // Verify that the tool was called
    expect(mockAsyncTool).toHaveBeenCalledWith(params, mockOpenRouterConfig, mockContext);
  });

  it('should handle errors from synchronous tools', async () => {
    // Define a mock synchronous tool that throws an error
    const mockErrorTool = vi.fn().mockImplementation(() => {
      throw new Error('Sync tool error');
    });

    // Register the tool
    registerTool({
      name: 'mock-error-tool',
      description: 'A mock synchronous tool that throws an error',
      inputSchema: {}, // Empty schema for testing
      executor: mockErrorTool,
    });

    // Execute the tool
    const params = { param1: 'value1' };
    const result = await executeTool('mock-error-tool', params, mockOpenRouterConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('isError');
    expect(result.isError).toBe(true);
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toContain('Error executing tool');
    expect(result).toHaveProperty('errorDetails');
    expect(result.errorDetails && typeof result.errorDetails === 'object' && 'message' in result.errorDetails ? result.errorDetails.message : '').toContain('Sync tool error');

    // Verify that the tool was called
    expect(mockErrorTool).toHaveBeenCalledWith(params, mockOpenRouterConfig, mockContext);
  });

  it('should handle errors from asynchronous tools', async () => {
    // Define a mock asynchronous tool that throws an error
    const mockAsyncErrorTool = vi.fn().mockImplementation(() => {
      throw new Error('Async tool error');
    });

    // Register the tool
    registerTool({
      name: 'mock-async-error-tool',
      description: 'A mock asynchronous tool that throws an error',
      inputSchema: {}, // Empty schema for testing
      executor: mockAsyncErrorTool,

    });

    // Execute the tool
    const params = { param1: 'value1' };
    const result = await executeTool('mock-async-error-tool', params, mockOpenRouterConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('isError');
    expect(result.isError).toBe(true);
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toContain('Error executing tool');
    expect(result).toHaveProperty('errorDetails');
    expect(result.errorDetails && typeof result.errorDetails === 'object' && 'message' in result.errorDetails ? result.errorDetails.message : '').toContain('Async tool error');

    // Verify that the tool was called
    expect(mockAsyncErrorTool).toHaveBeenCalledWith(params, mockOpenRouterConfig, mockContext);
  });

  it('should handle non-existent tools', async () => {
    // Execute a non-existent tool
    const params = { param1: 'value1' };
    const result = await executeTool('non-existent-tool', params, mockOpenRouterConfig, mockContext);

    // Verify the result
    expect(result).toHaveProperty('isError');
    expect(result.isError).toBe(true);
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toContain('Tool not found');
    expect(result).toHaveProperty('errorDetails');
    expect(result.errorDetails && typeof result.errorDetails === 'object' && 'message' in result.errorDetails ? result.errorDetails.message : '').toContain('Tool not found');
  });
});
