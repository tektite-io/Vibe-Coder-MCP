/**
 * Shared File Search Service
 *
 * A high-performance, reusable file search service for all tools in the Vibe Coder MCP.
 * Provides fuzzy matching, glob patterns, content search, and advanced caching.
 *
 * @module FileSearchService
 */

export { FileSearchService } from './file-search-engine.js';
export { FileReaderService } from './file-reader-service.js';
export { FuzzyMatcher, GlobMatcher } from './search-strategies.js';
export { CacheManager } from './cache-manager.js';

// Re-export types for convenience
export type {
  FileSearchOptions,
  FileSearchResult,
  SearchMetrics,
  SearchStrategy,
  CacheEntry,
  CacheStats
} from './search-strategies.js';

export type {
  FileContent,
  FileReadOptions,
  FileReadResult
} from './file-reader-service.js';
