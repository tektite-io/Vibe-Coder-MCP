/**
 * Memory Leak Detection and Cleanup Utilities for Testing Infrastructure
 * 
 * Provides comprehensive memory monitoring, leak detection, and cleanup
 * capabilities to ensure tests don't consume excessive memory or leak resources.
 */

import logger from '../logger.js';

/**
 * Memory snapshot for comparison
 */
interface MemorySnapshot {
  timestamp: number;
  usage: NodeJS.MemoryUsage;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  arrayBuffers: number;
}

/**
 * Memory leak detection result
 */
interface MemoryLeakResult {
  hasLeak: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  memoryIncrease: number;
  heapIncrease: number;
  recommendations: string[];
  snapshots: MemorySnapshot[];
}

/**
 * Memory monitoring configuration
 */
interface MemoryMonitorConfig {
  maxHeapSizeMB: number;
  maxRSSizeMB: number;
  leakThresholdMB: number;
  monitoringIntervalMs: number;
  maxSnapshots: number;
  enableGCForcing: boolean;
  warningThresholdMB: number;
}

/**
 * Memory Leak Detector
 */
export class MemoryLeakDetector {
  private static snapshots: MemorySnapshot[] = [];
  private static isMonitoring = false;
  private static monitoringInterval: NodeJS.Timeout | null = null;
  private static isTestEnvironment = false;
  private static config: MemoryMonitorConfig = {
    maxHeapSizeMB: 512,        // Maximum heap size in MB
    maxRSSizeMB: 1024,         // Maximum RSS in MB
    leakThresholdMB: 50,       // Memory increase threshold for leak detection
    monitoringIntervalMs: 5000, // Monitoring interval in milliseconds
    maxSnapshots: 20,          // Maximum number of snapshots to keep
    enableGCForcing: true,     // Enable forcing garbage collection
    warningThresholdMB: 256    // Warning threshold in MB
  };

  /**
   * Initialize the memory leak detector
   */
  static initialize(customConfig?: Partial<MemoryMonitorConfig>): void {
    // Only operate in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      logger.warn('MemoryLeakDetector should only be used in test environment');
      return;
    }

    this.isTestEnvironment = true;
    
