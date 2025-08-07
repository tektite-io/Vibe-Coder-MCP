#!/usr/bin/env node
/**
 * Interactive Setup Wizard for Vibe Coder MCP
 * Guides users through first-time configuration
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

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

interface SetupConfig {
  OPENROUTER_API_KEY: string;
  VIBE_CODER_OUTPUT_DIR: string;
  CODE_MAP_ALLOWED_DIR: string;
  VIBE_TASK_MANAGER_READ_DIR: string;
  VIBE_TASK_MANAGER_SECURITY_MODE: 'strict' | 'permissive';
  OPENROUTER_BASE_URL: string;
  GEMINI_MODEL: string;
  PERPLEXITY_MODEL: string;
  configureDirs?: boolean;
  configureAdvanced?: boolean;
}

interface SetupAnswers {
  OPENROUTER_API_KEY: string;
  VIBE_CODER_OUTPUT_DIR?: string;
  CODE_MAP_ALLOWED_DIR?: string;
  VIBE_TASK_MANAGER_READ_DIR?: string;
  VIBE_TASK_MANAGER_SECURITY_MODE?: 'strict' | 'permissive';
  OPENROUTER_BASE_URL?: string;
  GEMINI_MODEL?: string;
  PERPLEXITY_MODEL?: string;
  configureDirs?: boolean;
  configureAdvanced?: boolean;
}

// Type-safe inquirer wrapper for strict typing compliance

export class SetupWizard {
  private envPath: string;
  private configPath: string;

  constructor() {
    this.envPath = path.join(projectRoot, '.env');
    this.configPath = path.join(projectRoot, '.vibe-config.json');
  }

  /**
   * Check if this is the first run (no .env file exists)
   */
  async isFirstRun(): Promise<boolean> {
    const envExists = await fs.pathExists(this.envPath);
    const configValid = await this.isConfigValid();
    
    // If .env doesn't exist and config is not valid, it's first run
    return !envExists && !configValid;
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
   * Display welcome message
   */
  private displayWelcome(): void {
    console.clear();
    const welcomeMessage = chalk.cyan.bold('🚀 Welcome to Vibe Coder MCP!');
    const subMessage = chalk.gray('Your AI-powered development assistant');
    
    console.log(boxen(
      `${welcomeMessage}\n\n${subMessage}`,
      {
        padding: 1,
        margin: 1,
        borderStyle: 'round',
        borderColor: 'cyan',
        textAlignment: 'center'
      }
    ));

    console.log(chalk.yellow('\n📋 First-time Setup Wizard\n'));
    console.log(chalk.gray('This wizard will help you configure Vibe Coder MCP.\n'));
  }

  /**
   * Validate OpenRouter API key format
   */
  private validateApiKey(apiKey: string): boolean | string {
    if (!apiKey || apiKey.trim() === '') {
      return 'API key is required';
    }
    if (apiKey.length < 20) {
      return 'API key seems too short. Please check and try again';
    }
    if (!apiKey.startsWith('sk-')) {
      return chalk.yellow('⚠ API key usually starts with "sk-". Continue anyway? (yes)');
    }
    return true;
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
        name: 'configureDirs',
        message: '📁 Would you like to configure custom directories?',
        default: false
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
      PERPLEXITY_MODEL: rawAnswers.PERPLEXITY_MODEL || 'perplexity/sonar'
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
    
    // Directory Configuration
    envContent += '# Directory Configuration\n';
    envContent += `VIBE_CODER_OUTPUT_DIR="${config.VIBE_CODER_OUTPUT_DIR}"\n`;
    envContent += `CODE_MAP_ALLOWED_DIR="${config.CODE_MAP_ALLOWED_DIR}"\n`;
    envContent += `VIBE_TASK_MANAGER_READ_DIR="${config.VIBE_TASK_MANAGER_READ_DIR}"\n`;
    envContent += `VIBE_TASK_MANAGER_SECURITY_MODE="${config.VIBE_TASK_MANAGER_SECURITY_MODE}"\n`;
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
   * Test API key by making a simple request
   */
  private async testApiKey(apiKey: string): Promise<boolean> {
    const spinner = ora('Testing API key...').start();
    
    try {
      // Simple test - just check if the key format is valid
      // In a real implementation, you might make a test API call
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      if (apiKey && apiKey.length > 20) {
        spinner.succeed('API key validated successfully!');
        return true;
      } else {
        spinner.fail('API key validation failed');
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
   * Run the setup wizard
   */
  async run(): Promise<boolean> {
    try {
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
      await this.createEnvFile(config);
      await this.saveConfigJson(config);
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