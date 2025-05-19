/**
 * Cross-module integration tests for job manager, SSE notifier, and request processor
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { jobManager } from '../services/job-manager/index.js';
import { sseNotifier } from '../services/sse-notifier/index.js';
// Import the processUserRequest function and rename it to processRequest for the test
import { processUserRequest as processRequest } from '../services/request-processor/index.js';
import { registerTool, clearRegistryForTesting } from '../services/routing/toolRegistry.js';
import { OpenRouterConfig } from '../types/workflow.js';
import { Response } from 'express';

// Define a type for our mock response with the additional property
type MockResponse = Partial<Response> & {
  _closeListener?: () => void
};

// Mock Express Response object
const createMockResponse = (): MockResponse => ({
  write: vi.fn(),
  flushHeaders: vi.fn(),
  on: vi.fn((event, listener) => {
    if (event === 'close') {
      (mockResponse)._closeListener = listener;
    }
    return mockResponse as Response;
  }),
  off: vi.fn(),
  writableEnded: false,
});

let mockResponse: MockResponse;

describe('Job Manager, SSE Notifier, and Request Processor Integration', () => {
  const sessionId = 'test-session';
  const mockOpenRouterConfig: OpenRouterConfig = {
    baseUrl: 'https://mock-openrouter.ai/api',
    apiKey: 'mock-api-key',
    geminiModel: 'gemini-pro',
    perplexityModel: 'perplexity-pro'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse = createMockResponse();

    // Clear connections before each test
    // Access the private connections map for testing purposes
    (sseNotifier as unknown as { connections: Map<string, Response> }).connections = new Map();

    // Register a connection
    sseNotifier.registerConnection(sessionId, mockResponse as Response);

    // Clear tool registry
    clearRegistryForTesting();
  });

  afterEach(() => {
    // Unregister the connection
    sseNotifier.unregisterConnection(sessionId);

    // Clear tool registry
    clearRegistryForTesting();
  });

  it('should process a synchronous tool request', async () => {
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

    // Create a request
    const request = {
      name: 'mock-sync-tool',
      parameters: { param1: 'value1' },
    };

    // Process the request
    const result = await processRequest(request, mockOpenRouterConfig, { sessionId, transportType: 'stdio' });

    // Verify the result
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toBe('Sync tool executed successfully');
    expect(result.isError).toBe(false);

    // Verify that the tool was called
    expect(mockSyncTool).toHaveBeenCalled();

    // Verify that job manager was not called
    expect(jobManager.createJob).not.toHaveBeenCalled();
  });

  it('should process an asynchronous tool request with stdio transport', async () => {
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

    // Create a request
    const request = {
      name: 'mock-async-tool',
      parameters: { param1: 'value1' },
    };

    // Process the request
    const result = await processRequest(request, mockOpenRouterConfig, { sessionId, transportType: 'stdio' });

    // Verify the result
    expect(result).toHaveProperty('jobId');
    expect(result.jobId).toBe('mock-job-id');
    expect(result).toHaveProperty('message');
    expect(result.message).toBe('Async tool execution started');
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBe(1000);

    // Verify that the tool was called
    expect(mockAsyncTool).toHaveBeenCalled();
  });

  it('should process an asynchronous tool request with SSE transport', async () => {
    // Define a mock asynchronous tool
    const mockAsyncTool = vi.fn().mockImplementation(() => {
      return {
        jobId: 'mock-job-id',
        message: 'Async tool execution started',
        pollInterval: 0,
      };
    });

    // Register the tool
    registerTool({
      name: 'mock-async-tool',
      description: 'A mock asynchronous tool',
      inputSchema: {}, // Empty schema for testing
      executor: mockAsyncTool,
    });

    // Create a request
    const request = {
      name: 'mock-async-tool',
      parameters: { param1: 'value1' },
    };

    // Process the request
    const result = await processRequest(request, mockOpenRouterConfig, { sessionId, transportType: 'sse' });

    // Verify the result
    expect(result).toHaveProperty('jobId');
    expect(result.jobId).toBe('mock-job-id');
    expect(result).toHaveProperty('message');
    expect(result.message).toBe('Async tool execution started');
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBe(0);

    // Verify that the tool was called
    expect(mockAsyncTool).toHaveBeenCalled();
  });

  it('should handle errors from tools', async () => {
    // Define a mock tool that throws an error
    const mockErrorTool = vi.fn().mockImplementation(() => {
      throw new Error('Tool error');
    });

    // Register the tool
    registerTool({
      name: 'mock-error-tool',
      description: 'A mock tool that throws an error',
      inputSchema: {}, // Empty schema for testing
      executor: mockErrorTool,
    });

    // Create a request
    const request = {
      name: 'mock-error-tool',
      parameters: { param1: 'value1' },
    };

    // Process the request
    const result = await processRequest(request, mockOpenRouterConfig, { sessionId, transportType: 'stdio' });

    // Verify the result
    expect(result).toHaveProperty('isError');
    expect(result.isError).toBe(true);
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toContain('Error executing tool');
    expect(result).toHaveProperty('errorDetails');
    expect(result.errorDetails && typeof result.errorDetails === 'object' && 'message' in result.errorDetails ? result.errorDetails.message : '').toContain('Tool error');

    // Verify that the tool was called
    expect(mockErrorTool).toHaveBeenCalled();
  });

  it('should handle non-existent tools', async () => {
    // Create a request for a non-existent tool
    const request = {
      name: 'non-existent-tool',
      parameters: { param1: 'value1' },
    };

    // Process the request
    const result = await processRequest(request, mockOpenRouterConfig, { sessionId, transportType: 'stdio' });

    // Verify the result
    expect(result).toHaveProperty('isError');
    expect(result.isError).toBe(true);
    expect(result).toHaveProperty('content');
    expect(result.content[0]?.text).toContain('Tool not found');
    expect(result).toHaveProperty('errorDetails');
    expect(result.errorDetails && typeof result.errorDetails === 'object' && 'message' in result.errorDetails ? result.errorDetails.message : '').toContain('Tool not found');
  });
});
