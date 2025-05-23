/**
 * No-cache import resolver utility for the Code-Map Generator tool.
 * This file contains utilities for resolving import paths without using memory caching.
 */

import resolve from 'resolve';
import * as path from 'path';
import * as fs from 'fs';
import logger from '../../../logger.js';

/**
 * Options for resolving imports.
 */
export interface ImportResolverOptions {
  /**
   * The project root directory.
   */
  projectRoot: string;

  /**
   * The file path of the file containing the import.
   */
  fromFile: string;

  /**
   * The language of the file containing the import.
   */
  language: string;

  /**
   * Whether to use the cache.
   * Note: This is ignored in the no-cache version.
   */
  useCache?: boolean;

  /**
   * Extensions to try when resolving imports.
   */
  extensions?: string[];

  /**
   * Whether to temporarily expand the security boundary for import resolution.
   * When true, the import resolver will attempt to resolve imports outside the
   * allowed mapping directory, but will not access their content.
   */
  expandSecurityBoundary?: boolean;

  /**
   * Whether to include absolute paths in the result.
   * When true, the resolver will return both relative and absolute paths.
   */
  includeAbsolutePath?: boolean;
}

/**
 * Result of resolving an import path.
 */
export interface ResolvedImportResult {
  /**
   * The relative path from the project root.
   */
  relativePath?: string;

  /**
   * The absolute path to the imported file.
   */
  absolutePath?: string;
}

/**
 * Resolves an import path to absolute and relative paths.
 * This version does not use any in-memory caching.
 *
 * @param importPath The import path to resolve.
 * @param options Options for resolving the import.
 * @returns The resolved import paths, or the original path if it couldn't be resolved.
 */
export function resolveImport(
  importPath: string,
  options: ImportResolverOptions
): ResolvedImportResult | string {
  // For backward compatibility, if includeAbsolutePath is not set, return a string
  if (options.includeAbsolutePath !== true) {
    return resolveImportLegacy(importPath, options);
  }

  // Skip resolution for built-in modules
  if (isBuiltinModule(importPath)) {
    return { relativePath: importPath };
  }

  // Skip resolution for external packages
  if (isExternalPackage(importPath)) {
    return { relativePath: importPath };
  }

  try {
    // Get the directory containing the file
    const basedir = path.dirname(options.fromFile);

    // Default extensions based on language
    const extensions = options.extensions || getDefaultExtensions(options.language);

    // Check if we need to use expanded boundary resolution
    let resolvedPath: string | null = null;
    try {
      // Always try to resolve with expanded boundary first
      try {
        // Use resolve.sync directly without security validation
        resolvedPath = resolve.sync(importPath, {
          basedir,
          extensions,
          preserveSymlinks: false
        });

        logger.debug({
          importPath,
          resolvedPath,
          securityExpanded: true
        }, 'Resolved import path with expanded security boundary');
      } catch (expandedError) {
        logger.debug({ err: expandedError, importPath, basedir }, 'Error resolving import with expanded boundary');

        // Try a more direct approach if the standard resolve fails
        try {
          // Try to resolve relative to the base directory
          const potentialPath = path.resolve(basedir, importPath);

          // Check if the file exists with any of the extensions
          for (const ext of extensions) {
            const fullPath = `${potentialPath}${ext}`;
            if (fs.existsSync(fullPath)) {
              resolvedPath = fullPath;
              logger.debug({
                importPath,
                resolvedPath,
                method: 'direct-fs'
              }, 'Resolved import path with direct filesystem check');
              break;
            }
          }

          // If we still don't have a path, fall back to standard resolution
          if (!resolvedPath) {
            throw new Error('Could not resolve with direct filesystem check');
          }
        } catch (directError) {
          // Fall back to standard resolution as a last resort
          logger.debug({ err: directError, importPath, basedir }, 'Error resolving import with direct filesystem check');
          resolvedPath = resolve.sync(importPath, {
            basedir,
            extensions,
            preserveSymlinks: false
          });
        }
      }

      // If we have a project root, make the path relative to it
      let relativePath = importPath;
      if (options.projectRoot && resolvedPath.startsWith(options.projectRoot)) {
        // Make the path relative to the project root
        relativePath = path.relative(options.projectRoot, resolvedPath);

        // Ensure consistent path format (use forward slashes)
        relativePath = relativePath.replace(/\\/g, '/');

        // Add a ./ prefix if it doesn't start with one
        if (!relativePath.startsWith('./') && !relativePath.startsWith('../')) {
          relativePath = `./${relativePath}`;
        }

        logger.debug({
          originalPath: importPath,
          resolvedPath,
          relativePath,
          projectRoot: options.projectRoot
        }, 'Resolved import path relative to project root');
      } else {
        // The resolved path is outside the project root
        logger.debug({
          originalPath: importPath,
          resolvedPath,
          projectRoot: options.projectRoot
        }, 'Resolved import path is outside project root');
      }

      return {
        relativePath,
        absolutePath: resolvedPath
      };
    } catch (error) {
      // Log the error
      logger.debug({ err: error, importPath, fromFile: options.fromFile }, 'Error resolving absolute path');

      // Return just the relative path as fallback
      return {
        relativePath: importPath
      };
    }
  } catch (error) {
    // Log the error
    logger.debug({ err: error, importPath, fromFile: options.fromFile }, 'Error in import resolution');

    // Return an empty result
    return { relativePath: importPath };
  }
}

/**
 * Clears the import cache.
 * This is a no-op in the no-cache version.
 */
export function clearImportCache(): void {
  // No-op since we don't have a cache
}

