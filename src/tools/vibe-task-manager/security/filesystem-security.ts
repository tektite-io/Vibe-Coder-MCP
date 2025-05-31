/**
 * Filesystem Security Module for Vibe Task Manager
 * Follows Code Map Generator security patterns with system directory blacklist
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { getUnifiedSecurityConfig } from './unified-security-config.js';
import logger from '../../../logger.js';

/**
 * System directories that should be blacklisted to prevent EACCES errors
 */
const SYSTEM_DIRECTORY_BLACKLIST = new Set([
  '/private/var/spool/postfix',
  '/private/var/spool/cups',
  '/private/var/spool/mail',
  '/private/var/spool/mqueue',
  '/private/var/db/sudo',
  '/private/var/db/dslocal',
  '/private/var/folders',
  '/private/var/vm',
  '/private/var/tmp',
  '/System',
  '/usr/bin',
  '/usr/sbin',
  '/bin',
  '/sbin',
  '/private/etc',
  '/private/var/root',
  '/private/var/log',
  '/Library/Application Support',
  '/Library/Caches',
  '/Library/Logs',
  '/Library/Preferences',
  '/Users/Shared',
  // Windows system directories
  'C:\\Windows',
  'C:\\Program Files',
  'C:\\Program Files (x86)',
  'C:\\ProgramData',
  'C:\\System Volume Information',
  'C:\\$Recycle.Bin',
  // Linux system directories
  '/proc',
  '/sys',
  '/dev',
  '/boot',
  '/root',
  '/var/log',
  '/var/spool',
  '/var/cache',
  '/var/lib',
  '/etc',
  '/tmp'
]);

/**
 * File extensions that are considered safe for reading
 */
const SAFE_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.xml', '.csv',
  '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
  '.py', '.java', '.go', '.rs', '.cpp', '.c', '.h', '.hpp',
  '.html', '.css', '.scss', '.sass', '.less',
  '.sql', '.sh', '.bat', '.ps1', '.dockerfile',
  '.gitignore', '.gitattributes', '.editorconfig',
  '.eslintrc', '.prettierrc', '.babelrc',
  '.log', '.env'
]);

export interface SecurityCheckResult {
  allowed: boolean;
  reason?: string;
  normalizedPath?: string;
  securityViolation?: boolean;
}

export interface FilesystemSecurityConfig {
  enablePermissionChecking: boolean;
  enableBlacklist: boolean;
  enableExtensionFiltering: boolean;
  maxPathLength: number;
  performanceThresholdMs: number;
  allowedDirectories: string[];
  additionalBlacklistedPaths: string[];
  additionalSafeExtensions: string[];
}

/**
 * Filesystem Security Manager
 */
export class FilesystemSecurity {
  private static instance: FilesystemSecurity;
  private config: FilesystemSecurityConfig;
  private securityMode: 'strict' | 'permissive';

  private constructor(config?: Partial<FilesystemSecurityConfig>) {
    try {
      // Try to get configuration from unified security config manager
      const unifiedConfig = getUnifiedSecurityConfig();
      const unifiedSecurityConfig = unifiedConfig.getFilesystemSecurityConfig();

      this.securityMode = unifiedSecurityConfig.securityMode;
      this.config = {
        enablePermissionChecking: unifiedSecurityConfig.enablePermissionChecking,
        enableBlacklist: unifiedSecurityConfig.enableBlacklist,
        enableExtensionFiltering: unifiedSecurityConfig.enableExtensionFiltering,
        maxPathLength: unifiedSecurityConfig.maxPathLength,
        performanceThresholdMs: unifiedSecurityConfig.performanceThresholdMs,
        allowedDirectories: unifiedSecurityConfig.allowedDirectories,
        additionalBlacklistedPaths: [],
        additionalSafeExtensions: [],
        ...config
      };

      logger.info({
        securityMode: this.securityMode,
        config: this.config,
        source: 'unified-security-config'
      }, 'Filesystem Security initialized from unified configuration');

    } catch (error) {
      // Fallback to environment variables if unified config is not available
      logger.warn({ err: error }, 'Unified security config not available, falling back to environment variables');

      this.securityMode = (process.env.VIBE_TASK_MANAGER_SECURITY_MODE as 'strict' | 'permissive') || 'strict';
      this.config = {
        enablePermissionChecking: true,
        enableBlacklist: true,
        enableExtensionFiltering: this.securityMode === 'strict',
        maxPathLength: 4096,
        performanceThresholdMs: 50, // Epic 6.2 target
        allowedDirectories: [
          process.env.VIBE_TASK_MANAGER_READ_DIR || process.cwd(),
          process.env.VIBE_CODER_OUTPUT_DIR || path.join(process.cwd(), 'VibeCoderOutput')
        ],
        additionalBlacklistedPaths: [],
        additionalSafeExtensions: [],
        ...config
      };

      logger.info({
        securityMode: this.securityMode,
        config: this.config,
        source: 'environment-variables'
      }, 'Filesystem Security initialized from environment variables (fallback)');
    }
  }

