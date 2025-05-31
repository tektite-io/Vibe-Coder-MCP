/**
 * File Search Engine - Core implementation
 *
 * High-performance file search with multiple strategies and caching.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
import { CacheManager } from './cache-manager.js';
import {
  FileSearchOptions,
  FileSearchResult,
  SearchMetrics,
  SearchStrategy,
  FuzzyMatcher,
  GlobMatcher
} from './search-strategies.js';

/**
 * File Search Engine implementation
 */
export class FileSearchService {
  private static instance: FileSearchService;
  private cacheManager: CacheManager;
  private searchMetrics: SearchMetrics;

  private constructor() {
    this.cacheManager = new CacheManager({
      maxEntries: 1000,
      defaultTtl: 5 * 60 * 1000, // 5 minutes
      maxMemoryUsage: 50 * 1024 * 1024, // 50MB
      enableStats: true
    });

    this.searchMetrics = {
      searchTime: 0,
      filesScanned: 0,
      resultsFound: 0,
      cacheHitRate: 0,
      memoryUsage: 0,
      strategy: 'fuzzy'
    };

    logger.debug('File search service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FileSearchService {
    if (!FileSearchService.instance) {
      FileSearchService.instance = new FileSearchService();
    }
    return FileSearchService.instance;
  }

  /**
   * Search files with specified options
   */
  async searchFiles(
    projectPath: string,
    options: FileSearchOptions = {}
  ): Promise<FileSearchResult[]> {
    const startTime = Date.now();

    try {
      logger.debug({ projectPath, options }, 'Starting file search');

      // Validate project path
      if (!await this.isValidPath(projectPath)) {
        throw new Error(`Invalid or inaccessible project path: ${projectPath}`);
      }

      // Check cache first
      const query = options.pattern || options.glob || options.content || '';
      const cachedResults = this.cacheManager.get(query, options);

      if (cachedResults) {
        this.updateMetrics(startTime, 0, cachedResults.length, 'fuzzy', true);
        return cachedResults;
      }

      // Perform search based on strategy
      const strategy = options.searchStrategy || 'fuzzy';
      const results = await this.searchByStrategy(strategy, projectPath, options);

      // Cache results if enabled
      if (options.cacheResults !== false) {
        this.cacheManager.set(query, options, results);
      }

      this.updateMetrics(startTime, this.searchMetrics.filesScanned, results.length, strategy, false);

      logger.info({
        projectPath,
        strategy,
        resultsCount: results.length,
        searchTime: Date.now() - startTime
      }, 'File search completed');

      return results;

    } catch (error) {
      logger.error({ err: error, projectPath, options }, 'File search failed');
      throw error;
    }
  }

  /**
   * Search files using specific strategy
   */
  async searchByStrategy(
    strategy: SearchStrategy,
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    switch (strategy) {
      case 'fuzzy':
        return this.fuzzySearch(projectPath, options);
      case 'exact':
        return this.exactSearch(projectPath, options);
      case 'glob':
        return this.globSearch(projectPath, options);
      case 'regex':
        return this.regexSearch(projectPath, options);
      case 'content':
        return this.contentSearch(projectPath, options);
      default:
        throw new Error(`Unsupported search strategy: ${strategy}`);
    }
  }

  /**
   * Fuzzy file name search
   */
  private async fuzzySearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    const pattern = options.pattern || '';
    if (!pattern) return [];

    const files = await this.collectFiles(projectPath, options);
    const results: FileSearchResult[] = [];
    const minScore = options.minScore || 0.3;

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const score = FuzzyMatcher.calculateScore(
        pattern,
        fileName,
        options.caseSensitive || false
      );

      if (score >= minScore) {
        results.push({
          filePath,
          score,
          matchType: 'fuzzy',
          relevanceFactors: [`Fuzzy match score: ${score.toFixed(2)}`],
          metadata: await this.getFileMetadata(filePath)
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return this.limitResults(results, options.maxResults);
  }

  /**
   * Exact file name search
   */
  private async exactSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    const pattern = options.pattern || '';
    if (!pattern) return [];

    const files = await this.collectFiles(projectPath, options);
    const results: FileSearchResult[] = [];
    const searchPattern = options.caseSensitive ? pattern : pattern.toLowerCase();

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      const searchTarget = options.caseSensitive ? fileName : fileName.toLowerCase();

      if (searchTarget.includes(searchPattern)) {
        const score = searchTarget === searchPattern ? 1.0 : 0.8;
        results.push({
          filePath,
          score,
          matchType: 'exact',
          relevanceFactors: ['Exact name match'],
          metadata: await this.getFileMetadata(filePath)
        });
      }
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);

    return this.limitResults(results, options.maxResults);
  }

  /**
   * Glob pattern search
   */
  private async globSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    const globPattern = options.glob || options.pattern || '';
    if (!globPattern) return [];

    const files = await this.collectFiles(projectPath, options);
    const results: FileSearchResult[] = [];

    for (const filePath of files) {
      const relativePath = path.relative(projectPath, filePath);

      if (GlobMatcher.matches(globPattern, relativePath)) {
        results.push({
          filePath,
          score: 1.0,
          matchType: 'glob',
          relevanceFactors: [`Matches glob pattern: ${globPattern}`],
          metadata: await this.getFileMetadata(filePath)
        });
      }
    }

    return this.limitResults(results, options.maxResults);
  }

