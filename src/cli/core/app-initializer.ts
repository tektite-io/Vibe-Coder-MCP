/**
 * Core App Initializer for Interactive CLI
 * Follows EXACT initialization sequence from server
 * Uses ALL centralized services - NO bypassing
 */

import { OpenRouterConfigManager } from '../../utils/openrouter-config-manager.js';
import { JobTimeoutConfigManager } from '../../utils/job-timeout-config-manager.js';
import { ToolRegistry } from '../../services/routing/toolRegistry.js';
import { getUnifiedSecurityConfig } from '../../tools/vibe-task-manager/security/unified-security-config.js';
import { initializeToolEmbeddings } from '../../services/routing/embeddingStore.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { TransportContext } from '../../index-with-setup.js';
import logger from '../../logger.js';

export class VibeAppInitializer {
  private initialized = false;
  private openRouterConfig: OpenRouterConfig | null = null;
  
  /**
   * Initialize all core services in the EXACT order required
   * This follows the proven initialization sequence from src/index.ts
   */
  async initializeCoreServices(): Promise<OpenRouterConfig> {
    if (this.initialized && this.openRouterConfig) {
      logger.debug('Core services already initialized, returning cached config');
      return this.openRouterConfig;
    }

    try {
      logger.info('Starting CLI core services initialization');
      
      // Step 1: Initialize OpenRouterConfigManager (singleton)
      logger.debug('Step 1: Initializing OpenRouterConfigManager');
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const openRouterConfig = await configManager.getOpenRouterConfig();
      
      // Log configuration details for debugging
      const mappingKeys = Object.keys(openRouterConfig.llm_mapping || {});
      logger.info('Loaded OpenRouter configuration', {
        hasApiKey: Boolean(openRouterConfig.apiKey),
        baseUrl: openRouterConfig.baseUrl,
        mappingLoaded: mappingKeys.length > 0,
        numberOfMappings: mappingKeys.length
      });
      
      // Validate configuration
      const validation = configManager.validateConfiguration();
      if (!validation.valid) {
        logger.error({ errors: validation.errors }, 'OpenRouter configuration validation failed');
        throw new Error(`Configuration validation failed: ${validation.errors.join(', ')}`);
      }
      
      if (validation.warnings.length > 0) {
        logger.warn({ warnings: validation.warnings }, 'OpenRouter configuration has warnings');
      }
      
      // Step 2: Initialize JobTimeoutConfigManager (singleton)
      logger.debug('Step 2: Initializing JobTimeoutConfigManager');
      const jobTimeoutManager = JobTimeoutConfigManager.getInstance();
      await jobTimeoutManager.initialize();
      
      // Step 3: Initialize ToolRegistry with OpenRouter config
      // CRITICAL: Must pass config to getInstance()
      logger.debug('Step 3: Initializing ToolRegistry with config');
      ToolRegistry.getInstance(openRouterConfig);
      
      // Step 4: Import tools to trigger self-registration
      logger.debug('Step 4: Importing tools for registration');
      await import('../../tools/index.js');
      await import('../../services/request-processor/index.js');
      
      // Step 5: Initialize unified security configuration with CLI transport context
      logger.debug('Step 5: Initializing UnifiedSecurityConfig with CLI context');
      const securityConfig = getUnifiedSecurityConfig();
      
      // Create CLI transport context (ALWAYS CLI for app initializer)
      const cliTransportContext: TransportContext = {
        sessionId: 'cli-session',
        transportType: 'cli', // Always CLI for this initializer
        timestamp: Date.now(),
        workingDirectory: process.cwd(), // ✅ User's project directory!
        mcpClientConfig: openRouterConfig
      };
      
      securityConfig.initializeFromMCPConfig(openRouterConfig, cliTransportContext);
      logger.info({ 
        workingDirectory: cliTransportContext.workingDirectory,
        autoDetection: process.env.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION 
      }, 'CLI initialized with auto-detection capability');
      
      // Step 6: Initialize tool embeddings for semantic routing
      logger.debug('Step 6: Initializing tool embeddings');
      await initializeToolEmbeddings();
      
      // Mark as initialized and cache config
      this.initialized = true;
      this.openRouterConfig = openRouterConfig;
      
      logger.info('CLI core services initialization completed successfully');
      return openRouterConfig;
      
    } catch (error) {
      logger.error({ err: error }, 'CLI initialization failed');
      const message = error instanceof Error ? error.message : 'Unknown initialization error';
      throw new Error(`Failed to initialize CLI: ${message}`);
    }
  }
  
  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
  
  /**
   * Get cached OpenRouter config if initialized
   */
  getConfig(): OpenRouterConfig | null {
    return this.openRouterConfig;
  }
  
  /**
   * Reset initialization state (mainly for testing)
   */
  reset(): void {
    this.initialized = false;
    this.openRouterConfig = null;
  }
}

// Export singleton instance
export const appInitializer = new VibeAppInitializer();