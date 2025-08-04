/**
 * Enhanced Timeout Management for Testing Infrastructure
 * 
 * Provides sophisticated timeout handling that adapts to different environments
 * and test types, with detailed monitoring and error reporting capabilities.
 */

import logger from '../logger.js';

/**
 * Timeout configuration for different environments and test types
 */
interface TimeoutConfig {
  // Test execution timeouts
  unitTest: number;
  integrationTest: number;
  e2eTest: number;
  
  // Lifecycle timeouts
  setupTimeout: number;
  teardownTimeout: number;
  hookTimeout: number;
  
  // Operation timeouts
  llmRequestTimeout: number;
  fileOperationTimeout: number;
  networkOperationTimeout: number;
  databaseOperationTimeout: number;
  
  // System timeouts
  processStartupTimeout: number;
  processShutdownTimeout: number;
  resourceCleanupTimeout: number;
  
  // Warning thresholds (percentage of timeout before warning)
  warningThreshold: number;
  
  // Retry configuration
  maxRetries: number;
  retryBackoffMs: number;
}

/**
 * Environment-specific timeout configurations
 */
interface EnvironmentTimeouts {
  local: TimeoutConfig;
  ci: TimeoutConfig;
  github: TimeoutConfig;
  docker: TimeoutConfig;
}

/**
 * Timeout monitoring result
 */
interface TimeoutMonitoringResult {
  operationId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  timedOut: boolean;
  warnings: string[];
  errorMessage?: string;
}

/**
 * Active timeout tracking
 */
interface ActiveTimeout {
  operationId: string;
  timeoutId: NodeJS.Timeout;
  startTime: number;
  timeoutMs: number;
  operationType: string;
  warningId?: NodeJS.Timeout;
  onTimeout?: () => void;
}

/**
 * Enhanced Timeout Manager
 */
export class TimeoutManager {
  private static activeTimeouts = new Map<string, ActiveTimeout>();
  private static completedOperations = new Map<string, TimeoutMonitoringResult>();
  private static isTestEnvironment = false;
  private static currentEnvironment: keyof EnvironmentTimeouts = 'local';
  private static config: TimeoutConfig;

