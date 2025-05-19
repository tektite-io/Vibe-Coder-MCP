import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processBatches } from '../batchProcessor.js';
import { CodeMapGeneratorConfig } from '../types.js';

// Mock jobManager and sseNotifier
const jobManager = {
  updateJobStatus: vi.fn()
};

const sseNotifier = {
  sendProgress: vi.fn()
};

// No need for mocks since we're defining the objects directly

describe('batchProcessor', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('processBatches', () => {
    it('should process items in batches', async () => {
      // Arrange
      const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const processFn = vi.fn((item) => Promise.resolve(`Processed ${item}`));
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/dir',
        processing: {
          batchSize: 3,
        },
      };
      const jobId = 'test-job';
      const sessionId = 'test-session';
      const taskName = 'Test Task';
      const startProgress = 0;
      const endProgress = 100;

      // Act
      const result = await processBatches(
        items,
        processFn,
        config,
        jobId,
        sessionId,
        taskName,
        startProgress,
        endProgress
      );

      // Assert
      expect(processFn).toHaveBeenCalledTimes(10);
      expect(result).toEqual([
        'Processed 1',
        'Processed 2',
        'Processed 3',
        'Processed 4',
        'Processed 5',
        'Processed 6',
        'Processed 7',
        'Processed 8',
        'Processed 9',
        'Processed 10',
      ]);

      // Check that progress updates were sent
      expect(jobManager.updateJobStatus).toHaveBeenCalledTimes(4); // One for each batch
      expect(sseNotifier.sendProgress).toHaveBeenCalledTimes(4); // One for each batch

      // Check progress percentages
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        sessionId,
        jobId,
        'RUNNING',
        expect.any(String),
        expect.any(Number)
      );
    });

    it('should handle empty items array', async () => {
      // Arrange
      const items: any[] = [];
      const processFn = vi.fn();
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/dir',
      };
      const jobId = 'test-job';
      const sessionId = 'test-session';
      const taskName = 'Test Task';
      const startProgress = 0;
      const endProgress = 100;

      // Act
      const result = await processBatches(
        items,
        processFn,
        config,
        jobId,
        sessionId,
        taskName,
        startProgress,
        endProgress
      );

      // Assert
      expect(processFn).not.toHaveBeenCalled();
      expect(result).toEqual([]);

      // Check that progress updates were sent
      expect(jobManager.updateJobStatus).toHaveBeenCalledTimes(1);
      expect(sseNotifier.sendProgress).toHaveBeenCalledTimes(1);

      // Check progress percentages
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        sessionId,
        jobId,
        'RUNNING',
        expect.stringContaining(taskName),
        endProgress
      );
    });

    it('should handle errors in process function', async () => {
      // Arrange
      const items = [1, 2, 3, 4, 5];
      const processFn = vi.fn((item) => {
        if (item === 3) {
          return Promise.reject(new Error('Test error'));
        }
        return Promise.resolve(`Processed ${item}`);
      });
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/dir',
        processing: {
          batchSize: 2,
        },
      };
      const jobId = 'test-job';
      const sessionId = 'test-session';
      const taskName = 'Test Task';
      const startProgress = 0;
      const endProgress = 100;

      // Act
      const result = await processBatches(
        items,
        processFn,
        config,
        jobId,
        sessionId,
        taskName,
        startProgress,
        endProgress
      );

      // Assert
      expect(processFn).toHaveBeenCalledTimes(5);

      // Check that the error was handled and processing continued
      expect(result).toEqual([
        'Processed 1',
        'Processed 2',
        undefined, // Error occurred here
        'Processed 4',
        'Processed 5',
      ]);

      // Check that progress updates were sent
      expect(jobManager.updateJobStatus).toHaveBeenCalledTimes(3); // One for each batch
      expect(sseNotifier.sendProgress).toHaveBeenCalledTimes(3); // One for each batch
    });

    it('should use default batch size if not specified in config', async () => {
      // Arrange
      const items = Array.from({ length: 150 }, (_, i) => i + 1);
      const processFn = vi.fn((item) => Promise.resolve(`Processed ${item}`));
      const config: CodeMapGeneratorConfig = {
        allowedMappingDirectory: '/test/dir',
      };
      const jobId = 'test-job';
      const sessionId = 'test-session';
      const taskName = 'Test Task';
      const startProgress = 0;
      const endProgress = 100;

      // Act
      const result = await processBatches(
        items,
        processFn,
        config,
        jobId,
        sessionId,
        taskName,
        startProgress,
        endProgress
      );

      // Assert
      expect(processFn).toHaveBeenCalledTimes(150);
      expect(result.length).toBe(150);

      // Check that progress updates were sent (default batch size is 100)
      expect(jobManager.updateJobStatus).toHaveBeenCalledTimes(2); // Two batches with default size
      expect(sseNotifier.sendProgress).toHaveBeenCalledTimes(2); // Two batches with default size
    });
  });
});
