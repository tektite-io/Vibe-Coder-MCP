/**
 * Universal Test Cleanup System
 * Consolidates all existing cleanup utilities into a cohesive, easy-to-use pattern
 * Builds on existing singleton-reset-manager, test-cleanup, and test-isolation-manager
 */

import { EventEmitter } from 'events';

// Fallback logger for test environments to avoid mocking conflicts
const logger = {
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'test') {
      console.debug(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'test') {
      console.info(...args);
    }
  },
  warn: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'test') {
      console.warn(...args);
    }
  },
  error: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(...args);
    }
  }
};
import { 
  autoRegisterKnownSingletons,
  clearSingletonRegistry
} from './singleton-reset-manager.js';
import { 
  performTestCleanup,
  registerEventEmitter,
  checkMemoryLeaks,
  getMemoryUsage
} from './test-cleanup.js';
import { TestIsolationManager } from './test-isolation-manager.js';
import { setupHttpMocking, cleanupHttpMocking } from './http-fetch-mock.js';
import { 
  setupPerformanceOptimization, 
  cleanupPerformanceOptimization
} from './performance-optimizer.js';

/**
 * Universal cleanup configuration options
 */
export interface UniversalCleanupOptions {
  enableMemoryMonitoring?: boolean;
  enableSingletonReset?: boolean;
  enableEventEmitterCleanup?: boolean;
  enableEnvironmentReset?: boolean;
  enableCacheClearing?: boolean;
  enableMockReset?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  timeoutMs?: number;
}

/**
 * Default cleanup configuration
 */
const DEFAULT_CLEANUP_OPTIONS: Required<UniversalCleanupOptions> = {
  enableMemoryMonitoring: true,
  enableSingletonReset: true,
  enableEventEmitterCleanup: true,
  enableEnvironmentReset: true,
  enableCacheClearing: true,
  enableMockReset: true,
  logLevel: 'debug',
  timeoutMs: 5000
};

/**
 * Global cleanup state tracking
 */
interface CleanupState {
  isInitialized: boolean;
  isCleanupInProgress: boolean;
  lastCleanupTime: number;
  cleanupCount: number;
  registeredResources: Set<string>;
  originalEnvVars: Record<string, string | undefined>;
  testIsolationManager?: TestIsolationManager;
}

let cleanupState: CleanupState = {
  isInitialized: false,
  isCleanupInProgress: false,
  lastCleanupTime: 0,
  cleanupCount: 0,
  registeredResources: new Set(),
  originalEnvVars: {}
};

/**
 * Registry for custom cleanup functions
 */
const customCleanupRegistry = new Map<string, () => Promise<void> | void>();

/**
 * Registry for EventEmitters created during tests
 */
const universalEventEmitterRegistry = new Set<EventEmitter>();

/**
 * Registry for cache systems that need clearing
 */
const cacheRegistry = new Map<string, { clear: () => void | Promise<void> }>();

/**
 * Initialize universal cleanup system
 */
export async function initializeUniversalCleanup(options: UniversalCleanupOptions = {}): Promise<void> {
  const config = { ...DEFAULT_CLEANUP_OPTIONS, ...options };
  
  try {
    if (cleanupState.isInitialized) {
      logger.debug('Universal cleanup already initialized, skipping');
      return;
    }

    logger.debug({ config }, 'Initializing universal cleanup system');

    // Store original environment variables
    cleanupState.originalEnvVars = { ...process.env };

    // Auto-register known singletons
    if (config.enableSingletonReset) {
      await autoRegisterKnownSingletons();
    }

    // Initialize test isolation manager
    cleanupState.testIsolationManager = new TestIsolationManager();

    // Initialize HTTP mocking
    setupHttpMocking();

    // Initialize performance optimization
    setupPerformanceOptimization();

    // Set up process exit handlers for emergency cleanup
    process.on('exit', () => {
      if (cleanupState.isCleanupInProgress) {
        logger.warn('Process exiting during cleanup - some resources may not be properly cleaned');
      }
    });

    cleanupState.isInitialized = true;
    logger.debug('Universal cleanup system initialized successfully');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize universal cleanup system');
    throw error;
  }
}

/**
 * Register a custom cleanup function
 */