    // Apply custom configuration
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    // Adjust config for CI environments
    if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
      this.config.maxHeapSizeMB = Math.min(this.config.maxHeapSizeMB, 256);
      this.config.maxRSSizeMB = Math.min(this.config.maxRSSizeMB, 512);
      this.config.monitoringIntervalMs = Math.max(this.config.monitoringIntervalMs, 10000);
    }

    this.setupProcessMonitors();
    
    logger.debug({ config: this.config }, 'MemoryLeakDetector initialized');
  }

  /**
   * Setup process-level memory monitors
   */
  private static setupProcessMonitors(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    // Monitor memory warnings
    process.on('warning', (warning) => {
      if (warning.name === 'MaxListenersExceededWarning' || 
          warning.message?.includes('memory')) {
        logger.warn({ warning }, 'Memory-related process warning detected');
        this.takeSnapshot('warning');
      }
    });

    logger.debug('Process memory monitors setup completed');
  }

  /**
   * Start memory monitoring
   */
  static startMonitoring(): void {
    if (!this.isTestEnvironment || this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.takeSnapshot('start');

    this.monitoringInterval = setInterval(() => {
      this.takeSnapshot('periodic');
      this.checkMemoryLimits();
    }, this.config.monitoringIntervalMs);

    logger.debug('Memory monitoring started');
  }

  /**
   * Stop memory monitoring
   */
  static stopMonitoring(): void {
    if (!this.isTestEnvironment || !this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    this.takeSnapshot('stop');
    logger.debug('Memory monitoring stopped');
  }

  /**
   * Take a memory snapshot
   */
  static takeSnapshot(reason: string): MemorySnapshot {
    if (!this.isTestEnvironment) {
      return {
        timestamp: Date.now(),
        usage: process.memoryUsage(),
        heapUsed: 0,
        heapTotal: 0,
        external: 0,
        rss: 0,
        arrayBuffers: 0
      };
    }

    // Force garbage collection if enabled and available
    if (this.config.enableGCForcing && global.gc) {
      try {
        global.gc();
      } catch (error) {
        logger.debug({ err: error }, 'Failed to force garbage collection');
      }
    }

    const usage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
      usage,
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
      external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
      rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100,
      arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024 * 100) / 100
    };

    this.snapshots.push(snapshot);

    // Keep only the most recent snapshots
    if (this.snapshots.length > this.config.maxSnapshots) {
      this.snapshots = this.snapshots.slice(-this.config.maxSnapshots);
    }

    logger.debug({ 
      reason, 
      heapUsed: snapshot.heapUsed, 
      rss: snapshot.rss 
    }, 'Memory snapshot taken');

    return snapshot;
  }

  /**
   * Check if memory usage exceeds limits
   */
  private static checkMemoryLimits(): void {
    if (!this.isTestEnvironment || this.snapshots.length === 0) {
      return;
    }

    const latest = this.snapshots[this.snapshots.length - 1];

    // Check heap size limit
    if (latest.heapUsed > this.config.maxHeapSizeMB) {
      logger.error({
        heapUsed: latest.heapUsed,
        maxHeap: this.config.maxHeapSizeMB
      }, 'Heap size limit exceeded');
    }

    // Check RSS limit
    if (latest.rss > this.config.maxRSSizeMB) {
      logger.error({
        rss: latest.rss,
        maxRSS: this.config.maxRSSizeMB
      }, 'RSS size limit exceeded');
    }

    // Check warning threshold
    if (latest.heapUsed > this.config.warningThresholdMB) {
      logger.warn({
        heapUsed: latest.heapUsed,
        warningThreshold: this.config.warningThresholdMB
      }, 'Memory usage approaching warning threshold');
    }
  }

  /**
   * Detect memory leaks between snapshots
   */
  static detectLeaks(startSnapshot?: MemorySnapshot, endSnapshot?: MemorySnapshot): MemoryLeakResult {
    if (!this.isTestEnvironment) {
      return {
        hasLeak: false,
        severity: 'low',
        memoryIncrease: 0,
        heapIncrease: 0,
        recommendations: [],
        snapshots: []
      };
    }

    const start = startSnapshot || (this.snapshots.length >= 2 ? this.snapshots[0] : null);
    const end = endSnapshot || (this.snapshots.length >= 1 ? this.snapshots[this.snapshots.length - 1] : null);

    if (!start || !end) {
      return {
        hasLeak: false,
        severity: 'low',
        memoryIncrease: 0,
        heapIncrease: 0,
        recommendations: ['Insufficient snapshots for leak detection'],
        snapshots: this.snapshots.slice()
      };
    }

    const memoryIncrease = end.rss - start.rss;
    const heapIncrease = end.heapUsed - start.heapUsed;

    let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let hasLeak = false;

    if (heapIncrease > this.config.leakThresholdMB) {
      hasLeak = true;
      if (heapIncrease > this.config.leakThresholdMB * 4) {
        severity = 'critical';
      } else if (heapIncrease > this.config.leakThresholdMB * 2) {
        severity = 'high';
      } else {
        severity = 'medium';
      }
    }

    const recommendations: string[] = [];

    if (hasLeak) {
      recommendations.push(`Heap memory increased by ${heapIncrease.toFixed(2)} MB`);
      
      if (end.external > start.external + 10) {
        recommendations.push('External memory usage increased significantly');
      }
      
      if (end.arrayBuffers > start.arrayBuffers + 5) {
        recommendations.push('Array buffer usage increased significantly');
      }

      recommendations.push('Consider checking for unclosed resources, event listeners, or retained objects');
      
      if (severity === 'critical') {
        recommendations.push('CRITICAL: Memory leak detected - immediate investigation required');
      }
    }

    return {
      hasLeak,
      severity,
      memoryIncrease,
      heapIncrease,
      recommendations,
      snapshots: this.snapshots.slice()
    };
  }

  /**
   * Force garbage collection and return memory statistics
   */
  static forceGarbageCollection(): { before: MemorySnapshot; after: MemorySnapshot; freed: number } {
    if (!this.isTestEnvironment) {
      return {
        before: this.takeSnapshot('before-gc'),
        after: this.takeSnapshot('after-gc'),
        freed: 0
      };
    }

    const before = this.takeSnapshot('before-gc');

    if (global.gc) {
      try {
        global.gc();
      } catch (error) {
        logger.warn({ err: error }, 'Failed to force garbage collection');
      }
    }

    const after = this.takeSnapshot('after-gc');
    const freed = before.heapUsed - after.heapUsed;

    logger.info({
      beforeHeap: before.heapUsed,
      afterHeap: after.heapUsed,
      freed: freed.toFixed(2)
    }, 'Forced garbage collection completed');

    return { before, after, freed };
  }

  /**
   * Get memory usage report
   */
  static getMemoryReport(): {
    current: MemorySnapshot;
    peak: MemorySnapshot;
    average: { heapUsed: number; rss: number };
    trend: 'increasing' | 'decreasing' | 'stable';
    snapshots: MemorySnapshot[];
  } {
    if (!this.isTestEnvironment || this.snapshots.length === 0) {
      const current = this.takeSnapshot('report');
      return {
        current,
        peak: current,
        average: { heapUsed: current.heapUsed, rss: current.rss },
        trend: 'stable',
        snapshots: [current]
      };
    }

    const current = this.snapshots[this.snapshots.length - 1];
    const peak = this.snapshots.reduce((max, snapshot) => 
      snapshot.heapUsed > max.heapUsed ? snapshot : max
    );

    const avgHeap = this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / this.snapshots.length;
    const avgRSS = this.snapshots.reduce((sum, s) => sum + s.rss, 0) / this.snapshots.length;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (this.snapshots.length >= 3) {
      const recent = this.snapshots.slice(-3);
      const first = recent[0].heapUsed;
      const last = recent[recent.length - 1].heapUsed;
      const threshold = 5; // 5MB threshold

      if (last - first > threshold) {
        trend = 'increasing';
      } else if (first - last > threshold) {
        trend = 'decreasing';
      }
    }

    return {
      current,
      peak,
      average: { 
        heapUsed: Math.round(avgHeap * 100) / 100, 
        rss: Math.round(avgRSS * 100) / 100 
      },
      trend,
      snapshots: this.snapshots.slice()
    };
  }

  /**
   * Clear all snapshots and reset monitoring state
   */
  static reset(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.stopMonitoring();
    this.snapshots = [];
    
    logger.debug('MemoryLeakDetector reset');
  }

  /**
   * Get current configuration
   */
  static getConfig(): MemoryMonitorConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  static updateConfig(newConfig: Partial<MemoryMonitorConfig>): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'MemoryLeakDetector configuration updated');
  }
}

