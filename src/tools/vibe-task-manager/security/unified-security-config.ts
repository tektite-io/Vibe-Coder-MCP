/**
 * Unified Security Configuration Service for Vibe Task Manager
 *
 * This service coordinates all security components to ensure they use the same
 * MCP client-approved configuration. It follows the Code Map Generator pattern
 * for loading configuration from MCP client config.
 */

import path from 'path';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { extractVibeTaskManagerSecurityConfig } from '../utils/config-loader.js';
import logger from '../../../logger.js';
import { TransportContext } from '../../../index-with-setup.js';

/**
 * Path validation result for centralized security boundary validation
 */
export interface PathValidationResult {
  /** Whether the path is valid and safe */
  isValid: boolean;
  /** Normalized secure path */
  normalizedPath?: string;
  /** Error message if validation failed */
  error?: string;
  /** Security warnings */
  warnings?: string[];
  /** Type of security violation if any */
  violationType?: 'path_traversal' | 'outside_boundary' | 'invalid_path' | 'dangerous_characters' | 'invalid_extension';
}

/**
 * Path operation type for security validation
 */
export type PathOperation = 'read' | 'write';

/**
 * Centralized validation options
 */
export interface ValidationOptions {
  /** Operation type for boundary checking */
  operation?: PathOperation;
  /** Whether to allow test mode relaxations */
  allowTestMode?: boolean;
  /** Whether to check file extensions */
  checkExtensions?: boolean;
  /** Custom allowed extensions for this validation */
  allowedExtensions?: string[];
  /** Whether to perform strict validation */
  strictMode?: boolean;
}

/**
 * Unified security configuration that all security components should use
 */
export interface UnifiedSecurityConfiguration {
  // MCP-approved directories
  allowedReadDirectory: string;
  allowedWriteDirectory: string;

  // Security mode
  securityMode: 'strict' | 'permissive';

  // Derived configurations for different security components
  allowedDirectories: string[];

  // Performance settings
  performanceThresholdMs: number;

  // Security features
  enablePermissionChecking: boolean;
  enableBlacklist: boolean;
  enableExtensionFiltering: boolean;
  maxPathLength: number;

  // Code-map-generator compatibility aliases
  allowedDir?: string; // Alias for allowedReadDirectory
  outputDir?: string;  // Alias for allowedWriteDirectory

  // Service-specific boundaries
  serviceBoundaries: {
    vibeTaskManager: {
      readDir: string;
      writeDir: string;
    };
    codeMapGenerator: {
      allowedDir: string;
      outputDir: string;
    };
    contextCurator: {
      readDir: string;
      outputDir: string;
    };
  };
}

/**
 * Unified Security Configuration Manager
 *
 * This singleton service ensures all security components use the same
 * MCP client-approved configuration.
 */
export class UnifiedSecurityConfigManager {
  private static instance: UnifiedSecurityConfigManager | null = null;
  private config: UnifiedSecurityConfiguration | null = null;
  private mcpConfig: OpenRouterConfig | null = null;

