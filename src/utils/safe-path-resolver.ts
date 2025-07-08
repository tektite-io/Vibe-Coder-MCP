/**
 * Safe Path Resolver - Provides secure path resolution that doesn't rely on process.cwd()
 * 
 * This utility prevents security issues when process.cwd() is compromised (set to '/' or other unsafe directories).
 * All path operations use absolute paths from the project root instead of relative paths from working directory.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../logger.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Determine the project root directory (2 levels up from src/utils/)
const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * Get the project root directory safely
 * @returns The absolute path to the project root directory
 */
export function getProjectRootSafe(): string {
  return PROJECT_ROOT;
}

/**
 * Resolve a path relative to the project root safely
 * @param relativePath The path to resolve, relative to the project root
 * @returns The absolute path
 */
export function resolveProjectPathSafe(relativePath: string): string {
  return path.join(PROJECT_ROOT, relativePath);
}

/**
 * Get a safe output directory (replaces dangerous process.cwd() usage)
 * @param subDirectory Optional subdirectory within output
 * @returns Safe absolute path to output directory
 */
export function getSafeOutputDirectory(subDirectory?: string): string {
  const baseOutputDir = resolveProjectPathSafe('VibeCoderOutput');
  return subDirectory ? path.join(baseOutputDir, subDirectory) : baseOutputDir;
}

/**
 * Get a safe temporary directory (replaces dangerous process.cwd() usage)
 * @param subDirectory Optional subdirectory within temp
 * @returns Safe absolute path to temporary directory
 */
export function getSafeTempDirectory(subDirectory?: string): string {
  const baseTempDir = resolveProjectPathSafe('tmp');
  return subDirectory ? path.join(baseTempDir, subDirectory) : baseTempDir;
}

/**
 * Get a safe data directory (replaces dangerous process.cwd() usage) 
 * @param subDirectory Optional subdirectory within data
 * @returns Safe absolute path to data directory
 */
export function getSafeDataDirectory(subDirectory?: string): string {
  const baseDataDir = resolveProjectPathSafe('data');
  return subDirectory ? path.join(baseDataDir, subDirectory) : baseDataDir;
}

/**
 * Check if the current working directory is safe
 * @returns Object with safety status and recommended action
 */
export function checkWorkingDirectorySafety(): {
  isSafe: boolean;
  currentCwd: string;
  recommendedAction: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
} {
  const currentCwd = process.cwd();
  
  if (currentCwd === '/') {
    return {
      isSafe: false,
      currentCwd,
      recommendedAction: 'CRITICAL: Working directory is root (/). Use absolute path resolution immediately.',
      severity: 'critical'
    };
  }
  
  if (currentCwd === '' || currentCwd === '/tmp' || currentCwd.startsWith('/tmp/')) {
    return {
      isSafe: false,
      currentCwd,
      recommendedAction: 'HIGH: Working directory is unsafe. Use absolute path resolution.',
      severity: 'high'
    };
  }
  
  if (!currentCwd.includes('Vibe-Coder-MCP') && !currentCwd.includes('RepoTools')) {
    return {
      isSafe: false,
      currentCwd,
      recommendedAction: 'MEDIUM: Working directory appears to be outside project. Verify path resolution.',
      severity: 'medium'
    };
  }
  
  return {
    isSafe: true,
    currentCwd,
    recommendedAction: 'Working directory appears safe.',
    severity: 'low'
  };
}

/**
 * Log working directory safety status
 */
export function logWorkingDirectorySafety(): void {
  const safety = checkWorkingDirectorySafety();
  
  if (safety.severity === 'critical') {
    logger.error({
      workingDirectory: safety.currentCwd,
      projectRoot: PROJECT_ROOT,
      severity: safety.severity
    }, `🚨 ${safety.recommendedAction}`);
  } else if (safety.severity === 'high') {
    logger.warn({
      workingDirectory: safety.currentCwd,
      projectRoot: PROJECT_ROOT,
      severity: safety.severity
    }, `⚠️ ${safety.recommendedAction}`);
  } else if (safety.severity === 'medium') {
    logger.warn({
      workingDirectory: safety.currentCwd,
      projectRoot: PROJECT_ROOT,
      severity: safety.severity
    }, `⚠️ ${safety.recommendedAction}`);
  } else {
    logger.debug({
      workingDirectory: safety.currentCwd,
      projectRoot: PROJECT_ROOT,
      severity: safety.severity
    }, `✅ ${safety.recommendedAction}`);
  }
}