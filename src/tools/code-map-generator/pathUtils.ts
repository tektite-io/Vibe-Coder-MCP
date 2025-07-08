/**
 * Path utilities for the Code-Map Generator tool.
 * This file contains functions for path resolution and validation.
 */

import path from 'path';
import logger from '../../logger.js';
import { PathValidationResult } from './types.js';

/**
 * Normalizes a path to ensure consistent format.
 * @param inputPath The path to normalize
 * @returns The normalized path
 */
export function normalizePath(inputPath: string): string {
  // Handle empty or undefined paths
  if (!inputPath) {
    throw new Error('Path cannot be empty or undefined');
  }

  // Normalize the path to resolve '..' and '.' segments
  const normalizedPath = path.normalize(inputPath);

  // Special handling for test paths to avoid path resolution issues in tests
  if (normalizedPath.includes('temp/') && path.isAbsolute(normalizedPath)) {
    logger.debug(`Using test path as-is: ${normalizedPath}`);
    return normalizedPath;
  }

  // Resolve to absolute path if it's relative
  return path.isAbsolute(normalizedPath)
    ? normalizedPath
    : path.resolve(process.cwd(), normalizedPath);
}

/**
 * Checks if a path is within another path (or equal to it).
 * Both paths are normalized before comparison.
 * @param childPath The path to check
 * @param parentPath The potential parent path
 * @returns True if childPath is within parentPath or equal to it, false otherwise
 */
export function isPathWithin(childPath: string, parentPath: string): boolean {
  const normalizedChild = normalizePath(childPath);
  const normalizedParent = normalizePath(parentPath);

  // Check for exact match first
  if (normalizedChild === normalizedParent) {
    return true;
  }

  // Ensure parent path ends with separator for proper prefix matching
  const parentWithSep = normalizedParent.endsWith(path.sep)
    ? normalizedParent
    : normalizedParent + path.sep;

  // Check if child starts with parent (prefix match)
  return normalizedChild.startsWith(parentWithSep);
}

/**
 * Validates a path against the allowed boundary.
 * @param inputPath The path to validate
 * @param allowedDirectory The allowed directory boundary
 * @returns A validation result object
 */
export function validatePathSecurity(
  inputPath: string,
  allowedDirectory: string
): PathValidationResult {
  try {
    // Validate allowedDirectory parameter - no fallbacks allowed
    if (!allowedDirectory || typeof allowedDirectory !== 'string' || allowedDirectory.trim() === '') {
      return {
        isValid: false,
        error: 'Security boundary violation: allowedDirectory must be explicitly provided by centralized configuration'
      };
    }

    // Normalize both paths
    const normalizedPath = normalizePath(inputPath);
    const normalizedAllowedDir = normalizePath(allowedDirectory);

    // Check if the path is within the allowed directory
    if (!isPathWithin(normalizedPath, normalizedAllowedDir)) {
      return {
        isValid: false,
        error: `Access denied: Path '${inputPath}' is outside of the allowed directory '${allowedDirectory}'`,
      };
    }

    // Path is valid
    return {
      isValid: true,
      normalizedPath,
    };
  } catch (error) {
    // Handle normalization errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      isValid: false,
      error: `Path validation error: ${errorMessage}`,
    };
  }
}

/**
 * Creates a secure path within the allowed boundary.
 * @param inputPath The path to secure
 * @param allowedDirectory The allowed directory boundary
 * @returns The secure path if valid, throws an error otherwise
 */
export function createSecurePath(
  inputPath: string,
  allowedDirectory: string
): string {
  // Validate input parameters with explicit error handling
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('createSecurePath: inputPath must be a non-empty string');
  }
  
  if (!allowedDirectory || typeof allowedDirectory !== 'string' || allowedDirectory.trim() === '') {
    logger.error({
      inputPath,
      allowedDirectory,
      function: 'createSecurePath'
    }, 'Security boundary violation: allowedDirectory must be explicitly provided by centralized configuration');
    
    throw new Error(
      'Security boundary violation: allowedDirectory must be explicitly provided by centralized configuration. ' +
      'Services must use centralized config-loader.ts to provide security boundaries.'
    );
  }

  const validationResult = validatePathSecurity(inputPath, allowedDirectory);

  if (!validationResult.isValid) {
    logger.error({
      inputPath,
      allowedDirectory,
      error: validationResult.error
    }, 'Security violation: Attempted to access path outside allowed directory');

    throw new Error(validationResult.error);
  }

  return validationResult.normalizedPath as string;
}

/**
 * Resolves a relative path against the allowed directory.
 * @param relativePath The relative path to resolve
 * @param allowedDirectory The allowed directory boundary
 * @returns The resolved absolute path if valid, throws an error otherwise
 */
export function resolveSecurePath(
  relativePath: string,
  allowedDirectory: string
): string {
  // Handle empty or undefined paths
  if (!relativePath) {
    throw new Error('Path cannot be empty or undefined');
  }

  // Validate allowedDirectory parameter - no fallbacks allowed
  if (!allowedDirectory || typeof allowedDirectory !== 'string' || allowedDirectory.trim() === '') {
    throw new Error(
      'Security boundary violation: allowedDirectory must be explicitly provided by centralized configuration. ' +
      'Services must use centralized config-loader.ts to provide security boundaries.'
    );
  }

  // If the path is already absolute, validate it directly
  if (path.isAbsolute(relativePath)) {
    return createSecurePath(relativePath, allowedDirectory);
  }

  // Resolve the relative path against the allowed directory
  const resolvedPath = path.resolve(allowedDirectory, relativePath);

  // Validate the resolved path
  return createSecurePath(resolvedPath, allowedDirectory);
}

/**
 * Gets the relative path from the allowed directory.
 * @param absolutePath The absolute path to convert
 * @param allowedDirectory The allowed directory boundary
 * @returns The relative path
 */
export function getRelativePath(
  absolutePath: string,
  allowedDirectory: string
): string {
  // Validate allowedDirectory parameter - no fallbacks allowed  
  if (!allowedDirectory || typeof allowedDirectory !== 'string' || allowedDirectory.trim() === '') {
    throw new Error(
      'Security boundary violation: allowedDirectory must be explicitly provided by centralized configuration. ' +
      'Services must use centralized config-loader.ts to provide security boundaries.'
    );
  }

  // Validate the path first
  const securePath = createSecurePath(absolutePath, allowedDirectory);

  // Get the relative path
  return path.relative(allowedDirectory, securePath);
}
