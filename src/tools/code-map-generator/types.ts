/**
 * Type definitions for the Code-Map Generator tool.
 * This file contains interfaces for configuration, cache, and other shared types.
 */

import { SyntaxNode } from './parser.js';
import { FunctionInfo, ClassInfo, ImportInfo } from './codeMapModel.js';

/**
 * Interface for language-specific function detection handlers.
 */
export interface LanguageHandler {
  /**
   * Extracts functions from an AST node.
   * @param rootNode The root node to extract functions from.
   * @param sourceCode The source code string.
   * @param options Additional options for function extraction.
   * @returns Array of extracted function information.
   */
  extractFunctions(
    rootNode: SyntaxNode,
    sourceCode: string,
    options?: FunctionExtractionOptions
  ): FunctionInfo[];

  /**
   * Extracts classes from an AST node.
   * @param rootNode The root node to extract classes from.
   * @param sourceCode The source code string.
   * @param options Additional options for class extraction.
   * @returns Array of extracted class information.
   */
  extractClasses(
    rootNode: SyntaxNode,
    sourceCode: string,
    options?: ClassExtractionOptions
  ): ClassInfo[];

  /**
   * Extracts imports from an AST node.
   * @param rootNode The root node to extract imports from.
   * @param sourceCode The source code string.
   * @param options Additional options for import extraction.
   * @returns Array of extracted import information.
   */
  extractImports(
    rootNode: SyntaxNode,
    sourceCode: string,
    options?: ImportExtractionOptions
  ): ImportInfo[];

  /**
   * Detects the framework used in the source code.
   * @param sourceCode The source code string.
   * @returns The detected framework, if any.
   */
  detectFramework?(sourceCode: string): string | null;
}

/**
 * Options for function extraction.
 */
export interface FunctionExtractionOptions {
  /**
   * Whether to extract methods within a class.
   */
  isMethodExtraction?: boolean;

  /**
   * The name of the parent class if extracting methods.
   */
  className?: string;

  /**
   * Maximum depth for nested function analysis.
   */
  maxNestedFunctionDepth?: number;

  /**
   * Whether to enable context analysis.
   */
  enableContextAnalysis?: boolean;

  /**
   * Whether to enable role detection.
   */
  enableRoleDetection?: boolean;

  /**
   * Whether to enable heuristic naming.
   */
  enableHeuristicNaming?: boolean;
}

/**
 * Options for class extraction.
 */
export interface ClassExtractionOptions {
  /**
   * Whether to extract nested classes.
   */
  extractNestedClasses?: boolean;

  /**
   * Whether to extract methods within classes.
   */
  extractMethods?: boolean;

  /**
   * Whether to extract properties within classes.
   */
  extractProperties?: boolean;

  /**
   * Maximum depth for nested class analysis.
   */
  maxNestedClassDepth?: number;
}

/**
 * Options for import extraction.
 */
export interface ImportExtractionOptions {
  /**
   * Whether to resolve import paths to absolute paths.
   */
  resolveImportPaths?: boolean;

  /**
   * Whether to extract comments for imports.
   */
  extractComments?: boolean;
}

/**
 * Context information for function extraction.
 */
export interface FunctionContext {
  /**
   * The type of context (e.g., 'class', 'function', 'object').
   */
  type: string;

  /**
   * The name of the context (e.g., class name, function name).
   */
  name?: string;

  /**
   * The parent context, if any.
   */
  parent?: FunctionContext;
}

/**
 * Main configuration interface for the Code-Map Generator.
 */
export interface CodeMapGeneratorConfig {
  /**
   * Required absolute path to the directory that the code-map generator is allowed to scan.
   * This is a security boundary - the tool will not access files outside this directory.
   */
  allowedMappingDirectory: string;

  /**
   * Optional cache configuration for optimizing performance and memory usage.
   */
  cache?: CacheConfig;

  /**
   * Optional processing configuration for controlling batch sizes and memory usage.
   */
  processing?: ProcessingConfig;

  /**
   * Optional output configuration for controlling where and how output files are saved.
   */
  output?: OutputConfig;

