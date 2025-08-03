/**
 * Test Performance Optimization System
 * Provides performance monitoring, timeout optimization, and caching for tests
 * Integrates with universal cleanup system for optimal test performance
 */

import { vi } from 'vitest';
import logger from '../../../../logger.js';

/**
 * Performance metrics tracking
 */
interface PerformanceMetrics {
  testName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    delta: NodeJS.MemoryUsage;
  };
  mockCallCount: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Performance optimization configuration
 */
export interface PerformanceConfig {
  enableMetrics?: boolean;
  enableCaching?: boolean;
  enableTimeoutOptimization?: boolean;
  unitTestTimeoutMs?: number;
  integrationTestTimeoutMs?: number;
  mockTimeoutMs?: number;
  cacheSize?: number;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * Default performance configuration
 */
const DEFAULT_PERFORMANCE_CONFIG: Required<PerformanceConfig> = {
  enableMetrics: true,
  enableCaching: true,
  enableTimeoutOptimization: true,
  unitTestTimeoutMs: 5000,
  integrationTestTimeoutMs: 60000,
  mockTimeoutMs: 2000,
  cacheSize: 100,
  logLevel: 'debug'
};

/**
 * Global performance state
 */
interface PerformanceState {
  isInitialized: boolean;
  config: Required<PerformanceConfig>;
  metrics: Map<string, PerformanceMetrics>;
  cache: Map<string, { value: unknown; timestamp: number; ttl: number }>;
  timeouts: Map<string, NodeJS.Timeout>;
  startTimes: Map<string, number>;
}

let performanceState: PerformanceState = {
  isInitialized: false,
  config: DEFAULT_PERFORMANCE_CONFIG,
  metrics: new Map(),
  cache: new Map(),
  timeouts: new Map(),
  startTimes: new Map()
};

/**
 * Initialize performance optimization system
 */
export function initializePerformanceOptimization(config: PerformanceConfig = {}): void {
  if (performanceState.isInitialized) {
    logger.debug('Performance optimization already initialized');
    return;
  }

  performanceState.config = { ...DEFAULT_PERFORMANCE_CONFIG, ...config };
  
  // Clear existing state
  performanceState.metrics.clear();
  performanceState.cache.clear();
  performanceState.timeouts.clear();
  performanceState.startTimes.clear();

  // Set up performance monitoring if enabled
  if (performanceState.config.enableMetrics) {
    setupPerformanceMonitoring();
  }

  // Set up timeout optimization if enabled
  if (performanceState.config.enableTimeoutOptimization) {
    setupTimeoutOptimization();
  }

  performanceState.isInitialized = true;
  logger.debug({ config: performanceState.config }, 'Performance optimization system initialized');
}

/**
 * Set up performance monitoring
 */
function setupPerformanceMonitoring(): void {
  // Override console.time and console.timeEnd for automatic tracking
  const originalTime = console.time;
  const originalTimeEnd = console.timeEnd;

  console.time = (label?: string) => {
    if (label) {
      startPerformanceTracking(label);
    }
    return originalTime.call(console, label);
  };

  console.timeEnd = (label?: string) => {
    if (label) {
      endPerformanceTracking(label);
    }
    return originalTimeEnd.call(console, label);
  };
}

/**
 * Set up timeout optimization
 */
function setupTimeoutOptimization(): void {
  // Configure vi.setTimeout for different test types
  const testType = process.env.TEST_TYPE || 'unit';
  
  let timeout: number;
  switch (testType) {
    case 'unit':
      timeout = performanceState.config.unitTestTimeoutMs;
      break;
    case 'integration':
      timeout = performanceState.config.integrationTestTimeoutMs;
      break;
    default:
      timeout = performanceState.config.unitTestTimeoutMs;
  }

  // Set global timeout for vi
  vi.setConfig({ testTimeout: timeout });
  
  logger.debug({ testType, timeout }, 'Test timeout optimization configured');
}

/**
 * Start performance tracking for a test
 */
export function startPerformanceTracking(testName: string): void {
  if (!performanceState.config.enableMetrics) return;

  const startTime = Date.now();
  performanceState.startTimes.set(testName, startTime);

  const metrics: PerformanceMetrics = {
    testName,
    startTime,
    mockCallCount: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  // Capture memory usage before test
  if (performanceState.config.enableMetrics) {
    metrics.memoryUsage = {
      before: process.memoryUsage(),
      after: process.memoryUsage(),
      delta: process.memoryUsage()
    };
  }

  performanceState.metrics.set(testName, metrics);
  
  logger.debug({ testName, startTime }, 'Performance tracking started');
}

/**
 * End performance tracking for a test
 */
export function endPerformanceTracking(testName: string): PerformanceMetrics | undefined {
  if (!performanceState.config.enableMetrics) return undefined;

  const metrics = performanceState.metrics.get(testName);
  if (!metrics) {
    logger.warn({ testName }, 'No performance metrics found for test');
    return undefined;
  }

  const endTime = Date.now();
  const duration = endTime - metrics.startTime;

  // Update metrics
  metrics.endTime = endTime;
  metrics.duration = duration;

  // Capture memory usage after test
  if (metrics.memoryUsage) {
    metrics.memoryUsage.after = process.memoryUsage();
    metrics.memoryUsage.delta = {
      rss: metrics.memoryUsage.after.rss - metrics.memoryUsage.before.rss,
      heapTotal: metrics.memoryUsage.after.heapTotal - metrics.memoryUsage.before.heapTotal,
      heapUsed: metrics.memoryUsage.after.heapUsed - metrics.memoryUsage.before.heapUsed,
      external: metrics.memoryUsage.after.external - metrics.memoryUsage.before.external,
      arrayBuffers: metrics.memoryUsage.after.arrayBuffers - metrics.memoryUsage.before.arrayBuffers
    };
  }

  // Log performance warning if test is slow
  const testType = process.env.TEST_TYPE || 'unit';
  const threshold = testType === 'unit' 
    ? performanceState.config.unitTestTimeoutMs * 0.8 
    : performanceState.config.integrationTestTimeoutMs * 0.8;

  if (duration > threshold) {
    logger.warn({ 
      testName, 
      duration, 
      threshold, 
      testType 
    }, 'Test performance warning: execution time exceeded threshold');
  }

  logger.debug({ 
    testName, 
    duration, 
    memoryDelta: metrics.memoryUsage?.delta,
    mockCallCount: metrics.mockCallCount,
    cacheHits: metrics.cacheHits,
    cacheMisses: metrics.cacheMisses
  }, 'Performance tracking completed');

  return metrics;
}

/**
 * Performance-optimized cache system
 */
export class PerformanceCache {
  private static instance: PerformanceCache;

  static getInstance(): PerformanceCache {
    if (!PerformanceCache.instance) {
      PerformanceCache.instance = new PerformanceCache();
    }
    return PerformanceCache.instance;
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | undefined {
    if (!performanceState.config.enableCaching) return undefined;

    const entry = performanceState.cache.get(key);
    if (!entry) {
      this.incrementCacheMisses();
      return undefined;
    }

    // Check if entry has expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      performanceState.cache.delete(key);
      this.incrementCacheMisses();
      return undefined;
    }

    this.incrementCacheHits();
    return entry.value as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, value: T, ttlMs: number = 60000): void {
    if (!performanceState.config.enableCaching) return;

    // Implement LRU eviction if cache is full
    if (performanceState.cache.size >= performanceState.config.cacheSize) {
      const oldestKey = performanceState.cache.keys().next().value;
      if (oldestKey) {
        performanceState.cache.delete(oldestKey);
      }
    }

    performanceState.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  /**
   * Clear cache
   */
  clear(): void {
    performanceState.cache.clear();
    logger.debug('Performance cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
  } {
    const totalHits = Array.from(performanceState.metrics.values())
      .reduce((sum, metrics) => sum + metrics.cacheHits, 0);
    
    const totalMisses = Array.from(performanceState.metrics.values())
      .reduce((sum, metrics) => sum + metrics.cacheMisses, 0);

    const hitRate = totalHits + totalMisses > 0 
      ? totalHits / (totalHits + totalMisses) 
      : 0;

    return {
      size: performanceState.cache.size,
      maxSize: performanceState.config.cacheSize,
      hitRate,
      totalHits,
      totalMisses
    };
  }

  private incrementCacheHits(): void {
    const currentTest = this.getCurrentTestName();
    if (currentTest) {
      const metrics = performanceState.metrics.get(currentTest);
      if (metrics) {
        metrics.cacheHits++;
      }
    }
  }

  private incrementCacheMisses(): void {
    const currentTest = this.getCurrentTestName();
    if (currentTest) {
      const metrics = performanceState.metrics.get(currentTest);
      if (metrics) {
        metrics.cacheMisses++;
      }
    }
  }

  private getCurrentTestName(): string | undefined {
    // Try to get current test name from vitest context
    try {
      const vitestWorker = (globalThis as Record<string, unknown>).__vitest_worker__ as Record<string, unknown> | undefined;
      const ctx = vitestWorker?.ctx as Record<string, unknown> | undefined;
      const currentTest = ctx?.currentTest as Record<string, unknown> | undefined;
      return currentTest?.name as string | undefined;
    } catch {
      return undefined;
    }
  }
}

/**
 * Optimized mock system with performance tracking
 */
export function createOptimizedMock<T extends (...args: unknown[]) => unknown>(
  implementation?: T,
  options: { timeout?: number; cache?: boolean } = {}
): ReturnType<typeof vi.fn> {
  const timeout = options.timeout || performanceState.config.mockTimeoutMs;
  const enableCache = options.cache !== false && performanceState.config.enableCaching;
  
  const cache = enableCache ? PerformanceCache.getInstance() : null;
  
  const mockFn = vi.fn(async (...args: unknown[]) => {
    const startTime = Date.now();
    
    // Check cache if enabled
    if (cache) {
      const cacheKey = JSON.stringify(args);
      const cachedResult = cache.get(cacheKey);
      if (cachedResult !== undefined) {
        return cachedResult;
      }
    }

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Mock timeout after ${timeout}ms`)), timeout);
    });

    try {
      // Execute implementation with timeout
      const resultPromise = implementation ? implementation(...args) : Promise.resolve(undefined);
      const result = await Promise.race([resultPromise, timeoutPromise]);
      
      // Cache result if enabled
      if (cache && result !== undefined) {
        const cacheKey = JSON.stringify(args);
        cache.set(cacheKey, result, 30000); // 30 second TTL
      }

      // Track mock call performance
      const duration = Date.now() - startTime;
      if (duration > timeout * 0.8) {
        logger.warn({ duration, timeout }, 'Mock performance warning: execution time near timeout');
      }

      // Increment mock call count
      const currentTest = cache?.['getCurrentTestName']?.();
      if (currentTest) {
        const metrics = performanceState.metrics.get(currentTest);
        if (metrics) {
          metrics.mockCallCount++;
        }
      }

      return result;
    } catch (error) {
      logger.error({ err: error, args, duration: Date.now() - startTime }, 'Optimized mock failed');
      throw error;
    }
  });

  return mockFn;
}

/**
 * Get performance metrics for all tests
 */
export function getPerformanceMetrics(): PerformanceMetrics[] {
  return Array.from(performanceState.metrics.values());
}

/**
 * Get performance summary
 */
export function getPerformanceSummary(): {
  totalTests: number;
  averageDuration: number;
  slowestTest: PerformanceMetrics | undefined;
  fastestTest: PerformanceMetrics | undefined;
  totalMockCalls: number;
  cacheStats: ReturnType<PerformanceCache['getStats']>;
} {
  const metrics = getPerformanceMetrics();
  const completedMetrics = metrics.filter(m => m.duration !== undefined);
  
  const totalDuration = completedMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
  const averageDuration = completedMetrics.length > 0 ? totalDuration / completedMetrics.length : 0;
  
  const slowestTest = completedMetrics.reduce((slowest, current) => 
    !slowest || (current.duration || 0) > (slowest.duration || 0) ? current : slowest, 
    undefined as PerformanceMetrics | undefined
  );
  
  const fastestTest = completedMetrics.reduce((fastest, current) => 
    !fastest || (current.duration || 0) < (fastest.duration || 0) ? current : fastest, 
    undefined as PerformanceMetrics | undefined
  );
  
  const totalMockCalls = metrics.reduce((sum, m) => sum + m.mockCallCount, 0);
  
  return {
    totalTests: metrics.length,
    averageDuration,
    slowestTest,
    fastestTest,
    totalMockCalls,
    cacheStats: PerformanceCache.getInstance().getStats()
  };
}

/**
 * Clear all performance data
 */
export function clearPerformanceData(): void {
  performanceState.metrics.clear();
  performanceState.startTimes.clear();
  PerformanceCache.getInstance().clear();
  
  // Clear timeouts
  for (const timeout of performanceState.timeouts.values()) {
    clearTimeout(timeout);
  }
  performanceState.timeouts.clear();
  
  logger.debug('Performance data cleared');
}

/**
 * Reset performance optimization system
 */
export function resetPerformanceOptimization(): void {
  clearPerformanceData();
  
  performanceState = {
    isInitialized: false,
    config: DEFAULT_PERFORMANCE_CONFIG,
    metrics: new Map(),
    cache: new Map(),
    timeouts: new Map(),
    startTimes: new Map()
  };
  
  logger.debug('Performance optimization system reset');
}

/**
 * Setup performance optimization for tests (call in beforeEach)
 */
export function setupPerformanceOptimization(config?: PerformanceConfig): void {
  initializePerformanceOptimization(config);
}

/**
 * Cleanup performance optimization for tests (call in afterEach)
 */
export function cleanupPerformanceOptimization(): void {
  clearPerformanceData();
}

/**
 * Performance test helpers
 */
export const PerformanceHelpers = {
  /**
   * Measure test execution time
   */
  measureTime: async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => {
    startPerformanceTracking(name);
    try {
      const result = await fn();
      return result;
    } finally {
      endPerformanceTracking(name);
    }
  },

  /**
   * Create performance-optimized test timeout
   */
  withTimeout: <T>(promise: Promise<T>, timeoutMs?: number): Promise<T> => {
    const timeout = timeoutMs || performanceState.config.unitTestTimeoutMs;
    
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Test timeout after ${timeout}ms`)), timeout);
      })
    ]);
  },

  /**
   * Assert performance requirements
   */
  assertPerformance: (testName: string, maxDurationMs: number): void => {
    const metrics = performanceState.metrics.get(testName);
    if (!metrics || metrics.duration === undefined) {
      throw new Error(`No performance metrics found for test: ${testName}`);
    }
    
    if (metrics.duration > maxDurationMs) {
      throw new Error(
        `Test ${testName} exceeded performance requirement: ${metrics.duration}ms > ${maxDurationMs}ms`
      );
    }
  }
};