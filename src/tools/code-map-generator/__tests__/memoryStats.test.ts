/**
 * Tests for memory stats functions.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { formatBytes, getMemoryStats } from '../parser';
import os from 'os';

// Mock process.memoryUsage
vi.mock('process', () => ({
  memoryUsage: vi.fn().mockReturnValue({
    rss: 100000000,
    heapTotal: 80000000,
    heapUsed: 60000000,
    external: 10000000,
    arrayBuffers: 5000000
  })
}));

// Mock os.totalmem
vi.mock('os', () => ({
  totalmem: vi.fn().mockReturnValue(1000000000)
}));

describe('Memory Stats Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  describe('formatBytes', () => {
    it('should format bytes to human-readable string', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
      expect(formatBytes(1023)).toBe('1023 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });
  });
  
  describe('getMemoryStats', () => {
    it('should return memory usage statistics', () => {
      const stats = getMemoryStats();
      
      expect(stats.heapUsed).toBe(60000000);
      expect(stats.heapTotal).toBe(80000000);
      expect(stats.rss).toBe(100000000);
      expect(stats.systemTotal).toBe(1000000000);
      expect(stats.memoryUsagePercentage).toBe(0.1);
      
      expect(stats.formatted.heapUsed).toBe('57.22 MB');
      expect(stats.formatted.heapTotal).toBe('76.29 MB');
      expect(stats.formatted.rss).toBe('95.37 MB');
      expect(stats.formatted.systemTotal).toBe('953.67 MB');
    });
  });
});
