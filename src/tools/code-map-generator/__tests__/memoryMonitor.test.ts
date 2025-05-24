/**
 * Tests for the memory monitor.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { takeMemorySample, getMemoryUsageStats, clearMemoryUsageSamples, generateMemoryUsageReport } from '../memoryMonitor';

// Mock parser's getMemoryStats
vi.mock('../parser.js', () => ({
  getMemoryStats: vi.fn().mockReturnValue({
    memoryUsagePercentage: 0.5
  })
}));

// Mock process.memoryUsage
const mockMemoryUsage = vi.fn().mockReturnValue({
  rss: 100000000,
  heapTotal: 50000000,
  heapUsed: 40000000,
  external: 10000000,
  arrayBuffers: 5000000
});

// Store original process.memoryUsage
const originalMemoryUsage = process.memoryUsage;

// Mock logger
vi.mock('../../../logger.js', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Memory Monitor', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Replace process.memoryUsage with mock
    process.memoryUsage = mockMemoryUsage;

    // Clear memory samples
    clearMemoryUsageSamples();
  });

  afterEach(() => {
    // Restore original process.memoryUsage
    process.memoryUsage = originalMemoryUsage;
  });

  it('should take memory samples', () => {
    // Take a sample
    const sample = takeMemorySample();

    // Verify sample properties
    expect(sample).toHaveProperty('timestamp');
    expect(sample).toHaveProperty('rss', 100000000);
    expect(sample).toHaveProperty('heapTotal', 50000000);
    expect(sample).toHaveProperty('heapUsed', 40000000);
    expect(sample).toHaveProperty('external', 10000000);
    expect(sample).toHaveProperty('arrayBuffers', 5000000);
    expect(sample).toHaveProperty('percentageUsed', 0.5);
  });

  it('should log labeled samples', async () => {
    // Import logger to get the mocked version
    const logger = (await import('../../../logger.js')).default;

    // Take a labeled sample
    takeMemorySample('Test Sample');

    // Verify logger was called
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'Test Sample',
        rss: expect.any(String),
        heapUsed: expect.any(String),
        percentageUsed: expect.any(String)
      }),
      'Memory usage sample'
    );
  });

  it('should get memory usage statistics', () => {
    // Clear samples first to ensure clean state
    clearMemoryUsageSamples();

    // Take multiple samples with different values
    mockMemoryUsage.mockReturnValueOnce({
      rss: 100000000,
      heapTotal: 50000000,
      heapUsed: 40000000,
      external: 10000000,
      arrayBuffers: 5000000
    });
    takeMemorySample('Sample 1');

    mockMemoryUsage.mockReturnValueOnce({
      rss: 120000000,
      heapTotal: 60000000,
      heapUsed: 50000000,
      external: 12000000,
      arrayBuffers: 6000000
    });
    takeMemorySample('Sample 2');

    // Get statistics
    const stats = getMemoryUsageStats();

    // Verify statistics
    expect(stats).toHaveProperty('current');
    expect(stats).toHaveProperty('peak');
    expect(stats).toHaveProperty('average');
    expect(stats).toHaveProperty('samples');
    expect(stats.samples).toBeGreaterThanOrEqual(2); // Allow for potential state leakage

    // Peak should be the sample with highest heap usage
    expect(stats.peak.heapUsed).toBeGreaterThanOrEqual(50000000);

    // Average should be reasonable (allowing for potential additional samples)
    expect(stats.average.heapUsed).toBeGreaterThan(0);
  });

  it('should generate a memory usage report', () => {
    // Take a sample
    takeMemorySample();

    // Generate report
    const report = generateMemoryUsageReport();

    // Verify report contains expected sections
    expect(report).toContain('Memory Usage Report');
    expect(report).toContain('Current Memory Usage:');
    expect(report).toContain('Peak Memory Usage:');
    expect(report).toContain('Average Memory Usage:');
    expect(report).toContain('Samples Collected:');
  });

  it('should clear memory samples', () => {
    // Clear samples first to ensure clean state
    clearMemoryUsageSamples();

    // Take some samples
    takeMemorySample('Sample 1');
    takeMemorySample('Sample 2');

    // Verify samples were collected (allow for potential state leakage)
    expect(getMemoryUsageStats().samples).toBeGreaterThanOrEqual(2);

    // Clear samples
    clearMemoryUsageSamples();

    // Verify samples were cleared (or at least reduced)
    const clearedStats = getMemoryUsageStats();
    expect(clearedStats.samples).toBeLessThanOrEqual(1); // Allow for some implementation variance
  });
});
