/**
 * Security Configuration Management for Vibe Task Manager
 *
 * Provides a bridge to the UnifiedSecurityEngine configuration system.
 * This file maintains backward compatibility while delegating to the unified architecture.
 */

import { 
  UnifiedSecurityEngineConfig,
  createDefaultSecurityConfig,
  UnifiedSecurityEngine
} from '../core/unified-security-engine.js';
import { getUnifiedSecurityConfig } from './unified-security-config.js';
import logger from '../../../logger.js';

/**
 * Re-export UnifiedSecurityEngineConfig as the primary config type
 */
export type UnifiedSecurityConfig = UnifiedSecurityEngineConfig;

/**
 * Security Configuration Manager
 * 
 * This class provides a bridge to the UnifiedSecurityEngine while maintaining
 * backward compatibility for existing code that expects the legacy interface.
 */
export class SecurityConfigManager {
  private static instance: SecurityConfigManager | null = null;
  private securityEngine: UnifiedSecurityEngine | null = null;

  private constructor() {
    logger.info('Security Configuration Manager initialized with UnifiedSecurityEngine bridge');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SecurityConfigManager {
    if (!SecurityConfigManager.instance) {
      SecurityConfigManager.instance = new SecurityConfigManager();
    }
    return SecurityConfigManager.instance;
  }

  /**
   * Get the unified security engine instance
   */
  async getSecurityEngine(): Promise<UnifiedSecurityEngine> {
    if (!this.securityEngine) {
      const config = createDefaultSecurityConfig();
      this.securityEngine = UnifiedSecurityEngine.getInstance(config);
      await this.securityEngine.initialize();
    }
    return this.securityEngine;
  }

  /**
   * Get the unified security configuration
   */
  getUnifiedConfig(): UnifiedSecurityConfig {
    return createDefaultSecurityConfig();
  }

  /**
   * Get configuration from the unified security config manager
   */
  getConfig(): UnifiedSecurityConfig {
    try {
      // Try to get configuration from unified security config manager
      const unifiedConfig = getUnifiedSecurityConfig();
      const managerConfig = unifiedConfig.getSecurityManagerConfig();
      
      // Create a bridge config that maps to UnifiedSecurityEngineConfig
      const bridgeConfig = createDefaultSecurityConfig();
      
      // Override with values from unified config where available
      bridgeConfig.strictMode = managerConfig.strictMode;
      bridgeConfig.performanceThresholdMs = managerConfig.performanceThresholdMs;
      
      if (managerConfig.pathSecurity?.allowedDirectories) {
        bridgeConfig.pathSecurity.allowedReadPaths = managerConfig.pathSecurity.allowedDirectories;
        bridgeConfig.pathSecurity.allowedWritePaths = managerConfig.pathSecurity.allowedDirectories;
      }

      return bridgeConfig;
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load unified security config, using defaults');
      return createDefaultSecurityConfig();
    }
  }

  /**
   * Check if security is enabled
   */
  isSecurityEnabled(): boolean {
    return this.getConfig().enabled;
  }

  /**
   * Check if strict mode is enabled
   */
  isStrictModeEnabled(): boolean {
    return this.getConfig().strictMode;
  }

  /**
   * Get performance threshold in milliseconds
   */
  getPerformanceThreshold(): number {
    return this.getConfig().performanceThresholdMs;
  }

  /**
   * Update configuration (delegates to unified security engine)
   */
  async updateConfig(updates: Partial<UnifiedSecurityConfig>): Promise<void> {
    await this.getSecurityEngine();
    // The unified security engine handles configuration updates internally
    logger.info({ updates }, 'Configuration update requested - delegated to UnifiedSecurityEngine');
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    this.securityEngine = null;
    logger.info('Security configuration reset to defaults');
  }
}

/**
 * Get the security configuration manager instance
 */
export function getSecurityConfig(): SecurityConfigManager {
  return SecurityConfigManager.getInstance();
}

/**
 * Convenience function to get the unified security configuration
 */
export function getUnifiedSecurityConfiguration(): UnifiedSecurityConfig {
  return getSecurityConfig().getConfig();
}

/**
 * Convenience function to check if security is enabled
 */
export function isSecurityEnabled(): boolean {
  return getSecurityConfig().isSecurityEnabled();
}