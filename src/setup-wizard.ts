#!/usr/bin/env node
/**
 * Interactive Setup Wizard for Vibe Coder MCP
 * Guides users through first-time configuration
 * Integrates UserConfigManager and ConfigValidator for robust setup
 */

import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import { fileURLToPath } from 'url';
import logger from './logger.js';
import { OpenRouterConfigManager } from './utils/openrouter-config-manager.js';
import { UserConfigManager } from './utils/user-config-manager.js';
import { ConfigValidator } from './utils/config-validator.js';

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Get package version dynamically
function getPackageVersion(): string {
  try {
    const packagePath = path.resolve(projectRoot, 'package.json');
    const packageContent = fs.readFileSync(packagePath, 'utf-8');
    const packageJson = JSON.parse(packageContent);
    return packageJson.version || '0.0.0';
  } catch {
    // Fallback version if package.json can't be read
    return '0.0.0';
  }
}

interface SetupConfig {
  OPENROUTER_API_KEY: string;
  VIBE_CODER_OUTPUT_DIR: string;
  VIBE_PROJECT_ROOT?: string;
  VIBE_USE_PROJECT_ROOT_AUTO_DETECTION?: 'true' | 'false';
  CODE_MAP_ALLOWED_DIR: string;
  VIBE_TASK_MANAGER_READ_DIR: string;
  VIBE_TASK_MANAGER_SECURITY_MODE: 'strict' | 'permissive';
  OPENROUTER_BASE_URL: string;
  GEMINI_MODEL: string;
  PERPLEXITY_MODEL: string;
  configureDirs?: boolean;
  configureAdvanced?: boolean;
  useUnifiedConfig?: boolean;
}

interface SetupAnswers {
  OPENROUTER_API_KEY: string;
  VIBE_CODER_OUTPUT_DIR?: string;
  VIBE_PROJECT_ROOT?: string;
  VIBE_USE_PROJECT_ROOT_AUTO_DETECTION?: 'true' | 'false';
  CODE_MAP_ALLOWED_DIR?: string;
  VIBE_TASK_MANAGER_READ_DIR?: string;
  VIBE_TASK_MANAGER_SECURITY_MODE?: 'strict' | 'permissive';
  OPENROUTER_BASE_URL?: string;
  GEMINI_MODEL?: string;
  PERPLEXITY_MODEL?: string;
  configureDirs?: boolean;
  configureAdvanced?: boolean;
  useUnifiedConfig?: boolean;
}

// Type-safe inquirer wrapper for strict typing compliance

// ASCII art and messages from prompts
const getAsciiArt = (): string => `
██╗   ██╗██╗██████╗ ███████╗
██║   ██║██║██╔══██╗██╔════╝
██║   ██║██║██████╔╝█████╗  
╚██╗ ██╔╝██║██╔══██╗██╔══╝  
 ╚████╔╝ ██║██████╔╝███████╗
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝
     Coder MCP v${getPackageVersion()}
`;

const WELCOME_MESSAGE = `
Welcome to Vibe Coder MCP! 🎆

This setup wizard will help you configure:
• OpenRouter API for AI-powered development
• 🆕 Unified project root configuration (Recommended)
  - Single variable for all tools (VIBE_PROJECT_ROOT)
  - Automatic CLI project detection
  - Simplified MCP client setup
• Security boundaries for file access
• Output directories for generated content

🚀 New in v0.2.4+: Zero-configuration for CLI users!

Let's get started! This will only take a minute.
`;

export class SetupWizard {
  private envPath: string;
  private configPath: string;
  private userConfigManager: UserConfigManager;
  private configValidator: ConfigValidator;
  private isInteractive: boolean;

  constructor() {
    this.envPath = path.join(projectRoot, '.env');
    this.configPath = path.join(projectRoot, '.vibe-config.json');
    this.userConfigManager = UserConfigManager.getInstance();
    this.configValidator = ConfigValidator.getInstance();
    this.isInteractive = process.stdin.isTTY && !process.env.CI;
  }

