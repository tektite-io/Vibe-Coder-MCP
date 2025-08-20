/**
 * Configuration validator for the Code-Map Generator tool.
 * This file contains functions for validating and extracting configuration.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import logger from '../../logger.js';
import { CodeMapGeneratorConfig, CacheConfig, ProcessingConfig, OutputConfig, FeatureFlagsConfig, ImportResolverConfig, DebugConfig } from './types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { getCacheDirectory } from './directoryUtils.js';
import { detectTransportType } from '../../logger.js';
import { getUnifiedSecurityConfig } from '../vibe-task-manager/security/unified-security-config.js';
import { TransportContext } from '../../index-with-setup.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<CodeMapGeneratorConfig> = {
  cache: {
    enabled: true,
    maxEntries: 10000,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    useFileBasedAccess: true,
    useFileHashes: true,
    maxCachedFiles: 0, // Disable in-memory caching of file content
    useMemoryCache: false, // Disable memory caching in tiered caches by default
    memoryMaxEntries: 1000,
    memoryMaxAge: 10 * 60 * 1000, // 10 minutes
    memoryThreshold: 0.8, // 80% memory usage threshold
  },
  processing: {
    batchSize: 100,
    logMemoryUsage: false,
    maxMemoryUsage: 1024, // 1GB
    incremental: true,
    incrementalConfig: {
      useFileHashes: true,
      useFileMetadata: true,
      saveProcessedFilesList: true
    }
  },
  output: {
    format: 'markdown',
    splitOutput: false, // Make single file output the default
  },
  featureFlags: {
    enhancedFunctionDetection: true,
    contextAnalysis: true,
    frameworkDetection: true,
    roleIdentification: true,
    heuristicNaming: true,
    memoryOptimization: true,
  },
  importResolver: {
    enabled: false,
    useCache: true,
    cacheSize: 10000,
    extensions: {
      javascript: ['.js', '.json', '.node', '.mjs', '.cjs'],
      typescript: ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'],
      python: ['.py', '.pyw', '.pyc', '.pyo', '.pyd'],
      java: ['.java', '.class', '.jar'],
      csharp: ['.cs', '.dll'],
      go: ['.go'],
      ruby: ['.rb', '.rake', '.gemspec'],
      rust: ['.rs'],
      php: ['.php']
    },
    generateImportGraph: false,
    expandSecurityBoundary: true,
    enhanceImports: false,
    importMaxDepth: 3,
    semgrepTimeout: 30,
    semgrepMaxMemory: '1GB',
    disableSemgrepFallback: false
  },
  debug: {
    showDetailedImports: false,
    generateASTDebugFiles: false
  }
};

/**
 * Validates the main configuration object.
 * @param config The configuration object to validate
 * @returns The validated configuration with defaults applied
 * @throws Error if the configuration is invalid
 */
export async function validateCodeMapConfig(config: Partial<CodeMapGeneratorConfig>): Promise<CodeMapGeneratorConfig> {
  // allowedMappingDirectory should now be provided by unified security config
  const allowedMappingDirectory = config.allowedMappingDirectory;

  if (!allowedMappingDirectory) {
    throw new Error('allowedMappingDirectory is required. This should be resolved by the unified security config.');
  }

  // Validate allowedMappingDirectory
  await validateAllowedMappingDirectory(allowedMappingDirectory);

  // Apply defaults for optional configurations
  const validatedConfig: CodeMapGeneratorConfig = {
    allowedMappingDirectory,
    cache: validateCacheConfig(config.cache, allowedMappingDirectory),
    processing: validateProcessingConfig(config.processing),
    output: validateOutputConfig(config.output),
    featureFlags: validateFeatureFlagsConfig(config.featureFlags),
    importResolver: validateImportResolverConfig(config.importResolver),
    debug: validateDebugConfig(config.debug),
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
  } catch {
    throw new Error(`allowedMappingDirectory is not readable: ${normalizedPath}`);
  }

  logger.debug(`Validated allowedMappingDirectory: ${normalizedPath}`);
}

