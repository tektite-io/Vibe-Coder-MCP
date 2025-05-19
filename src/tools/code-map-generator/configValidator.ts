/**
 * Configuration validator for the Code-Map Generator tool.
 * This file contains functions for validating and extracting configuration.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import logger from '../../logger.js';
import { CodeMapGeneratorConfig, CacheConfig, ProcessingConfig, OutputConfig, FeatureFlagsConfig } from './types.js';
import { getFeatureFlags } from './config/featureFlags.js';
import { OpenRouterConfig } from '../../types/workflow.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<CodeMapGeneratorConfig> = {
  cache: {
    enabled: true,
    maxEntries: 10000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  processing: {
    batchSize: 100,
    logMemoryUsage: false,
    maxMemoryUsage: 1024, // 1GB
  },
  output: {
    format: 'markdown',
    splitOutput: true,
  },
  featureFlags: {
    enhancedFunctionDetection: true,
    contextAnalysis: true,
    frameworkDetection: true,
    roleIdentification: true,
    heuristicNaming: true,
    memoryOptimization: true,
  }
};

/**
 * Validates the main configuration object.
 * @param config The configuration object to validate
 * @returns The validated configuration with defaults applied
 * @throws Error if the configuration is invalid
 */
export async function validateCodeMapConfig(config: Partial<CodeMapGeneratorConfig>): Promise<CodeMapGeneratorConfig> {
  // Check if allowedMappingDirectory is provided in config or environment variable
  const envAllowedDir = process.env.CODE_MAP_ALLOWED_DIR;
  const allowedMappingDirectory = config.allowedMappingDirectory || envAllowedDir;

  if (!allowedMappingDirectory) {
    throw new Error('allowedMappingDirectory is required in the configuration or CODE_MAP_ALLOWED_DIR environment variable');
  }

  // Validate allowedMappingDirectory
  await validateAllowedMappingDirectory(allowedMappingDirectory);

  // Apply defaults for optional configurations
  const validatedConfig: CodeMapGeneratorConfig = {
    allowedMappingDirectory,
    cache: validateCacheConfig(config.cache),
    processing: validateProcessingConfig(config.processing),
    output: validateOutputConfig(config.output),
    featureFlags: validateFeatureFlagsConfig(config.featureFlags),
  };

  return validatedConfig;
}

/**
 * Validates the allowed mapping directory.
 * @param dirPath The directory path to validate
 * @throws Error if the directory is invalid
 */
export async function validateAllowedMappingDirectory(dirPath: string): Promise<void> {
  // Ensure the path is absolute
  if (!path.isAbsolute(dirPath)) {
    throw new Error(`allowedMappingDirectory must be an absolute path. Received: ${dirPath}`);
  }

  // Normalize the path
  const normalizedPath = path.resolve(dirPath);

  // Check if the directory exists
  try {
    const stats = await fs.stat(normalizedPath);
    if (!stats.isDirectory()) {
      throw new Error(`allowedMappingDirectory must be a directory. Path: ${normalizedPath}`);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      throw new Error(`allowedMappingDirectory does not exist: ${normalizedPath}`);
    }
    throw error;
  }

  // Check if the directory is readable
  try {
    await fs.access(normalizedPath, fsSync.constants.R_OK);
  } catch (error) {
    throw new Error(`allowedMappingDirectory is not readable: ${normalizedPath}`);
  }

  logger.debug(`Validated allowedMappingDirectory: ${normalizedPath}`);
}

/**
 * Validates the cache configuration.
 * @param config The cache configuration to validate
 * @returns The validated cache configuration with defaults applied
 */
export function validateCacheConfig(config?: Partial<CacheConfig>): CacheConfig {
  const defaultCache = DEFAULT_CONFIG.cache as CacheConfig;

  if (!config) {
    return defaultCache;
  }

  // Start with defaults and override with provided values
  return {
    enabled: config.enabled !== undefined ? config.enabled : defaultCache.enabled,
    maxEntries: config.maxEntries || defaultCache.maxEntries,
    maxAge: config.maxAge || defaultCache.maxAge,
    cacheDir: config.cacheDir,
  };
}