  private constructor() {
    logger.info('Unified Security Configuration Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): UnifiedSecurityConfigManager {
    if (!UnifiedSecurityConfigManager.instance) {
      UnifiedSecurityConfigManager.instance = new UnifiedSecurityConfigManager();
    }
    return UnifiedSecurityConfigManager.instance;
  }

  /**
   * Resolve unified read directory based on priority chain
   * Priority: Auto-detection → VIBE_PROJECT_ROOT → MCP config → Legacy vars → Fallback
   */
  private resolveUnifiedReadDirectory(context?: TransportContext): string {
    try {
      // Priority 1: Auto-detection (only for CLI transport && enabled)
      if (context?.transportType === 'cli' && this.shouldUseAutoDetection()) {
        const autoDetected = context.workingDirectory || process.cwd();
        logger.info({ 
          autoDetected, 
          transportType: context.transportType,
          priorityUsed: 'auto-detection'
        }, 'Using auto-detected project root directory');
        return autoDetected;
      }

      // Priority 2: VIBE_PROJECT_ROOT environment variable
      const unifiedProjectRoot = process.env.VIBE_PROJECT_ROOT;
      if (unifiedProjectRoot?.trim()) {
        logger.info({ 
          unifiedProjectRoot,
          priorityUsed: 'env-var'
        }, 'Using VIBE_PROJECT_ROOT environment variable');
        return unifiedProjectRoot.trim();
      }

      // Priority 3: MCP client config
      if (context?.mcpClientConfig?.env?.VIBE_PROJECT_ROOT) {
        const mcpProjectRoot = context.mcpClientConfig.env.VIBE_PROJECT_ROOT;
        logger.info({ 
          mcpProjectRoot,
          priorityUsed: 'mcp-config'
        }, 'Using VIBE_PROJECT_ROOT from MCP client config');
        return mcpProjectRoot;
      }

      // Priority 4: Legacy environment variables
      const legacyTaskManagerDir = process.env.VIBE_TASK_MANAGER_READ_DIR;
      if (legacyTaskManagerDir?.trim()) {
        logger.warn({ 
          legacyTaskManagerDir,
          priorityUsed: 'legacy-task-manager'
        }, 'Using legacy VIBE_TASK_MANAGER_READ_DIR (consider migrating to VIBE_PROJECT_ROOT)');
        return legacyTaskManagerDir.trim();
      }

      const legacyCodeMapDir = process.env.CODE_MAP_ALLOWED_DIR;
      if (legacyCodeMapDir?.trim()) {
        logger.warn({ 
          legacyCodeMapDir,
          priorityUsed: 'legacy-code-map'
        }, 'Using legacy CODE_MAP_ALLOWED_DIR (consider migrating to VIBE_PROJECT_ROOT)');
        return legacyCodeMapDir.trim();
      }

      // Priority 5: Fallback to getProjectRootSafe() equivalent
      const fallbackDir = process.cwd();
      logger.warn({ 
        fallbackDir,
        priorityUsed: 'fallback'
      }, 'Using fallback directory (process.cwd()) - consider setting VIBE_PROJECT_ROOT');
      return fallbackDir;

    } catch (error) {
      logger.error({ err: error, context }, 'Error resolving unified read directory, using fallback');
      return process.cwd();
    }
  }

  /**
   * Check if auto-detection should be used
   */
  private shouldUseAutoDetection(): boolean {
    return process.env.VIBE_USE_PROJECT_ROOT_AUTO_DETECTION === 'true';
  }

  /**
   * Initialize the security configuration from MCP client config
   * This should be called during server startup
   */
  initializeFromMCPConfig(mcpConfig: OpenRouterConfig, transportContext?: TransportContext): void {
    this.mcpConfig = mcpConfig;

    try {
      // Use unified directory resolution for read directory
      const unifiedReadDirectory = this.resolveUnifiedReadDirectory(transportContext);
      
      // Extract security configuration using the same pattern as Code Map Generator
      const securityConfig = extractVibeTaskManagerSecurityConfig(mcpConfig);

      // Create unified configuration with resolved unified read directory
      this.config = {
        allowedReadDirectory: unifiedReadDirectory,
        allowedWriteDirectory: securityConfig.allowedWriteDirectory,
        securityMode: securityConfig.securityMode,

        // Derived configurations
        allowedDirectories: [
          unifiedReadDirectory,
          securityConfig.allowedWriteDirectory
        ],

        // Performance settings aligned with Epic 6.2 targets
        performanceThresholdMs: 50,

        // Security features based on mode
        enablePermissionChecking: true,
        enableBlacklist: true,
        enableExtensionFiltering: securityConfig.securityMode === 'strict',
        maxPathLength: 4096,

        // Code-map-generator compatibility aliases
        allowedDir: unifiedReadDirectory,
        outputDir: securityConfig.allowedWriteDirectory,

        // Service-specific boundaries for all services
        serviceBoundaries: {
          vibeTaskManager: {
            readDir: unifiedReadDirectory,
            writeDir: securityConfig.allowedWriteDirectory
          },
          codeMapGenerator: {
            allowedDir: unifiedReadDirectory,
            outputDir: securityConfig.allowedWriteDirectory
          },
          contextCurator: {
            readDir: unifiedReadDirectory,
            outputDir: securityConfig.allowedWriteDirectory
          }
        }
      };

      logger.info({
        allowedReadDirectory: this.config.allowedReadDirectory,
        allowedWriteDirectory: this.config.allowedWriteDirectory,
        securityMode: this.config.securityMode,
        allowedDirectories: this.config.allowedDirectories
      }, 'Unified security configuration initialized from MCP client config');

    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize security configuration from MCP client config');
      throw error;
    }
  }

  /**
   * Check if the security configuration has been initialized
   */
  isInitialized(): boolean {
    return this.config !== null;
  }

  /**
   * Get the unified security configuration
   * Throws error if not initialized
   */
  getConfig(): UnifiedSecurityConfiguration {
    if (!this.config) {
      throw new Error('Unified security configuration not initialized. Call initializeFromMCPConfig() first.');
    }
    return { ...this.config };
  }

  /**
   * Get configuration for FilesystemSecurity component
   */
  getFilesystemSecurityConfig(): {
    allowedDirectories: string[];
    securityMode: 'strict' | 'permissive';
    enablePermissionChecking: boolean;
    enableBlacklist: boolean;
    enableExtensionFiltering: boolean;
    maxPathLength: number;
    performanceThresholdMs: number;
  } {
    const config = this.getConfig();
    return {
      allowedDirectories: config.allowedDirectories,
      securityMode: config.securityMode,
      enablePermissionChecking: config.enablePermissionChecking,
      enableBlacklist: config.enableBlacklist,
      enableExtensionFiltering: config.enableExtensionFiltering,
      maxPathLength: config.maxPathLength,
      performanceThresholdMs: config.performanceThresholdMs
    };
  }

  /**
   * Get configuration for PathSecurityValidator component
   */
  getPathValidatorConfig(): {
    allowedDirectories: string[];
    maxPathLength: number;
  } {
    const config = this.getConfig();
    return {
      allowedDirectories: config.allowedDirectories,
      maxPathLength: config.maxPathLength
    };
  }

  /**
   * Get configuration for SecurityConfigManager component
   */
  getSecurityManagerConfig(): {
    pathSecurity: {
      allowedDirectories: string[];
    };
    strictMode: boolean;
    performanceThresholdMs: number;
  } {
    const config = this.getConfig();
    return {
      pathSecurity: {
        allowedDirectories: config.allowedDirectories
      },
      strictMode: config.securityMode === 'strict',
      performanceThresholdMs: config.performanceThresholdMs
    };
  }

  /**
   * Get configuration for Code Map Generator (compatibility)
   */
  getCodeMapGeneratorConfig(): {
    allowedDir: string;
    outputDir: string;
    securityMode: 'strict' | 'permissive';
  } {
    const config = this.getConfig();
    return {
      allowedDir: config.allowedReadDirectory,
      outputDir: config.allowedWriteDirectory,
      securityMode: config.securityMode
    };
  }

  /**
   * Get configuration for Context Curator
   */
  getContextCuratorConfig(): {
    readDir: string;
    outputDir: string;
    allowedDirectories: string[];
    securityMode: 'strict' | 'permissive';
  } {
    const config = this.getConfig();
    return {
      readDir: config.allowedReadDirectory,
      outputDir: config.allowedWriteDirectory,
      allowedDirectories: config.allowedDirectories,
      securityMode: config.securityMode
    };
  }

  /**
   * Get configuration for Vibe Task Manager Security Validator
   */
  getVibeTaskManagerSecurityValidatorConfig(): {
    readDir: string;
    writeDir: string;
    securityMode: 'strict' | 'permissive';
  } {
    const config = this.getConfig();
    return {
      readDir: config.allowedReadDirectory,
      writeDir: config.allowedWriteDirectory,
      securityMode: config.securityMode
    };
  }

  /**
   * Get service-specific boundaries
   */
  getServiceBoundaries(serviceName: 'vibeTaskManager' | 'codeMapGenerator' | 'contextCurator'): {
    readDir?: string;
    writeDir?: string;
    allowedDir?: string;
    outputDir?: string;
  } {
    const config = this.getConfig();
    const boundaries = config.serviceBoundaries[serviceName];

    if (!boundaries) {
      throw new Error(`Service boundaries not found for service: ${serviceName}`);
    }

    return boundaries;
  }

  /**
   * Validate that a path is within allowed directories
   */
  isPathAllowed(filePath: string, operation: 'read' | 'write' = 'read'): boolean {
    const config = this.getConfig();

    try {
      const resolvedPath = path.resolve(filePath);

      if (operation === 'read') {
        return resolvedPath.startsWith(config.allowedReadDirectory);
      } else {
        return resolvedPath.startsWith(config.allowedWriteDirectory);
      }
    } catch (error) {
      logger.error({ err: error, filePath, operation }, 'Error validating path');
      return false;
    }
  }

  // ========================================================================
  // CENTRALIZED SECURITY BOUNDARY VALIDATION METHODS
  // ========================================================================

  /**
   * Centralized path normalization that handles cross-platform compatibility
   * and security concerns. Consolidates logic from multiple path utilities.
   * @param inputPath The path to normalize
   * @returns The normalized absolute path
   */
  normalizePath(inputPath: string): string {
    // Handle empty or undefined paths
    if (!inputPath || typeof inputPath !== 'string') {
      throw new Error('Path cannot be empty, undefined, or non-string');
    }

    try {
      // Remove dangerous characters that could indicate path injection
      // eslint-disable-next-line no-control-regex
      const sanitized = inputPath.replace(/[<>:"|?*\x00-\x1f]/g, '');
      
      // Normalize the path to resolve '..' and '.' segments
      const normalizedPath = path.normalize(sanitized);
      
      // Special handling for test paths to avoid path resolution issues in tests
      const isTestMode = process.env.NODE_ENV === 'test';
      if (isTestMode && (normalizedPath.includes('/tmp/') || normalizedPath.includes('temp/'))) {
        if (path.isAbsolute(normalizedPath)) {
          logger.debug(`Using test path as-is: ${normalizedPath}`);
          return normalizedPath;
        }
      }

      // Resolve to absolute path if it's relative
      return path.isAbsolute(normalizedPath)
        ? normalizedPath
        : path.resolve(normalizedPath);
        
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Path normalization failed: ${errorMessage}`);
    }
  }

  /**
   * Centralized path containment validation that checks if a child path
   * is within a parent path. Handles cross-platform path separators.
   * @param childPath The path to check
   * @param parentPath The potential parent path
   * @returns True if childPath is within parentPath or equal to it
   */
  isPathWithin(childPath: string, parentPath: string): boolean {
    try {
      const normalizedChild = this.normalizePath(childPath);
      const normalizedParent = this.normalizePath(parentPath);

      // Check for exact match first
      if (normalizedChild === normalizedParent) {
        return true;
      }

      // Ensure parent path ends with separator for proper prefix matching
      const separator = path.sep;
      const parentWithSep = normalizedParent.endsWith(separator)
        ? normalizedParent
        : normalizedParent + separator;

      // Check if child starts with parent (prefix match)
      return normalizedChild.startsWith(parentWithSep);
      
    } catch (error) {
      logger.error({ err: error, childPath, parentPath }, 'Error checking path containment');
      return false;
    }
  }

  /**
   * Centralized comprehensive path security validation that consolidates
   * all security checks from various path utilities across the codebase.
   * @param inputPath The path to validate
   * @param options Validation options including operation type and strictness
   * @returns Detailed validation result with security information
   */
  validatePathSecurity(inputPath: string, options: ValidationOptions = {}): PathValidationResult {
    const {
      operation = 'read',
      allowTestMode = true,
      checkExtensions = false,
      allowedExtensions = ['.md', '.json', '.txt', '.yaml', '.yml', '.js', '.ts'],
      strictMode = true
    } = options;

    try {
      const config = this.getConfig();
      const isTestMode = process.env.NODE_ENV === 'test';

      // Step 1: Basic input validation
      if (!inputPath || typeof inputPath !== 'string' || inputPath.trim() === '') {
        return {
          isValid: false,
          error: 'Path cannot be empty, undefined, or non-string',
          violationType: 'invalid_path'
        };
      }

      // Step 2: Check for dangerous characters (path injection prevention)
      // eslint-disable-next-line no-control-regex
      const dangerousChars = /[<>:"|?*\x00-\x1f]/;
      if (strictMode && dangerousChars.test(inputPath)) {
        return {
          isValid: false,
          error: `Path contains dangerous characters: ${inputPath}`,
          violationType: 'dangerous_characters'
        };
      }

      // Step 3: Check for path traversal attempts
      if (inputPath.includes('..') && strictMode) {
        const normalizedTest = path.normalize(inputPath);
        if (normalizedTest.includes('..')) {
          return {
            isValid: false,
            error: `Path traversal detected: ${inputPath}`,
            violationType: 'path_traversal'
          };
        }
      }

      // Step 4: Normalize the path
      let normalizedPath: string;
      try {
        normalizedPath = this.normalizePath(inputPath);
      } catch (error) {
        return {
          isValid: false,
          error: `Path normalization failed: ${error instanceof Error ? error.message : String(error)}`,
          violationType: 'invalid_path'
        };
      }

      // Step 5: Check path length
      if (normalizedPath.length > config.maxPathLength) {
        const multiplier = isTestMode && allowTestMode ? 2 : 1;
        if (normalizedPath.length > config.maxPathLength * multiplier) {
          return {
            isValid: false,
            error: `Path length ${normalizedPath.length} exceeds maximum ${config.maxPathLength * multiplier}`,
            violationType: 'invalid_path'
          };
        }
      }

      // Step 6: Check file extension if requested
      if (checkExtensions) {
        const ext = path.extname(normalizedPath).toLowerCase();
        if (ext && !allowedExtensions.includes(ext)) {
          // Allow relaxed extension validation in test mode
          if (!(isTestMode && allowTestMode)) {
            return {
              isValid: false,
              error: `File extension '${ext}' not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`,
              violationType: 'invalid_extension'
            };
          }
        }
      }

      // Step 7: Validate against security boundaries
      const allowedDirectory = operation === 'read' 
        ? config.allowedReadDirectory 
        : config.allowedWriteDirectory;

      if (!allowedDirectory) {
        return {
          isValid: false,
          error: `Security boundary not configured for ${operation} operations`,
          violationType: 'outside_boundary'
        };
      }

      // Step 8: Check boundary containment
      if (!this.isPathWithin(normalizedPath, allowedDirectory)) {
        // Allow test paths in test mode
        if (isTestMode && allowTestMode) {
          const testPaths = ['/tmp', path.join(process.cwd(), '__tests__'), path.join(process.cwd(), 'test')];
          const isTestPath = testPaths.some(testPath => this.isPathWithin(normalizedPath, testPath));
          
          if (isTestPath) {
            logger.debug(`Allowing test path: ${normalizedPath}`);
            return {
              isValid: true,
              normalizedPath,
              warnings: [`Test mode: Path outside normal boundaries but within test paths`]
            };
          }
        }

        return {
          isValid: false,
          error: `Access denied: Path '${inputPath}' is outside the allowed ${operation} directory '${allowedDirectory}'`,
          violationType: 'outside_boundary'
        };
      }

      // Path is valid
      return {
        isValid: true,
        normalizedPath
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, inputPath, options }, 'Unexpected error during path validation');
      return {
        isValid: false,
        error: `Validation error: ${errorMessage}`,
        violationType: 'invalid_path'
      };
    }
  }

  /**
   * Creates a secure path within the appropriate directory boundary.
   * Consolidates secure path creation logic from various utilities.
   * @param inputPath The path to secure
   * @param operation The operation type (read or write)
   * @param options Additional validation options
   * @returns The secure path if valid, throws an error otherwise
   */
  createSecurePath(inputPath: string, operation: PathOperation = 'read', options: ValidationOptions = {}): string {
    const validation = this.validatePathSecurity(inputPath, { ...options, operation });
    
    if (!validation.isValid) {
      const errorMsg = `Security violation: ${validation.error}`;
      logger.error({ inputPath, operation, validation }, errorMsg);
      throw new Error(errorMsg);
    }

    return validation.normalizedPath!;
  }

  /**
   * Validates path for specific operation with detailed result.
   * Provides backward compatibility with existing security validators.
   * @param inputPath The path to validate
   * @param operation The operation type
   * @param options Additional validation options
   * @returns Detailed validation result
   */
  isPathAllowedForOperation(inputPath: string, operation: PathOperation, options: ValidationOptions = {}): PathValidationResult {
    return this.validatePathSecurity(inputPath, { ...options, operation });
  }

  /**
   * Batch validation for multiple paths (performance optimization)
   * @param paths Array of paths to validate
   * @param operation Operation type for all paths
   * @param options Validation options
   * @returns Map of path to validation result
   */
  validateMultiplePaths(
    paths: string[], 
    operation: PathOperation = 'read', 
    options: ValidationOptions = {}
  ): Map<string, PathValidationResult> {
    const results = new Map<string, PathValidationResult>();
    
    for (const inputPath of paths) {
      try {
        const result = this.validatePathSecurity(inputPath, { ...options, operation });
        results.set(inputPath, result);
      } catch (error) {
        results.set(inputPath, {
          isValid: false,
          error: `Batch validation error: ${error instanceof Error ? error.message : String(error)}`,
          violationType: 'invalid_path'
        });
      }
    }
    
    return results;
  }

  /**
   * Get configuration status for debugging
   */
  getConfigStatus(): {
    initialized: boolean;
    mcpConfigPresent: boolean;
    allowedReadDirectory?: string;
    allowedWriteDirectory?: string;
    securityMode?: string;
  } {
    return {
      initialized: this.config !== null,
      mcpConfigPresent: this.mcpConfig !== null,
      allowedReadDirectory: this.config?.allowedReadDirectory,
      allowedWriteDirectory: this.config?.allowedWriteDirectory,
      securityMode: this.config?.securityMode
    };
  }

  // ========================================================================
  // BACKWARD COMPATIBILITY METHODS FOR EXISTING PATH UTILITIES
  // ========================================================================

  /**
   * Backward compatibility method for existing pathUtils.validatePathSecurity()
   * @param inputPath The path to validate
   * @param allowedDirectory The allowed directory (ignored in favor of centralized config)
   * @returns Compatible validation result
   */
  validatePathSecurityCompat(
    inputPath: string, 
    allowedDirectory?: string
  ): { isValid: boolean; normalizedPath?: string; error?: string } {
    // Log warning if allowedDirectory is provided (should use centralized config)
    if (allowedDirectory) {
      logger.warn({
        inputPath,
        providedAllowedDirectory: allowedDirectory,
        centralizedDirectory: this.getConfig().allowedReadDirectory
      }, 'Path validation using deprecated allowedDirectory parameter. Consider using centralized configuration.');
    }

    const result = this.validatePathSecurity(inputPath, { operation: 'read' });
    return {
      isValid: result.isValid,
      normalizedPath: result.normalizedPath,
      error: result.error
    };
  }

  /**
   * Backward compatibility method for existing SecurityBoundaryValidator.createSecureReadPath()
   * @param filePath The path to secure for reading
   * @returns The secure read path
   */
  createSecureReadPath(filePath: string): string {
    return this.createSecurePath(filePath, 'read');
  }

  /**
   * Backward compatibility method for existing SecurityBoundaryValidator.createSecureWritePath()
   * @param filePath The path to secure for writing
   * @returns The secure write path
   */
  createSecureWritePath(filePath: string): string {
    return this.createSecurePath(filePath, 'write');
  }

  /**
   * Backward compatibility method for existing VibeTaskManagerSecurityValidator.isPathWithinReadDirectory()
   * @param filePath The path to check
   * @returns Whether the path is within the read directory
   */
  isPathWithinReadDirectory(filePath: string): boolean {
    const result = this.isPathAllowedForOperation(filePath, 'read');
    return result.isValid;
  }

  /**
   * Backward compatibility method for existing VibeTaskManagerSecurityValidator.isPathWithinWriteDirectory()
   * @param filePath The path to check
   * @returns Whether the path is within the write directory
   */
  isPathWithinWriteDirectory(filePath: string): boolean {
    const result = this.isPathAllowedForOperation(filePath, 'write');
    return result.isValid;
  }

  /**
   * Enhanced method for existing PathSecurityValidator with test mode support
   * @param inputPath The path to validate
   * @param config Optional path security config (merged with centralized config)
   * @returns Enhanced validation result
   */
  validatePathWithConfig(
    inputPath: string,
    config?: {
      allowedExtensions?: string[];
      maxPathLength?: number;
      allowSymlinks?: boolean;
      strictMode?: boolean;
    }
  ): PathValidationResult {
    const options: ValidationOptions = {
      operation: 'read',
      checkExtensions: true,
      allowedExtensions: config?.allowedExtensions,
      strictMode: config?.strictMode ?? true
    };

    return this.validatePathSecurity(inputPath, options);
  }

  /**
   * Reset configuration (for testing purposes)
   */
  reset(): void {
    this.config = null;
    this.mcpConfig = null;
    logger.debug('Unified security configuration reset');
  }

  // ========================================================================
  // TOOL-SPECIFIC CONVENIENCE METHODS
  // ========================================================================

  /**
   * Get the base output directory for tools that only write files.
   * This is a convenience method for tools that don't need read access.
   * @returns The configured output directory path
   */
  getToolOutputDirectory(): string {
    const config = this.getConfig();
    return config.allowedWriteDirectory;
  }

  /**
   * Validate and create a secure output path for tool-generated files.
   * This is a convenience method for tools that only write to the output directory.
   * @param relativePath The relative path within the output directory
   * @returns The secure absolute path
   * @throws Error if the path is invalid or outside boundaries
   */
  createSecureToolOutputPath(relativePath: string): string {
    const config = this.getConfig();
    const outputPath = path.join(config.allowedWriteDirectory, relativePath);
    return this.createSecurePath(outputPath, 'write');
  }

  /**
   * Check if a tool output directory exists and is writable.
   * @param toolName The name of the tool (used for subdirectory)
   * @returns Promise resolving to the tool directory path
   */
  async ensureToolOutputDirectory(toolName: string): Promise<string> {
    const config = this.getConfig();
    const toolDir = path.join(config.allowedWriteDirectory, toolName);
    
    // Validate the path is within boundaries
    const validation = this.validatePathSecurity(toolDir, { operation: 'write' });
    if (!validation.isValid) {
      throw new Error(`Invalid tool directory: ${validation.error}`);
    }

    // Ensure directory exists
    try {
      const fs = await import('fs-extra');
      await fs.ensureDir(toolDir);
      logger.debug({ toolName, toolDir }, 'Ensured tool output directory exists');
      return toolDir;
    } catch (error) {
      logger.error({ err: error, toolName, toolDir }, 'Failed to ensure tool output directory');
      throw new Error(`Failed to create tool output directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get environment variable value with fallback.
   * Convenience method for tools that need to check environment variables.
   * @param varName The environment variable name
   * @param fallback The fallback value if not set
   * @returns The environment variable value or fallback
   */
  getEnvironmentVariable(varName: string, fallback?: string): string | undefined {
    return process.env[varName] || fallback;
  }
}

/**
 * Convenience function to get the unified security configuration manager
 */
export function getUnifiedSecurityConfig(): UnifiedSecurityConfigManager {
  return UnifiedSecurityConfigManager.getInstance();
}

// ========================================================================
// CENTRALIZED SECURITY VALIDATION CONVENIENCE FUNCTIONS
// ========================================================================

/**
 * Centralized path validation function that all path utilities should use.
 * Provides a single point of truth for security boundary validation.
 * @param inputPath The path to validate
 * @param options Validation options
 * @returns Detailed validation result
 */
export function validatePathSecurity(inputPath: string, options: ValidationOptions = {}): PathValidationResult {
  return getUnifiedSecurityConfig().validatePathSecurity(inputPath, options);
}

/**
 * Centralized secure path creation function.
 * @param inputPath The path to secure
 * @param operation The operation type (read or write)
 * @param options Additional validation options
 * @returns The secure path if valid, throws an error otherwise
 */
export function createSecurePath(inputPath: string, operation: PathOperation = 'read', options: ValidationOptions = {}): string {
  return getUnifiedSecurityConfig().createSecurePath(inputPath, operation, options);
}

/**
 * Centralized path normalization function.
 * @param inputPath The path to normalize
 * @returns The normalized absolute path
 */
export function normalizePath(inputPath: string): string {
  return getUnifiedSecurityConfig().normalizePath(inputPath);
}

/**
 * Centralized path containment validation function.
 * @param childPath The path to check
 * @param parentPath The potential parent path
 * @returns True if childPath is within parentPath
 */
export function isPathWithin(childPath: string, parentPath: string): boolean {
  return getUnifiedSecurityConfig().isPathWithin(childPath, parentPath);
}

/**
 * Check if a path is allowed for a specific operation.
 * @param inputPath The path to check
 * @param operation The operation type
 * @param options Additional validation options
 * @returns Whether the path is allowed
 */
export function isPathAllowed(inputPath: string, operation: PathOperation = 'read', options: ValidationOptions = {}): boolean {
  const result = getUnifiedSecurityConfig().isPathAllowedForOperation(inputPath, operation, options);
  return result.isValid;
}

/**
 * Validate multiple paths in batch for performance.
 * @param paths Array of paths to validate
 * @param operation Operation type for all paths
 * @param options Validation options
 * @returns Map of path to validation result
 */
export function validateMultiplePaths(
  paths: string[], 
  operation: PathOperation = 'read', 
  options: ValidationOptions = {}
): Map<string, PathValidationResult> {
  return getUnifiedSecurityConfig().validateMultiplePaths(paths, operation, options);
}

// ========================================================================
// BACKWARD COMPATIBILITY EXPORTS FOR EXISTING PATH UTILITIES
// ========================================================================

/**
 * Backward compatibility export for existing pathUtils
 * @deprecated Use validatePathSecurity() instead
 */
export function validatePathSecurityCompat(
  inputPath: string, 
  allowedDirectory?: string
): { isValid: boolean; normalizedPath?: string; error?: string } {
  return getUnifiedSecurityConfig().validatePathSecurityCompat(inputPath, allowedDirectory);
}

/**
 * Backward compatibility export for existing SecurityBoundaryValidator
 * @deprecated Use createSecurePath(path, 'read') instead
 */
export function createSecureReadPath(filePath: string): string {
  return getUnifiedSecurityConfig().createSecureReadPath(filePath);
}

/**
 * Backward compatibility export for existing SecurityBoundaryValidator
 * @deprecated Use createSecurePath(path, 'write') instead
 */
export function createSecureWritePath(filePath: string): string {
  return getUnifiedSecurityConfig().createSecureWritePath(filePath);
}

/**
 * Backward compatibility export for existing VibeTaskManagerSecurityValidator
 * @deprecated Use isPathAllowed(path, 'read') instead
 */
export function isPathWithinReadDirectory(filePath: string): boolean {
  return getUnifiedSecurityConfig().isPathWithinReadDirectory(filePath);
}

/**
 * Backward compatibility export for existing VibeTaskManagerSecurityValidator
 * @deprecated Use isPathAllowed(path, 'write') instead
 */
export function isPathWithinWriteDirectory(filePath: string): boolean {
  return getUnifiedSecurityConfig().isPathWithinWriteDirectory(filePath);
}

// ========================================================================
// TOOL-SPECIFIC CONVENIENCE EXPORTS
// ========================================================================

/**
 * Get the base output directory for tools that only write files.
 * Convenience export for tools migrating to centralized security.
 */
export function getToolOutputDirectory(): string {
  return getUnifiedSecurityConfig().getToolOutputDirectory();
}

/**
 * Create a secure output path for tool-generated files.
 * Convenience export for tools migrating to centralized security.
 */
export function createSecureToolOutputPath(relativePath: string): string {
  return getUnifiedSecurityConfig().createSecureToolOutputPath(relativePath);
}

/**
 * Ensure a tool's output directory exists.
 * Convenience export for tools migrating to centralized security.
 */
export async function ensureToolOutputDirectory(toolName: string): Promise<string> {
  return getUnifiedSecurityConfig().ensureToolOutputDirectory(toolName);
}
