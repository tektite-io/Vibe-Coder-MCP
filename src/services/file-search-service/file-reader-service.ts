/**
 * Dynamic File Reader Service
 *
 * Provides on-demand file reading capabilities with intelligent content extraction,
 * caching, and context enhancement for task decomposition.
 */

import fs from 'fs/promises';
import path from 'path';
import logger from '../../logger.js';
import { FileSearchService } from './file-search-engine.js';

/**
 * File content with metadata
 */
export interface FileContent {
  /** Absolute file path */
  filePath: string;
  /** File content as string */
  content: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  lastModified: Date;
  /** File extension */
  extension: string;
  /** Content type (text, binary, etc.) */
  contentType: 'text' | 'binary' | 'image' | 'unknown';
  /** Encoding used to read the file */
  encoding: string;
  /** Line count */
  lineCount: number;
  /** Character count */
  charCount: number;
}

/**
 * File reading options
 */
export interface FileReadOptions {
  /** Maximum file size to read (in bytes) */
  maxFileSize?: number;
  /** Encoding to use for text files */
  encoding?: BufferEncoding;
  /** Include binary files */
  includeBinary?: boolean;
  /** Maximum number of lines to read */
  maxLines?: number;
  /** Cache the file content */
  cacheContent?: boolean;
  /** Extract specific sections (line ranges) */
  lineRange?: [number, number];
  /** Include file metadata */
  includeMetadata?: boolean;
}

/**
 * File reading result
 */
export interface FileReadResult {
  /** Successfully read files */
  files: FileContent[];
  /** Files that failed to read */
  errors: Array<{
    filePath: string;
    error: string;
    reason: 'not-found' | 'too-large' | 'binary' | 'permission' | 'encoding' | 'unknown';
  }>;
  /** Performance metrics */
  metrics: {
    totalFiles: number;
    successCount: number;
    errorCount: number;
    totalSize: number;
    readTime: number;
    cacheHits: number;
  };
}

/**
 * Dynamic File Reader Service implementation
 */
export class FileReaderService {
  private static instance: FileReaderService;
  private contentCache = new Map<string, FileContent>();
  private fileSearchService: FileSearchService;

  private constructor() {
    this.fileSearchService = FileSearchService.getInstance();
    logger.debug('File reader service initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): FileReaderService {
    if (!FileReaderService.instance) {
      FileReaderService.instance = new FileReaderService();
    }
    return FileReaderService.instance;
  }

  /**
   * Read multiple files by their paths
   */
  async readFiles(
    filePaths: string[],
    options: FileReadOptions = {}
  ): Promise<FileReadResult> {
    const startTime = Date.now();
    const result: FileReadResult = {
      files: [],
      errors: [],
      metrics: {
        totalFiles: filePaths.length,
        successCount: 0,
        errorCount: 0,
        totalSize: 0,
        readTime: 0,
        cacheHits: 0
      }
    };

    logger.debug({ fileCount: filePaths.length, options }, 'Reading multiple files');

    for (const filePath of filePaths) {
      try {
        const fileContent = await this.readSingleFile(filePath, options);
        if (fileContent) {
          result.files.push(fileContent);
          result.metrics.successCount++;
          result.metrics.totalSize += fileContent.size;
        }
      } catch (error) {
        const errorInfo = this.categorizeError(error, filePath);
        result.errors.push(errorInfo);
        result.metrics.errorCount++;

        logger.debug({ filePath, error: errorInfo }, 'Failed to read file');
      }
    }

    result.metrics.readTime = Date.now() - startTime;

    logger.info({
      totalFiles: result.metrics.totalFiles,
      successCount: result.metrics.successCount,
      errorCount: result.metrics.errorCount,
      readTime: result.metrics.readTime
    }, 'File reading completed');

    return result;
  }

  /**
   * Read files matching a search pattern
   */
  async readFilesByPattern(
    projectPath: string,
    pattern: string,
    options: FileReadOptions = {}
  ): Promise<FileReadResult> {
    logger.debug({ projectPath, pattern }, 'Reading files by pattern');

    // Use file search service to find matching files
    const searchResults = await this.fileSearchService.searchFiles(projectPath, {
      pattern,
      searchStrategy: 'fuzzy',
      maxResults: 100, // Reasonable limit
      cacheResults: true
    });

    const filePaths = searchResults.map(result => result.filePath);
    return this.readFiles(filePaths, options);
  }

  /**
   * Read files by glob pattern
   */
  async readFilesByGlob(
    projectPath: string,
    globPattern: string,
    options: FileReadOptions = {}
  ): Promise<FileReadResult> {
    logger.debug({ projectPath, globPattern }, 'Reading files by glob pattern');

    const searchResults = await this.fileSearchService.searchFiles(projectPath, {
      glob: globPattern,
      searchStrategy: 'glob',
      maxResults: 200, // Higher limit for glob patterns
      cacheResults: true
    });

    const filePaths = searchResults.map(result => result.filePath);
    return this.readFiles(filePaths, options);
  }

  /**
   * Read a single file with caching
   */
  private async readSingleFile(
    filePath: string,
    options: FileReadOptions
  ): Promise<FileContent | null> {
    const cacheKey = this.generateCacheKey(filePath, options);

    // Check cache first
    if (options.cacheContent !== false && this.contentCache.has(cacheKey)) {
      const cached = this.contentCache.get(cacheKey)!;

      // Verify file hasn't changed
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtime.getTime() === cached.lastModified.getTime()) {
          logger.debug({ filePath }, 'Using cached file content');
          return cached;
        } else {
          // File changed, remove from cache
          this.contentCache.delete(cacheKey);
        }
      } catch {
        // File no longer exists, remove from cache
        this.contentCache.delete(cacheKey);
        return null;
      }
    }