/**
 * Validates the cache configuration.
 * @param config The cache configuration to validate
 * @param allowedMappingDirectory The allowed mapping directory for computing cache directory
 * @returns The validated cache configuration with defaults applied
 */
export function validateCacheConfig(config?: Partial<CacheConfig>, allowedMappingDirectory?: string): CacheConfig {
  const defaultCache = DEFAULT_CONFIG.cache as CacheConfig;

  if (!config) {
    // Use defaults but still compute cacheDir if possible
    const cacheConfig = { ...defaultCache };
    if (allowedMappingDirectory && cacheConfig.enabled) {
      const tempConfig = { allowedMappingDirectory } as CodeMapGeneratorConfig;
      cacheConfig.cacheDir = getCacheDirectory(tempConfig);
    }
    return cacheConfig;
  }

  // Validate cacheDir if provided and caching is enabled
  if (config.cacheDir && (config.enabled !== false)) {
    if (!path.isAbsolute(config.cacheDir)) {
      logger.warn(`cacheDir should be an absolute path. Received: ${config.cacheDir}. Using relative to current working directory.`);
    }
    
    // Normalize the cache directory path
    const normalizedCacheDir = path.resolve(config.cacheDir);
    
    // Check if parent directory exists (cache dir will be created if it doesn't exist)
    const parentDir = path.dirname(normalizedCacheDir);
    try {
      if (!fsSync.existsSync(parentDir)) {
        logger.warn(`Parent directory of cacheDir does not exist: ${parentDir}. Cache operations may fail.`);
      }
    } catch (error) {
      logger.warn(`Unable to validate cacheDir parent directory: ${parentDir}. Error: ${error}`);
    }
  }

  // Start with defaults and override with provided values
  const cacheConfig: CacheConfig = {
    enabled: config.enabled !== undefined ? config.enabled : defaultCache.enabled,
    maxEntries: config.maxEntries || defaultCache.maxEntries,
    maxAge: config.maxAge || defaultCache.maxAge,
    cacheDir: config.cacheDir,
    useFileBasedAccess: config.useFileBasedAccess !== undefined ? config.useFileBasedAccess : defaultCache.useFileBasedAccess,
    useFileHashes: config.useFileHashes !== undefined ? config.useFileHashes : defaultCache.useFileHashes,
    maxCachedFiles: config.maxCachedFiles !== undefined ? config.maxCachedFiles : defaultCache.maxCachedFiles,
    useMemoryCache: config.useMemoryCache !== undefined ? config.useMemoryCache : defaultCache.useMemoryCache,
    memoryMaxEntries: config.memoryMaxEntries || defaultCache.memoryMaxEntries,
    memoryMaxAge: config.memoryMaxAge || defaultCache.memoryMaxAge,
    memoryThreshold: config.memoryThreshold !== undefined ? config.memoryThreshold : defaultCache.memoryThreshold,
  };
  
  // If no cacheDir is provided but we have allowedMappingDirectory and caching is enabled, compute it
  if (!cacheConfig.cacheDir && allowedMappingDirectory && cacheConfig.enabled) {
    const tempConfig = { allowedMappingDirectory } as CodeMapGeneratorConfig;
    cacheConfig.cacheDir = getCacheDirectory(tempConfig);
  }
  
  return cacheConfig;
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
  const validatedConfig: ProcessingConfig = {
    batchSize: config.batchSize || defaultProcessing.batchSize,
    logMemoryUsage: config.logMemoryUsage !== undefined ? config.logMemoryUsage : defaultProcessing.logMemoryUsage,
    maxMemoryUsage: config.maxMemoryUsage || defaultProcessing.maxMemoryUsage,
    incremental: config.incremental !== undefined ? config.incremental : defaultProcessing.incremental,
    periodicGC: config.periodicGC !== undefined ? config.periodicGC : defaultProcessing.periodicGC,
    gcInterval: config.gcInterval || defaultProcessing.gcInterval,
  };

  // Handle incremental config separately
  if (config.incrementalConfig || defaultProcessing.incrementalConfig) {
    validatedConfig.incrementalConfig = {
      useFileHashes: config.incrementalConfig?.useFileHashes !== undefined
        ? config.incrementalConfig.useFileHashes
        : defaultProcessing.incrementalConfig?.useFileHashes,
      useFileMetadata: config.incrementalConfig?.useFileMetadata !== undefined
        ? config.incrementalConfig.useFileMetadata
        : defaultProcessing.incrementalConfig?.useFileMetadata,
      maxCachedHashes: config.incrementalConfig?.maxCachedHashes || defaultProcessing.incrementalConfig?.maxCachedHashes,
      maxHashAge: config.incrementalConfig?.maxHashAge || defaultProcessing.incrementalConfig?.maxHashAge,
      previousFilesListPath: config.incrementalConfig?.previousFilesListPath || defaultProcessing.incrementalConfig?.previousFilesListPath,
      saveProcessedFilesList: config.incrementalConfig?.saveProcessedFilesList !== undefined
        ? config.incrementalConfig.saveProcessedFilesList
        : defaultProcessing.incrementalConfig?.saveProcessedFilesList,
    };
  }

  return validatedConfig;
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
 * Validates the import resolver configuration.
 * @param config The import resolver configuration to validate
 * @returns The validated import resolver configuration with defaults applied
 */
export function validateImportResolverConfig(config?: Partial<ImportResolverConfig>): ImportResolverConfig {
  const defaultImportResolver = DEFAULT_CONFIG.importResolver as ImportResolverConfig;

  if (!config) {
    return defaultImportResolver;
  }

  // Start with defaults and override with provided values
  const validatedConfig: ImportResolverConfig = {
    enabled: config.enabled !== undefined ? config.enabled : defaultImportResolver.enabled,
    useCache: config.useCache !== undefined ? config.useCache : defaultImportResolver.useCache,
    cacheSize: config.cacheSize || defaultImportResolver.cacheSize,
    generateImportGraph: config.generateImportGraph !== undefined ?
      config.generateImportGraph : defaultImportResolver.generateImportGraph,
    expandSecurityBoundary: config.expandSecurityBoundary !== undefined ?
      config.expandSecurityBoundary : defaultImportResolver.expandSecurityBoundary,
    enhanceImports: config.enhanceImports !== undefined ?
      config.enhanceImports : defaultImportResolver.enhanceImports,
    importMaxDepth: config.importMaxDepth || defaultImportResolver.importMaxDepth,
    tsConfig: config.tsConfig,
    pythonPath: config.pythonPath,
    pythonVersion: config.pythonVersion,
    venvPath: config.venvPath,
    clangdPath: config.clangdPath,
    compileFlags: config.compileFlags,
    includePaths: config.includePaths,
    semgrepPatterns: config.semgrepPatterns,
    semgrepTimeout: config.semgrepTimeout,
    semgrepMaxMemory: config.semgrepMaxMemory,
    disableSemgrepFallback: config.disableSemgrepFallback !== undefined ?
      config.disableSemgrepFallback : false
  };

  // Handle extensions separately to allow merging
  if (config.extensions) {
    validatedConfig.extensions = {
      ...defaultImportResolver.extensions,
      ...config.extensions
    };
  } else {
    validatedConfig.extensions = defaultImportResolver.extensions;
  }

  // Log security-related settings
  if (validatedConfig.expandSecurityBoundary) {
    logger.debug('Import resolver configured with expanded security boundary. This allows resolving imports outside the allowed mapping directory, but file content access is still restricted.');
  }

  return validatedConfig;
}

/**
 * Validates the debug configuration.
 * @param config The debug configuration to validate
 * @returns The validated debug configuration with defaults applied
 */
export function validateDebugConfig(config?: Partial<DebugConfig>): DebugConfig {
  const defaultDebug = DEFAULT_CONFIG.debug as DebugConfig;

  if (!config) {
    return defaultDebug;
  }

  // Start with defaults and override with provided values
  return {
    showDetailedImports: config.showDetailedImports !== undefined ?
      config.showDetailedImports : defaultDebug.showDetailedImports,
    generateASTDebugFiles: config.generateASTDebugFiles !== undefined ?
      config.generateASTDebugFiles : defaultDebug.generateASTDebugFiles,
  };
}

/**
 * Extracts and validates the Code-Map Generator configuration from the client config.
 * Uses unified security config with transport context for directory resolution.
 * @param config The OpenRouter configuration object
 * @param context Optional execution context with transport information
 * @returns The validated Code-Map Generator configuration
 * @throws Error if the configuration is invalid
 */
export async function extractCodeMapConfig(config?: OpenRouterConfig, context?: { sessionId?: string; transportType?: string }): Promise<CodeMapGeneratorConfig> {
  // Create transport context for unified security config
  // Use provided context if available, otherwise detect
  const transportType = (context?.transportType as TransportContext['transportType']) || detectTransportType();
  const transportContext: TransportContext = {
    sessionId: context?.sessionId || 'code-map-session',
    transportType,
    timestamp: Date.now(),
    workingDirectory: process.cwd(), // For CLI auto-detection
    mcpClientConfig: config // For STDIO configuration
  };

  // Use unified security config instead of manual extraction
  const unifiedConfig = getUnifiedSecurityConfig();
  
  // Only initialize if not already initialized (e.g., by CLI or server startup)
  if (!unifiedConfig.isInitialized()) {
    // Create a mock config if none provided (for backward compatibility)
    const mcpConfig = config || {
      apiKey: '',
      baseUrl: 'https://openrouter.ai/api/v1',
      geminiModel: 'google/gemini-2.5-flash-lite',
      perplexityModel: 'perplexity/sonar'
    };
    
    unifiedConfig.initializeFromMCPConfig(mcpConfig, transportContext);
  }
  
  // Get configuration from the (now initialized) UnifiedSecurityConfig
  const securityConfig = unifiedConfig.getCodeMapGeneratorConfig();

  // Create base configuration using unified directory resolution
  let codeMapConfig: Partial<CodeMapGeneratorConfig> = {
    allowedMappingDirectory: securityConfig.allowedDir,
    // Use the output directory from security config with tool-specific subdirectory
    output: {
      outputDir: path.join(securityConfig.outputDir, 'code-map-generator')
    }
  };

  // Fallback: Try to extract from tools['map-codebase'] (legacy support for other config)
  const toolConfig = config?.tools?.['map-codebase'] as Partial<CodeMapGeneratorConfig>;
  const configSection = config?.config?.['map-codebase'] as Partial<CodeMapGeneratorConfig>;

  // Merge configurations if they exist (unified config takes precedence for directory)
  if (toolConfig || configSection) {
    logger.debug({
      toolConfig,
      configSection
    }, 'Using legacy tool config extraction as additional config');

    codeMapConfig = {
      ...configSection,
      ...toolConfig,
      ...codeMapConfig // Preserve unified directory resolution
    };
  }

  logger.info({ 
    allowedMappingDirectory: codeMapConfig.allowedMappingDirectory,
    transportType: transportContext.transportType,
    autoDetectionEnabled: process.env.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION 
  }, 'Code Map Generator using unified project root configuration');

  logger.debug({
    extractedCodeMapConfig: codeMapConfig,
    hasConfig: Boolean(config),
    hasEnv: Boolean(config?.env),
    configKeys: config ? Object.keys(config) : []
  }, 'Extracted code-map-generator config');

  // Validate the configuration
  return validateCodeMapConfig(codeMapConfig);
}
