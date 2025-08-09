/**
 * Configuration management for interactive CLI
 * Handles user preferences and settings
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import logger from '../../logger.js';

/**
 * Configuration schema
 */
export interface VibeInteractiveConfig {
  // Display settings
  display: {
    enableMarkdown: boolean;
    enableColors: boolean;
    enableEmoji: boolean;
    maxLineWidth: number;
    theme: string; // Allow any string for extensibility
  };
  
  // Session settings
  session: {
    autoSave: boolean;
    autoSaveInterval: number; // minutes
    sessionDirectory: string;
    maxSessionHistory: number;
    preserveContext: boolean;
  };
  
  // History settings
  history: {
    maxSize: number;
    persistent: boolean;
    historyFile: string;
  };
  
  // Command settings
  commands: {
    aliasEnabled: boolean;
    aliases: Record<string, string>;
    customCommands: Record<string, string>;
  };
  
  // Performance settings
  performance: {
    requestTimeout: number; // milliseconds
    maxConcurrentRequests: number;
    cacheResponses: boolean;
    cacheSize: number; // MB
  };
  
  // Developer settings
  developer: {
    debugMode: boolean;
    showTimings: boolean;
    showTokenUsage: boolean;
    verboseErrors: boolean;
  };
  
  // Tool settings
  tools: {
    defaultTimeout: number; // milliseconds
    preferredRouting: 'semantic' | 'exact' | 'llm';
    enabledTools: string[];
    disabledTools: string[];
  };
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: VibeInteractiveConfig = {
  display: {
    enableMarkdown: true,
    enableColors: true,
    enableEmoji: false,
    maxLineWidth: 80,
    theme: 'default'
  },
  
  session: {
    autoSave: true,
    autoSaveInterval: 1,
    sessionDirectory: path.join(os.homedir(), '.vibe', 'sessions'),
    maxSessionHistory: 1000,
    preserveContext: true
  },
  
  history: {
    maxSize: 1000,
    persistent: true,
    historyFile: path.join(os.homedir(), '.vibe', 'history.json')
  },
  
  commands: {
    aliasEnabled: true,
    aliases: {
      'q': '/quit',
      'h': '/help',
      'c': '/clear',
      's': '/save',
      't': '/tools'
    },
    customCommands: {}
  },
  
  performance: {
    requestTimeout: 60000,
    maxConcurrentRequests: 3,
    cacheResponses: true,
    cacheSize: 50
  },
  
  developer: {
    debugMode: false,
    showTimings: false,
    showTokenUsage: false,
    verboseErrors: false
  },
  
  tools: {
    defaultTimeout: 300000,
    preferredRouting: 'semantic',
    enabledTools: [],
    disabledTools: []
  }
};

/**
 * Configuration manager class
 */
export class ConfigurationManager {
  private config: VibeInteractiveConfig;
  private configPath: string;
  private configDir: string;
  private hasChanges = false;
  
  constructor() {
    this.configDir = path.join(os.homedir(), '.vibe');
    this.configPath = path.join(this.configDir, 'config.json');
    this.config = { ...DEFAULT_CONFIG };
  }
  
  /**
   * Initialize configuration
   */
  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await this.ensureConfigDirectory();
      
      // Load existing config or create default
      await this.loadConfig();
      