/**
 * Convenience functions for memory leak detection
 */

/**
 * Initialize memory leak detector
 */
export function initializeMemoryLeakDetector(config?: Partial<MemoryMonitorConfig>): void {
  MemoryLeakDetector.initialize(config);
}

/**
 * Start memory monitoring
 */
export function startMemoryMonitoring(): void {
  MemoryLeakDetector.startMonitoring();
}

/**
 * Stop memory monitoring
 */
export function stopMemoryMonitoring(): void {
  MemoryLeakDetector.stopMonitoring();
}

/**
 * Take a memory snapshot
 */
export function takeMemorySnapshot(reason: string = 'manual'): MemorySnapshot {
  return MemoryLeakDetector.takeSnapshot(reason);
}

/**
 * Detect memory leaks
 */
export function detectMemoryLeaks(startSnapshot?: MemorySnapshot, endSnapshot?: MemorySnapshot): MemoryLeakResult {
  return MemoryLeakDetector.detectLeaks(startSnapshot, endSnapshot);
}

/**
 * Force garbage collection
 */
export function forceGarbageCollection(): { before: MemorySnapshot; after: MemorySnapshot; freed: number } {
  return MemoryLeakDetector.forceGarbageCollection();
}

/**
 * Get memory usage report
 */
export function getMemoryReport(): {
  current: MemorySnapshot;
  peak: MemorySnapshot;
  average: { heapUsed: number; rss: number };
  trend: 'increasing' | 'decreasing' | 'stable';
  snapshots: MemorySnapshot[];
} {
  return MemoryLeakDetector.getMemoryReport();
}

/**
 * Helper function to run code with memory monitoring
 */
export async function withMemoryMonitoring<T>(
  operation: () => Promise<T> | T,
  config?: { detectLeaks?: boolean; forceGC?: boolean }
): Promise<{ result: T; memoryResult?: MemoryLeakResult }> {
  const startSnapshot = MemoryLeakDetector.takeSnapshot('operation-start');
  
  try {
    const result = await Promise.resolve(operation());
    
    if (config?.forceGC) {
      MemoryLeakDetector.forceGarbageCollection();
    }
    
    const endSnapshot = MemoryLeakDetector.takeSnapshot('operation-end');
    
    let memoryResult: MemoryLeakResult | undefined;
    if (config?.detectLeaks) {
      memoryResult = MemoryLeakDetector.detectLeaks(startSnapshot, endSnapshot);
    }
    
    return { result, memoryResult };
  } catch (error) {
    MemoryLeakDetector.takeSnapshot('operation-error');
    throw error;
  }
}