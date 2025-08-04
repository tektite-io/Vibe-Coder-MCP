/**
 * Environment Variable Cleanup Manager for Testing Infrastructure
 * 
 * Provides centralized management of process.env mutations during tests
 * to prevent environment pollution between test runs.
 */

import logger from '../logger.js';

/**
 * Environment variable snapshot for restoration
 */
interface EnvSnapshot {
  [key: string]: string | undefined;
}

/**
 * Environment Variable Cleanup Manager
 */
export class EnvCleanupManager {
  private static originalEnv: EnvSnapshot = {};
  private static isInitialized = false;
  private static isTestEnvironment = false;
  private static trackedKeys = new Set<string>();

  /**
   * Initialize the environment cleanup manager
   */
  static initialize(): void {
    // Only operate in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      logger.warn('EnvCleanupManager should only be used in test environment');
      return;
    }

    this.isTestEnvironment = true;
    this.createSnapshot();
    this.isInitialized = true;
    
    logger.debug('EnvCleanupManager initialized for test environment');
  }

  /**
   * Create a snapshot of current environment variables
   */
  static createSnapshot(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    // Store the original environment state
    this.originalEnv = { ...process.env };
    this.trackedKeys.clear();
    
    logger.debug('Environment snapshot created');
  }

  /**
   * Track a specific environment variable for cleanup
   */
  static trackVariable(key: string): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.trackedKeys.add(key);
    
    // Store original value if not already stored
    if (!(key in this.originalEnv)) {
      this.originalEnv[key] = process.env[key];
    }
    
    logger.debug({ key }, 'Environment variable tracked for cleanup');
  }

  /**
   * Set environment variable with automatic tracking
   */
  static setVariable(key: string, value: string): void {
    if (!this.isTestEnvironment) {
      logger.warn('EnvCleanupManager can only set variables in test environment');
      return;
    }

    this.trackVariable(key);
    process.env[key] = value;
    
    logger.debug({ key, value }, 'Environment variable set with tracking');
  }

  /**
   * Delete environment variable with tracking
   */
  static deleteVariable(key: string): void {
    if (!this.isTestEnvironment) {
      logger.warn('EnvCleanupManager can only delete variables in test environment');
      return;
    }

    this.trackVariable(key);
    delete process.env[key];
    
    logger.debug({ key }, 'Environment variable deleted with tracking');
  }

  /**
   * Restore environment to original state
   */
  static restoreEnvironment(): void {
    if (!this.isTestEnvironment || !this.isInitialized) {
      return;
    }

    const startTime = Date.now();
    let restoredCount = 0;
    let deletedCount = 0;

    // Restore tracked variables to their original values
    for (const key of this.trackedKeys) {
      const originalValue = this.originalEnv[key];
      
      if (originalValue === undefined) {
        // Variable didn't exist originally, delete it
        delete process.env[key];
        deletedCount++;
      } else {
        // Restore original value
        process.env[key] = originalValue;
        restoredCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    logger.debug({
      restoredCount,
      deletedCount,
      totalTracked: this.trackedKeys.size,
      duration
    }, 'Environment variables restored');

    // Clear tracked keys for next test
    this.trackedKeys.clear();
  }

  /**
   * Restore all environment variables (full reset)
   */
  static restoreAllEnvironment(): void {
    if (!this.isTestEnvironment || !this.isInitialized) {
      return;
    }

    const startTime = Date.now();
    let restoredCount = 0;
    let deletedCount = 0;

    // Get all current environment keys
    const currentKeys = Object.keys(process.env);
    
    // Restore all original variables
    for (const [key, value] of Object.entries(this.originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
        deletedCount++;
      } else {
        process.env[key] = value;
        restoredCount++;
      }
    }

    // Delete any variables that weren't in the original environment
    for (const key of currentKeys) {
      if (!(key in this.originalEnv)) {
        delete process.env[key];
        deletedCount++;
      }
    }

    const duration = Date.now() - startTime;
    
    logger.debug({
      restoredCount,
      deletedCount,
      totalOriginal: Object.keys(this.originalEnv).length,
      duration
    }, 'Full environment restoration completed');
  }

  /**
   * Get current environment diff from original
   */
  static getEnvironmentDiff(): { added: string[], modified: string[], deleted: string[] } {
    if (!this.isTestEnvironment || !this.isInitialized) {
      return { added: [], modified: [], deleted: [] };
    }

    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];

    // Check for added and modified variables
    for (const [key, currentValue] of Object.entries(process.env)) {
      const originalValue = this.originalEnv[key];
      
      if (originalValue === undefined) {
        added.push(key);
      } else if (originalValue !== currentValue) {
        modified.push(key);
      }
    }

    // Check for deleted variables
    for (const [key, originalValue] of Object.entries(this.originalEnv)) {
      if (originalValue !== undefined && !(key in process.env)) {
        deleted.push(key);
      }
    }

    return { added, modified, deleted };
  }

  /**
   * Get list of tracked variables
   */
  static getTrackedVariables(): string[] {
    return Array.from(this.trackedKeys);
  }

  /**
   * Clear all tracking (for testing the manager itself)
   */
  static clearTracking(): void {
    if (!this.isTestEnvironment) {
      return;
    }
    
    this.trackedKeys.clear();
    this.originalEnv = {};
    logger.debug('Environment tracking cleared');
  }

  /**
   * Check if manager is initialized
   */
  static isManagerInitialized(): boolean {
    return this.isInitialized && this.isTestEnvironment;
  }
}

/**
 * Convenience functions for common environment operations
 */

/**
 * Set environment variable with automatic cleanup
 */
export function setTestEnvVar(key: string, value: string): void {
  EnvCleanupManager.setVariable(key, value);
}

/**
 * Delete environment variable with automatic cleanup
 */
export function deleteTestEnvVar(key: string): void {
  EnvCleanupManager.deleteVariable(key);
}

/**
 * Temporarily set environment variables for a test block
 */
export function withTestEnvVars<T>(envVars: Record<string, string>, callback: () => T): T {
  // Set variables
  for (const [key, value] of Object.entries(envVars)) {
    EnvCleanupManager.setVariable(key, value);
  }

  try {
    return callback();
  } finally {
    // Variables will be cleaned up automatically by restoreEnvironment()
  }
}

/**
 * Initialize environment cleanup manager
 */
export function initializeEnvCleanupManager(): void {
  EnvCleanupManager.initialize();
}

/**
 * Restore environment to original state
 */
export function restoreTestEnvironment(): void {
  EnvCleanupManager.restoreEnvironment();
}

/**
 * Restore all environment variables (full reset)
 */
export function restoreAllTestEnvironment(): void {
  EnvCleanupManager.restoreAllEnvironment();
}