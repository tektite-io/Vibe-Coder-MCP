/**
 * Job Timeout Configuration Manager
 * 
 * Singleton pattern for managing job timeout configurations across the MCP server.
 * Follows the same pattern as OpenRouterConfigManager for consistency.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../logger.js';
import { TimeoutOperation } from '../tools/vibe-task-manager/utils/timeout-manager.js';
import { getProjectRoot } from '../tools/code-map-generator/utils/pathUtils.enhanced.js';

/**
 * Tool timeout configuration
 */
export interface ToolTimeoutConfig {
  timeoutOperation: TimeoutOperation;
  customTimeoutMs?: number;
  description?: string;
}

/**
 * Retry policy configuration
 */
export interface RetryPolicyConfig {
  maxRetries: number;
  backoffMultiplier: number;
  initialDelayMs: number;
  maxDelayMs: number;
  enableExponentialBackoff: boolean;
  retryableErrors?: string[];
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  enableTimeoutLogging: boolean;
  logLevel: string;
  metricsEnabled: boolean;
  alertThresholds?: {
    timeoutRate?: number;
    averageExecutionTime?: number;
  };
}

/**
 * Job timeout configuration structure
 */
export interface JobTimeoutConfig {
  description?: string;
  version?: string;
  defaults: {
    taskExecution: number;
    llmRequest: number;
    fileOperations: number;
    networkOperations: number;
    databaseOperations: number;
    taskDecomposition: number;
    recursiveTaskDecomposition: number;
    taskRefinement: number;
    agentCommunication: number;
  };
  toolTimeouts: Record<string, ToolTimeoutConfig>;
  retryPolicy: RetryPolicyConfig;
  monitoring: MonitoringConfig;
}

/**
 * Default job timeout configuration
 */
const DEFAULT_JOB_TIMEOUT_CONFIG: JobTimeoutConfig = {
  defaults: {
    taskExecution: 300000, // 5 minutes
    llmRequest: 60000, // 1 minute
    fileOperations: 10000, // 10 seconds
    networkOperations: 20000, // 20 seconds
    databaseOperations: 15000, // 15 seconds
    taskDecomposition: 600000, // 10 minutes
    recursiveTaskDecomposition: 720000, // 12 minutes
    taskRefinement: 180000, // 3 minutes
    agentCommunication: 30000 // 30 seconds
  },
  toolTimeouts: {},
  retryPolicy: {
    maxRetries: 3,
    backoffMultiplier: 2.0,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    enableExponentialBackoff: true,
    retryableErrors: ['TIMEOUT', 'NETWORK_ERROR', 'RATE_LIMIT']
  },
  monitoring: {
    enableTimeoutLogging: true,
    logLevel: 'warn',
    metricsEnabled: true
  }
};

/**
 * Manages job timeout configuration for the MCP server
 */
export class JobTimeoutConfigManager {
  private static instance: JobTimeoutConfigManager | null = null;
  private config: JobTimeoutConfig | null = null;
  private configPath: string;
  private initialized = false;

  private constructor() {
    // Determine config path (project root) - using getProjectRoot for consistent path resolution
    const projectRoot = getProjectRoot();
    this.configPath = path.join(projectRoot, 'job-timeout-config.json');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): JobTimeoutConfigManager {
    if (!JobTimeoutConfigManager.instance) {
      JobTimeoutConfigManager.instance = new JobTimeoutConfigManager();
    }
    return JobTimeoutConfigManager.instance;
  }

  /**
   * Initialize the configuration manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.debug('JobTimeoutConfigManager already initialized');
      return;
    }

    try {
      await this.loadConfig();
      this.initialized = true;
      logger.info('JobTimeoutConfigManager initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize JobTimeoutConfigManager');
      // Use defaults on error
      this.config = DEFAULT_JOB_TIMEOUT_CONFIG;
      this.initialized = true;
    }
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf-8');
      const loadedConfig = JSON.parse(configContent) as JobTimeoutConfig;
      
      // Merge with defaults to ensure all fields are present
      this.config = {
        ...DEFAULT_JOB_TIMEOUT_CONFIG,
        ...loadedConfig,
        defaults: {
          ...DEFAULT_JOB_TIMEOUT_CONFIG.defaults,
          ...loadedConfig.defaults
        },
        toolTimeouts: {
          ...loadedConfig.toolTimeouts
        },
        retryPolicy: {
          ...DEFAULT_JOB_TIMEOUT_CONFIG.retryPolicy,
          ...loadedConfig.retryPolicy
        },
        monitoring: {
          ...DEFAULT_JOB_TIMEOUT_CONFIG.monitoring,
          ...loadedConfig.monitoring
        }
      };

      logger.info({ 
        configPath: this.configPath,
        toolCount: Object.keys(this.config.toolTimeouts).length 
      }, 'Loaded job timeout configuration');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn({ configPath: this.configPath }, 'Job timeout config file not found, using defaults');
      } else {
        logger.error({ error, configPath: this.configPath }, 'Error loading job timeout config');
      }
      this.config = DEFAULT_JOB_TIMEOUT_CONFIG;
    }
  }

  /**
   * Get timeout configuration for a specific tool
   */
  getToolTimeoutConfig(toolName: string): ToolTimeoutConfig | null {
    if (!this.config) {
      logger.warn('JobTimeoutConfigManager not initialized');
      return null;
    }

    const toolConfig = this.config.toolTimeouts[toolName];
    if (!toolConfig) {
      logger.debug({ toolName }, 'No specific timeout config for tool, using defaults');
      return null;
    }

    return toolConfig;
  }

