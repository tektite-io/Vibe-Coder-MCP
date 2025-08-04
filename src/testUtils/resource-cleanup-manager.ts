/**
 * Resource Cleanup Manager for Testing Infrastructure
 * 
 * Provides comprehensive cleanup of system resources during tests to prevent
 * memory leaks, hanging processes, and test interference.
 */

import logger from '../logger.js';
import { setTimeout as setTimeoutOriginal, clearTimeout, setInterval as setIntervalOriginal, clearInterval } from 'timers';

/**
 * Resource tracking interfaces
 */
interface TrackedTimer {
  id: NodeJS.Timeout;
  type: 'timeout' | 'interval';
  createdAt: number;
  stack?: string;
}

interface TrackedEventListener {
  target: EventTarget | NodeJS.EventEmitter;
  event: string;
  listener: (...args: unknown[]) => void;
  createdAt: number;
}

interface TrackedPromise {
  promise: Promise<unknown>;
  createdAt: number;
  stack?: string;
}

interface ResourceStats {
  timers: number;
  listeners: number;
  promises: number;
  memoryUsage: NodeJS.MemoryUsage;
  handles: number;
}

/**
 * Resource Cleanup Manager
 */
export class ResourceCleanupManager {
  private static trackedTimers = new Set<TrackedTimer>();
  private static trackedListeners = new Set<TrackedEventListener>();
  private static trackedPromises = new Set<TrackedPromise>();
  private static isTestEnvironment = false;
  private static isInitialized = false;
  private static originalTimerFunctions: {
    setTimeout: typeof setTimeout;
    setInterval: typeof setInterval;
    clearTimeout: typeof clearTimeout;
    clearInterval: typeof clearInterval;
  } | null = null;

  /**
   * Initialize the resource cleanup manager
   */
  static initialize(): void {
    // Only operate in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      logger.warn('ResourceCleanupManager should only be used in test environment');
      return;
    }

    this.isTestEnvironment = true;
    this.setupTimerTracking();
    this.setupProcessHandlers();
    this.isInitialized = true;
    
