/**
 * Strict type definitions for CLI system
 * NO any, unknown, or undefined types allowed
 */

import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * CLI configuration options with strict typing
 */
export interface CLIConfig {
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly outputFormat: 'text' | 'json' | 'yaml';
  readonly color: boolean;
}

/**
 * CLI execution context with strict typing
 */
export interface CLIContext {
  readonly sessionId: string;
  readonly startTime: number;
  readonly config: CLIConfig;
}

/**
 * CLI result wrapper with strict typing
 */
export interface CLIResult {
  readonly success: boolean;
  readonly message: string;
  readonly data?: CallToolResult;
}

/**
 * CLI error with strict typing
 */
export interface CLIError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, string>;
}

/**
 * Type guard for CLIError
 */
export function isCLIError(error: Error): error is CLIError & Error {
  return 'code' in error && typeof (error as CLIError).code === 'string';
}

/**
 * Validation function for CLIConfig
 */
export function validateCLIConfig(config: Record<string, unknown>): CLIConfig {
  return {
    verbose: typeof config.verbose === 'boolean' ? config.verbose : false,
    quiet: typeof config.quiet === 'boolean' ? config.quiet : false,
    outputFormat: 
      config.outputFormat === 'json' || config.outputFormat === 'yaml' 
        ? config.outputFormat 
        : 'text',
    color: typeof config.color === 'boolean' ? config.color : true
  };
}