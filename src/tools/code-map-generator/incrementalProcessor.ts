/**
 * Incremental processor for the code-map generator.
 * This module handles incremental processing of files based on changes since the last run.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import crypto from 'crypto';
import logger from '../../logger.js';
import { CodeMapGeneratorConfig, IncrementalProcessingConfig } from './types.js';
import { FileCache } from './cache/fileCache.js';
import { getCacheDirectory } from './directoryUtils.js';

/**
 * Interface for file metadata used for change detection.
 */
interface FileMetadata {
  /**
   * File path.
   */
  filePath: string;

  /**
   * File size in bytes.
   */
  size: number;

  /**
   * Last modification time.
   */
  mtime: number;

  /**
   * File hash (if enabled).
   */
  hash?: string;

  /**
   * Last processed time.
   */
  processedAt: number;
}

/**
 * Class for handling incremental processing.
 */
export class IncrementalProcessor {
  private config: IncrementalProcessingConfig;
  private fileMetadataCache: FileCache<FileMetadata> | null = null;
  private previouslyProcessedFiles: Set<string> = new Set();
  private currentProcessedFiles: Set<string> = new Set();
  private allowedDir: string;
  private cacheDir: string;

  /**
   * Constructor for the incremental processor.
   * @param config The incremental processing configuration.
   * @param allowedDir The allowed mapping directory.
   * @param cacheDir The cache directory.
   */
  constructor(config: IncrementalProcessingConfig, allowedDir: string, cacheDir: string) {
    this.config = config;
    this.allowedDir = allowedDir;
    this.cacheDir = cacheDir;
  }

  /**
   * Initialize the incremental processor.
   */
  async initialize(): Promise<void> {
    // Initialize file metadata cache
    this.fileMetadataCache = new FileCache<FileMetadata>({
      name: 'file-metadata',
      cacheDir: path.join(this.cacheDir, 'file-metadata'),
      maxEntries: this.config.maxCachedHashes || 10000,
      maxAge: this.config.maxHashAge || 24 * 60 * 60 * 1000, // 24 hours
    });

    // Load previously processed files
    await this.loadPreviouslyProcessedFiles();

    logger.info('Incremental processor initialized');
  }

