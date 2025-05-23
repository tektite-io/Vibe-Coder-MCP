/**
 * Import resolver initializer for the Code-Map Generator tool.
 * This file contains a function to initialize the import resolver with the proper configuration.
 */

import logger from '../../../logger.js';
import { ImportResolverManager } from './ImportResolverManager.js';

/**
 * Initializes the import resolver with the given configuration.
 * This should be called before any import resolution is performed.
 * 
 * @param {import('../types.js').CodeMapGeneratorConfig} config The Code-Map Generator configuration
 */
export function initializeImportResolver(config) {
  // Get the import resolver manager instance
  const manager = ImportResolverManager.getInstance();

  // Check if import resolution is enabled in the configuration
  if (config.importResolver?.enabled) {
    // Create the import resolver configuration
    const importResolverConfig = {
      enabled: true,
      useCache: config.importResolver.useCache !== false,
      cacheSize: config.importResolver.cacheSize || 10000,
      extensions: config.importResolver.extensions,
      expandSecurityBoundary: config.importResolver.expandSecurityBoundary !== false, // Default to true
      enhanceImports: config.importResolver.enhanceImports === true
    };

    // Initialize the import resolver
    manager.initialize(importResolverConfig);

    logger.info({
      enabled: importResolverConfig.enabled,
      expandSecurityBoundary: importResolverConfig.expandSecurityBoundary,
      enhanceImports: importResolverConfig.enhanceImports
    }, 'Import resolver initialized with configuration');
  } else {
    // Initialize with disabled configuration
    manager.initialize({ enabled: false });
    logger.info('Import resolver disabled in configuration');
  }
}