  static getInstance(config?: Partial<FilesystemSecurityConfig>): FilesystemSecurity {
    if (!FilesystemSecurity.instance) {
      FilesystemSecurity.instance = new FilesystemSecurity(config);
    }
    return FilesystemSecurity.instance;
  }

  /**
   * Check if a path is safe to access
   */
  async checkPathSecurity(
    filePath: string,
    operation: 'read' | 'write' | 'execute' = 'read'
  ): Promise<SecurityCheckResult> {
    const startTime = Date.now();

    try {
      // Basic validation
      if (!filePath || typeof filePath !== 'string') {
        return {
          allowed: false,
          reason: 'Invalid path input',
          securityViolation: true
        };
      }

      // Check path length
      if (filePath.length > this.config.maxPathLength) {
        return {
          allowed: false,
          reason: 'Path too long',
          securityViolation: true
        };
      }

      // Normalize the path
      const normalizedPath = this.normalizePath(filePath);

      // Check blacklist
      if (this.config.enableBlacklist && this.isBlacklisted(normalizedPath)) {
        return {
          allowed: false,
          reason: 'Path is in system directory blacklist',
          normalizedPath,
          securityViolation: true
        };
      }

      // Check if path is within allowed directories
      if (!this.isWithinAllowedDirectories(normalizedPath)) {
        return {
          allowed: false,
          reason: 'Path is outside allowed directories',
          normalizedPath,
          securityViolation: true
        };
      }

      // Check file extension for read operations
      if (operation === 'read' && this.config.enableExtensionFiltering) {
        const ext = path.extname(normalizedPath).toLowerCase();
        if (ext && !this.isSafeExtension(ext)) {
          return {
            allowed: false,
            reason: 'File extension not in safe list',
            normalizedPath,
            securityViolation: false // Not a security violation, just policy
          };
        }
      }

      // Check permissions if enabled
      if (this.config.enablePermissionChecking) {
        const permissionResult = await this.checkPermissions(normalizedPath, operation);
        if (!permissionResult.allowed) {
          return permissionResult;
        }
      }

      // Performance monitoring
      const duration = Date.now() - startTime;
      if (duration > this.config.performanceThresholdMs) {
        logger.warn({
          filePath,
          duration,
          threshold: this.config.performanceThresholdMs
        }, 'Security check exceeded performance threshold');
      }

      return {
        allowed: true,
        normalizedPath
      };

    } catch (error) {
      logger.error({ err: error, filePath }, 'Error during security check');
      return {
        allowed: false,
        reason: `Security check failed: ${error instanceof Error ? error.message : String(error)}`,
        securityViolation: true
      };
    }
  }