  /**
   * Check if this is the first run using multiple indicators
   */
  async isFirstRun(): Promise<boolean> {
    // First, check if .env file exists and load it if not already loaded
    // This ensures we don't miss existing configuration
    if (await fs.pathExists(this.envPath) && !process.env.OPENROUTER_API_KEY) {
      try {
        // Load environment variables from .env file
        const dotenv = await import('dotenv');
        dotenv.config({ path: this.envPath });
        logger.debug('Loaded .env file in isFirstRun check');
      } catch (error) {
        logger.warn({ err: error }, 'Failed to load .env in isFirstRun check');
      }
    }
    
    // Check multiple conditions for robust detection
    const checks = [
      // 1. Check for API key in environment (after loading .env if it exists)
      !process.env.OPENROUTER_API_KEY,
      
      // 2. Check for .env file in project
      !await fs.pathExists(this.envPath),
      
      // 3. Check for llm_config.json
      !await fs.pathExists(path.join(projectRoot, 'llm_config.json')),
      
      // 4. Check for user config directory
      !await fs.pathExists(this.userConfigManager.getUserConfigDir())
    ];
    
    // If any check fails, consider it first run
    const isFirstRun = checks.some(check => check);
    
    if (isFirstRun) {
      logger.info({
        checks: {
          hasApiKey: !checks[0],
          hasEnvFile: !checks[1],
          hasLlmConfig: !checks[2],
          hasUserConfig: !checks[3]
        }
      }, 'First run detected');
    }
    
    return isFirstRun;
  }

  /**
   * Check if configuration is valid
   */
  async isConfigValid(): Promise<boolean> {
    try {
      const configManager = OpenRouterConfigManager.getInstance();
      await configManager.initialize();
      const validation = configManager.validateConfiguration();
      return validation.valid;
    } catch (error) {
      logger.debug({ err: error }, 'Configuration validation failed');
      return false;
    }
  }

  /**
   * Display welcome message with enhanced visuals
   */
  private displayWelcome(): void {
    console.clear();
    console.log(chalk.cyan(getAsciiArt()));
    console.log(WELCOME_MESSAGE);
  }

  /**
   * Validate OpenRouter API key format and test it
   */
  private validateApiKey(apiKey: string): boolean | string {
    if (!apiKey || apiKey.trim() === '') {
      return 'API key is required';
    }
    if (!apiKey.startsWith('sk-or-')) {
      return 'Invalid API key format (should start with sk-or-)';
    }
    return true;
  }