  /**
   * Optional feature flags for enabling or disabling enhanced function detection features.
   */
  featureFlags?: FeatureFlagsConfig;
}

/**
 * Configuration for the file-based cache system.
 */
export interface CacheConfig {
  /**
   * Whether the cache is enabled. Default is true.
   */
  enabled: boolean;

  /**
   * Maximum number of entries to keep in the cache. Default is 10000.
   */
  maxEntries?: number;

  /**
   * Maximum age of cache entries in milliseconds. Default is 24 hours.
   */
  maxAge?: number;

  /**
   * Directory where cache files are stored. If not specified, defaults to
   * a '.cache' directory within the code-map-generator output directory.
   */
  cacheDir?: string;
}

/**
 * Configuration for processing options.
 */
export interface ProcessingConfig {
  /**
   * Number of files to process in each batch. Default is 100.
   */
  batchSize?: number;

  /**
   * Whether to log memory usage statistics during processing. Default is false.
   */
  logMemoryUsage?: boolean;

  /**
   * Maximum memory usage in MB before triggering garbage collection. Default is 1024 (1GB).
   */
  maxMemoryUsage?: number;
}

/**
 * Configuration for output options.
 */
export interface OutputConfig {
  /**
   * Directory where output files are saved. If not specified, defaults to
   * 'code-map-generator' within the VibeCoderOutput directory.
   */
  outputDir?: string;

  /**
   * Format for the output. Default is 'markdown'.
   */
  format?: 'markdown' | 'json';

  /**
   * Whether to split output into multiple files. Default is true.
   */
  splitOutput?: boolean;

  /**
   * Custom prefix for output filenames. Default is timestamp.
   */
  filePrefix?: string;
}

/**
 * Interface for directory structure paths.
 */
export interface DirectoryStructure {
  /**
   * Base output directory (VibeCoderOutput)
   */
  baseOutputDir: string;

  /**
   * Tool-specific output directory (VibeCoderOutput/code-map-generator)
   */
  outputDir: string;

  /**
   * Cache directory (VibeCoderOutput/code-map-generator/.cache)
   */
  cacheDir: string;

  /**
   * File info cache directory (VibeCoderOutput/code-map-generator/.cache/file-info)
   */
  fileInfoCacheDir: string;

  /**
   * Metadata cache directory (VibeCoderOutput/code-map-generator/.cache/metadata)
   */
  metadataCacheDir: string;

  /**
   * Temporary files directory (VibeCoderOutput/code-map-generator/.cache/temp)
   */
  tempDir: string;

  /**
   * Job-specific temporary directory (VibeCoderOutput/code-map-generator/.cache/temp/{jobId})
   */
  jobTempDir: string;
}

/**
 * Interface for path validation result.
 */
export interface PathValidationResult {
  /**
   * Whether the path is valid and within the allowed boundary.
   */
  isValid: boolean;

  /**
   * Error message if the path is invalid.
   */
  error?: string;

  /**
   * Normalized path if valid.
   */
  normalizedPath?: string;
}

/**
 * Configuration for feature flags.
 */
export interface FeatureFlagsConfig {
  /**
   * Whether to enable enhanced function detection.
   * This includes context-aware function naming, framework detection, and role identification.
   */
  enhancedFunctionDetection?: boolean;

  /**
   * Whether to enable context analysis for function detection.
   * This helps provide better names for anonymous functions based on their context.
   */
  contextAnalysis?: boolean;

  /**
   * Whether to enable framework detection.
   * This helps identify framework-specific patterns like React components, Express routes, etc.
   */
  frameworkDetection?: boolean;

  /**
   * Whether to enable role identification.
   * This helps identify function roles like event handlers, callbacks, etc.
   */
  roleIdentification?: boolean;

  /**
   * Whether to enable heuristic naming.
   * This helps provide better names for functions without explicit names.
   */
  heuristicNaming?: boolean;

  /**
   * Whether to enable memory optimization features.
   * This includes lazy grammar loading, AST caching, and incremental processing.
   */
  memoryOptimization?: boolean;
}