/**
 * Validates the processing configuration.
 * @param config The processing configuration to validate
 * @returns The validated processing configuration with defaults applied
 */
export function validateProcessingConfig(config?: Partial<ProcessingConfig>): ProcessingConfig {
  const defaultProcessing = DEFAULT_CONFIG.processing as ProcessingConfig;

  if (!config) {
    return defaultProcessing;
  }

  // Start with defaults and override with provided values
  return {
    batchSize: config.batchSize || defaultProcessing.batchSize,
    logMemoryUsage: config.logMemoryUsage !== undefined ? config.logMemoryUsage : defaultProcessing.logMemoryUsage,
    maxMemoryUsage: config.maxMemoryUsage || defaultProcessing.maxMemoryUsage,
  };
}

/**
 * Validates the output configuration.
 * @param config The output configuration to validate
 * @returns The validated output configuration with defaults applied
 */
export function validateOutputConfig(config?: Partial<OutputConfig>): OutputConfig {
  const defaultOutput = DEFAULT_CONFIG.output as OutputConfig;

  if (!config) {
    return defaultOutput;
  }

  // Start with defaults and override with provided values
  return {
    outputDir: config.outputDir,
    format: config.format || defaultOutput.format,
    splitOutput: config.splitOutput !== undefined ? config.splitOutput : defaultOutput.splitOutput,
    filePrefix: config.filePrefix,
  };
}

/**
 * Validates the feature flags configuration.
 * @param config The feature flags configuration to validate
 * @returns The validated feature flags configuration with defaults applied
 */
export function validateFeatureFlagsConfig(config?: Partial<FeatureFlagsConfig>): FeatureFlagsConfig {
  const defaultFeatureFlags = DEFAULT_CONFIG.featureFlags as FeatureFlagsConfig;

  if (!config) {
    return defaultFeatureFlags;
  }

  // Start with defaults and override with provided values
  return {
    enhancedFunctionDetection: config.enhancedFunctionDetection !== undefined ?
      config.enhancedFunctionDetection : defaultFeatureFlags.enhancedFunctionDetection,
    contextAnalysis: config.contextAnalysis !== undefined ?
      config.contextAnalysis : defaultFeatureFlags.contextAnalysis,
    frameworkDetection: config.frameworkDetection !== undefined ?
      config.frameworkDetection : defaultFeatureFlags.frameworkDetection,
    roleIdentification: config.roleIdentification !== undefined ?
      config.roleIdentification : defaultFeatureFlags.roleIdentification,
    heuristicNaming: config.heuristicNaming !== undefined ?
      config.heuristicNaming : defaultFeatureFlags.heuristicNaming,
    memoryOptimization: config.memoryOptimization !== undefined ?
      config.memoryOptimization : defaultFeatureFlags.memoryOptimization,
  };
}

/**
 * Extracts and validates the Code-Map Generator configuration from the client config.
 * @param config The OpenRouter configuration object
 * @returns The validated Code-Map Generator configuration
 * @throws Error if the configuration is invalid
 */
export async function extractCodeMapConfig(config?: OpenRouterConfig): Promise<CodeMapGeneratorConfig> {
  // Create a base configuration object
  let codeMapConfig: Partial<CodeMapGeneratorConfig> = {};

  if (config) {
    // Try to extract from tools['map-codebase'] first
    const toolConfig = config.tools?.['map-codebase'] as Partial<CodeMapGeneratorConfig>;

    // If not found, try config['map-codebase']
    const configSection = config.config?.['map-codebase'] as Partial<CodeMapGeneratorConfig>;

    // Merge configurations if they exist
    if (toolConfig || configSection) {
      codeMapConfig = {
        ...configSection,
        ...toolConfig,
      };
    }
  }

  // Even if no config is provided, we'll try to use environment variables
  logger.debug(`Extracted code-map-generator config: ${JSON.stringify(codeMapConfig)}`);

  // Validate the configuration (this will check for environment variables if config is empty)
  return validateCodeMapConfig(codeMapConfig);
}
