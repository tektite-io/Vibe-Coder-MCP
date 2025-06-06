import path from 'path';
import { readFile } from 'fs/promises';
import { FileUtils, FileOperationResult } from './file-utils.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';
import { getProjectRoot } from '../../code-map-generator/utils/pathUtils.enhanced.js';

/**
 * LLM configuration interface
 */
export interface LLMConfig {
  llm_mapping: Record<string, string>;
}

/**
 * MCP tool configuration interface
 */
export interface MCPToolConfig {
  description: string;
  use_cases: string[];
  input_patterns: string[];
}

/**
 * MCP configuration interface
 */
export interface MCPConfig {
  tools: Record<string, MCPToolConfig>;
}

/**
 * Vibe Task Manager security configuration interface
 */
export interface VibeTaskManagerSecurityConfig {
  allowedReadDirectory: string;
  allowedWriteDirectory: string;
  securityMode: 'strict' | 'permissive';
}

/**
 * Performance configuration for startup optimization
 */
export interface PerformanceConfig {
  enableConfigCache: boolean;
  configCacheTTL: number;
  lazyLoadServices: boolean;
  preloadCriticalServices: string[];
  connectionPoolSize: number;
  maxStartupTime: number;
  asyncInitialization: boolean;
  batchConfigLoading: boolean;
}

/**
 * Configuration cache entry
 */
interface ConfigCacheEntry {
  config: VibeTaskManagerConfig;
  timestamp: number;
  ttl: number;
}

/**
 * Combined configuration for Vibe Task Manager
 */
export interface VibeTaskManagerConfig {
  llm: LLMConfig;
  mcp: MCPConfig;
  taskManager: {
    // Task manager specific settings
    maxConcurrentTasks: number;
    defaultTaskTemplate: string;
    dataDirectory: string;
    performanceTargets: {
      maxResponseTime: number; // ms
      maxMemoryUsage: number; // MB
      minTestCoverage: number; // percentage
    };
    agentSettings: {
      maxAgents: number;
      defaultAgent: string;
      coordinationStrategy: 'round_robin' | 'least_loaded' | 'capability_based' | 'priority_based';
      healthCheckInterval: number; // seconds
    };
    nlpSettings: {
      primaryMethod: 'pattern' | 'llm' | 'hybrid';
      fallbackMethod: 'pattern' | 'llm' | 'none';
      minConfidence: number;
      maxProcessingTime: number; // ms
    };
    // Performance optimization settings
    performance: {
      memoryManagement: {
        enabled: boolean;
        maxMemoryPercentage: number;
        monitorInterval: number;
        autoManage: boolean;
        pruneThreshold: number;
        prunePercentage: number;
      };
      fileSystem: {
        enableLazyLoading: boolean;
        batchSize: number;
        enableCompression: boolean;
        indexingEnabled: boolean;
        concurrentOperations: number;
      };
      caching: {
        enabled: boolean;
        strategy: 'memory' | 'disk' | 'hybrid';
        maxCacheSize: number;
        defaultTTL: number;
        enableWarmup: boolean;
      };
      monitoring: {
        enabled: boolean;
        metricsInterval: number;
        enableAlerts: boolean;
        performanceThresholds: {
          maxResponseTime: number;
          maxMemoryUsage: number;
          maxCpuUsage: number;
        };
      };
    };
  };
}

