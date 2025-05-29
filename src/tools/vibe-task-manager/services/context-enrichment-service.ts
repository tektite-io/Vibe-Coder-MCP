/**
 * Context Enrichment Service
 *
 * Orchestrates dynamic context gathering during task decomposition by intelligently
 * selecting and reading relevant files based on task requirements.
 */

import logger from '../../../logger.js';
import { FileSearchService, FileReaderService } from '../../../services/file-search-service/index.js';
import type {
  FileSearchOptions,
  FileContent,
  FileReadOptions,
  FileReadResult
} from '../../../services/file-search-service/index.js';

/**
 * Context request for task decomposition
 */
export interface ContextRequest {
  /** Task description or requirements */
  taskDescription: string;
  /** Project root path */
  projectPath: string;
  /** Specific files to include */
  includeFiles?: string[];
  /** File patterns to search for */
  searchPatterns?: string[];
  /** Glob patterns for file matching */
  globPatterns?: string[];
  /** Keywords for content-based search */
  contentKeywords?: string[];
  /** Maximum number of files to include */
  maxFiles?: number;
  /** Maximum total content size (in characters) */
  maxContentSize?: number;
  /** File types to prioritize */
  priorityFileTypes?: string[];
  /** Directories to exclude */
  excludeDirs?: string[];
}

/**
 * Context relevance scoring factors
 */
export interface RelevanceFactors {
  /** File name relevance (0-1) */
  nameRelevance: number;
  /** Content relevance (0-1) */
  contentRelevance: number;
  /** File type priority (0-1) */
  typePriority: number;
  /** Recency factor (0-1) */
  recencyFactor: number;
  /** Size factor (0-1, smaller is better) */
  sizeFactor: number;
  /** Overall relevance score (0-1) */
  overallScore: number;
}

/**
 * Enriched context result
 */
export interface ContextResult {
  /** Successfully gathered context files */
  contextFiles: Array<FileContent & { relevance: RelevanceFactors }>;
  /** Files that failed to read */
  failedFiles: string[];
  /** Context summary */
  summary: {
    totalFiles: number;
    totalSize: number;
    averageRelevance: number;
    topFileTypes: string[];
    gatheringTime: number;
  };
  /** Performance metrics */
  metrics: {
    searchTime: number;
    readTime: number;
    scoringTime: number;
    totalTime: number;
    cacheHitRate: number;
  };
}

/**
 * Context enrichment configuration
 */
interface ContextConfig {
  /** Default maximum files to include */
  defaultMaxFiles: number;
  /** Default maximum content size */
  defaultMaxContentSize: number;
  /** Minimum relevance score threshold */
  minRelevanceThreshold: number;
  /** File type priority weights */
  fileTypePriorities: Record<string, number>;
  /** Content keyword boost factor */
  keywordBoostFactor: number;
  /** Recency weight (days) */
  recencyWeightDays: number;
}

/**
 * Context Enrichment Service implementation
 */
export class ContextEnrichmentService {
  private static instance: ContextEnrichmentService;
  private fileSearchService: FileSearchService;
  private fileReaderService: FileReaderService;
  private config: ContextConfig;

