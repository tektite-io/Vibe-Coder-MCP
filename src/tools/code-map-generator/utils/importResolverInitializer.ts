/**
 * Import resolver initializer for the Code-Map Generator tool.
 * This file contains a function to initialize the import resolver with the proper configuration.
 */

import logger from '../../../logger.js';
import { ImportResolverManager } from './ImportResolverManager.js';
import { CodeMapGeneratorConfig } from '../types.js';
import { ImportResolverFactory } from '../importResolvers/importResolverFactory.js';
import path from 'path';

// Store the factory instance for cleanup
let resolverFactory: ImportResolverFactory | null = null;

/**
 * Initializes the import resolver with the given configuration.
 * This should be called before any import resolution is performed.
 *
 * @param config The Code-Map Generator configuration
 */
export function initializeImportResolver(config: CodeMapGeneratorConfig): void {
  // Get the import resolver manager instance
  const manager = ImportResolverManager.getInstance();

  // Dispose existing factory if it exists
  if (resolverFactory) {
    resolverFactory.dispose();
    resolverFactory = null;
  }

  // Check if import resolution is enabled in the configuration
  if (config.importResolver?.enabled) {
    // Create the import resolver configuration
    const importResolverConfig = {
      enabled: true,
      useCache: config.importResolver.useCache !== false,
      cacheSize: config.importResolver.cacheSize || 10000,
      extensions: config.importResolver.extensions,
      // Always enable expandSecurityBoundary for better import resolution
      expandSecurityBoundary: true,
      enhanceImports: config.importResolver.enhanceImports === true
    };

    // Initialize the import resolver
    manager.initialize(importResolverConfig);

    // Create a new factory instance
    resolverFactory = new ImportResolverFactory({
      allowedDir: config.allowedMappingDirectory,
      outputDir: config.output?.outputDir || path.join(process.env.VIBE_CODER_OUTPUT_DIR || '.', 'code-map-generator'),
      maxDepth: config.importResolver?.importMaxDepth || 3,
      tsConfig: config.importResolver?.tsConfig,
      pythonPath: config.importResolver?.pythonPath,
      pythonVersion: config.importResolver?.pythonVersion,
      venvPath: config.importResolver?.venvPath,
      clangdPath: config.importResolver?.clangdPath,
      compileFlags: config.importResolver?.compileFlags,
      includePaths: config.importResolver?.includePaths,
      semgrepPatterns: config.importResolver?.semgrepPatterns,
      semgrepTimeout: config.importResolver?.semgrepTimeout,
      semgrepMaxMemory: config.importResolver?.semgrepMaxMemory,
      disableSemgrepFallback: config.importResolver?.disableSemgrepFallback
    });

    logger.info({
      enabled: importResolverConfig.enabled,
      expandSecurityBoundary: importResolverConfig.enabled ? true : false, // Always log true if enabled
      enhanceImports: importResolverConfig.enhanceImports
    }, 'Import resolver initialized with configuration');
  } else {
    // Initialize with disabled configuration
    manager.initialize({ enabled: false });
    logger.info('Import resolver disabled in configuration');
  }
}

/**
 * Disposes of the import resolver.
 * This should be called when the import resolver is no longer needed.
 */
export function disposeImportResolver(): void {
  // Dispose the factory instance
  if (resolverFactory) {
    resolverFactory.dispose();
    resolverFactory = null;
    logger.info('Import resolver factory disposed');
  }

  // Clear the manager cache
  const manager = ImportResolverManager.getInstance();
  manager.clearCache();
  logger.info('Import resolver manager cache cleared');
}
