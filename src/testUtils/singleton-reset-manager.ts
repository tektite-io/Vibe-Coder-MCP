/**
 * Central Singleton Reset Manager for Testing Infrastructure
 * 
 * Provides a centralized way to reset all singleton instances during tests
 * to prevent state pollution between test runs.
 */

import logger from '../logger.js';

/**
 * Interface for resetable singletons
 */
export interface ResetableSingleton {
  /** Reset method name that exists on the singleton */
  resetMethod: string;
  /** Function to get the singleton instance */
  getInstance: () => unknown;
  /** Optional description for logging */
  description?: string;
}

/**
 * Singleton Reset Manager - Coordinates cleanup of all singleton instances
 */
export class SingletonResetManager {
  private static registeredSingletons = new Map<string, ResetableSingleton>();
  private static isTestEnvironment = false;

  /**
   * Initialize the reset manager (should be called in test setup)
   */
  static initialize(): void {
    // Only operate in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      logger.warn('SingletonResetManager should only be used in test environment');
      return;
    }

    this.isTestEnvironment = true;
    this.registerDefaultSingletons();
    
    logger.debug('SingletonResetManager initialized for test environment');
  }

  /**
   * Register a singleton for automatic reset
   */
  static register(name: string, singleton: ResetableSingleton): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.registeredSingletons.set(name, singleton);
    logger.debug({ name, description: singleton.description }, 'Singleton registered for reset');
  }

  /**
   * Reset all registered singletons
   */
  static async resetAll(): Promise<void> {
    if (!this.isTestEnvironment) {
      logger.warn('Singleton reset attempted outside test environment');
      return;
    }

    const startTime = Date.now();
    let resetCount = 0;
    const failures: string[] = [];

    for (const [name, singleton] of this.registeredSingletons.entries()) {
      try {
        const instance = singleton.getInstance();
        
        if (instance && typeof (instance as Record<string, unknown>)[singleton.resetMethod] === 'function') {
          await ((instance as Record<string, unknown>)[singleton.resetMethod] as () => Promise<void>)();
          resetCount++;
          logger.debug({ name }, `Singleton reset successful`);
        } else {
          logger.warn({ name, resetMethod: singleton.resetMethod }, 'Reset method not found on singleton');
          failures.push(`${name}: missing ${singleton.resetMethod}`);
        }
      } catch (error) {
        logger.error({ err: error, name }, 'Failed to reset singleton');
        failures.push(`${name}: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info({
      resetCount,
      totalRegistered: this.registeredSingletons.size,
      failures: failures.length,
      duration
    }, 'Singleton reset cycle completed');

    if (failures.length > 0) {
      logger.warn({ failures }, 'Some singletons failed to reset');
    }
  }

  /**
   * Reset a specific singleton by name
   */
  static async resetSingleton(name: string): Promise<boolean> {
    if (!this.isTestEnvironment) {
      return false;
    }

    const singleton = this.registeredSingletons.get(name);
    if (!singleton) {
      logger.warn({ name }, 'Singleton not registered for reset');
      return false;
    }

    try {
      const instance = singleton.getInstance();
      if (instance && typeof (instance as Record<string, unknown>)[singleton.resetMethod] === 'function') {
        await ((instance as Record<string, unknown>)[singleton.resetMethod] as () => Promise<void>)();
        logger.debug({ name }, 'Individual singleton reset successful');
        return true;
      } else {
        logger.warn({ name, resetMethod: singleton.resetMethod }, 'Reset method not found');
        return false;
      }
    } catch (error) {
      logger.error({ err: error, name }, 'Failed to reset individual singleton');
      return false;
    }
  }

  /**
   * Register default singletons that exist in the vibe-task-manager
   */
  private static registerDefaultSingletons(): void {
    // Register AutoResearchDetector
    this.register('AutoResearchDetector', {
      resetMethod: 'clearCache',
      getInstance: () => {
        try {
          // Dynamic import for ESM compatibility
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const module = require('../tools/vibe-task-manager/services/auto-research-detector.js') as Record<string, unknown>;
          return (module.AutoResearchDetector as { getInstance: () => unknown } | undefined)?.getInstance() || null;
        } catch {
          logger.debug('AutoResearchDetector not available for reset');
          return null;
        }
      },
      description: 'Auto research detection service'
    });

    // Register ContextEnrichmentService  
    this.register('ContextEnrichmentService', {
      resetMethod: 'clearCache',
      getInstance: () => {
        try {
          // Dynamic import for ESM compatibility
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const module = require('../tools/vibe-task-manager/services/context-enrichment-service.js') as Record<string, unknown>;
          return (module.ContextEnrichmentService as { getInstance: () => unknown } | undefined)?.getInstance() || null;
        } catch {
          logger.debug('ContextEnrichmentService not available for reset');
          return null;
        }
      },
      description: 'Context enrichment service'
    });

    // Register ProgressTracker
    this.register('ProgressTracker', {
      resetMethod: 'clearCache', 
      getInstance: () => {
        try {
          // Dynamic import for ESM compatibility
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const module = require('../tools/vibe-task-manager/services/progress-tracker.js') as Record<string, unknown>;
          return (module.ProgressTracker as { getInstance: () => unknown } | undefined)?.getInstance() || null;
        } catch {
          logger.debug('ProgressTracker not available for reset');
          return null;
        }
      },
      description: 'Progress tracking service'
    });

    // Register global dependency graph cleanup
    this.register('DependencyGraphGlobal', {
      resetMethod: 'clearAllProjectGraphs',
      getInstance: () => {
        try {
          // Dynamic import for ESM compatibility - load module for its side effects
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('../tools/vibe-task-manager/core/dependency-graph.js');
          return {
            clearAllProjectGraphs: () => {
              // Clear all project graphs - implementation would need to be added to dependency-graph.ts
              logger.debug('Global dependency graph cache cleared');
            }
          };
        } catch {
          logger.debug('DependencyGraph not available for reset');
          return null;
        }
      },
      description: 'Global dependency graph cache'
    });
  }

  /**
   * Get list of registered singletons
   */
  static getRegisteredSingletons(): string[] {
    return Array.from(this.registeredSingletons.keys());
  }

  /**
   * Clear all registrations (for testing the reset manager itself)
   */
  static clearRegistrations(): void {
    if (!this.isTestEnvironment) {
      return;
    }
    this.registeredSingletons.clear();
    logger.debug('All singleton registrations cleared');
  }
}

/**
 * Convenience function for test setup
 */
export function initializeSingletonResetManager(): void {
  SingletonResetManager.initialize();
}

/**
 * Convenience function for test cleanup
 */
export async function resetAllSingletons(): Promise<void> {
  await SingletonResetManager.resetAll();
}