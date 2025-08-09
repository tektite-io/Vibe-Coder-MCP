import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import logger from '../logger.js';

export class UserConfigManager {
  private static instance: UserConfigManager | null = null;
  private userConfigDir: string;
  private configVersion: string = '0.3.0';
  
  private constructor() {
    // Determine user config directory based on OS
    this.userConfigDir = this.determineUserConfigDir();
  }
  
  static getInstance(): UserConfigManager {
    if (!UserConfigManager.instance) {
      UserConfigManager.instance = new UserConfigManager();
    }
    return UserConfigManager.instance;
  }

  private determineUserConfigDir(): string {
    const platform = os.platform();
    
    // Check for XDG_CONFIG_HOME first (Linux standard)
    if (process.env.XDG_CONFIG_HOME) {
      return path.join(process.env.XDG_CONFIG_HOME, 'vibe-coder');
    }
    
    // Platform-specific defaults
    switch (platform) {
      case 'win32':
        return path.join(process.env.APPDATA || os.homedir(), 'vibe-coder');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support', 'vibe-coder');
      default: // Linux and others
        return path.join(os.homedir(), '.config', 'vibe-coder');
    }
  }

  async ensureUserConfigDir(): Promise<void> {
    try {
      const dirs = [
        this.userConfigDir,
        path.join(this.userConfigDir, 'configs'),
        path.join(this.userConfigDir, 'backups'),
        path.join(this.userConfigDir, 'logs')
      ];
      
      for (const dir of dirs) {
        await fs.ensureDir(dir);
        logger.debug({ dir }, 'Ensured config directory exists');
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to create config directories');
      throw error;
    }
  }

  async copyDefaultConfigs(): Promise<void> {
    const templateDir = path.join(process.cwd(), 'src', 'config-templates');
    const configDir = path.join(this.userConfigDir, 'configs');
    
    const templates = [
      { src: '.env.template', dest: '.env' },
      { src: 'llm_config.template.json', dest: 'llm_config.json' },
      { src: 'mcp-config.template.json', dest: 'mcp-config.json' }
    ];
    
    for (const template of templates) {
      const srcPath = path.join(templateDir, template.src);
      const destPath = path.join(configDir, template.dest);
      
      if (!await fs.pathExists(destPath)) {
        await fs.copy(srcPath, destPath);
        logger.info({ file: template.dest }, 'Copied default config');
      }
    }
  }

  async backupExistingConfigs(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.userConfigDir, 'backups', timestamp);
    const configDir = path.join(this.userConfigDir, 'configs');
    
    if (await fs.pathExists(configDir)) {
      await fs.copy(configDir, backupDir);
      logger.info({ backupDir }, 'Backed up existing configs');
    }
  }

  getUserConfigDir(): string {
    return this.userConfigDir;
  }

  getConfigVersion(): string {
    return this.configVersion;
  }
}