  /**
   * Test API key by making a request to OpenRouter
   */
  private async testApiKeyLive(apiKey: string): Promise<boolean> {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.ok;
    } catch (error) {
      logger.error({ err: error }, 'API key validation failed');
      return false;
    }
  }

  /**
   * Prompt for configuration
   */
  private async promptConfiguration(): Promise<SetupConfig> {
    const questions = [
      {
        type: 'input',
        name: 'OPENROUTER_API_KEY',
        message: '🔑 Enter your OpenRouter API key:',
        validate: this.validateApiKey,
        transformer: (input: string) => {
          // Hide the API key as user types
          if (input.length > 8) {
            return `${input.substring(0, 4)}${'*'.repeat(input.length - 8)}${input.substring(input.length - 4)}`;
          }
          return input;
        }
      },
      {
        type: 'confirm',
        name: 'useUnifiedConfig',
        message: '🆕 Use simplified unified project root configuration? (Recommended)',
        default: true
      },
      {
        type: 'input',
        name: 'VIBE_PROJECT_ROOT',
        message: '📁 Project root directory (all tools will use this):',
        default: process.cwd(),
        when: (answers: Record<string, boolean | string>) => Boolean(answers.useUnifiedConfig),
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'Project root directory is required';
          }
          return true;
        }
      },
      {
        type: 'list',
        name: 'VIBE_USE_PROJECT_ROOT_AUTO_DETECTION',
        message: '🔍 Enable auto-detection for CLI users?',
        choices: [
          { name: 'Yes (recommended) - CLI auto-detects project root', value: 'true' },
          { name: 'No - Always use configured path', value: 'false' }
        ],
        default: 'true',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.useUnifiedConfig)
      },
      {
        type: 'confirm',
        name: 'configureDirs',
        message: '📁 Would you like to configure legacy directories? (Advanced)',
        default: false,
        when: (answers: Record<string, boolean | string>) => !answers.useUnifiedConfig
      },
      {
        type: 'input',
        name: 'VIBE_CODER_OUTPUT_DIR',
        message: '📂 Output directory for generated files:',
        default: './VibeCoderOutput',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureDirs)
      },
      {
        type: 'input',
        name: 'CODE_MAP_ALLOWED_DIR',
        message: '🗺️ Directory for code analysis (code mapping):',
        default: '.',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureDirs)
      },
      {
        type: 'input',
        name: 'VIBE_TASK_MANAGER_READ_DIR',
        message: '📋 Directory for task manager operations:',
        default: '.',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureDirs)
      },
      {
        type: 'list',
        name: 'VIBE_TASK_MANAGER_SECURITY_MODE',
        message: '🔒 Security mode for file operations:',
        choices: [
          { name: 'Strict (recommended) - Enhanced security validation', value: 'strict' },
          { name: 'Permissive - Relaxed validation for development', value: 'permissive' }
        ],
        default: 'strict',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureDirs)
      },
      {
        type: 'confirm',
        name: 'configureAdvanced',
        message: '⚙️ Configure advanced settings?',
        default: false
      },
      {
        type: 'input',
        name: 'OPENROUTER_BASE_URL',
        message: '🌐 OpenRouter API base URL:',
        default: 'https://openrouter.ai/api/v1',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureAdvanced)
      },
      {
        type: 'input',
        name: 'GEMINI_MODEL',
        message: '🤖 Default Gemini model:',
        default: 'google/gemini-2.5-flash-preview-05-20',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureAdvanced)
      },
      {
        type: 'input',
        name: 'PERPLEXITY_MODEL',
        message: '🔍 Default Perplexity model:',
        default: 'perplexity/sonar',
        when: (answers: Record<string, boolean | string>) => Boolean(answers.configureAdvanced)
      }
    ];

    // Controlled suppression for inquirer v12 compatibility with strict typing
    // The questions array is properly validated and all fields are type-safe
    // This is the only place where we need compatibility with inquirer's complex generic types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawAnswers = await inquirer.prompt(questions as any) as SetupAnswers;
    
    // Convert answers to final config with defaults
    const config: SetupConfig = {
      OPENROUTER_API_KEY: rawAnswers.OPENROUTER_API_KEY,
      VIBE_CODER_OUTPUT_DIR: rawAnswers.VIBE_CODER_OUTPUT_DIR || './VibeCoderOutput',
      CODE_MAP_ALLOWED_DIR: rawAnswers.CODE_MAP_ALLOWED_DIR || '.',
      VIBE_TASK_MANAGER_READ_DIR: rawAnswers.VIBE_TASK_MANAGER_READ_DIR || '.',
      VIBE_TASK_MANAGER_SECURITY_MODE: rawAnswers.VIBE_TASK_MANAGER_SECURITY_MODE || 'strict',
      OPENROUTER_BASE_URL: rawAnswers.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
      GEMINI_MODEL: rawAnswers.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20',
      PERPLEXITY_MODEL: rawAnswers.PERPLEXITY_MODEL || 'perplexity/sonar',
      // Unified configuration
      useUnifiedConfig: rawAnswers.useUnifiedConfig,
      VIBE_PROJECT_ROOT: rawAnswers.VIBE_PROJECT_ROOT,
      VIBE_USE_PROJECT_ROOT_AUTO_DETECTION: rawAnswers.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION,
      configureDirs: rawAnswers.configureDirs,
      configureAdvanced: rawAnswers.configureAdvanced
    };
    
    return config;
  }

  /**
   * Create .env file from configuration
   */
  private async createEnvFile(config: SetupConfig): Promise<void> {
    let envContent = '# Vibe Coder MCP Configuration\n';
    envContent += '# Generated by setup wizard\n\n';
    
    // Required configuration
    envContent += '# Required: Your OpenRouter API key\n';
    envContent += `OPENROUTER_API_KEY="${config.OPENROUTER_API_KEY}"\n\n`;
    
    // Unified Configuration (if selected)
    if (config.useUnifiedConfig && config.VIBE_PROJECT_ROOT) {
      envContent += '# Unified Project Root Configuration (Recommended)\n';
      envContent += `VIBE_PROJECT_ROOT="${config.VIBE_PROJECT_ROOT}"\n`;
      if (config.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION) {
        envContent += `VIBE_USE_PROJECT_ROOT_AUTO_DETECTION="${config.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION}"\n`;
      }
      envContent += '\n';
    }
    
    // Directory Configuration
    envContent += '# Directory Configuration\n';
    envContent += `VIBE_CODER_OUTPUT_DIR="${config.VIBE_CODER_OUTPUT_DIR}"\n`;
    
    // Legacy configuration (only if unified not used)
    if (!config.useUnifiedConfig || config.configureDirs) {
      envContent += '\n# Legacy Directory Configuration (Fallbacks)\n';
      envContent += `CODE_MAP_ALLOWED_DIR="${config.CODE_MAP_ALLOWED_DIR}"\n`;
      envContent += `VIBE_TASK_MANAGER_READ_DIR="${config.VIBE_TASK_MANAGER_READ_DIR}"\n`;
      envContent += `VIBE_TASK_MANAGER_SECURITY_MODE="${config.VIBE_TASK_MANAGER_SECURITY_MODE}"\n`;
    }
    envContent += '\n';
    
    // Advanced configuration
    envContent += '# Advanced Configuration\n';
    envContent += `OPENROUTER_BASE_URL="${config.OPENROUTER_BASE_URL}"\n`;
    envContent += `GEMINI_MODEL="${config.GEMINI_MODEL}"\n`;
    envContent += `PERPLEXITY_MODEL="${config.PERPLEXITY_MODEL}"\n`;
    
    await fs.writeFile(this.envPath, envContent, 'utf-8');
  }

  /**
   * Save configuration to JSON file for future reference
   */
  private async saveConfigJson(config: SetupConfig): Promise<void> {
    const configData = {
      version: '1.0.0',
      setupDate: new Date().toISOString(),
      unified: {
        enabled: config.useUnifiedConfig || false,
        projectRoot: config.VIBE_PROJECT_ROOT,
        autoDetection: config.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION
      },
      directories: {
        output: config.VIBE_CODER_OUTPUT_DIR,
        codeMap: config.CODE_MAP_ALLOWED_DIR,
        taskManager: config.VIBE_TASK_MANAGER_READ_DIR
      },
      security: {
        mode: config.VIBE_TASK_MANAGER_SECURITY_MODE
      },
      models: {
        gemini: config.GEMINI_MODEL,
        perplexity: config.PERPLEXITY_MODEL
      },
      api: {
        baseUrl: config.OPENROUTER_BASE_URL
      }
    };
    
    await fs.writeJson(this.configPath, configData, { spaces: 2 });
  }

  /**
   * Test API key with visual feedback
   */
  private async testApiKey(apiKey: string): Promise<boolean> {
    const spinner = ora('Validating API key...').start();
    
    try {
      const isValid = await this.testApiKeyLive(apiKey);
      
      if (isValid) {
        spinner.succeed('API key validated successfully!');
        return true;
      } else {
        spinner.fail('Invalid API key');
        return false;
      }
    } catch (error) {
      spinner.fail('API key validation failed');
      logger.error({ err: error }, 'API key validation error');
      return false;
    }
  }

  /**
   * Display next steps and install globally
   */
  private async displayNextSteps(): Promise<void> {
    console.log('\n' + boxen(
      chalk.green.bold('✅ Setup Complete!') + '\n\n' +
      chalk.white('Your Vibe is now configured and ready to use!') + '\n\n' +
      chalk.cyan('Quick Commands:') + '\n' +
      chalk.gray('• ') + chalk.cyan('vibe') + chalk.gray(' - Start MCP server') + '\n' +
      chalk.gray('• ') + chalk.cyan('vibe "request"') + chalk.gray(' - Process natural language') + '\n' +
      chalk.gray('• ') + chalk.cyan('vibe --help') + chalk.gray(' - Show all options') + '\n\n' +
      chalk.yellow('💡 Pro Tip: ') + chalk.gray('Use ') + chalk.cyan('vibe') + chalk.gray(' for everything!'),
      {
        padding: 1,
        margin: 1,
        borderStyle: 'double',
        borderColor: 'green',
        textAlignment: 'left'
      }
    ));

    // Suggest global installation for easier access
    try {
      const spinner = ora('Checking installation options...').start();
      
      // Check if we're running from npx vs global install
      const isNpxRun = process.env.npm_execpath && process.env.npm_execpath.includes('npx');
      
      if (isNpxRun) {
        spinner.info('For easier access, consider installing globally:');
        console.log(chalk.cyan('  npm install -g vibe-coder-mcp\n'));
        console.log(chalk.gray('After global install, just use ') + chalk.cyan('vibe') + chalk.gray(' from anywhere!'));
      } else {
        spinner.succeed('You can now use the vibe command from anywhere!');
      }
    } catch {
      // Silently continue if installation check fails
    }
  }

  /**
   * Handle non-interactive setup for CI/CD environments
   */
  private async runNonInteractiveSetup(): Promise<boolean> {
    const hasApiKey = !!process.env.OPENROUTER_API_KEY;
    
    if (!hasApiKey) {
      console.error(`
ERROR: Non-interactive setup requires OPENROUTER_API_KEY

To run in non-interactive mode (CI/CD environments), set:
  export OPENROUTER_API_KEY=your_api_key

Or run interactively with a TTY terminal.
`);
      return false;
    }
    
    try {
      // Ensure user config directory exists
      await this.userConfigManager.ensureUserConfigDir();
      
      // Generate config from environment
      const config: SetupConfig = {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
        VIBE_CODER_OUTPUT_DIR: process.env.VIBE_CODER_OUTPUT_DIR || './VibeCoderOutput',
        CODE_MAP_ALLOWED_DIR: process.env.CODE_MAP_ALLOWED_DIR || '.',
        VIBE_TASK_MANAGER_READ_DIR: process.env.VIBE_TASK_MANAGER_READ_DIR || '.',
        VIBE_TASK_MANAGER_SECURITY_MODE: (process.env.VIBE_TASK_MANAGER_SECURITY_MODE as 'strict' | 'permissive') || 'strict',
        OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
        GEMINI_MODEL: process.env.GEMINI_MODEL || 'google/gemini-2.5-flash-preview-05-20',
        PERPLEXITY_MODEL: process.env.PERPLEXITY_MODEL || 'perplexity/sonar',
        configureDirs: false,
        configureAdvanced: false
      };
      
      // Save configuration
      await this.saveEnhancedConfiguration(config);
      
      logger.info('Auto-setup completed successfully');
      return true;
      
    } catch (error) {
      logger.error({ err: error }, 'Auto-setup failed');
      return false;
    }
  }

  /**
   * Save configuration with UserConfigManager integration
   */
  private async saveEnhancedConfiguration(config: SetupConfig): Promise<void> {
    // Ensure user config directory exists
    await this.userConfigManager.ensureUserConfigDir();
    
    // Save to multiple locations for compatibility
    const locations = [
      // 1. User config directory (primary)
      {
        dir: path.join(this.userConfigManager.getUserConfigDir(), 'configs'),
        priority: 1
      },
      // 2. Project directory (backward compatibility)
      {
        dir: projectRoot,
        priority: 2
      }
    ];
    
    for (const location of locations) {
      try {
        // Create .env file
        await this.createEnvFile(config);
        
        // Copy template files if they don't exist
        await this.userConfigManager.copyDefaultConfigs();
        
      } catch (error) {
        logger.warn({ err: error, location }, 'Failed to save config to location');
      }
    }
  }

  /**
   * Run the setup wizard
   */
  async run(): Promise<boolean> {
    try {
      // Check for non-interactive environment
      if (!this.isInteractive) {
        console.log(chalk.yellow('Non-interactive environment detected.'));
        console.log(chalk.gray('Attempting auto-setup from environment variables...'));
        return await this.runNonInteractiveSetup();
      }
      
      this.displayWelcome();
      
      // Check if reconfiguration is requested
      if (process.argv.includes('--reconfigure') || process.argv.includes('--setup')) {
        console.log(chalk.yellow('🔄 Reconfiguring Vibe Coder MCP...\n'));
      } else if (!(await this.isFirstRun())) {
        // Not first run and not reconfiguring
        return true;
      }
      
      // Get configuration from user
      const config = await this.promptConfiguration();
      
      // Test API key
      const isValid = await this.testApiKey(config.OPENROUTER_API_KEY);
      if (!isValid) {
        const { continueAnyway } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueAnyway',
            message: 'API key validation failed. Continue anyway?',
            default: false
          }
        ]);
        
        if (!continueAnyway) {
          console.log(chalk.red('\n❌ Setup cancelled.'));
          return false;
        }
      }
      
      // Create .env file
      const spinner = ora('Creating configuration files...').start();
      await this.saveEnhancedConfiguration(config);
      spinner.succeed('Configuration files created!');
      
      // Display success message
      await this.displayNextSteps();
      
      // Reload environment variables
      const dotenv = await import('dotenv');
      dotenv.config({ path: this.envPath });
      
      return true;
      
    } catch (error) {
      console.error(chalk.red('\n❌ Setup failed:'), error);
      logger.error({ err: error }, 'Setup wizard error');
      return false;
    }
  }

  /**
   * Quick check if setup is needed
   */
  async quickCheck(): Promise<void> {
    if (await this.isFirstRun()) {
      console.log(chalk.yellow('\n⚠️ First-time setup required.'));
      console.log(chalk.gray('Run with --setup to configure Vibe Coder MCP.\n'));
      process.exit(1);
    }
    
    if (!(await this.isConfigValid())) {
      console.log(chalk.yellow('\n⚠️ Configuration is incomplete.'));
      console.log(chalk.gray('Run with --reconfigure to update settings.\n'));
    }
  }
}

// Export singleton instance
export const setupWizard = new SetupWizard();

// If run directly, execute the wizard
if (import.meta.url === `file://${process.argv[1]}`) {
  setupWizard.run().then(success => {
    process.exit(success ? 0 : 1);
  });
}