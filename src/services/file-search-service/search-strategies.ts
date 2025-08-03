/**
 * Search strategies and types for the File Search Service
 */

/**
 * Available search strategies
 */
export type SearchStrategy = 'fuzzy' | 'exact' | 'regex' | 'glob' | 'content';

/**
 * File search options
 */
export interface FileSearchOptions {
  /** Search pattern/query */
  pattern?: string;
  /** Glob pattern for file matching */
  glob?: string;
  /** Content search pattern (regex or text) */
  content?: string;
  /** File types/extensions to include */
  fileTypes?: string[];
  /** Maximum number of results to return */
  maxResults?: number;
  /** Include file content preview in results */
  includeContent?: boolean;
  /** Search strategy to use */
  searchStrategy?: SearchStrategy;
  /** Cache results for future queries */
  cacheResults?: boolean;
  /** Maximum file size to search (in bytes) */
  maxFileSize?: number;
  /** Directories to exclude from search */
  excludeDirs?: string[];
  /** Case sensitive search */
  caseSensitive?: boolean;
  /** Minimum fuzzy match score (0-1) */
  minScore?: number;
}

/**
 * File search result
 */
export interface FileSearchResult {
  /** Absolute file path */
  filePath: string;
  /** Relevance score (0-1) */
  score: number;
  /** Type of match found */
  matchType: 'name' | 'content' | 'glob' | 'fuzzy' | 'exact';
  /** Content preview if requested */
  preview?: string;
  /** Line numbers where matches were found */
  lineNumbers?: number[];
  /** Factors that contributed to relevance score */
  relevanceFactors: string[];
  /** File metadata */
  metadata?: {
    size: number;
    lastModified: Date;
    extension: string;
  };
}

/**
 * Search performance metrics
 */
export interface SearchMetrics {
  /** Total search time in milliseconds */
  searchTime: number;
  /** Number of files scanned */
  filesScanned: number;
  /** Number of results found */
  resultsFound: number;
  /** Cache hit rate (0-1) */
  cacheHitRate: number;
  /** Memory usage in bytes */
  memoryUsage: number;
  /** Search strategy used */
  strategy: SearchStrategy;
}

/**
 * Cache entry for search results
 */
export interface CacheEntry {
  /** Search query/pattern */
  query: string;
  /** Search options used */
  options: FileSearchOptions;
  /** Cached results */
  results: FileSearchResult[];
  /** Timestamp when cached */
  timestamp: Date;
  /** Time to live in milliseconds */
  ttl: number;
  /** Cache hit count */
  hitCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Total entries in cache */
  totalEntries: number;
  /** Cache hit rate */
  hitRate: number;
  /** Total memory usage in bytes */
  memoryUsage: number;
  /** Number of cache evictions */
  evictions: number;
  /** Average query time with cache */
  avgQueryTime: number;
}

/**
 * File iterator options for streaming
 */
export interface FileIteratorOptions {
  /** Directories to exclude */
  excludeDirs: Set<string>;
  /** File types to include (null = all) */
  fileTypes: Set<string> | null;
  /** Maximum depth to scan */
  maxDepth?: number;
  /** Security check callback */
  securityCheckFn?: (path: string) => Promise<boolean>;
}

/**
 * File evaluation result for streaming
 */
export interface FileEvaluation {
  /** Whether the file matches criteria */
  matches: boolean;
  /** Search result if matches */
  result?: FileSearchResult;
}

/**
 * Streaming search options
 */
export interface StreamingOptions extends FileSearchOptions {
  /** Enable streaming mode */
  streamingEnabled?: boolean;
  /** Callback for early results (progressive UI) */
  onResult?: (result: FileSearchResult) => void;
  /** Memory limit for result collection */
  memoryLimit?: number;
}

/**
 * Fuzzy matching algorithm implementation
 */