  /**
   * Secure directory reading with permission checking
   */
  async readDirSecure(dirPath: string): Promise<fsSync.Dirent[]> {
    const securityCheck = await this.checkPathSecurity(dirPath, 'read');

    if (!securityCheck.allowed) {
      throw new Error(`Access denied: ${securityCheck.reason}`);
    }

    const securePath = securityCheck.normalizedPath!;

    try {
      // Check if directory exists and is readable
      await fs.access(securePath, fsSync.constants.R_OK);

      // Read directory
      const entries = await fs.readdir(securePath, { withFileTypes: true });

      logger.debug({ path: securePath, entryCount: entries.length }, 'Directory read successfully');
      return entries;

    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const fsError = error as { code: string };

        if (fsError.code === 'ENOENT') {
          throw new Error(`Directory not found: ${dirPath}`);
        } else if (fsError.code === 'EACCES') {
          logger.warn({ path: securePath }, 'Permission denied for directory access');
          throw new Error(`Permission denied for directory: ${dirPath}`);
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, path: securePath }, `Error reading directory: ${errorMessage}`);
      throw new Error(`Could not read directory '${dirPath}': ${errorMessage}`);
    }
  }

  /**
   * Secure file stat with permission checking
   */
  async statSecure(filePath: string): Promise<fsSync.Stats> {
    const securityCheck = await this.checkPathSecurity(filePath, 'read');

    if (!securityCheck.allowed) {
      throw new Error(`Access denied: ${securityCheck.reason}`);
    }

    const securePath = securityCheck.normalizedPath!;

    try {
      const stats = await fs.stat(securePath);
      logger.debug({ path: securePath }, 'File stats retrieved successfully');
      return stats;

    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const fsError = error as { code: string };

        if (fsError.code === 'ENOENT') {
          throw new Error(`File not found: ${filePath}`);
        } else if (fsError.code === 'EACCES') {
          logger.warn({ path: securePath }, 'Permission denied for file access');
          throw new Error(`Permission denied for file: ${filePath}`);
        }
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, path: securePath }, `Error getting file stats: ${errorMessage}`);
      throw new Error(`Could not get stats for '${filePath}': ${errorMessage}`);
    }
  }

  /**
   * Normalize path for consistent comparison
   */
  private normalizePath(inputPath: string): string {
    try {
      return path.resolve(inputPath);
    } catch (error) {
      logger.warn({ inputPath, error }, 'Failed to normalize path');
      return inputPath;
    }
  }

  /**
   * Check if path is blacklisted
   */
  private isBlacklisted(normalizedPath: string): boolean {
    // Check system blacklist
    for (const blacklistedPath of SYSTEM_DIRECTORY_BLACKLIST) {
      if (this.isPathWithin(normalizedPath, blacklistedPath)) {
        return true;
      }
    }

    // Check additional blacklisted paths
    for (const blacklistedPath of this.config.additionalBlacklistedPaths) {
      if (this.isPathWithin(normalizedPath, blacklistedPath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if path is within allowed directories
   */
  private isWithinAllowedDirectories(normalizedPath: string): boolean {
    for (const allowedDir of this.config.allowedDirectories) {
      if (this.isPathWithin(normalizedPath, allowedDir)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if child path is within parent path
   */
  private isPathWithin(childPath: string, parentPath: string): boolean {
    const normalizedChild = path.resolve(childPath);
    const normalizedParent = path.resolve(parentPath);

    // Check for exact match
    if (normalizedChild === normalizedParent) {
      return true;
    }

    // Ensure parent path ends with separator for proper prefix matching
    const parentWithSep = normalizedParent.endsWith(path.sep)
      ? normalizedParent
      : normalizedParent + path.sep;

    return normalizedChild.startsWith(parentWithSep);
  }

  /**
   * Check if file extension is safe
   */
  private isSafeExtension(extension: string): boolean {
    return SAFE_FILE_EXTENSIONS.has(extension.toLowerCase()) ||
           this.config.additionalSafeExtensions.includes(extension.toLowerCase());
  }

  /**
   * Check file/directory permissions
   */
  private async checkPermissions(
    normalizedPath: string,
    operation: 'read' | 'write' | 'execute'
  ): Promise<SecurityCheckResult> {
    try {
      let accessMode: number;

      switch (operation) {
        case 'read':
          accessMode = fsSync.constants.R_OK;
          break;
        case 'write':
          accessMode = fsSync.constants.W_OK;
          break;
        case 'execute':
          accessMode = fsSync.constants.X_OK;
          break;
        default:
          accessMode = fsSync.constants.F_OK;
      }

      await fs.access(normalizedPath, accessMode);

      return {
        allowed: true,
        normalizedPath
      };

    } catch (error) {
      if (error instanceof Error && 'code' in error) {
        const fsError = error as { code: string };

        if (fsError.code === 'ENOENT') {
          return {
            allowed: false,
            reason: 'Path does not exist',
            normalizedPath,
            securityViolation: false
          };
        } else if (fsError.code === 'EACCES') {
          return {
            allowed: false,
            reason: `Permission denied for ${operation} operation`,
            normalizedPath,
            securityViolation: false
          };
        }
      }

      return {
        allowed: false,
        reason: `Permission check failed: ${error instanceof Error ? error.message : String(error)}`,
        normalizedPath,
        securityViolation: true
      };
    }
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<FilesystemSecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Filesystem security configuration updated');
  }

  /**
   * Get current security configuration
   */
  getConfig(): FilesystemSecurityConfig {
    return { ...this.config };
  }

  /**
   * Get security mode
   */
  getSecurityMode(): 'strict' | 'permissive' {
    return this.securityMode;
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    securityMode: string;
    blacklistedPathsCount: number;
    allowedDirectoriesCount: number;
    safeExtensionsCount: number;
  } {
    return {
      securityMode: this.securityMode,
      blacklistedPathsCount: SYSTEM_DIRECTORY_BLACKLIST.size + this.config.additionalBlacklistedPaths.length,
      allowedDirectoriesCount: this.config.allowedDirectories.length,
      safeExtensionsCount: SAFE_FILE_EXTENSIONS.size + this.config.additionalSafeExtensions.length
    };
  }

  /**
   * Add a path to the blacklist
   */
  addToBlacklist(pathToBlock: string): void {
    const normalizedPath = path.resolve(pathToBlock);
    if (!this.config.additionalBlacklistedPaths.includes(normalizedPath)) {
      this.config.additionalBlacklistedPaths.push(normalizedPath);
      logger.info({ path: normalizedPath }, 'Path added to blacklist');
    }
  }

  /**
   * Remove a path from the blacklist
   */
  removeFromBlacklist(pathToUnblock: string): void {
    const normalizedPath = path.resolve(pathToUnblock);
    const index = this.config.additionalBlacklistedPaths.indexOf(normalizedPath);
    if (index !== -1) {
      this.config.additionalBlacklistedPaths.splice(index, 1);
      logger.info({ path: normalizedPath }, 'Path removed from blacklist');
    }
  }
}