/**
 * Gets the size of the import cache.
 * This always returns 0 in the no-cache version.
 *
 * @returns The number of entries in the import cache.
 */
export function getImportCacheSize(): number {
  return 0;
}

/**
 * Legacy version of resolveImport that returns a string.
 * This is used for backward compatibility.
 *
 * @param importPath The import path to resolve.
 * @param options Options for resolving the import.
 * @returns The resolved import path, or the original path if it couldn't be resolved.
 */
function resolveImportLegacy(
  importPath: string,
  options: ImportResolverOptions
): string {
  // Skip resolution for built-in modules
  if (isBuiltinModule(importPath)) {
    return importPath;
  }

  // Skip resolution for external packages
  if (isExternalPackage(importPath)) {
    return importPath;
  }

  try {
    // Get the directory containing the file
    const basedir = path.dirname(options.fromFile);

    // Default extensions based on language
    const extensions = options.extensions || getDefaultExtensions(options.language);

    // Check if we need to use expanded boundary resolution
    let resolvedPath: string | null = null;

    // Always try to resolve with expanded boundary first
    try {
      // Use resolve.sync directly without security validation
      resolvedPath = resolve.sync(importPath, {
        basedir,
        extensions,
        preserveSymlinks: false
      });

      logger.debug({
        importPath,
        resolvedPath,
        securityExpanded: true
      }, 'Resolved import path with expanded security boundary');
    } catch (expandedError) {
      logger.debug({ err: expandedError, importPath, basedir }, 'Error resolving import with expanded boundary');

      // Try a more direct approach if the standard resolve fails
      try {
        // Try to resolve relative to the base directory
        const potentialPath = path.resolve(basedir, importPath);

        // Check if the file exists with any of the extensions
        let found = false;
        for (const ext of extensions) {
          const fullPath = `${potentialPath}${ext}`;
          if (fs.existsSync(fullPath)) {
            resolvedPath = fullPath;
            found = true;
            logger.debug({
              importPath,
              resolvedPath,
              method: 'direct-fs'
            }, 'Resolved import path with direct filesystem check');
            break;
          }
        }

        // If we still don't have a path, fall back to standard resolution
        if (!found) {
          throw new Error('Could not resolve with direct filesystem check');
        }
      } catch (directError) {
        // Fall back to standard resolution as a last resort
        logger.debug({ err: directError, importPath, basedir }, 'Error resolving import with direct filesystem check');
        resolvedPath = resolve.sync(importPath, {
          basedir,
          extensions,
          preserveSymlinks: false
        });
      }
    }

    // If we have a project root, make the path relative to it
    let finalPath: string = importPath; // Default to the original import path
    if (resolvedPath && options.projectRoot) {
      // Check if the resolved path is within the project root
      if (resolvedPath.startsWith(options.projectRoot)) {
        // Make the path relative to the project root
        finalPath = path.relative(options.projectRoot, resolvedPath);

        // Ensure consistent path format (use forward slashes)
        finalPath = finalPath.replace(/\\/g, '/');

        // Add a ./ prefix if it doesn't start with one
        if (!finalPath.startsWith('./') && !finalPath.startsWith('../')) {
          finalPath = `./${finalPath}`;
        }

        logger.debug({
          originalPath: importPath,
          resolvedPath,
          finalPath,
          projectRoot: options.projectRoot
        }, 'Resolved import path relative to project root');
      } else {
        // The resolved path is outside the project root
        logger.debug({
          originalPath: importPath,
          resolvedPath,
          projectRoot: options.projectRoot
        }, 'Resolved import path is outside project root');
      }
    }

    return finalPath;
  } catch (error) {
    // Log the error
    logger.debug({ err: error, importPath, fromFile: options.fromFile }, 'Error resolving import');

    // Return the original import path
    return importPath;
  }
}

/**
 * Checks if a module is a built-in Node.js module.
 *
 * @param moduleName The name of the module to check.
 * @returns Whether the module is a built-in Node.js module.
 */
function isBuiltinModule(moduleName: string): boolean {
  // List of built-in Node.js modules
  const builtinModules = [
    'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants',
    'crypto', 'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'https',
    'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode',
    'querystring', 'readline', 'repl', 'stream', 'string_decoder', 'timers',
    'tls', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib'
  ];

  return builtinModules.includes(moduleName);
}

/**
 * Checks if a module is an external package.
 *
 * @param moduleName The name of the module to check.
 * @returns Whether the module is an external package.
 */
function isExternalPackage(moduleName: string): boolean {
  // Check if the module name starts with a package name
  // This is a simple heuristic that works for most cases
  return !moduleName.startsWith('.') && !moduleName.startsWith('/') && !isBuiltinModule(moduleName);
}

// Removed unused function: getPackageName

/**
 * Gets the default extensions for a language.
 *
 * @param language The language to get extensions for.
 * @returns An array of file extensions for the language.
 */
function getDefaultExtensions(language: string): string[] {
  switch (language) {
    case 'javascript':
      return ['.js', '.json', '.node', '.mjs', '.cjs'];
    case 'typescript':
      return ['.ts', '.tsx', '.js', '.jsx', '.json', '.node'];
    case 'python':
      return ['.py', '.pyw', '.pyc', '.pyo', '.pyd'];
    case 'java':
      return ['.java', '.class', '.jar'];
    case 'csharp':
      return ['.cs', '.dll'];
    case 'go':
      return ['.go'];
    case 'ruby':
      return ['.rb', '.rake', '.gemspec'];
    case 'rust':
      return ['.rs'];
    case 'php':
      return ['.php'];
    default:
      return ['.js', '.json', '.node']; // Default to JavaScript
  }
}