  /**
   * Get timeout operation type for a tool
   */
  getTimeoutOperation(toolName: string): TimeoutOperation {
    const toolConfig = this.getToolTimeoutConfig(toolName);
    return toolConfig?.timeoutOperation || 'taskExecution';
  }

  /**
   * Get custom timeout milliseconds for a tool
   */
  getCustomTimeoutMs(toolName: string): number | undefined {
    const toolConfig = this.getToolTimeoutConfig(toolName);
    return toolConfig?.customTimeoutMs;
  }

  /**
   * Get default timeout for an operation type
   */
  getDefaultTimeout(operation: TimeoutOperation): number {
    if (!this.config) {
      return DEFAULT_JOB_TIMEOUT_CONFIG.defaults[operation] || 60000;
    }
    return this.config.defaults[operation] || 60000;
  }

  /**
   * Get retry policy configuration
   */
  getRetryPolicy(): RetryPolicyConfig {
    if (!this.config) {
      return DEFAULT_JOB_TIMEOUT_CONFIG.retryPolicy;
    }
    return this.config.retryPolicy;
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig(): MonitoringConfig {
    if (!this.config) {
      return DEFAULT_JOB_TIMEOUT_CONFIG.monitoring;
    }
    return this.config.monitoring;
  }

  /**
   * Check if timeout logging is enabled
   */
  isTimeoutLoggingEnabled(): boolean {
    return this.getMonitoringConfig().enableTimeoutLogging;
  }

  /**
   * Check if metrics are enabled
   */
  areMetricsEnabled(): boolean {
    return this.getMonitoringConfig().metricsEnabled;
  }

  /**
   * Get all configured tool names
   */
  getConfiguredTools(): string[] {
    if (!this.config) {
      return [];
    }
    return Object.keys(this.config.toolTimeouts);
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config) {
      errors.push('Configuration not loaded');
      return { valid: false, errors };
    }

    // Validate defaults
    const requiredDefaults: (keyof JobTimeoutConfig['defaults'])[] = [
      'taskExecution',
      'llmRequest',
      'fileOperations',
      'networkOperations',
      'databaseOperations'
    ];

    for (const op of requiredDefaults) {
      if (!this.config.defaults[op] || this.config.defaults[op] <= 0) {
        errors.push(`Invalid or missing default timeout for ${op}`);
      }
    }

    // Validate tool configs
    for (const [toolName, toolConfig] of Object.entries(this.config.toolTimeouts)) {
      if (!toolConfig.timeoutOperation) {
        errors.push(`Tool ${toolName} missing timeoutOperation`);
      }
      if (toolConfig.customTimeoutMs !== undefined && toolConfig.customTimeoutMs !== null && toolConfig.customTimeoutMs <= 0) {
        errors.push(`Tool ${toolName} has invalid customTimeoutMs`);
      }
    }

    // Validate retry policy
    if (this.config.retryPolicy.maxRetries < 0) {
      errors.push('Invalid maxRetries in retry policy');
    }
    if (this.config.retryPolicy.backoffMultiplier < 1.0) {
      errors.push('Invalid backoffMultiplier in retry policy');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Reload configuration from file
   */
  async reload(): Promise<void> {
    logger.info('Reloading job timeout configuration');
    await this.loadConfig();
  }

  /**
   * Get configuration summary for logging
   */
  getConfigSummary(): {
    initialized: boolean;
    configPath: string;
    toolCount: number;
    defaultTimeouts: Record<string, number>;
    retryEnabled: boolean;
    monitoringEnabled: boolean;
  } {
    return {
      initialized: this.initialized,
      configPath: this.configPath,
      toolCount: this.config ? Object.keys(this.config.toolTimeouts).length : 0,
      defaultTimeouts: this.config?.defaults || {},
      retryEnabled: (this.config?.retryPolicy?.maxRetries ?? 0) > 0,
      monitoringEnabled: this.config?.monitoring.metricsEnabled || false
    };
  }
}

// Export singleton instance getter
export function getJobTimeoutConfigManager(): JobTimeoutConfigManager {
  return JobTimeoutConfigManager.getInstance();
}