    logger.debug('ResourceCleanupManager initialized for test environment');
  }

  /**
   * Setup timer function interception for tracking
   */
  private static setupTimerTracking(): void {
    if (!this.isTestEnvironment || this.originalTimerFunctions) {
      return;
    }

    // Store original functions
    this.originalTimerFunctions = {
      setTimeout: global.setTimeout,
      setInterval: global.setInterval,
      clearTimeout: global.clearTimeout,
      clearInterval: global.clearInterval
    };

    // Override setTimeout
    global.setTimeout = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      const timer = setTimeoutOriginal(callback, ms, ...args);
      
      this.trackedTimers.add({
        id: timer,
        type: 'timeout',
        createdAt: Date.now(),
        stack: new Error().stack
      });
      
      return timer;
    }) as typeof setTimeout;

    // Override setInterval
    global.setInterval = ((callback: (...args: unknown[]) => void, ms?: number, ...args: unknown[]) => {
      const timer = setIntervalOriginal(callback, ms, ...args);
      
      this.trackedTimers.add({
        id: timer,
        type: 'interval',
        createdAt: Date.now(),
        stack: new Error().stack
      });
      
      return timer;
    }) as typeof setInterval;

    // Override clearTimeout
    global.clearTimeout = ((timer: string | number | NodeJS.Timeout | undefined) => {
      this.originalTimerFunctions!.clearTimeout(timer);
      
      // Remove from tracking
      for (const tracked of this.trackedTimers) {
        if (tracked.id === timer) {
          this.trackedTimers.delete(tracked);
          break;
        }
      }
    }) as typeof clearTimeout;

    // Override clearInterval
    global.clearInterval = ((timer: string | number | NodeJS.Timeout | undefined) => {
      this.originalTimerFunctions!.clearInterval(timer);
      
      // Remove from tracking
      for (const tracked of this.trackedTimers) {
        if (tracked.id === timer) {
          this.trackedTimers.delete(tracked);
          break;
        }
      }
    }) as typeof clearInterval;

    logger.debug('Timer tracking setup completed');
  }

  /**
   * Setup process event handlers for resource monitoring
   */
  private static setupProcessHandlers(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    // Monitor uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error({ err: error }, 'Uncaught exception detected during test');
      this.logResourceStats();
    });

    // Monitor unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled promise rejection detected');
      this.logResourceStats();
    });

    logger.debug('Process handlers setup completed');
  }

  /**
   * Track an event listener
   */
  static trackEventListener(
    target: EventTarget | NodeJS.EventEmitter, 
    event: string, 
    listener: (...args: unknown[]) => void
  ): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.trackedListeners.add({
      target,
      event,
      listener,
      createdAt: Date.now()
    });

    logger.debug({ event, listenerCount: this.trackedListeners.size }, 'Event listener tracked');
  }

  /**
   * Track a promise
   */
  static trackPromise(promise: Promise<unknown>): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.trackedPromises.add({
      promise,
      createdAt: Date.now(),
      stack: new Error().stack
    });

    // Remove from tracking when promise settles
    promise.finally(() => {
      for (const tracked of this.trackedPromises) {
        if (tracked.promise === promise) {
          this.trackedPromises.delete(tracked);
          break;
        }
      }
    });

    logger.debug({ promiseCount: this.trackedPromises.size }, 'Promise tracked');
  }

  /**
   * Clean up all tracked resources
   */
  static async cleanupResources(): Promise<void> {
    if (!this.isTestEnvironment || !this.isInitialized) {
      return;
    }

    const startTime = Date.now();
    const cleaned = {
      timers: 0,
      listeners: 0,
      promises: 0
    };

    try {
      // Clean up timers
      for (const timer of this.trackedTimers) {
        try {
          if (timer.type === 'timeout') {
            clearTimeout(timer.id);
          } else {
            clearInterval(timer.id);
          }
          cleaned.timers++;
        } catch (error) {
          logger.warn({ err: error, timer: timer.id }, 'Failed to clear timer');
        }
      }
      this.trackedTimers.clear();

      // Clean up event listeners
      for (const listener of this.trackedListeners) {
        try {
          if ('removeEventListener' in listener.target) {
            (listener.target as EventTarget).removeEventListener(listener.event, listener.listener as EventListener);
          } else if ('removeListener' in listener.target) {
            (listener.target as NodeJS.EventEmitter).removeListener(listener.event, listener.listener);
          }
          cleaned.listeners++;
        } catch (error) {
          logger.warn({ err: error, event: listener.event }, 'Failed to remove event listener');
        }
      }
      this.trackedListeners.clear();

      // Wait for tracked promises to settle (with timeout)
      if (this.trackedPromises.size > 0) {
        const promises = Array.from(this.trackedPromises).map(tracked => tracked.promise);
        try {
          await Promise.allSettled(promises.map(p => 
            Promise.race([p, new Promise(resolve => setTimeout(resolve, 1000))])
          ));
          cleaned.promises = promises.length;
        } catch (error) {
          logger.warn({ err: error }, 'Failed to wait for promises to settle');
        }
      }
      this.trackedPromises.clear();

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const duration = Date.now() - startTime;
      
      logger.info({
        cleaned,
        duration,
        memoryAfter: process.memoryUsage()
      }, 'Resource cleanup completed');

    } catch (error) {
      logger.error({ err: error }, 'Resource cleanup failed');
      throw error;
    }
  }

  /**
   * Get current resource statistics
   */
  static getResourceStats(): ResourceStats {
    const memoryUsage = process.memoryUsage();
    const handles = (process as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.()?.length || 0;

    return {
      timers: this.trackedTimers.size,
      listeners: this.trackedListeners.size,
      promises: this.trackedPromises.size,
      memoryUsage,
      handles
    };
  }

  /**
   * Log current resource statistics
   */
  static logResourceStats(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    const stats = this.getResourceStats();
    logger.info(stats, 'Current resource statistics');
  }

  /**
   * Check for resource leaks
   */
  static checkForLeaks(): { hasLeaks: boolean; leaks: string[] } {
    if (!this.isTestEnvironment) {
      return { hasLeaks: false, leaks: [] };
    }

    const leaks: string[] = [];
    const now = Date.now();
    const maxAge = 30000; // 30 seconds

    // Check for old timers
    for (const timer of this.trackedTimers) {
      if (now - timer.createdAt > maxAge) {
        leaks.push(`Long-running ${timer.type}: ${timer.id} (age: ${now - timer.createdAt}ms)`);
      }
    }

    // Check for old listeners
    for (const listener of this.trackedListeners) {
      if (now - listener.createdAt > maxAge) {
        leaks.push(`Long-running listener: ${listener.event} (age: ${now - listener.createdAt}ms)`);
      }
    }

    // Check for old promises
    for (const promise of this.trackedPromises) {
      if (now - promise.createdAt > maxAge) {
        leaks.push(`Long-running promise (age: ${now - promise.createdAt}ms)`);
      }
    }

    return {
      hasLeaks: leaks.length > 0,
      leaks
    };
  }

  /**
   * Restore original timer functions
   */
  static restoreOriginalFunctions(): void {
    if (!this.isTestEnvironment || !this.originalTimerFunctions) {
      return;
    }

    global.setTimeout = this.originalTimerFunctions.setTimeout;
    global.setInterval = this.originalTimerFunctions.setInterval;
    global.clearTimeout = this.originalTimerFunctions.clearTimeout;
    global.clearInterval = this.originalTimerFunctions.clearInterval;

    this.originalTimerFunctions = null;
    logger.debug('Original timer functions restored');
  }

  /**
   * Reset the manager (for testing the manager itself)
   */
  static reset(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.trackedTimers.clear();
    this.trackedListeners.clear();
    this.trackedPromises.clear();
    this.restoreOriginalFunctions();
    this.isInitialized = false;
    
    logger.debug('ResourceCleanupManager reset');
  }

  /**
   * Check if manager is initialized
   */
  static isManagerInitialized(): boolean {
    return this.isInitialized && this.isTestEnvironment;
  }
}

/**
 * Convenience functions for common resource operations
 */

/**
 * Initialize resource cleanup manager
 */
export function initializeResourceCleanupManager(): void {
  ResourceCleanupManager.initialize();
}

/**
 * Clean up all tracked resources
 */
export async function cleanupResources(): Promise<void> {
  await ResourceCleanupManager.cleanupResources();
}

/**
 * Track a promise for cleanup
 */
export function trackPromise(promise: Promise<unknown>): Promise<unknown> {
  ResourceCleanupManager.trackPromise(promise);
  return promise;
}

/**
 * Track an event listener for cleanup
 */
export function trackEventListener(
  target: EventTarget | NodeJS.EventEmitter, 
  event: string, 
  listener: (...args: unknown[]) => void
): void {
  ResourceCleanupManager.trackEventListener(target, event, listener);
}

/**
 * Get resource statistics
 */
export function getResourceStats(): ResourceStats {
  return ResourceCleanupManager.getResourceStats();
}

/**
 * Check for resource leaks
 */
export function checkForResourceLeaks(): { hasLeaks: boolean; leaks: string[] } {
  return ResourceCleanupManager.checkForLeaks();
}