export class FuzzyMatcher {
  /**
   * Calculate fuzzy match score between query and target
   */
  static calculateScore(query: string, target: string, caseSensitive: boolean = false): number {
    if (!query || !target) return 0;

    const q = caseSensitive ? query : query.toLowerCase();
    const t = caseSensitive ? target : target.toLowerCase();

    // Exact match gets highest score
    if (q === t) return 1.0;

    // Check if query is substring
    if (t.includes(q)) {
      const ratio = q.length / t.length;
      return 0.8 + (ratio * 0.2); // 0.8-1.0 range for substring matches
    }

    // Calculate Levenshtein distance-based score
    const distance = this.levenshteinDistance(q, t);
    const maxLength = Math.max(q.length, t.length);
    const similarity = 1 - (distance / maxLength);

    // Apply bonus for matching prefixes
    let prefixBonus = 0;
    for (let i = 0; i < Math.min(q.length, t.length); i++) {
      if (q[i] === t[i]) {
        prefixBonus += 0.1;
      } else {
        break;
      }
    }

    return Math.min(similarity + prefixBonus, 0.79); // Cap at 0.79 to keep below substring matches
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  private static levenshteinDistance(a: string, b: string): number {
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,     // deletion
          matrix[j - 1][i] + 1,     // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * Glob pattern matcher
 */
export class GlobMatcher {
  /**
   * Convert glob pattern to RegExp
   */
  static globToRegex(pattern: string): RegExp {
    // Handle special cases for ** patterns
    if (pattern.startsWith('**/') && pattern.endsWith('/**')) {
      // **/ at start and /** at end
      const middle = pattern.slice(3, -3);
      const middlePattern = this.escapeAndConvert(middle);
      return new RegExp(`^(?:.*/)?${middlePattern}/.*$`, 'i');
    } else if (pattern.startsWith('**/')) {
      // **/ at start should match any depth including zero
      const rest = pattern.slice(3);
      const restPattern = this.escapeAndConvert(rest);
      return new RegExp(`^(?:.*/)?${restPattern}$`, 'i');
    } else if (pattern.endsWith('/**')) {
      // /** at end should match any depth
      const prefix = pattern.slice(0, -3);
      const prefixPattern = this.escapeAndConvert(prefix);
      return new RegExp(`^${prefixPattern}/.*$`, 'i');
    } else if (pattern.includes('/**/')) {
      // /** in middle
      const parts = pattern.split('/**/');
      const escapedParts = parts.map(part => this.escapeAndConvert(part));
      return new RegExp(`^${escapedParts.join('/.*/')}$`, 'i');
    } else {
      // No ** patterns, handle normally
      return new RegExp(`^${this.escapeAndConvert(pattern)}$`, 'i');
    }
  }

  /**
   * Escape and convert a pattern without ** handling
   */
  private static escapeAndConvert(pattern: string): string {
    return pattern
      .replace(/[+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\./g, '\\.') // Escape dots separately
      .replace(/\*/g, '[^/]*') // * matches anything except /
      .replace(/\?/g, '[^/]'); // ? matches single character except /
  }

  /**
   * Test if path matches glob pattern
   */
  static matches(pattern: string, path: string): boolean {
    try {
      const regex = this.globToRegex(pattern);
      return regex.test(path);
    } catch {
      return false;
    }
  }
}

/**
 * Priority queue for maintaining top N results efficiently
 * Used during streaming to keep only the best results in memory
 */
export class PriorityQueue<T> {
  private items: T[] = [];
  private compareFn: (a: T, b: T) => number;
  private maxSize: number;

  /**
   * Create a new priority queue
   * @param compareFn Function to compare items (return positive if a > b)
   * @param maxSize Maximum number of items to keep
   */
  constructor(compareFn: (a: T, b: T) => number, maxSize: number) {
    this.compareFn = compareFn;
    this.maxSize = maxSize;
  }

  /**
   * Add an item to the queue
   * Maintains sort order and size limit
   */
  add(item: T): void {
    // Add the item
    this.items.push(item);
    
    // Sort by priority (highest first)
    this.items.sort(this.compareFn);
    
    // Remove lowest priority items if over limit
    if (this.items.length > this.maxSize) {
      this.items = this.items.slice(0, this.maxSize);
    }
  }

  /**
   * Get all items as an array
   */
  toArray(): T[] {
    return [...this.items];
  }

  /**
   * Get the current size
   */
  get size(): number {
    return this.items.length;
  }

  /**
   * Check if queue is full
   */
  get isFull(): boolean {
    return this.items.length >= this.maxSize;
  }

  /**
   * Get the minimum score item (last in queue)
   * Useful for early filtering
   */
  getMinScore(scoreFn: (item: T) => number): number | undefined {
    if (this.items.length === 0) return undefined;
    if (this.items.length < this.maxSize) return 0; // Accept any score if not full
    return scoreFn(this.items[this.items.length - 1]);
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.items = [];
  }
}
