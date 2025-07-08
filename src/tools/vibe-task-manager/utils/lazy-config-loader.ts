/**
 * Lazy Configuration Loader Utility
 * 
 * Provides reusable patterns for deferred configuration loading to prevent
 * module-level initialization issues with TimeoutManager and other services.
 * 
 * This utility follows the established pattern from the security configuration
 * fix and provides memoized getter functions with fallback handling.
 */

import { getTimeoutManager, TimeoutOperation, RetryConfig } from './timeout-manager.js';
import logger from '../../../logger.js';

/**
 * Type for configuration factories that may need timeout values
 */
export type ConfigFactory<T> = () => T;

/**
 * Type for configuration with timeout dependencies
 */
export interface TimeoutDependentConfig {
  readonly [key: string]: unknown;
}

/**
 * Lazy configuration container with memoization
 */
export class LazyConfigContainer<T extends TimeoutDependentConfig> {
  private config: T | null = null;
  private configFactory: ConfigFactory<T>;
  private readonly configName: string;

  constructor(configName: string, factory: ConfigFactory<T>) {
    this.configName = configName;
    this.configFactory = factory;
  }

  /**
   * Get configuration, initializing only on first access
   */
  getConfig(): T {
    if (!this.config) {
      try {
        this.config = this.configFactory();
        logger.debug({ configName: this.configName }, 'Lazy configuration initialized successfully');
      } catch (error) {
        logger.error({ 
          err: error, 
          configName: this.configName 
        }, 'Failed to initialize lazy configuration');
        throw new Error(`Failed to initialize ${this.configName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return this.config;
  }

  /**
   * Check if configuration has been initialized
   */
  isInitialized(): boolean {
    return this.config !== null;
  }

  /**
   * Reset configuration (for testing purposes)
   */
  reset(): void {
    this.config = null;
    logger.debug({ configName: this.configName }, 'Lazy configuration reset');
  }
}

/**
 * Creates a lazy configuration factory with timeout dependencies
 * 
 * @param configName - Name for logging/debugging
 * @param baseConfig - Base configuration object
 * @param timeoutMappings - Map of config keys to timeout operation types
 * @param userOverrides - Optional user configuration overrides
 * @returns LazyConfigContainer instance
 */
export function createLazyTimeoutConfig<T extends TimeoutDependentConfig>(
  configName: string,
  baseConfig: Omit<T, keyof TimeoutDependentConfig>,
  timeoutMappings: Record<string, string>,
  userOverrides?: Partial<T>
): LazyConfigContainer<T> {
  const factory: ConfigFactory<T> = () => {
    const timeoutManager = getTimeoutManager();
    
    // Build timeout values
    const timeoutValues: Record<string, number> = {};
    for (const [configKey, timeoutOperation] of Object.entries(timeoutMappings)) {
      timeoutValues[configKey] = timeoutManager.getTimeout(timeoutOperation as TimeoutOperation);
    }

    // Merge base config, timeout values, and user overrides
    const finalConfig = {
      ...baseConfig,
      ...timeoutValues,
      ...userOverrides
    } as T;

    return finalConfig;
  };

  return new LazyConfigContainer(configName, factory);
}

/**
 * Creates a lazy configuration factory with retry dependencies
 * 
 * @param configName - Name for logging/debugging  
 * @param baseConfig - Base configuration object
 * @param retryMappings - Map of config keys to retry config properties
 * @param userOverrides - Optional user configuration overrides
 * @returns LazyConfigContainer instance
 */
export function createLazyRetryConfig<T extends TimeoutDependentConfig>(
  configName: string,
  baseConfig: Omit<T, keyof TimeoutDependentConfig>,
  retryMappings: Record<string, keyof RetryConfig>,
  userOverrides?: Partial<T>
): LazyConfigContainer<T> {
  const factory: ConfigFactory<T> = () => {
    const timeoutManager = getTimeoutManager();
    const retryConfig = timeoutManager.getRetryConfig();
    
    // Build retry values
    const retryValues: Record<string, unknown> = {};
    for (const [configKey, retryProperty] of Object.entries(retryMappings)) {
      retryValues[configKey] = retryConfig[retryProperty];
    }

    // Merge base config, retry values, and user overrides
    const finalConfig = {
      ...baseConfig,
      ...retryValues,
      ...userOverrides
    } as T;

    return finalConfig;
  };

  return new LazyConfigContainer(configName, factory);
}

/**
 * Utility for creating memoized configuration getters
 * 
 * This pattern ensures configuration is only computed once and cached
 * for subsequent access, preventing repeated timeout manager calls.
 */
export function memoizeConfig<T>(
  configName: string, 
  factory: ConfigFactory<T>
): () => T {
  let memoizedConfig: T | null = null;

  return (): T => {
    if (!memoizedConfig) {
      try {
        memoizedConfig = factory();
        logger.debug({ configName }, 'Configuration memoized successfully');
      } catch (error) {
        logger.error({ 
          err: error, 
          configName 
        }, 'Failed to memoize configuration');
        throw new Error(`Failed to create ${configName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return memoizedConfig;
  };
}

/**
 * Environment-aware configuration helper
 * 
 * Provides different configuration strategies based on NODE_ENV
 */
export class EnvironmentAwareConfig {
  private static readonly isTestEnv = process.env.NODE_ENV === 'test';
  private static readonly isDevEnv = process.env.NODE_ENV === 'development';
  private static readonly isProdEnv = process.env.NODE_ENV === 'production';

  /**
   * Get environment-specific timeout value
   */
  static getTimeoutForEnv(baseTimeout: number, testTimeout?: number): number {
    if (this.isTestEnv && testTimeout !== undefined) {
      return testTimeout;
    }
    return baseTimeout;
  }

  /**
   * Get environment-specific configuration
   */
  static getConfigForEnv<T>(
    prodConfig: T,
    devConfig?: Partial<T>,
    testConfig?: Partial<T>
  ): T {
    if (this.isTestEnv && testConfig) {
      return { ...prodConfig, ...testConfig };
    }
    if (this.isDevEnv && devConfig) {
      return { ...prodConfig, ...devConfig };
    }
    return prodConfig;
  }

  /**
   * Check if current environment allows configuration fallbacks
   */
  static allowsFallbacks(): boolean {
    return this.isTestEnv || this.isDevEnv;
  }
}

/**
 * Configuration validation utilities
 */
export class ConfigValidator {
  /**
   * Validate required configuration properties
   */
  static validateRequired<T extends Record<string, unknown>>(
    config: T,
    requiredProps: (keyof T)[],
    configName: string
  ): void {
    const missing = requiredProps.filter(prop => 
      config[prop] === undefined || config[prop] === null
    );

    if (missing.length > 0) {
      const errorMsg = `Missing required configuration properties in ${configName}: ${missing.join(', ')}`;
      logger.error({ missing, configName }, errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Validate timeout values are positive numbers
   */
  static validateTimeouts<T extends Record<string, unknown>>(
    config: T,
    timeoutProps: (keyof T)[],
    configName: string
  ): void {
    const invalid = timeoutProps.filter(prop => {
      const value = config[prop];
      return typeof value !== 'number' || value <= 0;
    });

    if (invalid.length > 0) {
      const errorMsg = `Invalid timeout values in ${configName}: ${invalid.join(', ')} must be positive numbers`;
      logger.error({ invalid, configName }, errorMsg);
      throw new Error(errorMsg);
    }
  }
}