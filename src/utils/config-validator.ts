import { z } from 'zod';
import fs from 'fs-extra';
import path from 'path';

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

  private readonly llmConfigSchema = z.object({
    llm_mapping: z.record(z.string()).refine(
      (mapping) => mapping['default_generation'] !== undefined,
      { message: 'default_generation mapping is required' }
    )
  });
  
  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }

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

  async detectMissingConfigs(): Promise<MissingConfig[]> {
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
}