      logger.info('Configuration loaded successfully');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to load configuration, using defaults');
    }
  }
  
  /**
   * Ensure configuration directory exists
   */
  private async ensureConfigDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create config directory');
      throw error;
    }
  }
  
  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const userConfig = JSON.parse(data) as Partial<VibeInteractiveConfig>;
      
      // Merge with defaults
      this.config = this.mergeConfig(DEFAULT_CONFIG, userConfig);
      
    } catch {
      // File doesn't exist or is invalid, create default
      await this.saveConfig();
    }
  }
  
  /**
   * Deep merge configurations
   */
  private mergeConfig(
    defaults: VibeInteractiveConfig, 
    user: Partial<VibeInteractiveConfig>
  ): VibeInteractiveConfig {
    const merged = { ...defaults };
    
    for (const key in user) {
      const k = key as keyof VibeInteractiveConfig;
      if (user[k] !== undefined) {
        if (typeof user[k] === 'object' && !Array.isArray(user[k])) {
          (merged as Record<string, unknown>)[k] = { ...defaults[k], ...user[k] as Record<string, unknown> };
        } else {
          (merged as Record<string, unknown>)[k] = user[k];
        }
      }
    }
    
    return merged;
  }
  
  /**
   * Save configuration to file
   */
  async saveConfig(): Promise<void> {
    try {
      const data = JSON.stringify(this.config, null, 2);
      await fs.writeFile(this.configPath, data, 'utf-8');
      this.hasChanges = false;
      
      logger.info('Configuration saved successfully');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save configuration');
      throw error;
    }
  }
  
  /**
   * Get configuration value
   */
  get<K extends keyof VibeInteractiveConfig>(
    section: K
  ): VibeInteractiveConfig[K];
  get<K extends keyof VibeInteractiveConfig, 
      P extends keyof VibeInteractiveConfig[K]>(
    section: K,
    property: P
  ): VibeInteractiveConfig[K][P];
  get<K extends keyof VibeInteractiveConfig, 
      P extends keyof VibeInteractiveConfig[K]>(
    section: K,
    property?: P
  ): VibeInteractiveConfig[K] | VibeInteractiveConfig[K][P] {
    if (property !== undefined) {
      return this.config[section][property];
    }
    return this.config[section];
  }
  
  /**
   * Set configuration value
   */
  set<K extends keyof VibeInteractiveConfig>(
    section: K,
    value: VibeInteractiveConfig[K]
  ): void;
  set<K extends keyof VibeInteractiveConfig, 
      P extends keyof VibeInteractiveConfig[K]>(
    section: K,
    property: P,
    value: VibeInteractiveConfig[K][P]
  ): void;
  set<K extends keyof VibeInteractiveConfig, 
      P extends keyof VibeInteractiveConfig[K]>(
    section: K,
    propertyOrValue: P | VibeInteractiveConfig[K],
    value?: VibeInteractiveConfig[K][P]
  ): void {
    if (value !== undefined) {
      // Setting a specific property
      const prop = propertyOrValue as P;
      this.config[section][prop] = value;
    } else {
      // Setting entire section
      this.config[section] = propertyOrValue as VibeInteractiveConfig[K];
    }
    this.hasChanges = true;
  }
  
  /**
   * Get full configuration
   */
  getAll(): VibeInteractiveConfig {
    return { ...this.config };
  }
  
  /**
   * Reset to defaults
   */
  async reset(): Promise<void> {
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
  }
  
  /**
   * Check if configuration has unsaved changes
   */
  hasUnsavedChanges(): boolean {
    return this.hasChanges;
  }
  
  /**
   * Auto-save if enabled
   */
  async autoSave(): Promise<void> {
    if (this.hasChanges && this.config.session.autoSave) {
      await this.saveConfig();
    }
  }
  
  /**
   * Load configuration from custom path
   */
  async loadFrom(configPath: string): Promise<void> {
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const userConfig = JSON.parse(data) as Partial<VibeInteractiveConfig>;
      
      this.config = this.mergeConfig(DEFAULT_CONFIG, userConfig);
      this.hasChanges = true;
      
      logger.info({ path: configPath }, 'Configuration loaded from custom path');
    } catch (error) {
      logger.error({ err: error, path: configPath }, 'Failed to load configuration from path');
      throw error;
    }
  }
  
  /**
   * Export configuration to custom path
   */
  async exportTo(exportPath: string): Promise<void> {
    try {
      const data = JSON.stringify(this.config, null, 2);
      await fs.writeFile(exportPath, data, 'utf-8');
      
      logger.info({ path: exportPath }, 'Configuration exported');
    } catch (error) {
      logger.error({ err: error, path: exportPath }, 'Failed to export configuration');
      throw error;
    }
  }
  
  /**
   * Print configuration in a formatted way
   */
  printConfig(): string {
    const lines: string[] = [];
    
    lines.push(chalk.yellow.bold('Current Configuration:'));
    lines.push(chalk.gray('─'.repeat(50)));
    
    for (const [section, values] of Object.entries(this.config)) {
      lines.push(chalk.cyan(`\n${section}:`));
      
      for (const [key, value] of Object.entries(values)) {
        const formattedValue = typeof value === 'object' 
          ? JSON.stringify(value, null, 2).split('\n').join('\n  ')
          : value;
          
        lines.push(`  ${chalk.green(key)}: ${formattedValue}`);
      }
    }
    
    lines.push(chalk.gray('\n─'.repeat(50)));
    lines.push(chalk.gray(`Config file: ${this.configPath}`));
    
    return lines.join('\n');
  }
  
  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Validate display settings
    if (this.config.display.maxLineWidth < 40 || this.config.display.maxLineWidth > 200) {
      errors.push('maxLineWidth must be between 40 and 200');
    }
    
    // Validate session settings
    if (this.config.session.autoSaveInterval < 0.5 || this.config.session.autoSaveInterval > 60) {
      errors.push('autoSaveInterval must be between 0.5 and 60 minutes');
    }
    
    if (this.config.session.maxSessionHistory < 100 || this.config.session.maxSessionHistory > 10000) {
      errors.push('maxSessionHistory must be between 100 and 10000');
    }
    
    // Validate history settings
    if (this.config.history.maxSize < 100 || this.config.history.maxSize > 10000) {
      errors.push('history.maxSize must be between 100 and 10000');
    }
    
    // Validate performance settings
    if (this.config.performance.requestTimeout < 5000 || this.config.performance.requestTimeout > 600000) {
      errors.push('requestTimeout must be between 5000ms and 600000ms');
    }
    
    if (this.config.performance.maxConcurrentRequests < 1 || this.config.performance.maxConcurrentRequests > 10) {
      errors.push('maxConcurrentRequests must be between 1 and 10');
    }
    
    if (this.config.performance.cacheSize < 10 || this.config.performance.cacheSize > 1000) {
      errors.push('cacheSize must be between 10MB and 1000MB');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export singleton instance
export const configManager = new ConfigurationManager();