  /**
   * Regular expression search
   */
  private async regexSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    const pattern = options.pattern || '';
    if (!pattern) return [];

    try {
      const regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
      const files = await this.collectFiles(projectPath, options);
      const results: FileSearchResult[] = [];

      for (const filePath of files) {
        const fileName = path.basename(filePath);

        if (regex.test(fileName)) {
          results.push({
            filePath,
            score: 0.9,
            matchType: 'name',
            relevanceFactors: [`Matches regex: ${pattern}`],
            metadata: await this.getFileMetadata(filePath)
          });
        }
      }

      return this.limitResults(results, options.maxResults);

    } catch (error) {
      logger.error({ err: error, pattern }, 'Invalid regex pattern');
      return [];
    }
  }

  /**
   * Content-based search
   */
  private async contentSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    const contentPattern = options.content || options.pattern || '';
    if (!contentPattern) return [];

    const files = await this.collectFiles(projectPath, options);
    const results: FileSearchResult[] = [];
    const maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB default

    for (const filePath of files) {
      try {
        const stats = await fs.stat(filePath);

        // Skip large files
        if (stats.size > maxFileSize) continue;

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const matchingLines: number[] = [];
        let preview = '';

        // Search for pattern in content
        const regex = new RegExp(
          contentPattern,
          options.caseSensitive ? 'g' : 'gi'
        );

        lines.forEach((line, index) => {
          if (regex.test(line)) {
            matchingLines.push(index + 1);
            if (!preview) {
              preview = line.trim().substring(0, 100);
            }
          }
        });

        if (matchingLines.length > 0) {
          results.push({
            filePath,
            score: 0.8,
            matchType: 'content',
            lineNumbers: matchingLines,
            preview: options.includeContent ? preview : undefined,
            relevanceFactors: [`Found ${matchingLines.length} content matches`],
            metadata: await this.getFileMetadata(filePath)
          });
        }

      } catch (error) {
        // Skip files that can't be read
        logger.debug({ err: error, filePath }, 'Could not read file for content search');
        continue;
      }
    }

    return this.limitResults(results, options.maxResults);
  }

  /**
   * Collect files from project directory
   */
  private async collectFiles(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<string[]> {
    const files: string[] = [];
    const excludeDirs = new Set([
      'node_modules',
      '.git',
      'dist',
      'build',
      '.next',
      'coverage',
      ...(options.excludeDirs || [])
    ]);

    const fileTypes = options.fileTypes ? new Set(options.fileTypes) : null;

    await this.scanDirectory(projectPath, files, excludeDirs, fileTypes, 0);

    this.searchMetrics.filesScanned = files.length;
    return files;
  }

  /**
   * Recursively scan directory for files with security checks
   */
  private async scanDirectory(
    dirPath: string,
    files: string[],
    excludeDirs: Set<string>,
    fileTypes: Set<string> | null,
    depth: number
  ): Promise<void> {
    // Prevent infinite recursion
    if (depth > 25) return;

    try {
      // Import and use filesystem security
      const { FilesystemSecurity } = await import('../../tools/vibe-task-manager/security/filesystem-security.js');
      const fsecurity = FilesystemSecurity.getInstance();

      // Check if directory is safe to access
      const securityCheck = await fsecurity.checkPathSecurity(dirPath, 'read');
      if (!securityCheck.allowed) {
        if (securityCheck.securityViolation) {
          logger.warn({
            dirPath,
            reason: securityCheck.reason
          }, 'Directory access blocked by security policy');
        }
        return;
      }

      // Use secure directory reading
      const entries = await fsecurity.readDirSecure(dirPath);

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // Skip excluded directories
          if (!excludeDirs.has(entry.name)) {
            await this.scanDirectory(fullPath, files, excludeDirs, fileTypes, depth + 1);
          }
        } else if (entry.isFile()) {
          // Additional security check for files
          const fileSecurityCheck = await fsecurity.checkPathSecurity(fullPath, 'read');
          if (!fileSecurityCheck.allowed) {
            continue; // Skip files that fail security check
          }

          // Filter by file types if specified
          if (fileTypes) {
            const ext = path.extname(entry.name).toLowerCase();
            if (!fileTypes.has(ext)) continue;
          }

          files.push(fullPath);
        }
      }
    } catch (error) {
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('Permission denied') || error.message.includes('EACCES')) {
          logger.debug({ dirPath }, 'Directory access denied - skipping');
        } else if (error.message.includes('blacklist')) {
          logger.debug({ dirPath }, 'Directory in security blacklist - skipping');
        } else {
          logger.debug({ err: error, dirPath }, 'Could not read directory');
        }
      } else {
        logger.debug({ err: error, dirPath }, 'Could not read directory');
      }
    }
  }

  /**
   * Get file metadata
   */
  private async getFileMetadata(filePath: string) {
    try {
      const stats = await fs.stat(filePath);
      return {
        size: stats.size,
        lastModified: stats.mtime,
        extension: path.extname(filePath).toLowerCase()
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Limit results to maximum count
   */
  private limitResults(
    results: FileSearchResult[],
    maxResults?: number
  ): FileSearchResult[] {
    if (!maxResults || results.length <= maxResults) {
      return results;
    }
    return results.slice(0, maxResults);
  }

  /**
   * Validate if path exists and is accessible with security checks
   */
  private async isValidPath(projectPath: string): Promise<boolean> {
    try {
      // Import and use filesystem security
      const { FilesystemSecurity } = await import('../../tools/vibe-task-manager/security/filesystem-security.js');
      const fsecurity = FilesystemSecurity.getInstance();

      // Check security first
      const securityCheck = await fsecurity.checkPathSecurity(projectPath, 'read');
      if (!securityCheck.allowed) {
        logger.debug({
          projectPath,
          reason: securityCheck.reason
        }, 'Path validation failed security check');
        return false;
      }

      // Use secure stat to check if it's a directory
      const stats = await fsecurity.statSecure(projectPath);
      return stats.isDirectory();
    } catch (error) {
      logger.debug({ err: error, projectPath }, 'Path validation failed');
      return false;
    }
  }

  /**
   * Update search metrics
   */
  private updateMetrics(
    startTime: number,
    filesScanned: number,
    resultsFound: number,
    strategy: SearchStrategy,
    fromCache: boolean
  ): void {
    this.searchMetrics = {
      searchTime: Date.now() - startTime,
      filesScanned,
      resultsFound,
      cacheHitRate: fromCache ? 1.0 : 0.0,
      memoryUsage: process.memoryUsage().heapUsed,
      strategy
    };
  }

  /**
   * Clear cache for specific project or all
   */
  async clearCache(projectPath?: string): Promise<void> {
    this.cacheManager.clear(projectPath);
    logger.info({ projectPath }, 'File search cache cleared');
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): SearchMetrics {
    return { ...this.searchMetrics };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cacheManager.getStats();
  }
}