export function registerCustomCleanup(name: string, cleanupFn: () => Promise<void> | void): void {
  customCleanupRegistry.set(name, cleanupFn);
  cleanupState.registeredResources.add(`custom:${name}`);
  logger.debug({ name }, 'Custom cleanup function registered');
}

/**
 * Register an EventEmitter for automatic cleanup
 */
export function registerUniversalEventEmitter(emitter: EventEmitter, name?: string): void {
  universalEventEmitterRegistry.add(emitter);
  registerEventEmitter(emitter, name);
  cleanupState.registeredResources.add(`emitter:${name || 'unnamed'}`);
  
  // Set reasonable limits for test environment
  emitter.setMaxListeners(20);
  
  if (name) {
    logger.debug({ name, listenerCount: emitter.listenerCount('*') }, 'EventEmitter registered for universal cleanup');
  }
}

/**
 * Register a cache system for clearing
 */
export function registerCache(name: string, cache: { clear: () => void | Promise<void> }): void {
  cacheRegistry.set(name, cache);
  cleanupState.registeredResources.add(`cache:${name}`);
  logger.debug({ name }, 'Cache system registered for cleanup');
}

/**
 * Clean up all registered EventEmitters
 */
async function cleanupUniversalEventEmitters(): Promise<void> {
  let cleanedCount = 0;
  
  for (const emitter of universalEventEmitterRegistry) {
    try {
      // Remove all listeners
      emitter.removeAllListeners();
      
      // Reset max listeners to default
      emitter.setMaxListeners(10);
      
      cleanedCount++;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to cleanup universal EventEmitter');
    }
  }
  
  // Clear the registry
  universalEventEmitterRegistry.clear();
  
  if (cleanedCount > 0) {
    logger.debug({ cleanedCount }, 'Universal EventEmitters cleaned up');
  }
}

/**
 * Clear all registered cache systems
 */
async function clearAllCaches(): Promise<void> {
  const results: Array<{ name: string; success: boolean; error?: unknown }> = [];
  
  for (const [name, cache] of cacheRegistry) {
    try {
      await cache.clear();
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, error });
      logger.warn({ err: error, name }, 'Failed to clear cache');
    }
  }
  
  // Clear the registry
  cacheRegistry.clear();
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  if (results.length > 0) {
    logger.debug({ 
      total: results.length, 
      success: successCount, 
      failures: failureCount 
    }, 'Cache systems cleared');
  }
}

/**
 * Execute all custom cleanup functions
 */
async function executeCustomCleanupFunctions(): Promise<void> {
  const results: Array<{ name: string; success: boolean; error?: unknown }> = [];
  
  for (const [name, cleanupFn] of customCleanupRegistry) {
    try {
      await cleanupFn();
      results.push({ name, success: true });
    } catch (error) {
      results.push({ name, success: false, error });
      logger.warn({ err: error, name }, 'Custom cleanup function failed');
    }
  }
  
  // Clear the registry
  customCleanupRegistry.clear();
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.length - successCount;
  
  if (results.length > 0) {
    logger.debug({ 
      total: results.length, 
      success: successCount, 
      failures: failureCount 
    }, 'Custom cleanup functions executed');
  }
}

/**
 * Reset environment variables to original state
 */
