/**
 * Type definitions for the Code-Map Generator tool.
 * This file contains interfaces for configuration, cache, and other shared types.
 */

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
