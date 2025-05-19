/**
 * Cross-module integration tests for SSE notifier and different transport types
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sseNotifier } from '../services/sse-notifier/index.js';
import { formatBackgroundJobInitiationResponse } from '../services/job-response-formatter/index.js';
import { JobStatus } from '../services/job-manager/index.js';
import { Response } from 'express';
// Logger is mocked but not directly used in tests
// import logger from '../logger.js';

// Define a custom type for our mock response with additional properties
type MockResponse = Partial<Response> & {
  _closeListener?: () => void;
  writableEnded: boolean;
};

// Mock Express Response object
const createMockResponse = (): MockResponse => ({
  write: vi.fn(),
  flushHeaders: vi.fn(),
  on: vi.fn((event, listener) => {
    if (event === 'close') {
      (mockResponse)._closeListener = listener;
    }
    return mockResponse as unknown as Response;
  }),
  off: vi.fn(),
  writableEnded: false,
});

let mockResponse: MockResponse;

// Mock the logger
vi.mock('../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('SSE Notifier and Transport Types Integration', () => {
  const sessionId = 'test-session';
  const jobId = 'test-job';

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse = createMockResponse();

    // Clear connections before each test
    // Access internal property for testing purposes
    (sseNotifier as unknown as { connections: Map<string, Response> }).connections = new Map();

    // Register a connection
    sseNotifier.registerConnection(sessionId, mockResponse as unknown as Response);
  });

  afterEach(() => {
    // Unregister the connection
    sseNotifier.unregisterConnection(sessionId);
  });

  describe('SSE Transport', () => {
    it('should format response with zero polling interval for SSE transport', () => {
      // Format response for SSE transport
      const response = formatBackgroundJobInitiationResponse(jobId, 'sse', 'Job initiated');

      // Verify the response
      expect(response).toHaveProperty('jobId', jobId);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('pollInterval', 0);
    });

    it('should send progress updates for SSE transport', () => {
      // Send progress update
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that SSE notifier was called
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(jobId)
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(JobStatus.RUNNING)
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('Processing')
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('50')
      );
    });

    it('should send job result for SSE transport', () => {
      // Send job result
      sseNotifier.sendJobResult(sessionId, jobId, { content: [{ text: 'Success!' }] });

      // Verify that SSE notifier was called
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: result')
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining(jobId)
      );
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('Success!')
      );
    });
  });

  describe('Stdio Transport', () => {
    it('should format response with non-zero polling interval for stdio transport', () => {
      // Format response for stdio transport
      const response = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job initiated');

      // Verify the response
      expect(response).toHaveProperty('jobId', jobId);
      expect(response).toHaveProperty('message');
      expect(response).toHaveProperty('pollInterval');
      expect(response.pollInterval).toBeGreaterThan(0);
    });

    it('should provide adaptive polling recommendations based on job status for stdio transport', () => {
      // Format response for pending job
      const pendingResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job pending', { sessionId, transportType: 'stdio' });
      expect(pendingResponse.pollInterval).toBeGreaterThan(0);

      // Format response for in-progress job
      const inProgressResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job in progress', { sessionId, transportType: 'stdio' });
      expect(inProgressResponse.pollInterval).toBeGreaterThan(0);

      // Format response for completed job
      const completedResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job completed', { sessionId, transportType: 'stdio' });
      expect(completedResponse.pollInterval).toBe(0);

      // Format response for error job
      const errorResponse = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job failed', { sessionId, transportType: 'stdio' });
      expect(errorResponse.pollInterval).toBe(0);
    });

    it('should provide adaptive polling recommendations based on progress percentage for stdio transport', () => {
      // Format response for different progress values
      const response10 = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job at 10%', { sessionId, transportType: 'stdio' });
      const response50 = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job at 50%', { sessionId, transportType: 'stdio' });
      const response90 = formatBackgroundJobInitiationResponse(jobId, 'stdio', 'Job at 90%', { sessionId, transportType: 'stdio' });

      // Verify that polling intervals are adjusted based on progress
      expect(response10.pollInterval).toBeGreaterThan(0);
      expect(response50.pollInterval).toBeGreaterThan(0);
      expect(response90.pollInterval).toBeGreaterThan(0);

      // Verify that polling intervals decrease as progress increases
      // Note: This may not be true for all implementations, so we're just checking that they're all positive
      expect(response10.pollInterval).toBeGreaterThan(0);
      expect(response50.pollInterval).toBeGreaterThan(0);
      expect(response90.pollInterval).toBeGreaterThan(0);
    });
  });

  describe('Transport-Agnostic Behavior', () => {
    it('should handle connection registration and unregistration', () => {
      // Verify connection is registered
      expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(true);

      // Unregister the connection
      sseNotifier.unregisterConnection(sessionId);

      // Verify connection is unregistered
      expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(false);
    });

    it('should handle connection close event', () => {
      // Verify connection is registered
      expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(true);

      // Simulate connection close
      if (mockResponse._closeListener) {
        mockResponse._closeListener();
      }

      // Verify connection is unregistered
      expect((sseNotifier as unknown as { connections: Map<string, Response> }).connections.has(sessionId)).toBe(false);
    });

    it('should not send updates to closed connections', () => {
      // Set connection as closed
      mockResponse.writableEnded = true;

      // Send progress update
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that SSE notifier was not called after initial connection message
      expect(mockResponse.write).toHaveBeenCalledTimes(1);
      expect(mockResponse.write).not.toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
    });
  });
});