function resetEnvironmentVariables(): void {
  try {
    // Reset to original environment variables
    for (const [key, value] of Object.entries(cleanupState.originalEnvVars)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    
    // Remove any test-specific variables that weren't in the original environment
    const testVarPrefixes = ['TEST_', 'EPIC_', 'VITEST_', 'CI_SAFE_'];
    for (const key of Object.keys(process.env)) {
      if (testVarPrefixes.some(prefix => key.startsWith(prefix)) && 
          !(key in cleanupState.originalEnvVars)) {
        delete process.env[key];
      }
    }
    
    logger.debug('Environment variables reset to original state');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reset environment variables');
  }
}

/**
 * Reset mock systems (vi mocks, etc.)
 */
async function resetMockSystems(): Promise<void> {
  try {
    // Reset vi mocks if available (import dynamically to avoid errors)
    try {
      const { vi } = await import('vitest');
      if (vi && vi.clearAllMocks) {
        vi.clearAllMocks();
      }
    } catch {
      // vi not available, skip
    }
    
    logger.debug('Mock systems reset');
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reset mock systems');
  }
}

/**
 * Perform comprehensive universal cleanup
 */
export async function performUniversalCleanup(options: UniversalCleanupOptions = {}): Promise<{
  success: boolean;
  duration: number;
  memoryBefore: ReturnType<typeof getMemoryUsage>;
  memoryAfter: ReturnType<typeof getMemoryUsage>;
  cleanupResults: {
    singletons: boolean;
    eventEmitters: boolean;
    caches: boolean;
    customFunctions: boolean;
    environment: boolean;
    mocks: boolean;
    isolation: boolean;
  };
  warnings: string[];
}> {
  const config = { ...DEFAULT_CLEANUP_OPTIONS, ...options };
  const startTime = Date.now();
  let memoryBefore: ReturnType<typeof getMemoryUsage>;
  let memoryAfter: ReturnType<typeof getMemoryUsage>;
  const warnings: string[] = [];
  
  const cleanupResults = {
    singletons: false,
    eventEmitters: false,
    caches: false,
    customFunctions: false,
    environment: false,
    mocks: false,
    isolation: false
  };

  try {
    if (cleanupState.isCleanupInProgress) {
      logger.warn('Cleanup already in progress, skipping');
      return {
        success: false,
        duration: 0,
        memoryBefore: getMemoryUsage(),
        memoryAfter: getMemoryUsage(),
        cleanupResults,
        warnings: ['Cleanup already in progress']
      };
    }

    cleanupState.isCleanupInProgress = true;
    
    // Initialize if not already done
    if (!cleanupState.isInitialized) {
      await initializeUniversalCleanup(config);
    }

    logger.debug('Starting comprehensive universal cleanup');
    
    // Get memory usage before cleanup
    memoryBefore = config.enableMemoryMonitoring ? getMemoryUsage() : getMemoryUsage();

    // 1. Execute custom cleanup functions first
    try {
      await executeCustomCleanupFunctions();
      cleanupResults.customFunctions = true;
    } catch (error) {
      warnings.push('Custom cleanup functions failed');
      logger.warn({ err: error }, 'Custom cleanup functions failed');
    }

    // 2. Clean up EventEmitters
    if (config.enableEventEmitterCleanup) {
      try {
        await cleanupUniversalEventEmitters();
        cleanupResults.eventEmitters = true;
      } catch (error) {
        warnings.push('EventEmitter cleanup failed');
        logger.warn({ err: error }, 'EventEmitter cleanup failed');
      }
    }

    // 3. Clear cache systems
    if (config.enableCacheClearing) {
      try {
        await clearAllCaches();
        cleanupResults.caches = true;
      } catch (error) {
        warnings.push('Cache clearing failed');
        logger.warn({ err: error }, 'Cache clearing failed');
      }
    }

    // 4. Reset singletons using both legacy and enhanced methods
    if (config.enableSingletonReset) {
      try {
        // Use the existing comprehensive test cleanup
        await performTestCleanup();
        cleanupResults.singletons = true;
      } catch (error) {
        warnings.push('Singleton reset failed');
        logger.warn({ err: error }, 'Singleton reset failed');
      }
    }

    // 5. Reset environment variables
    if (config.enableEnvironmentReset) {
      try {
        resetEnvironmentVariables();
        cleanupResults.environment = true;
      } catch (error) {
        warnings.push('Environment reset failed');
        logger.warn({ err: error }, 'Environment reset failed');
      }
    }

    // 6. Reset mock systems
    if (config.enableMockReset) {
      try {
        resetMockSystems();
        cleanupResults.mocks = true;
      } catch (error) {
        warnings.push('Mock reset failed');
        logger.warn({ err: error }, 'Mock reset failed');
      }
    }

    // 7. Clean up HTTP mocking
    try {
      cleanupHttpMocking();
      cleanupResults.isolation = true; // Using isolation flag for HTTP cleanup
    } catch (error) {
      warnings.push('HTTP mocking cleanup failed');
      logger.warn({ err: error }, 'HTTP mocking cleanup failed');
    }

    // 7.5. Clean up performance optimization
    try {
      cleanupPerformanceOptimization();
    } catch (error) {
      warnings.push('Performance optimization cleanup failed');
      logger.warn({ err: error }, 'Performance optimization cleanup failed');
    }

    // 8. Clean up test isolation
    try {
      if (cleanupState.testIsolationManager) {
        TestIsolationManager.cleanupTestIsolation();
      }
    } catch (error) {
      warnings.push('Test isolation cleanup failed');
      logger.warn({ err: error }, 'Test isolation cleanup failed');
    }

    // 8. Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    // Get memory usage after cleanup
    memoryAfter = config.enableMemoryMonitoring ? getMemoryUsage() : getMemoryUsage();

    // Update cleanup state
    cleanupState.lastCleanupTime = Date.now();
    cleanupState.cleanupCount++;
    cleanupState.registeredResources.clear();

    const duration = Date.now() - startTime;
    
    logger.debug({ 
      duration, 
      cleanupResults, 
      warnings: warnings.length,
      memoryBefore: memoryBefore?.formatted,
      memoryAfter: memoryAfter?.formatted
    }, 'Universal cleanup completed');

    return {
      success: warnings.length === 0,
      duration,
      memoryBefore: memoryBefore!,
      memoryAfter: memoryAfter!,
      cleanupResults,
      warnings
    };

  } catch (error) {
    logger.error({ err: error }, 'Universal cleanup failed');
    throw error;
  } finally {
    cleanupState.isCleanupInProgress = false;
  }
}

/**
 * Setup universal cleanup for test environment
 * Call this in beforeEach hooks
 */
export async function setupUniversalTestCleanup(options: UniversalCleanupOptions = {}): Promise<void> {
  try {
    // Initialize the cleanup system
    await initializeUniversalCleanup(options);
    
    // Create isolated test environment
    TestIsolationManager.setupTestIsolation();
    
    logger.debug('Universal test cleanup setup completed');
  } catch (error) {
    logger.error({ err: error }, 'Failed to setup universal test cleanup');
    throw error;
  }
}

/**
 * Cleanup universal test environment
 * Call this in afterEach hooks
 */
export async function cleanupUniversalTest(options: UniversalCleanupOptions = {}): Promise<void> {
  try {
    const result = await performUniversalCleanup(options);
    
    if (!result.success) {
      logger.warn({ warnings: result.warnings }, 'Universal cleanup completed with warnings');
    }
    
    // Check for memory leaks
    const leakCheck = checkMemoryLeaks();
    if (leakCheck.hasLeaks) {
      logger.warn({ warnings: leakCheck.warnings }, 'Potential memory leaks detected');
    }
    
  } catch (error) {
    logger.error({ err: error }, 'Failed to cleanup universal test environment');
    throw error;
  }
}

/**
 * Get cleanup statistics
 */
export function getCleanupStats(): {
  isInitialized: boolean;
  isCleanupInProgress: boolean;
  lastCleanupTime: number;
  cleanupCount: number;
  registeredResourceCount: number;
  memoryUsage: ReturnType<typeof getMemoryUsage>;
} {
  return {
    isInitialized: cleanupState.isInitialized,
    isCleanupInProgress: cleanupState.isCleanupInProgress,
    lastCleanupTime: cleanupState.lastCleanupTime,
    cleanupCount: cleanupState.cleanupCount,
    registeredResourceCount: cleanupState.registeredResources.size,
    memoryUsage: getMemoryUsage()
  };
}

/**
 * Reset cleanup system (for testing the cleanup system itself)
 */
export function resetCleanupSystem(): void {
  cleanupState = {
    isInitialized: false,
    isCleanupInProgress: false,
    lastCleanupTime: 0,
    cleanupCount: 0,
    registeredResources: new Set(),
    originalEnvVars: {},
    testIsolationManager: undefined
  };
  
  customCleanupRegistry.clear();
  universalEventEmitterRegistry.clear();
  cacheRegistry.clear();
  clearSingletonRegistry();
  
  logger.debug('Cleanup system reset');
}

/**
 * Convenience function for simple test setup/teardown
 */
export function createUniversalTestHooks(options: UniversalCleanupOptions = {}): {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
} {
  return {
    beforeEach: () => setupUniversalTestCleanup(options),
    afterEach: () => cleanupUniversalTest(options)
  };
}