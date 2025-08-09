# 🎯 Configuration & Onboarding Resolution Plan

## Overview
Create a seamless first-time user experience while maintaining existing configuration patterns and enabling config persistence across versions.

## Core Principles Validation
✅ **DRY (Don't Repeat Yourself)**: All configuration logic centralized in OpenRouterConfigManager
✅ **Central Configuration**: Single source of truth via UnifiedSecurityConfigManager
✅ **Security**: Maintains existing security boundaries, no relaxation of permissions
✅ **Transport Compatibility**: All transports (stdio, SSE, WebSocket, HTTP) remain fully functional

---

## Phase 1: Configuration Infrastructure (Foundation)

### 🔧 Task 1.1: Create User Config Directory Service
**Priority**: Critical  
**Estimated Time**: 2 hours  
**Dependencies**: None  
**Files to Create**: `src/utils/user-config-manager.ts`

**Atomic Implementation Steps for AI Agent:**

1. **Create the TypeScript class file with proper imports:**
```typescript
// src/utils/user-config-manager.ts
import path from 'path';
import os from 'os';
import fs from 'fs-extra';
import logger from '../logger.js';
import { OpenRouterConfigManager } from './openrouter-config-manager.js';

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
}
```

2. **Implement OS-specific config directory detection (follows XDG standards):**
```typescript
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
```

3. **Implement directory structure creation:**
```typescript
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
```

4. **Implement config file operations with error handling:**
```typescript
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
```

5. **Add backup functionality with timestamps:**
```typescript
async backupExistingConfigs(): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(this.userConfigDir, 'backups', timestamp);
  const configDir = path.join(this.userConfigDir, 'configs');
  
  if (await fs.pathExists(configDir)) {
    await fs.copy(configDir, backupDir);
    logger.info({ backupDir }, 'Backed up existing configs');
  }
}
```

**Validation Checklist:**
- [ ] Follows singleton pattern (DRY principle)
- [ ] Integrates with OpenRouterConfigManager (Central Config)
- [ ] No security boundary changes (Security)
- [ ] Platform-agnostic implementation (Transport Compatibility)
- [ ] Proper error handling and logging
- [ ] TypeScript strict typing

### 🔧 Task 1.2: Create Config Template System
**Priority**: Critical  
**Estimated Time**: 1 hour  
**Dependencies**: None  
**Files to Create**: 
- `src/config-templates/.env.template`
- `src/config-templates/llm_config.template.json`
- `src/config-templates/mcp-config.template.json`

**Atomic Implementation Steps for AI Agent:**

1. **Create .env.template with comprehensive comments:**
```bash
# src/config-templates/.env.template
# ================================================
# Vibe Coder MCP Configuration Template
# ================================================

# REQUIRED: OpenRouter API Configuration
# Get your API key at: https://openrouter.ai/
# This key is essential for all LLM operations
OPENROUTER_API_KEY=

# OPTIONAL: OpenRouter Base URL (defaults to https://openrouter.ai/api/v1)
# Only change if using a custom endpoint
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1

# OPTIONAL: Directory Configuration
# Where Vibe can read/analyze files (defaults to current working directory)
VIBE_TASK_MANAGER_READ_DIR=

# Where Vibe saves generated files (defaults to ./VibeCoderOutput)
VIBE_CODER_OUTPUT_DIR=

# OPTIONAL: Security Configuration
# Security Mode: strict (recommended) or permissive
# strict = only access explicitly allowed directories
# permissive = wider access with warnings
VIBE_TASK_MANAGER_SECURITY_MODE=strict

# OPTIONAL: Code Map Tool Configuration
# Directory that code-map-generator can scan
CODE_MAP_ALLOWED_DIR=

# OPTIONAL: Model Configuration
# Default models for different operations
GEMINI_MODEL=google/gemini-2.5-flash-preview-05-20
PERPLEXITY_MODEL=perplexity/sonar

# OPTIONAL: Transport Configuration (for advanced users)
# SSE_PORT=3000
# MCP_TRANSPORT=stdio
```

2. **Create llm_config.template.json with all mappings:**
```json
// src/config-templates/llm_config.template.json
{
  "llm_mapping": {
    // Core mappings (REQUIRED)
    "default_generation": "google/gemini-2.5-flash-preview-05-20",
    "task_decomposition": "google/gemini-2.5-flash-preview-05-20",
    "intent_recognition": "google/gemini-2.5-flash-preview-05-20",
    
    // Tool-specific mappings (RECOMMENDED)
    "research_query": "perplexity/sonar",
    "sequential_thought_generation": "google/gemini-2.5-flash-preview-05-20",
    "context_curator_intent_analysis": "google/gemini-2.5-flash-preview-05-20",
    "context_curator_relevance_ranking": "google/gemini-2.5-flash-preview-05-20",
    "agent_coordination": "google/gemini-2.5-flash-preview-05-20",
    "atomic_task_detection": "google/gemini-2.5-flash-preview-05-20",
    "task_refinement": "google/gemini-2.5-flash-preview-05-20",
    "dependency_graph_analysis": "google/gemini-2.5-flash-preview-05-20",
    
    // Advanced mappings (OPTIONAL)
    "code_generation": "google/gemini-2.5-flash-preview-05-20",
    "code_review": "google/gemini-2.5-flash-preview-05-20",
    "documentation_generation": "google/gemini-2.5-flash-preview-05-20",
    "test_generation": "google/gemini-2.5-flash-preview-05-20",
    "error_analysis": "google/gemini-2.5-flash-preview-05-20"
  }
}
```

3. **Create mcp-config.template.json with tool configurations:**
```json
// src/config-templates/mcp-config.template.json
{
  "tools": {
    "vibe-task-manager": {
      "description": "AI-native task management with RDD methodology",
      "use_cases": [
        "break down {task} into subtasks",
        "create atomic tasks for {project}",
        "decompose {epic} into manageable pieces"
      ],
      "input_patterns": [
        "task: {description}",
        "epic: {description}",
        "project: {description}"
      ],
      "enabled": true,
      "timeout": 300000
    },
    "research-manager": {
      "description": "Deep research using Perplexity Sonar",
      "use_cases": [
        "research {topic}",
        "find information about {subject}",
        "investigate {technology}"
      ],
      "input_patterns": [
        "research: {query}",
        "investigate: {topic}",
        "explore: {subject}"
      ],
      "enabled": true,
      "timeout": 120000
    },
    "code-map-generator": {
      "description": "Advanced codebase analysis and mapping",
      "use_cases": [
        "analyze {codebase}",
        "map project structure",
        "generate code documentation"
      ],
      "input_patterns": [
        "analyze: {directory}",
        "map: {project}",
        "document: {codebase}"
      ],
      "enabled": true,
      "timeout": 180000
    }
  },
  "version": "0.3.0",
  "created_at": "{{timestamp}}",
  "last_modified": "{{timestamp}}"
}
```

**Validation Checklist:**
- [ ] All templates have comprehensive comments
- [ ] Templates use existing config structure (backward compatible)
- [ ] Security defaults are strict (Security principle)
- [ ] No hardcoded paths (Transport compatibility)
- [ ] JSON templates are valid and parseable
- [ ] Version tracking included

### 🔧 Task 1.3: Create Config Validator Service
**Priority**: High  
**Estimated Time**: 2 hours  
**Dependencies**: Task 1.1, Task 1.2  
**Files to Create**: `src/utils/config-validator.ts`

**Atomic Implementation Steps for AI Agent:**

1. **Create the validator class with type definitions:**
```typescript
// src/utils/config-validator.ts
import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';
import logger from '../logger.js';
import { OpenRouterConfigManager } from './openrouter-config-manager.js';
import { UserConfigManager } from './user-config-manager.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface MissingConfig {
  file: string;
  required: boolean;
  description: string;
  defaultPath: string;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  field: string;
  message: string;
  suggestedFix?: string;
}

export class ConfigValidator {
  private static instance: ConfigValidator | null = null;
  
  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }
}
```

2. **Implement environment validation with Zod schemas:**
```typescript
private readonly envSchema = z.object({
  OPENROUTER_API_KEY: z.string().min(1, 'API key is required'),
  OPENROUTER_BASE_URL: z.string().url().optional().default('https://openrouter.ai/api/v1'),
  VIBE_TASK_MANAGER_READ_DIR: z.string().optional(),
  VIBE_CODER_OUTPUT_DIR: z.string().optional(),
  VIBE_TASK_MANAGER_SECURITY_MODE: z.enum(['strict', 'permissive']).optional().default('strict'),
  CODE_MAP_ALLOWED_DIR: z.string().optional(),
  GEMINI_MODEL: z.string().optional().default('google/gemini-2.5-flash-preview-05-20'),
  PERPLEXITY_MODEL: z.string().optional().default('perplexity/sonar')
});

async validateEnvFile(envPath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };
  
  try {
    // Read and parse .env file
    const envContent = await fs.readFile(envPath, 'utf-8');
    const envVars: Record<string, string> = {};
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
    
    // Validate with schema
    const parseResult = this.envSchema.safeParse(envVars);
    
    if (!parseResult.success) {
      result.valid = false;
      parseResult.error.errors.forEach(err => {
        result.errors.push(`${err.path.join('.')}: ${err.message}`);
        
        // Add suggestions
        if (err.path[0] === 'OPENROUTER_API_KEY') {
          result.suggestions.push('Get your API key at https://openrouter.ai/');
        }
      });
    }
    
    // Add warnings for optional fields
    if (!envVars.VIBE_CODER_OUTPUT_DIR) {
      result.warnings.push('VIBE_CODER_OUTPUT_DIR not set, using ./VibeCoderOutput');
    }
    
  } catch (error) {
    result.valid = false;
    result.errors.push(`Failed to read env file: ${error}`);
  }
  
  return result;
}
```

3. **Implement LLM config validation:**
```typescript
private readonly llmConfigSchema = z.object({
  llm_mapping: z.record(z.string()).refine(
    (mapping) => mapping['default_generation'] !== undefined,
    { message: 'default_generation mapping is required' }
  )
});

async validateLLMConfig(config: unknown): Promise<ValidationResult> {
  const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    suggestions: []
  };
  
  const parseResult = this.llmConfigSchema.safeParse(config);
  
  if (!parseResult.success) {
    result.valid = false;
    parseResult.error.errors.forEach(err => {
      result.errors.push(err.message);
    });
    result.suggestions.push('Ensure llm_config.json has a default_generation mapping');
  } else {
    // Check for recommended mappings
    const recommended = [
      'task_decomposition',
      'intent_recognition',
      'research_query'
    ];
    
    const mappings = parseResult.data.llm_mapping;
    recommended.forEach(key => {
      if (!mappings[key]) {
        result.warnings.push(`Missing recommended mapping: ${key}`);
        result.suggestions.push(`Add ${key} mapping for better performance`);
      }
    });
  }
  
  return result;
}
```

4. **Implement missing config detection:**
```typescript
async detectMissingConfigs(): Promise<MissingConfig[]> {
  const userConfigManager = UserConfigManager.getInstance();
  const missing: MissingConfig[] = [];
  
  const requiredConfigs = [
    {
      file: '.env',
      required: true,
      description: 'Environment variables including API key',
      defaultPath: path.join(process.cwd(), '.env')
    },
    {
      file: 'llm_config.json',
      required: true,
      description: 'LLM model mappings for different operations',
      defaultPath: path.join(process.cwd(), 'llm_config.json')
    },
    {
      file: 'mcp-config.json',
      required: false,
      description: 'MCP tool configurations',
      defaultPath: path.join(process.cwd(), 'mcp-config.json')
    }
  ];
  
  for (const config of requiredConfigs) {
    const exists = await fs.pathExists(config.defaultPath);
    if (!exists) {
      missing.push(config);
    }
  }
  
  return missing;
}
```

5. **Implement fix suggestions:**
```typescript
suggestFixes(issues: ValidationIssue[]): string[] {
  const fixes: string[] = [];
  
  issues.forEach(issue => {
    if (issue.suggestedFix) {
      fixes.push(issue.suggestedFix);
    } else {
      // Generate fix based on issue type
      switch (issue.field) {
        case 'OPENROUTER_API_KEY':
          fixes.push('1. Visit https://openrouter.ai/ to get an API key');
          fixes.push('2. Add OPENROUTER_API_KEY=your_key to .env file');
          break;
        case 'llm_mapping.default_generation':
          fixes.push('Add "default_generation": "google/gemini-2.5-flash-preview-05-20" to llm_config.json');
          break;
        default:
          fixes.push(`Check ${issue.field} configuration`);
      }
    }
  });
  
  return [...new Set(fixes)]; // Remove duplicates
}
```

**Validation Checklist:**
- [ ] Uses Zod for type-safe validation
- [ ] Integrates with UserConfigManager and OpenRouterConfigManager
- [ ] Provides actionable error messages and suggestions
- [ ] Validates all config files comprehensively
- [ ] Follows singleton pattern (DRY)
- [ ] No security boundary violations

---

## Phase 2: Setup Wizard Implementation

### 🔧 Task 2.1: Create Interactive Setup Wizard
**Priority**: Critical  
**Estimated Time**: 3 hours  
**Dependencies**: Tasks 1.1, 1.2, 1.3  
**Files to Create**: 
- `src/setup/setup-wizard.ts`
- `src/setup/prompts.ts`

**Atomic Implementation Steps for AI Agent:**

1. **Create prompts module with all UI elements:**
```typescript
// src/setup/prompts.ts
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';

export const ASCII_ART = `
██╗   ██╗██╗██████╗ ███████╗
██║   ██║██║██╔══██╗██╔════╝
██║   ██║██║██████╔╝█████╗  
╚██╗ ██╔╝██║██╔══██╗██╔══╝  
 ╚████╔╝ ██║██████╔╝███████╗
  ╚═══╝  ╚═╝╚═════╝ ╚══════╝
     Coder MCP v0.3.0
`;

export const WELCOME_MESSAGE = `
Welcome to Vibe Coder MCP! 🎆

This setup wizard will help you configure:
• OpenRouter API for AI-powered development
• Security boundaries for file access
• Output directories for generated content

Let's get started! This will only take a minute.
`;

export async function promptAPIKey(): Promise<string> {
  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenRouter API key:',
      mask: '*',
      validate: (input: string) => {
        if (!input || input.trim().length === 0) {
          return 'API key is required';
        }
        if (!input.startsWith('sk-or-')) {
          return 'Invalid API key format (should start with sk-or-)';
        }
        return true;
      }
    }
  ]);
  return apiKey;
}

export async function promptDirectories(defaults: any): Promise<any> {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'readDir',
      message: 'Directory for reading/analyzing files:',
      default: defaults.readDir,
      validate: (input: string) => {
        if (!input) return 'Read directory is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'outputDir',
      message: 'Directory for saving generated files:',
      default: defaults.outputDir
    },
    {
      type: 'list',
      name: 'securityMode',
      message: 'Security mode:',
      choices: [
        { name: 'Strict (Recommended) - Only access specified directories', value: 'strict' },
        { name: 'Permissive - Wider access with warnings', value: 'permissive' }
      ],
      default: 'strict'
    }
  ]);
}
```

2. **Create main setup wizard class:**
```typescript
// src/setup/setup-wizard.ts
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import chalk from 'chalk';
import ora from 'ora';
import { UserConfigManager } from '../utils/user-config-manager.js';
import { ConfigValidator } from '../utils/config-validator.js';
import { OpenRouterConfigManager } from '../utils/openrouter-config-manager.js';
import logger from '../logger.js';
import * as prompts from './prompts.js';

export interface SetupResult {
  success: boolean;
  configPath: string;
  error?: string;
}

export interface DirectoryConfig {
  readDir: string;
  outputDir: string;
  securityMode: 'strict' | 'permissive';
}

export class SetupWizard {
  private userConfigManager: UserConfigManager;
  private configValidator: ConfigValidator;
  private isInteractive: boolean;
  
  constructor() {
    this.userConfigManager = UserConfigManager.getInstance();
    this.configValidator = ConfigValidator.getInstance();
    this.isInteractive = process.stdin.isTTY && !process.env.CI;
  }
  
  async detectFirstRun(): Promise<boolean> {
    // Check multiple conditions
    const checks = [
      // 1. Check for API key in environment
      !process.env.OPENROUTER_API_KEY,
      
      // 2. Check for .env file in project
      !await fs.pathExists(path.join(process.cwd(), '.env')),
      
      // 3. Check for llm_config.json
      !await fs.pathExists(path.join(process.cwd(), 'llm_config.json')),
      
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
  
  async runInteractiveSetup(): Promise<SetupResult> {
    try {
      // Check if we can run interactively
      if (!this.isInteractive) {
        return this.runNonInteractiveSetup();
      }
      
      // Clear console and show welcome
      console.clear();
      console.log(chalk.cyan(prompts.ASCII_ART));
      console.log(prompts.WELCOME_MESSAGE);
      
      // Step 1: Get API key
      console.log(chalk.yellow('\nStep 1: API Configuration'));
      const apiKey = await prompts.promptAPIKey();
      
      // Step 2: Validate API key
      const spinner = ora('Validating API key...').start();
      const isValid = await this.validateAPIKey(apiKey);
      
      if (!isValid) {
        spinner.fail('Invalid API key');
        return {
          success: false,
          configPath: '',
          error: 'API key validation failed'
        };
      }
      spinner.succeed('API key validated');
      
      // Step 3: Configure directories
      console.log(chalk.yellow('\nStep 2: Directory Configuration'));
      const defaults = {
        readDir: process.cwd(),
        outputDir: path.join(process.cwd(), 'VibeCoderOutput')
      };
      const dirConfig = await prompts.promptDirectories(defaults);
      
      // Step 4: Save configuration
      spinner.text = 'Saving configuration...';
      spinner.start();
      
      const config = {
        apiKey,
        ...dirConfig,
        baseUrl: 'https://openrouter.ai/api/v1',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/sonar'
      };
      
      const savedPath = await this.saveConfiguration(config);
      spinner.succeed('Configuration saved');
      
      // Step 5: Success message
      console.log(chalk.green('\n✓ Setup complete!'));
      console.log(chalk.gray(`Configuration saved to: ${savedPath}`));
      console.log(chalk.cyan('\nYou can now use Vibe Coder MCP! Try:'));
      console.log(chalk.white('  npx vibe'));
      console.log(chalk.white('  npx vibe "Research modern React patterns"'));
      
      return {
        success: true,
        configPath: savedPath
      };
      
    } catch (error) {
      logger.error({ err: error }, 'Setup wizard failed');
      return {
        success: false,
        configPath: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  async validateAPIKey(apiKey: string): Promise<boolean> {
    try {
      // Make a test request to OpenRouter
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
  
  async saveConfiguration(config: any): Promise<string> {
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
        dir: process.cwd(),
        priority: 2
      }
    ];
    
    let savedPath = '';
    
    for (const location of locations) {
      try {
        // Save .env file
        const envPath = path.join(location.dir, '.env');
        const envContent = `
# Generated by Vibe Coder Setup Wizard
OPENROUTER_API_KEY=${config.apiKey}
OPENROUTER_BASE_URL=${config.baseUrl}
VIBE_TASK_MANAGER_READ_DIR=${config.readDir}
VIBE_CODER_OUTPUT_DIR=${config.outputDir}
VIBE_TASK_MANAGER_SECURITY_MODE=${config.securityMode}
GEMINI_MODEL=${config.geminiModel}
PERPLEXITY_MODEL=${config.perplexityModel}
`;
        await fs.writeFile(envPath, envContent.trim());
        
        // Copy template files if they don't exist
        await this.userConfigManager.copyDefaultConfigs();
        
        if (location.priority === 1) {
          savedPath = location.dir;
        }
        
      } catch (error) {
        logger.warn({ err: error, location }, 'Failed to save config to location');
      }
    }
    
    return savedPath;
  }
  
  private async runNonInteractiveSetup(): Promise<SetupResult> {
    // Delegate to AutoSetup for non-interactive environments
    const { AutoSetup } = await import('./auto-setup.js');
    const autoSetup = new AutoSetup();
    
    if (!autoSetup.validateMinimalConfig()) {
      return {
        success: false,
        configPath: '',
        error: 'Missing required environment variables for non-interactive setup'
      };
    }
    
    await autoSetup.setupFromEnvironment();
    return {
      success: true,
      configPath: process.cwd()
    };
  }
}
```

**Validation Checklist:**
- [ ] Detects first-run accurately across all scenarios
- [ ] Handles non-interactive environments (CI/CD)
- [ ] Validates API key before saving
- [ ] Creates all necessary config files
- [ ] Provides clear user feedback
- [ ] Saves to both user and project directories
- [ ] Works with all transport types

---

## Success Criteria

### ✅ First-Time User Experience
- [ ] User can run `npx vibe` without prior setup
- [ ] Clear, guided setup process
- [ ] Meaningful error messages
- [ ] Quick start in < 2 minutes

### ✅ Configuration Persistence
- [ ] Configs survive package updates
- [ ] User settings in ~/.vibe directory
- [ ] Automatic backup before changes
- [ ] Version migration support

### ✅ Backward Compatibility
- [ ] Existing setups continue working
- [ ] Project configs still supported
- [ ] Environment variables take precedence
- [ ] No breaking changes

### ✅ Developer Experience
- [ ] Easy config management commands
- [ ] Clear config status visibility
- [ ] Validation and error reporting
- [ ] Documentation and examples

---

## Implementation Validation

### Transport Compatibility Matrix

| Transport | Current State | With Setup Wizard | Breaking Changes | Notes |
|-----------|--------------|-------------------|------------------|-------|
| **stdio (MCP Studio)** | Crashes if no API key | Graceful setup via stderr | None | Wizard output to stderr won't interfere |
| **SSE** | Requires pre-config | Auto-setup on first request | None | HTTP endpoints unchanged |
| **WebSocket** | Agent communication | Unaffected | None | Uses config after setup |
| **HTTP** | Agent API | Unaffected | None | Uses config after setup |
| **CLI Interactive** | Broken for new users | Fixed with wizard | None | Major UX improvement |

### Edge Cases Handled

1. **Non-Interactive Environments**: Detect CI/CD and fail fast with clear errors
2. **Docker Containers**: Support env-only configuration
3. **Read-only Filesystems**: Fall back to environment variables
4. **Permission Issues**: Graceful fallback to project directory
5. **Multiple Instances**: Each can have different configs

### Security Validation

- ✅ No relaxation of existing security boundaries
- ✅ User config directory follows OS standards
- ✅ API keys never logged or exposed
- ✅ Strict mode remains default
- ✅ All file operations validated

This plan ensures a seamless onboarding experience while maintaining all core principles and full compatibility across all transport systems and deployment scenarios.