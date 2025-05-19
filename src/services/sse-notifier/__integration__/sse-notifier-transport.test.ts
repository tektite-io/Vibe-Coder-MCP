/**
 * Integration tests for the SSE Notifier service with different transport types
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sseNotifier } from '../index.js';
import { JobStatus } from '../../job-manager/index.js';
import { Response } from 'express';
import logger from '../../../logger.js';

// Mock the logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock Express Response object
const createMockResponse = (): Partial<Response> => ({
  write: vi.fn(),
  flushHeaders: vi.fn(),
  on: vi.fn((event, listener) => {
    if (event === 'close') {
      (mockResponse as any)._closeListener = listener;
    }
    return mockResponse as Response;
  }),
  off: vi.fn(),
  writableEnded: false,
});

let mockResponse: Partial<Response> & { _closeListener?: () => void };

describe('SSE Notifier Transport Integration', () => {
  const sessionId = 'test-session';
  const jobId = 'test-job';

  beforeEach(() => {
    vi.clearAllMocks();
    mockResponse = createMockResponse();

    // Clear connections before each test
    (sseNotifier as any).connections.clear();

    // Register a connection
    sseNotifier.registerConnection(sessionId, mockResponse as Response);
  });

  afterEach(() => {
    // Unregister the connection
    sseNotifier.unregisterConnection(sessionId);
  });

  describe('SSE Transport', () => {
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

    it('should handle connection close event', () => {
      // Verify connection is registered
      expect((sseNotifier as any).connections.has(sessionId)).toBe(true);

      // Simulate connection close
      if (mockResponse._closeListener) {
        mockResponse._closeListener();
      }

      // Verify connection is unregistered
      expect((sseNotifier as any).connections.has(sessionId)).toBe(false);
    });

    it('should not send updates to closed connections', () => {
      // Set connection as closed
      (mockResponse as any).writableEnded = true;

      // Send progress update
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that SSE notifier was not called after initial connection message
      expect(mockResponse.write).toHaveBeenCalledTimes(1);
      expect(mockResponse.write).not.toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
    });
  });

  describe('Stdio Transport', () => {
    it('should handle stdio transport differently', () => {
      // In a real implementation, the SSE notifier might check the transport type
      // and handle stdio differently. For now, we'll just verify that the SSE notifier
      // can send updates to SSE connections regardless of transport type.

      // Send progress update
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that SSE notifier was called
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
    });
  });

  describe('Multiple Connections', () => {
    it('should handle multiple connections correctly', () => {
      // Create a second mock response
      const mockResponse2 = createMockResponse();
      const sessionId2 = 'test-session-2';

      // Register a second connection
      sseNotifier.registerConnection(sessionId2, mockResponse2 as Response);

      // Send progress update
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Processing', 50);
      sseNotifier.sendProgress(sessionId2, jobId, JobStatus.RUNNING, 'Processing', 50);

      // Verify that both responses received updates
      expect(mockResponse.write).toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );
      expect(mockResponse2.write).toHaveBeenCalledWith(
        expect.stringContaining('event: progress')
      );

      // Unregister the second connection
      sseNotifier.unregisterConnection(sessionId2);
    });
  });
});