/**
 * Enhanced configuration loader with performance optimizations
 * - Configuration caching with TTL
 * - Async initialization
 * - Batch loading
 * - Connection pooling preparation
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: VibeTaskManagerConfig | null = null;
  private configCache: Map<string, ConfigCacheEntry> = new Map();
  private llmConfigPath: string;
  private mcpConfigPath: string;
  private performanceConfig: PerformanceConfig;
  private initializationPromise: Promise<void> | null = null;
  private loadingStartTime: number = 0;

  private constructor() {
    const projectRoot = getProjectRoot();
    this.llmConfigPath = path.join(projectRoot, 'llm_config.json');
    this.mcpConfigPath = path.join(projectRoot, 'mcp-config.json');

    // Performance configuration with <50ms targets
    this.performanceConfig = {
      enableConfigCache: true,
      configCacheTTL: 300000, // 5 minutes
      lazyLoadServices: true,
      preloadCriticalServices: ['execution-coordinator', 'agent-orchestrator'],
      connectionPoolSize: 10,
      maxStartupTime: 50, // <50ms target
      asyncInitialization: true,
      batchConfigLoading: true
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ConfigLoader {
    if (!ConfigLoader.instance) {
      ConfigLoader.instance = new ConfigLoader();
    }
    return ConfigLoader.instance;
  }

  /**
   * Get the Vibe Task Manager output directory following the established convention
   */
  private getVibeTaskManagerOutputDirectory(): string {
    const baseOutputDir = process.env.VIBE_CODER_OUTPUT_DIR
      ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
      : path.join(getProjectRoot(), 'VibeCoderOutput');

    return path.join(baseOutputDir, 'vibe-task-manager');
  }

  /**
   * Check if cached configuration is valid
   */
  private isCacheValid(cacheKey: string): boolean {
    if (!this.performanceConfig.enableConfigCache) {
      return false;
    }

    const cached = this.configCache.get(cacheKey);
    if (!cached) {
      return false;
    }

    const now = Date.now();
    return (now - cached.timestamp) < cached.ttl;
  }

  /**
   * Get configuration from cache
   */
  private getCachedConfig(cacheKey: string): VibeTaskManagerConfig | null {
    if (!this.isCacheValid(cacheKey)) {
      this.configCache.delete(cacheKey);
      return null;
    }

    const cached = this.configCache.get(cacheKey);
    return cached ? { ...cached.config } : null;
  }

  /**
   * Cache configuration
   */
  private cacheConfig(cacheKey: string, config: VibeTaskManagerConfig): void {
    if (!this.performanceConfig.enableConfigCache) {
      return;
    }

    this.configCache.set(cacheKey, {
      config: { ...config },
      timestamp: Date.now(),
      ttl: this.performanceConfig.configCacheTTL
    });
  }

  /**
   * Load configuration files in batch for better performance
   */
  private async batchLoadConfigs(): Promise<{ llm: LLMConfig; mcp: MCPConfig }> {
    if (this.performanceConfig.batchConfigLoading) {
      // Load both files concurrently
      const [llmResult, mcpResult] = await Promise.all([
        FileUtils.readJsonFile<LLMConfig>(this.llmConfigPath),
        FileUtils.readJsonFile<MCPConfig>(this.mcpConfigPath)
      ]);

      if (!llmResult.success) {
        throw new Error(`Failed to load LLM config: ${llmResult.error}`);
      }

      if (!mcpResult.success) {
        throw new Error(`Failed to load MCP config: ${mcpResult.error}`);
      }

      return {
        llm: llmResult.data!,
        mcp: mcpResult.data!
      };
    } else {
      // Sequential loading (fallback)
      const llmResult = await FileUtils.readJsonFile<LLMConfig>(this.llmConfigPath);
      if (!llmResult.success) {
        throw new Error(`Failed to load LLM config: ${llmResult.error}`);
      }

      const mcpResult = await FileUtils.readJsonFile<MCPConfig>(this.mcpConfigPath);
      if (!mcpResult.success) {
        throw new Error(`Failed to load MCP config: ${mcpResult.error}`);
      }

      return {
        llm: llmResult.data!,
        mcp: mcpResult.data!
      };
    }
  }

  /**
   * Load configuration from existing files with performance optimizations
   */
  async loadConfig(): Promise<FileOperationResult<VibeTaskManagerConfig>> {
    this.loadingStartTime = performance.now();

    try {
      const cacheKey = 'main-config';

      // Check cache first
      const cachedConfig = this.getCachedConfig(cacheKey);
      if (cachedConfig) {
        const loadTime = performance.now() - this.loadingStartTime;
        logger.debug({ loadTime }, 'Configuration loaded from cache');

        this.config = cachedConfig;
        return {
          success: true,
          data: cachedConfig,
          metadata: {
            filePath: 'cached-config',
            operation: 'load_config_cached',
            timestamp: new Date(),
            loadTime
          }
        };
      }

      logger.debug('Loading Vibe Task Manager configuration from files');

      // Batch load configuration files
      const { llm, mcp } = await this.batchLoadConfigs();

      // Combine configurations with optimized task manager defaults
      this.config = {
        llm,
        mcp,
        taskManager: {
          maxConcurrentTasks: 10,
          defaultTaskTemplate: 'development',
          dataDirectory: this.getVibeTaskManagerOutputDirectory(),
          performanceTargets: {
            maxResponseTime: 50, // <50ms target for Epic 6.2
            maxMemoryUsage: 500,
            minTestCoverage: 90
          },
          agentSettings: {
            maxAgents: 10,
            defaultAgent: 'default-agent',
            coordinationStrategy: 'capability_based',
            healthCheckInterval: 30
          },
          nlpSettings: {
            primaryMethod: 'hybrid',
            fallbackMethod: 'pattern',
            minConfidence: 0.7,
            maxProcessingTime: 50 // Reduced to 50ms for Epic 6.2
          },
          // Enhanced performance optimization for <50ms target
          performance: {
            memoryManagement: {
              enabled: true,
              maxMemoryPercentage: 0.3, // Reduced to 30% for better performance
              monitorInterval: 5000, // 5 seconds for faster response
              autoManage: true,
              pruneThreshold: 0.6, // More aggressive pruning
              prunePercentage: 0.4 // Prune 40% of entries
            },
            fileSystem: {
              enableLazyLoading: true,
              batchSize: 50, // Smaller batches for faster processing
              enableCompression: false, // Disabled for speed
              indexingEnabled: true,
              concurrentOperations: 10 // Increased concurrency
            },
            caching: {
              enabled: true,
              strategy: 'memory', // Memory-only for speed
              maxCacheSize: 50 * 1024 * 1024, // 50MB for faster access
              defaultTTL: 60000, // 1 minute for faster refresh
              enableWarmup: true
            },
            monitoring: {
              enabled: true,
              metricsInterval: 1000, // 1 second for real-time monitoring
              enableAlerts: true,
              performanceThresholds: {
                maxResponseTime: 50, // <50ms target
                maxMemoryUsage: 300, // 300MB
                maxCpuUsage: 70 // 70%
              }
            }
          }
        }
      };

      // Cache the configuration
      this.cacheConfig(cacheKey, this.config);

      const loadTime = performance.now() - this.loadingStartTime;

      // Check if we met the performance target
      if (loadTime > this.performanceConfig.maxStartupTime) {
        logger.warn({
          loadTime,
          target: this.performanceConfig.maxStartupTime
        }, 'Configuration loading exceeded performance target');
      } else {
        logger.debug({ loadTime }, 'Configuration loaded within performance target');
      }

      logger.info({ loadTime }, 'Vibe Task Manager configuration loaded successfully');

      return {
        success: true,
        data: this.config,
        metadata: {
          filePath: 'combined-config',
          operation: 'load_config',
          timestamp: new Date(),
          loadTime,
          fromCache: false
        }
      };

    } catch (error) {
      const loadTime = performance.now() - this.loadingStartTime;
      logger.error({
        err: error,
        loadTime
      }, 'Failed to load Vibe Task Manager configuration');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'combined-config',
          operation: 'load_config',
          timestamp: new Date(),
          loadTime
        }
      };
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): VibeTaskManagerConfig | null {
    return this.config ? { ...this.config } : null;
  }

  /**
   * Get LLM model for specific operation
   */
  getLLMModel(operation: string): string {
    if (!this.config) {
      return 'google/gemini-2.5-flash-preview-05-20'; // fallback
    }

    return this.config.llm.llm_mapping[operation] ||
           this.config.llm.llm_mapping['default_generation'] ||
           'google/gemini-2.5-flash-preview-05-20';
  }

  /**
   * Get MCP tool configuration
   */
  getMCPToolConfig(toolName: string): MCPToolConfig | null {
    if (!this.config) {
      return null;
    }

    return this.config.mcp.tools[toolName] || null;
  }

  /**
   * Get task manager specific configuration
   */
  getTaskManagerConfig(): VibeTaskManagerConfig['taskManager'] | null {
    return this.config?.taskManager || null;
  }

  /**
   * Validate that required LLM mappings exist for task manager
   */
  validateLLMMappings(): { valid: boolean; missing: string[] } {
    if (!this.config) {
      return { valid: false, missing: ['Configuration not loaded'] };
    }

    const requiredMappings = [
      'task_decomposition',
      'atomic_task_detection',
      'intent_recognition',
      'task_refinement',
      'dependency_graph_analysis',
      'agent_coordination'
    ];

    const missing = requiredMappings.filter(
      mapping => !this.config!.llm.llm_mapping[mapping]
    );

    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Validate that task manager is registered in MCP config
   */
  validateMCPRegistration(): { valid: boolean; error?: string } {
    if (!this.config) {
      return { valid: false, error: 'Configuration not loaded' };
    }

    const taskManagerConfig = this.config.mcp.tools['vibe-task-manager'];
    if (!taskManagerConfig) {
      return { valid: false, error: 'vibe-task-manager not found in MCP config' };
    }

    // Validate required fields
    if (!taskManagerConfig.description ||
        !taskManagerConfig.use_cases ||
        !taskManagerConfig.input_patterns) {
      return { valid: false, error: 'vibe-task-manager MCP config is incomplete' };
    }

    return { valid: true };
  }

  /**
   * Get configuration summary for logging/debugging
   */
  getConfigSummary(): {
    llmMappingsCount: number;
    mcpToolsCount: number;
    taskManagerConfigured: boolean;
    requiredLLMMappingsPresent: boolean;
  } {
    if (!this.config) {
      return {
        llmMappingsCount: 0,
        mcpToolsCount: 0,
        taskManagerConfigured: false,
        requiredLLMMappingsPresent: false
      };
    }

    const llmValidation = this.validateLLMMappings();
    const mcpValidation = this.validateMCPRegistration();

    return {
      llmMappingsCount: Object.keys(this.config.llm.llm_mapping).length,
      mcpToolsCount: Object.keys(this.config.mcp.tools).length,
      taskManagerConfigured: mcpValidation.valid,
      requiredLLMMappingsPresent: llmValidation.valid
    };
  }

  /**
   * Reload configuration from files
   */
  async reloadConfig(): Promise<FileOperationResult<VibeTaskManagerConfig>> {
    this.config = null;
    return await this.loadConfig();
  }

  /**
   * Check if configuration is loaded and valid
   */
  isConfigValid(): boolean {
    if (!this.config) {
      return false;
    }

    const llmValidation = this.validateLLMMappings();
    const mcpValidation = this.validateMCPRegistration();

    return llmValidation.valid && mcpValidation.valid;
  }

  /**
   * Get performance configuration
   */
  getPerformanceConfig(): PerformanceConfig {
    return { ...this.performanceConfig };
  }

  /**
   * Update performance configuration
   */
  updatePerformanceConfig(updates: Partial<PerformanceConfig>): void {
    this.performanceConfig = { ...this.performanceConfig, ...updates };
    logger.debug({ updates }, 'Performance configuration updated');
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configCache.clear();
    logger.debug('Configuration cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    entries: string[];
    hitRate: number;
  } {
    const entries = Array.from(this.configCache.keys());
    return {
      size: this.configCache.size,
      entries,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }

  /**
   * Warm up configuration cache
   */
  async warmupCache(): Promise<void> {
    if (!this.performanceConfig.enableConfigCache) {
      return;
    }

    const startTime = performance.now();
    await this.loadConfig();
    const warmupTime = performance.now() - startTime;

    logger.debug({ warmupTime }, 'Configuration cache warmed up');
  }
}

/**
 * Convenience function to get configured instance
 */
export async function getVibeTaskManagerConfig(): Promise<VibeTaskManagerConfig | null> {
  const loader = ConfigLoader.getInstance();

  if (!loader.getConfig()) {
    const result = await loader.loadConfig();
    if (!result.success) {
      logger.error({ error: result.error }, 'Failed to load Vibe Task Manager configuration');
      return null;
    }
  }

  return loader.getConfig();
}

/**
 * Convenience function to get LLM model for operation
 */
export async function getLLMModelForOperation(operation: string): Promise<string> {
  const loader = ConfigLoader.getInstance();

  if (!loader.getConfig()) {
    await loader.loadConfig();
  }

  return loader.getLLMModel(operation);
}

/**
 * Get the base output directory following the established Vibe Coder MCP convention
 */
export function getBaseOutputDir(): string {
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(getProjectRoot(), 'VibeCoderOutput');
}

/**
 * Get the Vibe Task Manager specific output directory
 */
export function getVibeTaskManagerOutputDir(): string {
  const baseOutputDir = getBaseOutputDir();
  return path.join(baseOutputDir, 'vibe-task-manager');
}

/**
 * Extracts and validates the Vibe Task Manager security configuration from the MCP client config.
 * This follows the same pattern as the Code Map Generator's extractCodeMapConfig function.
 * @param config The OpenRouter configuration object from MCP client
 * @returns The validated Vibe Task Manager security configuration
 * @throws Error if the configuration is invalid
 */
export function extractVibeTaskManagerSecurityConfig(config?: OpenRouterConfig): VibeTaskManagerSecurityConfig {
  // Create a base security configuration object
  let securityConfig: Partial<VibeTaskManagerSecurityConfig> = {};

  if (config) {
    // Try to extract from tools['vibe-task-manager'] first
    const toolConfig = config.tools?.['vibe-task-manager'] as any;

    // If not found, try config['vibe-task-manager']
    const configSection = config.config?.['vibe-task-manager'] as any;

    // Merge configurations if they exist
    if (toolConfig || configSection) {
      securityConfig = {
        ...configSection,
        ...toolConfig,
      };
    }
  }

  // Even if no config is provided, we'll try to use environment variables
  logger.debug(`Extracted vibe-task-manager security config: ${JSON.stringify(securityConfig)}`);

  // Validate and apply defaults with environment variable fallbacks
  const allowedReadDirectory = securityConfig.allowedReadDirectory ||
                               process.env.VIBE_TASK_MANAGER_READ_DIR ||
                               process.cwd();

  const allowedWriteDirectory = securityConfig.allowedWriteDirectory ||
                                process.env.VIBE_CODER_OUTPUT_DIR ||
                                path.join(process.cwd(), 'VibeCoderOutput');

  const securityMode = (securityConfig.securityMode ||
                       process.env.VIBE_TASK_MANAGER_SECURITY_MODE ||
                       'strict') as 'strict' | 'permissive';

  // Validate that directories are provided
  if (!allowedReadDirectory) {
    throw new Error('allowedReadDirectory is required in the configuration, VIBE_TASK_MANAGER_READ_DIR environment variable, or defaults to current working directory');
  }

  if (!allowedWriteDirectory) {
    throw new Error('allowedWriteDirectory is required in the configuration, VIBE_CODER_OUTPUT_DIR environment variable, or defaults to VibeCoderOutput');
  }

  // Resolve paths to absolute paths
  const resolvedReadDir = path.resolve(allowedReadDirectory);
  const resolvedWriteDir = path.resolve(allowedWriteDirectory);

  logger.info({
    allowedReadDirectory: resolvedReadDir,
    allowedWriteDirectory: resolvedWriteDir,
    securityMode
  }, 'Vibe Task Manager security configuration extracted from MCP client config');

  return {
    allowedReadDirectory: resolvedReadDir,
    allowedWriteDirectory: resolvedWriteDir,
    securityMode
  };
}