  /**
   * Load the list of previously processed files.
   */
  private async loadPreviouslyProcessedFiles(): Promise<void> {
    const previousFilesListPath = this.config.previousFilesListPath || path.join(this.cacheDir, 'processed-files.json');

    try {
      if (fsSync.existsSync(previousFilesListPath)) {
        const fileContent = await fs.readFile(previousFilesListPath, 'utf-8');
        const filesList = JSON.parse(fileContent) as string[];
        this.previouslyProcessedFiles = new Set(filesList);
        logger.info(`Loaded ${filesList.length} previously processed files from ${previousFilesListPath}`);
      } else {
        logger.info(`No previously processed files list found at ${previousFilesListPath}`);
      }
    } catch (error) {
      logger.warn(`Error loading previously processed files: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save the list of processed files for the next run.
   */
  async saveProcessedFilesList(): Promise<void> {
    if (!this.config.saveProcessedFilesList) {
      logger.debug('Skipping saving processed files list (disabled in config)');
      return;
    }

    const previousFilesListPath = this.config.previousFilesListPath || path.join(this.cacheDir, 'processed-files.json');

    try {
      const filesList = Array.from(this.currentProcessedFiles);
      await fs.writeFile(previousFilesListPath, JSON.stringify(filesList), 'utf-8');
      logger.info(`Saved ${filesList.length} processed files to ${previousFilesListPath}`);
    } catch (error) {
      logger.warn(`Error saving processed files list: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if a file has changed since the last run.
   * @param filePath The file path to check.
   * @returns True if the file has changed, false otherwise.
   */
  async hasFileChanged(filePath: string): Promise<boolean> {
    if (!this.fileMetadataCache) {
      logger.warn('File metadata cache not initialized');
      return true;
    }

    // If the file wasn't processed before, it's considered changed
    if (!this.previouslyProcessedFiles.has(filePath)) {
      logger.debug(`File ${filePath} was not processed before`);
      return true;
    }

    try {
      // Get current file stats
      const stats = await fs.stat(filePath);

      // Get cached metadata
      const cachedMetadata = await this.fileMetadataCache.get(filePath);

      if (!cachedMetadata) {
        logger.debug(`No cached metadata for ${filePath}`);
        return true;
      }

      // Check if file size has changed
      if (stats.size !== cachedMetadata.size) {
        logger.debug(`File size changed for ${filePath}: ${cachedMetadata.size} -> ${stats.size}`);
        return true;
      }

      // Check if modification time has changed
      if (stats.mtimeMs > cachedMetadata.mtime) {
        logger.debug(`File modification time changed for ${filePath}: ${new Date(cachedMetadata.mtime).toISOString()} -> ${new Date(stats.mtimeMs).toISOString()}`);
        return true;
      }

      // If file hash checking is enabled, compute and compare hashes
      if (this.config.useFileHashes) {
        const currentHash = await this.computeFileHash(filePath);
        if (currentHash !== cachedMetadata.hash) {
          logger.debug(`File hash changed for ${filePath}: ${cachedMetadata.hash} -> ${currentHash}`);
          return true;
        }
      }

      // File hasn't changed
      logger.debug(`File ${filePath} hasn't changed since last run`);
      return false;
    } catch (error) {
      logger.warn(`Error checking if file ${filePath} has changed: ${error instanceof Error ? error.message : String(error)}`);
      return true;
    }
  }

  /**
   * Compute the hash of a file.
   * @param filePath The file path.
   * @returns The file hash.
   */
  private async computeFileHash(filePath: string): Promise<string> {
    try {
      const fileContent = await fs.readFile(filePath);
      return crypto.createHash('md5').update(fileContent).digest('hex');
    } catch (error) {
      logger.warn(`Error computing hash for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  /**
   * Update the metadata for a file.
   * @param filePath The file path.
   */
  async updateFileMetadata(filePath: string): Promise<void> {
    if (!this.fileMetadataCache) {
      logger.warn('File metadata cache not initialized');
      return;
    }

    try {
      // Get current file stats
      const stats = await fs.stat(filePath);

      // Create metadata object
      const metadata: FileMetadata = {
        filePath,
        size: stats.size,
        mtime: stats.mtimeMs,
        processedAt: Date.now(),
      };

      // Add hash if enabled
      if (this.config.useFileHashes) {
        metadata.hash = await this.computeFileHash(filePath);
      }

      // Update cache
      await this.fileMetadataCache.set(filePath, metadata);

      // Add to current processed files
      this.currentProcessedFiles.add(filePath);
    } catch (error) {
      logger.warn(`Error updating metadata for ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Filter a list of files to only include those that have changed since the last run.
   * @param filePaths The list of file paths to filter.
   * @returns The filtered list of file paths.
   */
  async filterChangedFiles(filePaths: string[]): Promise<string[]> {
    if (!this.config.useFileHashes && !this.config.useFileMetadata) {
      logger.info('Incremental processing is enabled but neither file hashes nor file metadata are used for change detection. Processing all files.');
      return filePaths;
    }

    const changedFiles: string[] = [];

    for (const filePath of filePaths) {
      if (await this.hasFileChanged(filePath)) {
        changedFiles.push(filePath);
      }
    }

    logger.info(`Filtered ${filePaths.length} files to ${changedFiles.length} changed files`);
    return changedFiles;
  }

  /**
   * Close the incremental processor and save the processed files list.
   */
  async close(): Promise<void> {
    await this.saveProcessedFilesList();

    if (this.fileMetadataCache) {
      await this.fileMetadataCache.close();
    }

    logger.info('Incremental processor closed');
  }
}

/**
 * Create an incremental processor instance.
 * @param config The code map generator configuration.
 * @returns The incremental processor instance, or null if incremental processing is disabled.
 */
export async function createIncrementalProcessor(config: CodeMapGeneratorConfig): Promise<IncrementalProcessor | null> {
  if (!config.processing?.incremental) {
    logger.info('Incremental processing is disabled');
    return null;
  }

  if (!config.processing.incrementalConfig) {
    logger.warn('Incremental processing is enabled but no configuration is provided');
    return null;
  }

  // Get cache directory - either from config or compute it
  const cacheDir = config.cache?.cacheDir || getCacheDirectory(config);
  if (!cacheDir) {
    logger.warn('Incremental processing is enabled but no cache directory is available');
    return null;
  }

  const processor = new IncrementalProcessor(
    config.processing.incrementalConfig,
    config.allowedMappingDirectory,
    cacheDir
  );

  await processor.initialize();
  return processor;
}
