/**
 * File Search Engine - Core implementation
 *
 * High-performance file search with multiple strategies and caching.
 * Uses streaming iterators for memory-efficient processing of large codebases
 * without file count limitations.
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
  GlobMatcher,
  PriorityQueue
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
   * Generic streaming search for filename-based strategies
   * 
   * Memory-efficient implementation that:
   * - Processes files one at a time using async iterators
   * - Maintains only top N results in memory via priority queue
   * - Filters files during traversal for optimal performance
   * - Removes previous 500-file limitation
   * 
   * Memory complexity: O(maxResults) instead of O(all files)
   */
  private async streamingSearch(
    projectPath: string,
    strategy: SearchStrategy,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    // Early validation based on strategy
    const pattern = options.pattern || options.glob || '';
    if (!pattern && strategy !== 'content') return [];
    
    // Create priority queue to maintain top results
    const maxResults = options.maxResults || 100;
    const resultQueue = new PriorityQueue<FileSearchResult>(
      (a, b) => b.score - a.score, // Higher scores first
      maxResults * 2 // Keep 2x to ensure best results after final limit
    );
    
    // Set up file filtering
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
    
    // Stream through files and evaluate
    let filesProcessed = 0;
    for await (const filePath of this.scanDirectoryIterator(
      projectPath,
      excludeDirs,
      fileTypes
    )) {
      filesProcessed++;
      
      // Evaluate file against search criteria
      const result = await this.evaluateFile(filePath, strategy, options, projectPath);
      
      if (result) {
        // Only add if score is high enough for current queue
        const minScore = resultQueue.getMinScore(r => r.score);
        if (minScore === undefined || result.score >= minScore) {
          resultQueue.add(result);
        }
      }
      
      // Log progress periodically
      if (filesProcessed % 1000 === 0) {
        logger.debug({ 
          filesProcessed, 
          queueSize: resultQueue.size,
          strategy 
        }, 'Streaming search progress');
      }
    }
    
    logger.debug({ 
      filesProcessed, 
      resultsFound: resultQueue.size,
      strategy 
    }, 'Streaming search completed');
    
    // Update metrics for integration with searchFiles
    this.searchMetrics.filesScanned = filesProcessed;
    
    // Get final results and apply limit
    const results = resultQueue.toArray().slice(0, maxResults);
    
    return results;
  }

  /**
   * Fuzzy file name search
   */
  private async fuzzySearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    return this.streamingSearch(projectPath, 'fuzzy', options);
  }

  /**
   * Exact file name search
   */
  private async exactSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    return this.streamingSearch(projectPath, 'exact', options);
  }

  /**
   * Glob pattern search
   */
  private async globSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    return this.streamingSearch(projectPath, 'glob', options);
  }

  /**
   * Regular expression search
   */
  private async regexSearch(
    projectPath: string,
    options: FileSearchOptions
  ): Promise<FileSearchResult[]> {
    // Validate regex pattern first
    const pattern = options.pattern || '';
    if (!pattern) return [];
    
    try {
      new RegExp(pattern, options.caseSensitive ? 'g' : 'gi'); // Test validity
      return this.streamingSearch(projectPath, 'regex', options);
    } catch (error) {
      logger.error({ err: error, pattern }, 'Invalid regex pattern');
      return [];
    }
  }

  /**
   * Streaming content search iterator
   * Processes files one at a time, reading contents only when needed
   */
  private async *contentSearchIterator(
    projectPath: string,
    options: FileSearchOptions
  ): AsyncGenerator<FileSearchResult> {
    const contentPattern = options.content || options.pattern || '';
    if (!contentPattern) return;
    
    const maxFileSize = options.maxFileSize || 1024 * 1024; // 1MB default
    
    // Set up file filtering
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
    
    // Create regex for content search
    let regex: RegExp;
    try {
      regex = new RegExp(contentPattern, options.caseSensitive ? 'g' : 'gi');
    } catch (error) {
      logger.error({ err: error, pattern: contentPattern }, 'Invalid content search pattern');
      return;
    }
    
    // Stream through files
    for await (const filePath of this.scanDirectoryIterator(
      projectPath,
      excludeDirs,
      fileTypes
    )) {
      try {
        const stats = await fs.stat(filePath);
        
        // Skip large files
        if (stats.size > maxFileSize) continue;
        
        // Read file content
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        const matchingLines: number[] = [];
        let preview = '';
        
        // Search for pattern in content
        lines.forEach((line, index) => {
          // Reset regex lastIndex for global flag
          regex.lastIndex = 0;
          if (regex.test(line)) {
            matchingLines.push(index + 1);
            if (!preview && line.trim()) {
              preview = line.trim().substring(0, 100);
            }
          }
        });
        
        // Yield result if matches found
        if (matchingLines.length > 0) {
          yield {
            filePath,
            score: Math.min(0.8 + (matchingLines.length * 0.01), 1.0), // More matches = higher score
            matchType: 'content',
            lineNumbers: matchingLines,
            preview: options.includeContent ? preview : undefined,
            relevanceFactors: [`Found ${matchingLines.length} content matches`],
            metadata: {
              size: stats.size,
              lastModified: stats.mtime,
              extension: path.extname(filePath).toLowerCase()
            }
          };
        }
        
      } catch (error) {
        // Skip files that can't be read
        logger.debug({ err: error, filePath }, 'Could not read file for content search');
        continue;
      }
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
    
    // Create priority queue for results
    const maxResults = options.maxResults || 100;
    const resultQueue = new PriorityQueue<FileSearchResult>(
      (a, b) => b.score - a.score,
      maxResults * 2
    );
    
    // Process content search results
    let filesProcessed = 0;
    for await (const result of this.contentSearchIterator(projectPath, options)) {
      filesProcessed++;
      resultQueue.add(result);
      
      // Log progress periodically
      if (filesProcessed % 100 === 0) {
        logger.debug({ 
          filesProcessed, 
          resultsFound: resultQueue.size 
        }, 'Content search progress');
      }
    }
    
    logger.debug({ 
      filesProcessed, 
      resultsFound: resultQueue.size 
    }, 'Content search completed');
    
    // Update metrics for integration with searchFiles
    this.searchMetrics.filesScanned = filesProcessed;
    
    // Return final results
    return resultQueue.toArray().slice(0, maxResults);
  }

  /**
   * Collect files from project directory
   * Now uses streaming iterator without file limits
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

    // Use streaming iterator to collect all files without limits
    for await (const filePath of this.scanDirectoryIterator(
      projectPath,
      excludeDirs,
      fileTypes
    )) {
      files.push(filePath);
    }

    this.searchMetrics.filesScanned = files.length;
    return files;
  }


  /**
   * Asynchronously iterate through directory files
   * Yields file paths one at a time for memory efficiency
   */
  private async *scanDirectoryIterator(
    dirPath: string,
    excludeDirs: Set<string>,
    fileTypes: Set<string> | null,
    depth: number = 0,
    maxDepth: number = 25
  ): AsyncGenerator<string> {
    // Prevent infinite recursion
    if (depth > maxDepth) return;

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
            // Recursively yield from subdirectory
            yield* this.scanDirectoryIterator(
              fullPath, 
              excludeDirs, 
              fileTypes, 
              depth + 1, 
              maxDepth
            );
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

          // Yield the file path
          yield fullPath;
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
   * Evaluate a single file against search criteria
   * Returns a search result if the file matches, null otherwise
   */
  private async evaluateFile(
    filePath: string,
    strategy: SearchStrategy,
    options: FileSearchOptions,
    projectPath: string
  ): Promise<FileSearchResult | null> {
    const fileName = path.basename(filePath);
    
    switch (strategy) {
      case 'fuzzy': {
        const pattern = options.pattern || '';
        if (!pattern) return null;
        
        const score = FuzzyMatcher.calculateScore(
          pattern,
          fileName,
          options.caseSensitive || false
        );
        
        const minScore = options.minScore || 0.3;
        if (score >= minScore) {
          return {
            filePath,
            score,
            matchType: 'fuzzy',
            relevanceFactors: [`Fuzzy match score: ${score.toFixed(2)}`],
            metadata: await this.getFileMetadata(filePath)
          };
        }
        return null;
      }
      
      case 'exact': {
        const pattern = options.pattern || '';
        if (!pattern) return null;
        
        const searchPattern = options.caseSensitive ? pattern : pattern.toLowerCase();
        const searchTarget = options.caseSensitive ? fileName : fileName.toLowerCase();
        
        if (searchTarget.includes(searchPattern)) {
          const score = searchTarget === searchPattern ? 1.0 : 0.8;
          return {
            filePath,
            score,
            matchType: 'exact',
            relevanceFactors: ['Exact name match'],
            metadata: await this.getFileMetadata(filePath)
          };
        }
        return null;
      }
      
      case 'glob': {
        const globPattern = options.glob || options.pattern || '';
        if (!globPattern) return null;
        
        const relativePath = path.relative(projectPath, filePath);
        
        if (GlobMatcher.matches(globPattern, relativePath)) {
          return {
            filePath,
            score: 1.0,
            matchType: 'glob',
            relevanceFactors: [`Matches glob pattern: ${globPattern}`],
            metadata: await this.getFileMetadata(filePath)
          };
        }
        return null;
      }
      
      case 'regex': {
        const pattern = options.pattern || '';
        if (!pattern) return null;
        
        try {
          const regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
          if (regex.test(fileName)) {
            return {
              filePath,
              score: 0.9,
              matchType: 'name',
              relevanceFactors: [`Matches regex: ${pattern}`],
              metadata: await this.getFileMetadata(filePath)
            };
          }
        } catch (error) {
          logger.error({ err: error, pattern }, 'Invalid regex pattern');
        }
        return null;
      }
      
      case 'content': {
        // Content search requires reading the file, handled separately
        // This method only handles filename-based strategies
        return null;
      }
      
      default:
        return null;
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