  private constructor() {
    this.fileSearchService = FileSearchService.getInstance();
    this.fileReaderService = FileReaderService.getInstance();

    this.config = {
      defaultMaxFiles: 20,
      defaultMaxContentSize: 100000, // 100KB
      minRelevanceThreshold: 0.3,
      fileTypePriorities: {
        '.ts': 1.0,
        '.js': 0.9,
        '.tsx': 0.95,
        '.jsx': 0.85,
        '.json': 0.7,
        '.md': 0.6,
        '.txt': 0.5,
        '.yml': 0.6,
        '.yaml': 0.6,
        '.config.js': 0.8,
        '.config.ts': 0.8
      },
      keywordBoostFactor: 0.2,
      recencyWeightDays: 30
    };

    logger.debug('Context enrichment service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ContextEnrichmentService {
    if (!ContextEnrichmentService.instance) {
      ContextEnrichmentService.instance = new ContextEnrichmentService();
    }
    return ContextEnrichmentService.instance;
  }

  /**
   * Gather context for task decomposition
   */
  async gatherContext(request: ContextRequest): Promise<ContextResult> {
    const startTime = Date.now();

    logger.info({
      taskDescription: request.taskDescription.substring(0, 100),
      projectPath: request.projectPath
    }, 'Starting context gathering');

    try {
      // Phase 1: Discover relevant files
      const searchStartTime = Date.now();
      const candidateFiles = await this.discoverCandidateFiles(request);
      const searchTime = Date.now() - searchStartTime;

      // Phase 2: Read and score files
      const readStartTime = Date.now();
      const readResult = await this.readAndScoreFiles(candidateFiles, request);
      const readTime = Date.now() - readStartTime;

      // Phase 3: Select best files based on relevance
      const scoringStartTime = Date.now();
      const selectedFiles = await this.selectBestFiles(readResult, request);
      const scoringTime = Date.now() - scoringStartTime;

      const totalTime = Date.now() - startTime;

      const result: ContextResult = {
        contextFiles: selectedFiles,
        failedFiles: readResult?.errors?.map(e => e.filePath) || [],
        summary: {
          totalFiles: selectedFiles.length,
          totalSize: selectedFiles.reduce((sum, f) => sum + f.charCount, 0),
          averageRelevance: selectedFiles.length > 0
            ? selectedFiles.reduce((sum, f) => sum + f.relevance.overallScore, 0) / selectedFiles.length
            : 0,
          topFileTypes: this.getTopFileTypes(selectedFiles),
          gatheringTime: totalTime
        },
        metrics: {
          searchTime,
          readTime,
          scoringTime,
          totalTime,
          cacheHitRate: readResult?.metrics?.cacheHits ?
            readResult.metrics.cacheHits / Math.max(readResult.metrics.totalFiles, 1) : 0
        }
      };

      logger.info({
        totalFiles: result.summary.totalFiles,
        totalSize: result.summary.totalSize,
        averageRelevance: result.summary.averageRelevance.toFixed(2),
        gatheringTime: result.summary.gatheringTime
      }, 'Context gathering completed');

      return result;

    } catch (error) {
      logger.error({ err: error, request }, 'Context gathering failed');
      throw error;
    }
  }

  /**
   * Discover candidate files for context
   */
  private async discoverCandidateFiles(request: ContextRequest): Promise<string[]> {
    const candidateFiles = new Set<string>();

    // Add explicitly requested files
    if (request.includeFiles) {
      request.includeFiles.forEach(file => candidateFiles.add(file));
    }

    // Search by patterns
    if (request.searchPatterns) {
      for (const pattern of request.searchPatterns) {
        const searchOptions: FileSearchOptions = {
          pattern,
          searchStrategy: 'fuzzy',
          maxResults: 50,
          fileTypes: request.priorityFileTypes,
          excludeDirs: request.excludeDirs,
          cacheResults: true
        };

        const results = await this.fileSearchService.searchFiles(request.projectPath, searchOptions);
        if (results && Array.isArray(results)) {
          results.forEach(result => candidateFiles.add(result.filePath));
        }
      }
    }

    // Search by glob patterns
    if (request.globPatterns) {
      for (const globPattern of request.globPatterns) {
        const searchOptions: FileSearchOptions = {
          glob: globPattern,
          searchStrategy: 'glob',
          maxResults: 100,
          excludeDirs: request.excludeDirs,
          cacheResults: true
        };

        const results = await this.fileSearchService.searchFiles(request.projectPath, searchOptions);
        if (results && Array.isArray(results)) {
          results.forEach(result => candidateFiles.add(result.filePath));
        }
      }
    }

    // Content-based search
    if (request.contentKeywords) {
      for (const keyword of request.contentKeywords) {
        const searchOptions: FileSearchOptions = {
          content: keyword,
          searchStrategy: 'content',
          maxResults: 30,
          fileTypes: request.priorityFileTypes,
          excludeDirs: request.excludeDirs,
          cacheResults: true
        };

        const results = await this.fileSearchService.searchFiles(request.projectPath, searchOptions);
        if (results && Array.isArray(results)) {
          results.forEach(result => candidateFiles.add(result.filePath));
        }
      }
    }

    // If no specific search criteria, do a general search based on task description
    if (!request.searchPatterns && !request.globPatterns && !request.contentKeywords && !request.includeFiles) {
      const keywords = this.extractKeywordsFromTask(request.taskDescription);

      for (const keyword of keywords.slice(0, 3)) { // Limit to top 3 keywords
        const searchOptions: FileSearchOptions = {
          pattern: keyword,
          searchStrategy: 'fuzzy',
          maxResults: 20,
          fileTypes: request.priorityFileTypes,
          excludeDirs: request.excludeDirs,
          cacheResults: true
        };

        const results = await this.fileSearchService.searchFiles(request.projectPath, searchOptions);
        if (results && Array.isArray(results)) {
          results.forEach(result => candidateFiles.add(result.filePath));
        }
      }
    }

    const candidateArray = Array.from(candidateFiles);
    logger.debug({ candidateCount: candidateArray.length }, 'Discovered candidate files');

    return candidateArray;
  }

  /**
   * Read and score candidate files
   */
  private async readAndScoreFiles(
    candidateFiles: string[],
    _request: ContextRequest
  ): Promise<FileReadResult> {
    const readOptions: FileReadOptions = {
      maxFileSize: 5 * 1024 * 1024, // 5MB limit
      cacheContent: true,
      includeMetadata: true,
      maxLines: 1000 // Reasonable limit for context
    };

    return this.fileReaderService.readFiles(candidateFiles, readOptions);
  }

  /**
   * Select best files based on relevance scoring
   */
  private async selectBestFiles(
    readResult: FileReadResult,
    request: ContextRequest
  ): Promise<Array<FileContent & { relevance: RelevanceFactors }>> {
    const maxFiles = request.maxFiles || this.config.defaultMaxFiles;
    const maxContentSize = request.maxContentSize || this.config.defaultMaxContentSize;

    // Ensure readResult and files exist
    if (!readResult || !readResult.files) {
      logger.warn('No files in readResult, returning empty array');
      return [];
    }

    // Score all files
    const scoredFiles = readResult.files.map(file => ({
      ...file,
      relevance: this.calculateRelevance(file, request)
    }));

    // Filter by minimum relevance threshold
    const relevantFiles = scoredFiles.filter(
      file => file.relevance.overallScore >= this.config.minRelevanceThreshold
    );

    // Sort by relevance score (descending)
    relevantFiles.sort((a, b) => b.relevance.overallScore - a.relevance.overallScore);

    // Select files within limits
    const selectedFiles: Array<FileContent & { relevance: RelevanceFactors }> = [];
    let totalSize = 0;

    for (const file of relevantFiles) {
      if (selectedFiles.length >= maxFiles) break;
      if (totalSize + file.charCount > maxContentSize) break;

      selectedFiles.push(file);
      totalSize += file.charCount;
    }

    logger.debug({
      totalCandidates: readResult.files.length,
      relevantFiles: relevantFiles.length,
      selectedFiles: selectedFiles.length,
      totalSize
    }, 'File selection completed');

    return selectedFiles;
  }

  /**
   * Calculate relevance score for a file
   */
  private calculateRelevance(file: FileContent, request: ContextRequest): RelevanceFactors {
    // Name relevance based on task keywords
    const nameRelevance = this.calculateNameRelevance(file.filePath, request.taskDescription);

    // Content relevance based on keywords
    const contentRelevance = this.calculateContentRelevance(file.content, request);

    // File type priority
    const typePriority = this.config.fileTypePriorities[file.extension] || 0.5;

    // Recency factor (newer files get higher scores)
    const recencyFactor = this.calculateRecencyFactor(file.lastModified);

    // Size factor (smaller files are generally better for context)
    const sizeFactor = this.calculateSizeFactor(file.charCount);

    // Calculate overall score with weights
    const overallScore = (
      nameRelevance * 0.3 +
      contentRelevance * 0.4 +
      typePriority * 0.15 +
      recencyFactor * 0.1 +
      sizeFactor * 0.05
    );

    return {
      nameRelevance,
      contentRelevance,
      typePriority,
      recencyFactor,
      sizeFactor,
      overallScore: Math.min(overallScore, 1.0)
    };
  }

  /**
   * Calculate name relevance based on task description
   */
  private calculateNameRelevance(filePath: string, taskDescription: string): number {
    const fileName = filePath.toLowerCase();
    const taskWords = this.extractKeywordsFromTask(taskDescription);

    let relevanceScore = 0;

    for (const word of taskWords) {
      if (fileName.includes(word.toLowerCase())) {
        relevanceScore += 1;
      }
    }

    // Normalize by number of keywords
    return taskWords.length > 0 ? Math.min(relevanceScore / taskWords.length, 1.0) : 0;
  }

  /**
   * Calculate content relevance based on keywords
   */
  private calculateContentRelevance(content: string, request: ContextRequest): number {
    const contentLower = content.toLowerCase();
    let relevanceScore = 0;
    let totalKeywords = 0;

    // Check task description keywords
    const taskKeywords = this.extractKeywordsFromTask(request.taskDescription);
    for (const keyword of taskKeywords) {
      totalKeywords++;
      if (contentLower.includes(keyword.toLowerCase())) {
        relevanceScore += 1;
      }
    }

    // Check explicit content keywords
    if (request.contentKeywords) {
      for (const keyword of request.contentKeywords) {
        totalKeywords++;
        if (contentLower.includes(keyword.toLowerCase())) {
          relevanceScore += 1 + this.config.keywordBoostFactor; // Boost explicit keywords
        }
      }
    }

    return totalKeywords > 0 ? Math.min(relevanceScore / totalKeywords, 1.0) : 0;
  }

  /**
   * Calculate recency factor
   */
  private calculateRecencyFactor(lastModified: Date): number {
    const now = new Date();
    const daysDiff = (now.getTime() - lastModified.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= 1) return 1.0; // Very recent
    if (daysDiff <= 7) return 0.9; // Recent
    if (daysDiff <= this.config.recencyWeightDays) return 0.7; // Moderately recent

    return 0.5; // Older files
  }

  /**
   * Calculate size factor (smaller is better for context)
   */
  private calculateSizeFactor(charCount: number): number {
    if (charCount <= 1000) return 1.0; // Very small
    if (charCount <= 5000) return 0.9; // Small
    if (charCount <= 20000) return 0.7; // Medium
    if (charCount <= 50000) return 0.5; // Large

    return 0.3; // Very large
  }

  /**
   * Extract keywords from task description
   */
  private extractKeywordsFromTask(taskDescription: string): string[] {
    // Remove common stop words and extract meaningful keywords
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
      'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'between', 'among', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those'
    ]);

