/**
 * Tests for the MemoryLeakDetector class.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryLeakDetector } from '../memoryLeakDetector.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Mock the parser's getMemoryStats function
vi.mock('../../parser.js', () => ({
  getMemoryStats: vi.fn().mockReturnValue({
    heapUsed: 100000000,
    heapTotal: 200000000,
    rss: 150000000,
    systemTotal: 1000000000,
    memoryUsagePercentage: 0.15,
    formatted: {
      heapUsed: '95.37 MB',
      heapTotal: '190.73 MB',
      rss: '143.05 MB',
      systemTotal: '953.67 MB'
    }
  }),
}));

// Mock process.memoryUsage
vi.mock('process', () => ({
  memoryUsage: vi.fn().mockReturnValue({
    rss: 150000000,
    heapTotal: 200000000,
    heapUsed: 100000000,
    external: 10000000,
    arrayBuffers: 5000000
  })
}));

// Mock v8.getHeapSnapshot
vi.mock('v8', () => ({
  getHeapSnapshot: vi.fn().mockReturnValue({
    pipe: vi.fn((writeStream) => {
      // Simulate writing to the stream
      setTimeout(() => {
        writeStream.emit('finish');
      }, 10);
    })
  })
}));

// Mock fs.createWriteStream
vi.mock('fs', () => ({
  createWriteStream: vi.fn().mockReturnValue({
    on: vi.fn((event, callback) => {
      // Store the callback for later use
      if (event === 'finish') {
        (vi.mocked(fs).createWriteStream as any).finishCallback = callback;
      }
    }),
    emit: vi.fn((event) => {
      // Call the stored callback
      if (event === 'finish' && (vi.mocked(fs).createWriteStream as any).finishCallback) {
        (vi.mocked(fs).createWriteStream as any).finishCallback();
      }
    })
  })
}));

describe('MemoryLeakDetector', () => {
  let tempDir: string;
  let detector: MemoryLeakDetector;

  beforeEach(async () => {
    // Create a temporary directory for snapshots
    tempDir = path.join(os.tmpdir(), `memory-leak-detector-test-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Create a new detector instance
    detector = new MemoryLeakDetector({
      snapshotDir: tempDir,
      snapshotInterval: 1000, // 1 second
      maxSnapshots: 3,
      leakThreshold: 0.2, // 20%
      autoDetect: false, // Disable auto-detection for tests
      checkInterval: 500, // 0.5 seconds
      maxSamples: 5
    });

    await detector.init();
  });

  afterEach(async () => {
    // Clean up the detector
    detector.cleanup();

    // Clean up the temporary directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Error cleaning up temp directory:', error);
    }
  });

  it('should initialize correctly', () => {
    expect(detector).toBeDefined();
  });

  it('should take memory samples', () => {
    // Take a memory sample (private method, so we need to call it through a public method)
    const result = detector.analyzeMemoryTrend();
    
    // Should have one sample
    expect(result.samples).toHaveLength(1);
    
    // Sample should have the correct properties
    const sample = result.samples[0];
    expect(sample.heapUsed).toBe(100000000);
    expect(sample.heapTotal).toBe(200000000);
    expect(sample.rss).toBe(150000000);
    expect(sample.external).toBe(10000000);
    expect(sample.arrayBuffers).toBe(5000000);
  });

  it('should analyze memory trend', async () => {
    // First sample
    detector.analyzeMemoryTrend();
    
    // Mock process.memoryUsage to return increased values
    vi.mocked(process.memoryUsage).mockReturnValue({
      rss: 180000000, // 20% increase
      heapTotal: 240000000, // 20% increase
      heapUsed: 130000000, // 30% increase
      external: 12000000, // 20% increase
      arrayBuffers: 6000000 // 20% increase
    });
    
    // Second sample
    const result = detector.analyzeMemoryTrend();
    
    // Should detect a leak
    expect(result.leakDetected).toBe(true);
    expect(result.leakType).toBe('heap');
    expect(result.trend).toBe('increasing');
    expect(result.increasePercentage).toBeCloseTo(30, 0); // 30% increase
  });

  it('should take heap snapshots', async () => {
    const snapshotPath = await detector.takeHeapSnapshot();
    
    // Should return a valid path
    expect(snapshotPath).toContain(tempDir);
    expect(snapshotPath).toContain('heap-snapshot-');
    
    // Should have one snapshot
    const snapshots = detector.getAllSnapshots();
    expect(snapshots).toHaveLength(1);
    
    // Snapshot should have the correct properties
    const snapshot = snapshots[0];
    expect(snapshot.path).toBe(snapshotPath);
    expect(snapshot.memoryUsage.heapUsed).toBe(100000000);
  });

  it('should compare heap snapshots', async () => {
    // Take two snapshots
    const snapshot1Path = await detector.takeHeapSnapshot();
    
    // Mock fs.stat to return different sizes
    vi.mocked(fs.stat).mockResolvedValueOnce({ size: 1000000 } as any);
    vi.mocked(fs.stat).mockResolvedValueOnce({ size: 1200000 } as any);
    
    // Compare snapshots
    const comparison = await detector.compareHeapSnapshots(snapshot1Path, snapshot1Path);
    
    // Should return a valid comparison
    expect(comparison.snapshot1Size).toBe(1000000);
    expect(comparison.snapshot2Size).toBe(1200000);
    expect(comparison.sizeDiff).toBe(200000);
    expect(comparison.percentChange).toBe(20);
  });
});