  // Default timeout configurations for different environments
  private static environmentTimeouts: EnvironmentTimeouts = {
    local: {
      unitTest: 30000,           // 30 seconds
      integrationTest: 120000,   // 2 minutes
      e2eTest: 300000,          // 5 minutes
      setupTimeout: 30000,       // 30 seconds
      teardownTimeout: 20000,    // 20 seconds
      hookTimeout: 15000,        // 15 seconds
      llmRequestTimeout: 60000,  // 1 minute
      fileOperationTimeout: 10000, // 10 seconds
      networkOperationTimeout: 30000, // 30 seconds
      databaseOperationTimeout: 15000, // 15 seconds
      processStartupTimeout: 60000, // 1 minute
      processShutdownTimeout: 30000, // 30 seconds
      resourceCleanupTimeout: 10000, // 10 seconds
      warningThreshold: 0.8,     // 80% of timeout
      maxRetries: 3,
      retryBackoffMs: 1000
    },
    ci: {
      unitTest: 60000,           // 1 minute (slower CI environment)
      integrationTest: 180000,   // 3 minutes
      e2eTest: 600000,          // 10 minutes
      setupTimeout: 60000,       // 1 minute
      teardownTimeout: 45000,    // 45 seconds
      hookTimeout: 30000,        // 30 seconds
      llmRequestTimeout: 120000, // 2 minutes
      fileOperationTimeout: 20000, // 20 seconds
      networkOperationTimeout: 60000, // 1 minute
      databaseOperationTimeout: 30000, // 30 seconds
      processStartupTimeout: 120000, // 2 minutes
      processShutdownTimeout: 60000, // 1 minute
      resourceCleanupTimeout: 30000, // 30 seconds
      warningThreshold: 0.7,     // 70% of timeout (earlier warning)
      maxRetries: 2,
      retryBackoffMs: 2000
    },
    github: {
      unitTest: 90000,           // 1.5 minutes (GitHub Actions can be slow)
      integrationTest: 300000,   // 5 minutes
      e2eTest: 900000,          // 15 minutes
      setupTimeout: 90000,       // 1.5 minutes
      teardownTimeout: 60000,    // 1 minute
      hookTimeout: 45000,        // 45 seconds
      llmRequestTimeout: 180000, // 3 minutes
      fileOperationTimeout: 30000, // 30 seconds
      networkOperationTimeout: 90000, // 1.5 minutes
      databaseOperationTimeout: 45000, // 45 seconds
      processStartupTimeout: 180000, // 3 minutes
      processShutdownTimeout: 90000, // 1.5 minutes
      resourceCleanupTimeout: 45000, // 45 seconds
      warningThreshold: 0.6,     // 60% of timeout (even earlier warning)
      maxRetries: 1,
      retryBackoffMs: 3000
    },
    docker: {
      unitTest: 45000,           // 45 seconds
      integrationTest: 240000,   // 4 minutes
      e2eTest: 720000,          // 12 minutes
      setupTimeout: 75000,       // 1.25 minutes
      teardownTimeout: 45000,    // 45 seconds
      hookTimeout: 30000,        // 30 seconds
      llmRequestTimeout: 150000, // 2.5 minutes
      fileOperationTimeout: 25000, // 25 seconds
      networkOperationTimeout: 60000, // 1 minute
      databaseOperationTimeout: 30000, // 30 seconds
      processStartupTimeout: 150000, // 2.5 minutes
      processShutdownTimeout: 75000, // 1.25 minutes
      resourceCleanupTimeout: 30000, // 30 seconds
      warningThreshold: 0.75,    // 75% of timeout
      maxRetries: 2,
      retryBackoffMs: 1500
    }
  };

  /**
   * Initialize the timeout manager
   */
  static initialize(customConfig?: Partial<TimeoutConfig>): void {
    // Only operate in test environment
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      logger.warn('TimeoutManager should only be used in test environment');
      return;
    }

    this.isTestEnvironment = true;
    this.detectEnvironment();
    
    // Get base configuration for detected environment
    this.config = { ...this.environmentTimeouts[this.currentEnvironment] };
    
    // Apply custom configuration
    if (customConfig) {
      this.config = { ...this.config, ...customConfig };
    }