    const words = taskDescription
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => !/^\d+$/.test(word)); // Remove pure numbers

    // Remove duplicates and return
    return Array.from(new Set(words));
  }

  /**
   * Get top file types from selected files
   */
  private getTopFileTypes(files: Array<FileContent & { relevance: RelevanceFactors }>): string[] {
    const typeCount = new Map<string, number>();

    files.forEach(file => {
      const ext = file.extension || 'unknown';
      typeCount.set(ext, (typeCount.get(ext) || 0) + 1);
    });

    return Array.from(typeCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ext]) => ext);
  }

  /**
   * Create context summary for LLM consumption
   */
  async createContextSummary(contextResult: ContextResult): Promise<string> {
    const { contextFiles, summary } = contextResult;

    if (contextFiles.length === 0) {
      return 'No relevant context files found for this task.';
    }

    let contextSummary = `## Context Summary\n\n`;
    contextSummary += `Found ${summary.totalFiles} relevant files (${Math.round(summary.totalSize / 1024)}KB total)\n`;
    contextSummary += `Average relevance: ${(summary.averageRelevance * 100).toFixed(1)}%\n`;
    contextSummary += `Top file types: ${summary.topFileTypes.join(', ')}\n\n`;

    contextSummary += `## File Contents\n\n`;

    for (const file of contextFiles) {
      const relativePath = file.filePath.split('/').slice(-3).join('/'); // Show last 3 path segments
      const relevancePercent = (file.relevance.overallScore * 100).toFixed(1);

      contextSummary += `### ${relativePath} (${relevancePercent}% relevant)\n\n`;
      contextSummary += `\`\`\`${file.extension.slice(1) || 'text'}\n`;

      // Truncate very long files
      const content = file.content.length > 2000
        ? file.content.substring(0, 2000) + '\n... (truncated)'
        : file.content;

      contextSummary += content;
      contextSummary += `\n\`\`\`\n\n`;
    }

    return contextSummary;
  }

  /**
   * Clear context cache
   */
  clearCache(): void {
    this.fileSearchService.clearCache();
    this.fileReaderService.clearCache();
    logger.info('Context enrichment cache cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.debug({ config: this.config }, 'Context enrichment configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): ContextConfig {
    return { ...this.config };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      searchMetrics: this.fileSearchService.getPerformanceMetrics(),
      readerCacheStats: this.fileReaderService.getCacheStats(),
      searchCacheStats: this.fileSearchService.getCacheStats()
    };
  }
}