    // Read file from disk
    const fileContent = await this.readFromDisk(filePath, options);

    // Cache if enabled
    if (fileContent && options.cacheContent !== false) {
      this.contentCache.set(cacheKey, fileContent);

      // Limit cache size
      if (this.contentCache.size > 1000) {
        const firstKey = this.contentCache.keys().next().value;
        if (firstKey) {
          this.contentCache.delete(firstKey);
        }
      }
    }

    return fileContent;
  }

  /**
   * Read file content from disk
   */
  private async readFromDisk(
    filePath: string,
    options: FileReadOptions
  ): Promise<FileContent | null> {
    const maxFileSize = options.maxFileSize || 10 * 1024 * 1024; // 10MB default
    const encoding = options.encoding || 'utf-8';

    // Get file stats
    const stats = await fs.stat(filePath);

    // Check file size
    if (stats.size > maxFileSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${maxFileSize})`);
    }

    // Determine content type
    const extension = path.extname(filePath).toLowerCase();
    const contentType = this.determineContentType(extension);

    // Skip binary files unless explicitly included
    if ((contentType === 'binary' || contentType === 'image') && !options.includeBinary) {
      throw new Error('Binary file excluded');
    }

    // Read file content
    let content: string;
    let fileEncoding: string;
    try {
      const buffer = await fs.readFile(filePath);

      if (contentType === 'binary' || contentType === 'image') {
        content = buffer.toString('base64');
        fileEncoding = 'base64';
      } else {
        content = buffer.toString(encoding);
        fileEncoding = encoding;
      }
    } catch (error) {
      throw new Error(`Failed to read file: ${error}`);
    }

    // Apply line range if specified
    if (options.lineRange) {
      const lines = content.split('\n');
      const [start, end] = options.lineRange;
      content = lines.slice(start - 1, end).join('\n');
    }

    // Apply max lines limit
    if (options.maxLines) {
      const lines = content.split('\n');
      if (lines.length > options.maxLines) {
        content = lines.slice(0, options.maxLines).join('\n');
      }
    }

    const fileContent: FileContent = {
      filePath,
      content,
      size: stats.size,
      lastModified: stats.mtime,
      extension,
      contentType,
      encoding: fileEncoding,
      lineCount: content.split('\n').length,
      charCount: content.length
    };

    return fileContent;
  }

  /**
   * Determine content type based on file extension
   */
  private determineContentType(extension: string): 'text' | 'binary' | 'image' | 'unknown' {
    const textExtensions = new Set([
      '.txt', '.md', '.js', '.ts', '.jsx', '.tsx', '.json', '.xml', '.html', '.htm',
      '.css', '.scss', '.sass', '.less', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
      '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala', '.clj', '.hs',
      '.ml', '.fs', '.vb', '.sql', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.bat',
      '.cmd', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.log', '.csv',
      '.tsv', '.gitignore', '.gitattributes', '.editorconfig', '.eslintrc', '.prettierrc'
    ]);

    const imageExtensions = new Set([
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'
    ]);

    const binaryExtensions = new Set([
      '.exe', '.dll', '.so', '.dylib', '.bin', '.zip', '.tar', '.gz', '.rar', '.7z',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4',
      '.avi', '.mov', '.wmv', '.flv', '.mkv', '.wav', '.flac', '.ogg'
    ]);

    if (textExtensions.has(extension)) {
      return 'text';
    } else if (imageExtensions.has(extension)) {
      return 'image';
    } else if (binaryExtensions.has(extension)) {
      return 'binary';
    } else {
      return 'unknown';
    }
  }

  /**
   * Generate cache key for file content
   */
  private generateCacheKey(filePath: string, options: FileReadOptions): string {
    const keyData = {
      filePath,
      encoding: options.encoding || 'utf-8',
      lineRange: options.lineRange,
      maxLines: options.maxLines,
      includeBinary: options.includeBinary
    };
    return JSON.stringify(keyData);
  }

  /**
   * Categorize error for better error reporting
   */
  private categorizeError(error: unknown, filePath: string) {
    const errorMessage = (error as Error)?.message || String(error);

    if (errorMessage.includes('ENOENT') || errorMessage.includes('not found')) {
      return {
        filePath,
        error: errorMessage,
        reason: 'not-found' as const
      };
    } else if (errorMessage.includes('too large')) {
      return {
        filePath,
        error: errorMessage,
        reason: 'too-large' as const
      };
    } else if (errorMessage.includes('Binary file excluded')) {
      return {
        filePath,
        error: errorMessage,
        reason: 'binary' as const
      };
    } else if (errorMessage.includes('EACCES') || errorMessage.includes('permission')) {
      return {
        filePath,
        error: errorMessage,
        reason: 'permission' as const
      };
    } else if (errorMessage.includes('encoding') || errorMessage.includes('decode')) {
      return {
        filePath,
        error: errorMessage,
        reason: 'encoding' as const
      };
    } else {
      return {
        filePath,
        error: errorMessage,
        reason: 'unknown' as const
      };
    }
  }

  /**
   * Clear content cache
   */
  clearCache(filePath?: string): void {
    if (filePath) {
      // Clear cache entries for specific file
      const keysToDelete: string[] = [];
      for (const key of this.contentCache.keys()) {
        if (key.includes(filePath)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.contentCache.delete(key));

      logger.debug({ filePath, clearedEntries: keysToDelete.length }, 'File content cache cleared for file');
    } else {
      // Clear all cache
      const totalEntries = this.contentCache.size;
      this.contentCache.clear();

      logger.info({ clearedEntries: totalEntries }, 'File content cache cleared completely');
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    const totalEntries = this.contentCache.size;
    let totalMemoryUsage = 0;

    for (const content of this.contentCache.values()) {
      // Rough estimation of memory usage
      totalMemoryUsage += content.content.length * 2; // UTF-16 encoding
      totalMemoryUsage += JSON.stringify(content).length * 2; // Metadata
    }

    return {
      totalEntries,
      memoryUsage: totalMemoryUsage,
      averageFileSize: totalEntries > 0 ? totalMemoryUsage / totalEntries : 0
    };
  }
}