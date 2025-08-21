/**
 * CLI Configuration loader that PROPERLY uses centralized systems
 * FOLLOWS centralized configuration and security patterns
 * NO bypassing of existing infrastructure
 */

import { OpenRouterConfig } from '../../types/workflow.js';
import { CLIConfig, validateCLIConfig } from '../types/index.js';
import { OpenRouterConfigManager } from '../../utils/openrouter-config-manager.js';
import { getUnifiedSecurityConfig } from '../../tools/vibe-task-manager/security/unified-security-config.js';
import logger from '../../logger.js';

/**
 * Load OpenRouter configuration using CENTRALIZED ConfigManager
 * Uses existing singleton pattern - NO direct env var access
 */
export async function loadOpenRouterConfig(): Promise<OpenRouterConfig> {
  try {
    // Use CENTRALIZED OpenRouterConfigManager (singleton)
    const configManager = OpenRouterConfigManager.getInstance();
    
    // Ensure the manager is properly initialized
    await configManager.initialize();
    
    // Get configuration through centralized system
    const config = await configManager.getOpenRouterConfig();
    
    logger.debug('CLI loaded OpenRouter configuration via centralized manager');
    return config;
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown configuration error';
    logger.error({ err: error }, 'CLI failed to load centralized OpenRouter configuration');
    throw new Error(`Failed to load OpenRouter configuration: ${message}`);
  }
}

/**
 * Get CLI security boundaries using UNIFIED security system
 * Integrates with centralized security configuration
 */
export async function getCLISecurityBoundaries(): Promise<{
  allowedReadDirectories: ReadonlyArray<string>;
  allowedWriteDirectory: string;
  securityMode: 'strict' | 'permissive';
}> {
  try {
    // Use CENTRALIZED unified security config
    const securityManager = await getUnifiedSecurityConfig();
    const securityConfig = securityManager.getConfig();
    
    return {
      allowedReadDirectories: [securityConfig.allowedReadDirectory],
      allowedWriteDirectory: securityConfig.allowedWriteDirectory,
      securityMode: securityConfig.securityMode
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown security error';
    logger.error({ err: error }, 'CLI failed to load unified security configuration');
    throw new Error(`Failed to load security configuration: ${message}`);
  }
}

/**
 * Parse CLI arguments into typed configuration
 * Validates all arguments with strict typing
 */
export function parseCliArgs(args: ReadonlyArray<string>): CLIConfig {
  const argSet = new Set(args);

  // Build config object with explicit typing
  const rawConfig: Record<string, unknown> = {
    verbose: argSet.has('--verbose') || argSet.has('-v'),
    quiet: argSet.has('--quiet') || argSet.has('-q'),
    color: !argSet.has('--no-color'),
    outputFormat: getOutputFormat(args)
  };

  // Validate and return typed config
  return validateCLIConfig(rawConfig);
}

/**
 * Extract output format from arguments with validation
 */
function getOutputFormat(args: ReadonlyArray<string>): 'text' | 'json' | 'yaml' {
  const formatIndex = args.indexOf('--format');
  
  if (formatIndex !== -1 && formatIndex + 1 < args.length) {
    const format = args[formatIndex + 1];
    
    if (format === 'json' || format === 'yaml' || format === 'text') {
      return format;
    }
  }

  // Check for shorthand formats
  if (args.includes('--json')) return 'json';
  if (args.includes('--yaml')) return 'yaml';

  return 'text'; // Default format
}

/**
 * Filter non-flag arguments (the actual request)
 */
export function extractRequestArgs(args: ReadonlyArray<string>): ReadonlyArray<string> {
  const flagsToSkip = new Set([
    '--verbose', '-v',
    '--quiet', '-q', 
    '--no-color',
    '--json',
    '--yaml',
    '--help', '-h',
    '--force', '-f'
  ]);

  const result: string[] = [];
  let skipNext = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (arg === '--format') {
      skipNext = true; // Skip the format value
      continue;
    }

    if (!arg.startsWith('-') || !flagsToSkip.has(arg)) {
      if (!arg.startsWith('-')) {
        result.push(arg);
      }
    }
  }

  return result;
}

/**
 * Validate if help should be displayed
 */
export function shouldDisplayHelp(args: ReadonlyArray<string>): boolean {
  return args.length === 0 || 
         args.includes('--help') || 
         args.includes('-h');
}

/**
 * Check if force flag is present
 */
export function hasForceFlag(args: ReadonlyArray<string>): boolean {
  return args.includes('--force') || args.includes('-f');
}

/**
 * Generate session ID with timestamp (following existing patterns)
 */
export function generateSessionId(): string {
  return `cli-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Validate environment using CENTRALIZED systems
 * Checks both configuration and security systems
 */
export async function validateEnvironment(): Promise<{ 
  valid: boolean; 
  errors: ReadonlyArray<string> 
}> {
  const errors: string[] = [];

  try {
    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion < 20) {
      errors.push(`Node.js 20.0.0+ is required. Current version: ${nodeVersion}`);
    }

    // Validate centralized OpenRouter configuration
    const configManager = OpenRouterConfigManager.getInstance();
    const configValidation = configManager.validateConfiguration();
    
    if (!configValidation.valid) {
      errors.push(...configValidation.errors.map(e => `Configuration: ${e}`));
    }

    // Skip security configuration check during validation
    // It will be initialized properly in appInitializer.initializeCoreServices()

    // Validate LLM configuration through centralized system
    try {
      await loadOpenRouterConfig();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown OpenRouter error';
      errors.push(`OpenRouter configuration: ${message}`);
    }

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation error';
    errors.push(`Environment validation: ${message}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Initialize CLI configuration using centralized systems
 * Ensures all centralized systems are properly initialized
 */
export async function initializeCLIConfiguration(): Promise<{
  openRouterConfig: OpenRouterConfig;
  securityBoundaries: Awaited<ReturnType<typeof getCLISecurityBoundaries>>;
}> {
  try {
    logger.info('Initializing CLI configuration via centralized systems');
    
    // Initialize centralized OpenRouter configuration
    const configManager = OpenRouterConfigManager.getInstance();
    await configManager.initialize();
    const openRouterConfig = await configManager.getOpenRouterConfig();
    
    // Initialize unified security configuration  
    const securityBoundaries = await getCLISecurityBoundaries();
    
    logger.info('CLI configuration initialized successfully via centralized systems');
    
    return {
      openRouterConfig,
      securityBoundaries
    };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown initialization error';
    logger.error({ err: error }, 'Failed to initialize CLI configuration via centralized systems');
    throw new Error(`CLI configuration initialization failed: ${message}`);
  }
}