    logger.debug({
      environment: this.currentEnvironment,
      config: this.config
    }, 'TimeoutManager initialized');
  }

  /**
   * Detect the current test environment
   */
  private static detectEnvironment(): void {
    if (process.env.GITHUB_ACTIONS === 'true') {
      this.currentEnvironment = 'github';
    } else if (process.env.CI === 'true') {
      this.currentEnvironment = 'ci';
    } else if (process.env.DOCKER === 'true' || process.cwd().includes('docker')) {
      this.currentEnvironment = 'docker';
    } else {
      this.currentEnvironment = 'local';
    }

    logger.debug({ environment: this.currentEnvironment }, 'Test environment detected');
  }

  /**
   * Start monitoring an operation with timeout
   */
  static startOperation(
    operationId: string,
    operationType: keyof TimeoutConfig,
    customTimeoutMs?: number,
    onTimeout?: () => void
  ): void {
    if (!this.isTestEnvironment) {
      return;
    }

    // Clean up any existing timeout for this operation
    this.clearOperation(operationId);

    const timeoutMs = customTimeoutMs || this.config[operationType];
    const startTime = Date.now();

    // Set up warning timeout
    const warningTimeoutMs = timeoutMs * this.config.warningThreshold;
    const warningId = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      logger.warn({
        operationId,
        operationType,
        elapsed,
        timeout: timeoutMs,
        remainingMs: timeoutMs - elapsed
      }, 'Operation timeout warning - approaching limit');
    }, warningTimeoutMs);

    // Set up main timeout
    const timeoutId = setTimeout(() => {
      const duration = Date.now() - startTime;
      const result: TimeoutMonitoringResult = {
        operationId,
        startTime,
        endTime: Date.now(),
        duration,
        timedOut: true,
        warnings: [`Operation timed out after ${duration}ms (limit: ${timeoutMs}ms)`],
        errorMessage: `Operation '${operationId}' (${operationType}) timed out after ${duration}ms`
      };

      this.completedOperations.set(operationId, result);
      this.activeTimeouts.delete(operationId);

      logger.error({
        operationId,
        operationType,
        duration,
        timeoutMs
      }, 'Operation timed out');

      // Call custom timeout handler if provided
      if (onTimeout) {
        try {
          onTimeout();
        } catch (error) {
          logger.error({ err: error, operationId }, 'Error in timeout handler');
        }
      }
    }, timeoutMs);

    // Track the active timeout
    this.activeTimeouts.set(operationId, {
      operationId,
      timeoutId,
      startTime,
      timeoutMs,
      operationType,
      warningId,
      onTimeout
    });

    logger.debug({
      operationId,
      operationType,
      timeoutMs,
      warningThreshold: this.config.warningThreshold
    }, 'Operation timeout monitoring started');
  }

  /**
   * Complete an operation (clears timeout monitoring)
   */
  static completeOperation(operationId: string, success: boolean = true): TimeoutMonitoringResult | null {
    if (!this.isTestEnvironment) {
      return null;
    }

    const activeTimeout = this.activeTimeouts.get(operationId);
    if (!activeTimeout) {
      logger.debug({ operationId }, 'No active timeout found for operation');
      return null;
    }

    // Clear timeouts
    clearTimeout(activeTimeout.timeoutId);
    if (activeTimeout.warningId) {
      clearTimeout(activeTimeout.warningId);
    }

    const endTime = Date.now();
    const duration = endTime - activeTimeout.startTime;

    const result: TimeoutMonitoringResult = {
      operationId,
      startTime: activeTimeout.startTime,
      endTime,
      duration,
      timedOut: false,
      warnings: []
    };

    // Add performance warnings
    const slowThreshold = activeTimeout.timeoutMs * 0.5; // 50% of timeout
    if (duration > slowThreshold) {
      result.warnings.push(`Operation took ${duration}ms (${Math.round(duration / activeTimeout.timeoutMs * 100)}% of timeout limit)`);
    }

    if (!success) {
      result.errorMessage = `Operation '${operationId}' failed after ${duration}ms`;
    }

    this.completedOperations.set(operationId, result);
    this.activeTimeouts.delete(operationId);

    logger.debug({
      operationId,
      duration,
      success,
      warnings: result.warnings.length
    }, 'Operation completed');

    return result;
  }

  /**
   * Clear timeout monitoring for an operation
   */
  static clearOperation(operationId: string): void {
    if (!this.isTestEnvironment) {
      return;
    }

    const activeTimeout = this.activeTimeouts.get(operationId);
    if (activeTimeout) {
      clearTimeout(activeTimeout.timeoutId);
      if (activeTimeout.warningId) {
        clearTimeout(activeTimeout.warningId);
      }
      this.activeTimeouts.delete(operationId);
      
      logger.debug({ operationId }, 'Operation timeout cleared');
    }
  }

  /**
   * Get timeout for a specific operation type
   */
  static getTimeout(operationType: keyof TimeoutConfig): number {
    return this.config[operationType];
  }

  /**
   * Execute an operation with automatic timeout monitoring
   */
  static async withTimeout<T>(
    operationId: string,
    operationType: keyof TimeoutConfig,
    operation: () => Promise<T>,
    customTimeoutMs?: number
  ): Promise<T> {
    if (!this.isTestEnvironment) {
      return operation();
    }

    return new Promise<T>((resolve, reject) => {
      let completed = false;

      // Start timeout monitoring
      this.startOperation(operationId, operationType, customTimeoutMs, () => {
        if (!completed) {
          completed = true;
          reject(new Error(`Operation '${operationId}' timed out after ${customTimeoutMs || this.config[operationType]}ms`));
        }
      });

      // Execute the operation
      Promise.resolve(operation())
        .then((result) => {
          if (!completed) {
            completed = true;
            this.completeOperation(operationId, true);
            resolve(result);
          }
        })
        .catch((error) => {
          if (!completed) {
            completed = true;
            this.completeOperation(operationId, false);
            reject(error);
          }
        });
    });
  }

  /**
   * Get monitoring statistics
   */
  static getStats(): {
    activeOperations: number;
    completedOperations: number;
    timedOutOperations: number;
    averageDuration: number;
    currentEnvironment: string;
    config: TimeoutConfig;
  } {
    const completed = Array.from(this.completedOperations.values());
    const timedOut = completed.filter(op => op.timedOut);
    const successful = completed.filter(op => !op.timedOut && op.duration);
    const avgDuration = successful.length > 0 
      ? successful.reduce((sum, op) => sum + (op.duration || 0), 0) / successful.length 
      : 0;

    return {
      activeOperations: this.activeTimeouts.size,
      completedOperations: this.completedOperations.size,
      timedOutOperations: timedOut.length,
      averageDuration: Math.round(avgDuration),
      currentEnvironment: this.currentEnvironment,
      config: { ...this.config }
    };
  }

  /**
   * Get detailed operation report
   */
  static getOperationReport(operationId: string): TimeoutMonitoringResult | null {
    return this.completedOperations.get(operationId) || null;
  }

  /**
   * Get all operation reports
   */
  static getAllReports(): TimeoutMonitoringResult[] {
    return Array.from(this.completedOperations.values());
  }

  /**
   * Clear all monitoring data
   */
  static reset(): void {
    if (!this.isTestEnvironment) {
      return;
    }

    // Clear all active timeouts
    for (const activeTimeout of this.activeTimeouts.values()) {
      clearTimeout(activeTimeout.timeoutId);
      if (activeTimeout.warningId) {
        clearTimeout(activeTimeout.warningId);
      }
    }

    this.activeTimeouts.clear();
    this.completedOperations.clear();
    
    logger.debug('TimeoutManager reset');
  }

  /**
   * Update configuration
   */
  static updateConfig(newConfig: Partial<TimeoutConfig>): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'TimeoutManager configuration updated');
  }

  /**
   * Get current environment
   */
  static getCurrentEnvironment(): keyof EnvironmentTimeouts {
    return this.currentEnvironment;
  }

  /**
   * Force environment detection (for testing)
   */
  static forceEnvironment(environment: keyof EnvironmentTimeouts): void {
    if (!this.isTestEnvironment) {
      return;
    }

    this.currentEnvironment = environment;
    this.config = { ...this.environmentTimeouts[environment] };
    logger.debug({ environment }, 'Environment forced');
  }
}

/**
 * Convenience functions for timeout management
 */

/**
 * Initialize timeout manager
 */
export function initializeTimeoutManager(config?: Partial<TimeoutConfig>): void {
  TimeoutManager.initialize(config);
}

/**
 * Execute operation with timeout
 */
export async function withTimeout<T>(
  operationId: string,
  operationType: keyof TimeoutConfig,
  operation: () => Promise<T>,
  customTimeoutMs?: number
): Promise<T> {
  return TimeoutManager.withTimeout(operationId, operationType, operation, customTimeoutMs);
}

/**
 * Get timeout for operation type
 */
export function getTimeout(operationType: keyof TimeoutConfig): number {
  return TimeoutManager.getTimeout(operationType);
}

/**
 * Get timeout statistics
 */
export function getTimeoutStats(): {
  activeOperations: number;
  completedOperations: number;
  timedOutOperations: number;
  averageDuration: number;
  currentEnvironment: string;
  config: TimeoutConfig;
} {
  return TimeoutManager.getStats();
}