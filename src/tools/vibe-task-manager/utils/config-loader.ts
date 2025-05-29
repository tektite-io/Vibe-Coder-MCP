import path from 'path';
import { FileUtils, FileOperationResult } from './file-utils.js';
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
 * Configuration loader that uses existing llm_config.json and mcp-config.json
 */
export class ConfigLoader {
  private static instance: ConfigLoader;
  private config: VibeTaskManagerConfig | null = null;
  private llmConfigPath: string;
  private mcpConfigPath: string;

  private constructor() {
    const projectRoot = getProjectRoot();
    this.llmConfigPath = path.join(projectRoot, 'llm_config.json');
    this.mcpConfigPath = path.join(projectRoot, 'mcp-config.json');
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
   * Load configuration from existing files
   */
  async loadConfig(): Promise<FileOperationResult<VibeTaskManagerConfig>> {
    try {
      logger.debug('Loading Vibe Task Manager configuration from existing files');
      logger.debug({
        projectRoot: getProjectRoot(),
        cwd: process.cwd(),
        llmConfigPath: this.llmConfigPath,
        mcpConfigPath: this.mcpConfigPath
      }, 'Configuration file paths');

      // Load LLM configuration
      const llmResult = await FileUtils.readJsonFile<LLMConfig>(this.llmConfigPath);
      if (!llmResult.success) {
        logger.error({
          llmConfigPath: this.llmConfigPath,
          error: llmResult.error
        }, 'Failed to load LLM configuration file');
        return {
          success: false,
          error: `Failed to load LLM config: ${llmResult.error}`,
          metadata: {
            filePath: this.llmConfigPath,
            operation: 'load_llm_config',
            timestamp: new Date()
          }
        };
      }

      // Load MCP configuration
      const mcpResult = await FileUtils.readJsonFile<MCPConfig>(this.mcpConfigPath);
      if (!mcpResult.success) {
        return {
          success: false,
          error: `Failed to load MCP config: ${mcpResult.error}`,
          metadata: {
            filePath: this.mcpConfigPath,
            operation: 'load_mcp_config',
            timestamp: new Date()
          }
        };
      }

      // Combine configurations with task manager defaults
      this.config = {
        llm: llmResult.data!,
        mcp: mcpResult.data!,
        taskManager: {
          maxConcurrentTasks: 10,
          defaultTaskTemplate: 'development',
          dataDirectory: this.getVibeTaskManagerOutputDirectory(),
          performanceTargets: {
            maxResponseTime: 500,
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
            maxProcessingTime: 5000
          },
          // Performance optimization defaults
          performance: {
            memoryManagement: {
              enabled: true,
              maxMemoryPercentage: 0.4, // 40% of available memory
              monitorInterval: 30000, // 30 seconds
              autoManage: true,
              pruneThreshold: 0.7, // Prune when 70% full
              prunePercentage: 0.3 // Prune 30% of entries
            },
            fileSystem: {
              enableLazyLoading: true,
              batchSize: 100, // Process 100 files at a time
              enableCompression: false, // Disabled by default for speed
              indexingEnabled: true,
              concurrentOperations: 5
            },
            caching: {
              enabled: true,
              strategy: 'hybrid', // Memory + disk caching
              maxCacheSize: 100 * 1024 * 1024, // 100MB
              defaultTTL: 300000, // 5 minutes
              enableWarmup: true
            },
            monitoring: {
              enabled: true,
              metricsInterval: 10000, // 10 seconds
              enableAlerts: true,
              performanceThresholds: {
                maxResponseTime: 5000, // 5 seconds
                maxMemoryUsage: 500, // 500MB
                maxCpuUsage: 80 // 80%
              }
            }
          }
        }
      };

      logger.info('Vibe Task Manager configuration loaded successfully');

      return {
        success: true,
        data: this.config,
        metadata: {
          filePath: 'combined-config',
          operation: 'load_config',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error }, 'Failed to load Vibe Task Manager configuration');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'combined-config',
          operation: 'load_config',
          timestamp: new Date()
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
      return 'google/gemini-2.5-flash-preview'; // fallback
    }

    return this.config.llm.llm_mapping[operation] ||
           this.config.llm.llm_mapping['default_generation'] ||
           'google/gemini-2.5-flash-preview';
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
