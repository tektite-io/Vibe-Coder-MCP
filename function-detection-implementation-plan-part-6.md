# Enhanced Function Name Detection Implementation Plan - Part 6

## Phase 3: Memory Management and Performance Optimization

### Epic: FD-3.0 - Memory Management

#### FD-3.1 - Implement Lazy Grammar Loading

**Description**: Implement lazy loading of grammar files to improve startup time and reduce memory usage.

**File Path**: `src/tools/code-map-generator/parser.ts`

**Nature of Change**: Modify

**Implementation**:
```typescript
// Existing code...

let parserInstance: ParserFromPackage | null = null;
const loadedGrammars = new Map<string, ParserFromPackage.Language>();

/**
 * Gets the parser for a file extension, initializing it if necessary.
 * This implements lazy loading of grammar files.
 */
export async function getParserForFileExtension(fileExtension: string): Promise<ParserFromPackage | null> {
  // Initialize parser if not already initialized
  if (!parserInstance) {
    try {
      await initializeParser();
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize parser');
      return null;
    }
  }
  
  // Check if we have a language configuration for this extension
  const langConfig = languageConfigurations[fileExtension];
  if (!langConfig) {
    logger.warn(`No language configuration found for extension: ${fileExtension}`);
    return null;
  }
  
  // Load the grammar if not already loaded
  if (!loadedGrammars.has(fileExtension)) {
    logger.debug(`Grammar for ${langConfig.name} (${fileExtension}) not yet loaded. Loading...`);
    try {
      const loaded = await loadLanguageGrammar(fileExtension, langConfig);
      if (!loaded) {
        logger.warn(`Failed to load grammar for ${fileExtension}`);
        return null;
      }
    } catch (error) {
      logger.error({ err: error }, `Error loading grammar for ${fileExtension}`);
      return null;
    }
  }
  
  // Get the language from the loaded grammars
  const language = loadedGrammars.get(fileExtension);
  if (!language) {
    logger.warn(`Grammar for ${fileExtension} was not available after loading`);
    return null;
  }
  
  // Set the language on the parser
  try {
    parserInstance.setLanguage(language);
    return parserInstance;
  } catch (error) {
    logger.error({ err: error }, `Error setting language for ${fileExtension}`);
    return null;
  }
}

// Modify the parseCode function to use lazy loading
export async function parseCode(
  sourceCode: string,
  fileExtension: string,
  filePath?: string,
  config?: CodeMapGeneratorConfig
): Promise<ParserFromPackage.Tree | null> {
  // Check if caching is enabled and we have a file path
  const useCaching = config?.cache?.enabled !== false && filePath && sourceCodeCache && parseCache;
  const cacheKey = filePath ? `${filePath}:${sourceCode.length}` : null;
  
  // Check cache first if caching is enabled
  if (useCaching && parseCache && cacheKey) {
    const cachedTree = await parseCache.get(cacheKey);
    if (cachedTree) {
      logger.debug(`Using cached parse tree for ${filePath}`);
      return cachedTree;
    }
  }
  
  // Get the parser for the file extension (lazy loading)
  const parser = await getParserForFileExtension(fileExtension);
  if (!parser) {
    return null;
  }
  
  try {
    // Parse the source code
    const tree = parser.parse(sourceCode);
    logger.debug(`Successfully parsed code for extension ${fileExtension}. Root node: ${tree.rootNode.type}`);
    
    // Cache the parse tree if caching is enabled
    if (useCaching && parseCache && cacheKey) {
      await parseCache.set(cacheKey, tree);
    }
    
    return tree;
  } catch (error) {
    logger.error({ err: error, fileExtension }, `Error parsing code for extension ${fileExtension}.`);
    return null;
  }
}
```

**Rationale**: Lazy loading of grammar files improves startup time and reduces memory usage by only loading grammar files when they are needed. This is especially important for large codebases with many different file types, as it avoids loading grammar files for languages that are not used in the codebase.

#### FD-3.2 - Implement AST Caching with LRU Eviction

**Description**: Implement an AST cache with LRU (Least Recently Used) eviction policy to reduce memory usage.

**File Path**: `src/tools/code-map-generator/cache/astCache.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { Tree } from 'web-tree-sitter';
import LRUCache from 'lru-cache';
import logger from '../../../logger.js';

/**
 * Options for the AST cache.
 */
export interface ASTCacheOptions {
  /**
   * Maximum number of ASTs to cache.
   * Default: 100
   */
  maxSize?: number;
  
  /**
   * Maximum age of cached ASTs in milliseconds.
   * Default: 5 minutes
   */
  maxAge?: number;
  
  /**
   * Whether to dispose ASTs when they are evicted from the cache.
   * Default: true
   */
  disposeOnEvict?: boolean;
}

/**
 * Cache for ASTs with LRU eviction policy.
 */
export class ASTCache {
  /**
   * The LRU cache instance.
   */
  private cache: LRUCache<string, Tree>;
  
  /**
   * Creates a new AST cache.
   * 
   * @param options Options for the cache.
   */
  constructor(options: ASTCacheOptions = {}) {
    this.cache = new LRUCache<string, Tree>({
      max: options.maxSize || 100,
      maxAge: options.maxAge || 5 * 60 * 1000, // 5 minutes
      dispose: options.disposeOnEvict !== false ? (key, value) => {
        // Clean up resources when an AST is evicted
        try {
          value.delete();
        } catch (error) {
          logger.error({ err: error }, `Error disposing AST for ${key}`);
        }
      } : undefined
    });
  }
  
  /**
   * Gets an AST from the cache.
   * 
   * @param key The cache key.
   * @returns The cached AST, or undefined if not found.
   */
  get(key: string): Tree | undefined {
    return this.cache.get(key);
  }
  
  /**
   * Sets an AST in the cache.
   * 
   * @param key The cache key.
   * @param value The AST to cache.
   */
  set(key: string, value: Tree): void {
    this.cache.set(key, value);
  }
  
  /**
   * Deletes an AST from the cache.
   * 
   * @param key The cache key.
   * @returns Whether the AST was in the cache.
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }
  
  /**
   * Clears the cache.
   */
  clear(): void {
    this.cache.clear();
  }
  
  /**
   * Gets the number of ASTs in the cache.
   */
  get size(): number {
    return this.cache.size;
  }
  
  /**
   * Gets cache statistics.
   * 
   * @returns Cache statistics.
   */
  getStats(): { size: number, maxSize: number, hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      hitRate: this.cache.getRatio()
    };
  }
}
```

**Rationale**: The AST cache with LRU eviction policy reduces memory usage by limiting the number of ASTs kept in memory. It automatically evicts the least recently used ASTs when the cache reaches its maximum size, and it properly disposes of ASTs to free up resources. This is especially important for large codebases, as ASTs can consume a significant amount of memory.

#### FD-3.3 - Implement Memory Manager

**Description**: Implement a memory manager to coordinate memory usage across different components.

**File Path**: `src/tools/code-map-generator/memory/memoryManager.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { Tree } from 'web-tree-sitter';
import { ASTCache } from '../cache/astCache.js';
import logger from '../../../logger.js';

/**
 * Options for the memory manager.
 */
export interface MemoryManagerOptions {
  /**
   * Maximum number of ASTs to cache.
   * Default: 100
   */
  maxAstCacheSize?: number;
  
  /**
   * Maximum age of cached ASTs in milliseconds.
   * Default: 5 minutes
   */
  maxAstCacheAge?: number;
  
  /**
   * Maximum number of source code strings to cache.
   * Default: 200
   */
  maxSourceCacheSize?: number;
  
  /**
   * Maximum age of cached source code strings in milliseconds.
   * Default: 10 minutes
   */
  maxSourceCacheAge?: number;
  
  /**
   * Whether to enable memory usage monitoring.
   * Default: true
   */
  enableMonitoring?: boolean;
  
  /**
   * Memory usage threshold in bytes.
   * When memory usage exceeds this threshold, the memory manager will try to free memory.
   * Default: 1GB
   */
  memoryThreshold?: number;
  
  /**
   * Interval in milliseconds for memory usage monitoring.
   * Default: 30 seconds
   */
  monitoringInterval?: number;
}

/**
 * Memory manager for the Code Map Generator.
 * Coordinates memory usage across different components.
 */
export class MemoryManager {
  /**
   * The AST cache.
   */
  private astCache: ASTCache;
  
  /**
   * The source code cache.
   */
  private sourceCache: Map<string, string>;
  
  /**
   * The memory manager options.
   */
  private options: MemoryManagerOptions;
  
  /**
   * The monitoring interval ID.
   */
  private monitoringIntervalId: NodeJS.Timeout | null = null;
  
  /**
   * Creates a new memory manager.
   * 
   * @param options Options for the memory manager.
   */
  constructor(options: MemoryManagerOptions = {}) {
    this.options = {
      maxAstCacheSize: options.maxAstCacheSize || 100,
      maxAstCacheAge: options.maxAstCacheAge || 5 * 60 * 1000, // 5 minutes
      maxSourceCacheSize: options.maxSourceCacheSize || 200,
      maxSourceCacheAge: options.maxSourceCacheAge || 10 * 60 * 1000, // 10 minutes
      enableMonitoring: options.enableMonitoring !== false,
      memoryThreshold: options.memoryThreshold || 1024 * 1024 * 1024, // 1GB
      monitoringInterval: options.monitoringInterval || 30 * 1000 // 30 seconds
    };
    
    // Initialize caches
    this.astCache = new ASTCache({
      maxSize: this.options.maxAstCacheSize,
      maxAge: this.options.maxAstCacheAge
    });
    
    this.sourceCache = new Map<string, string>();
    
    // Start memory monitoring if enabled
    if (this.options.enableMonitoring) {
      this.startMonitoring();
    }
  }
  
  /**
   * Gets an AST from the cache.
   * 
   * @param key The cache key.
   * @returns The cached AST, or undefined if not found.
   */
  getAst(key: string): Tree | undefined {
    return this.astCache.get(key);
  }
  
  /**
   * Sets an AST in the cache.
   * 
   * @param key The cache key.
   * @param value The AST to cache.
   */
  setAst(key: string, value: Tree): void {
    this.astCache.set(key, value);
  }
  
  /**
   * Gets source code from the cache.
   * 
   * @param key The cache key.
   * @returns The cached source code, or undefined if not found.
   */
  getSourceCode(key: string): string | undefined {
    return this.sourceCache.get(key);
  }
  
  /**
   * Sets source code in the cache.
   * 
   * @param key The cache key.
   * @param value The source code to cache.
   */
  setSourceCode(key: string, value: string): void {
    // Enforce maximum cache size
    if (this.sourceCache.size >= this.options.maxSourceCacheSize!) {
      // Remove the oldest entry
      const oldestKey = this.sourceCache.keys().next().value;
      this.sourceCache.delete(oldestKey);
    }
    
    this.sourceCache.set(key, value);
  }
  
  /**
   * Clears all caches.
   */
  clearCaches(): void {
    this.astCache.clear();
    this.sourceCache.clear();
  }
  
  /**
   * Starts memory usage monitoring.
   */
  private startMonitoring(): void {
    if (this.monitoringIntervalId) {
      return;
    }
    
    this.monitoringIntervalId = setInterval(() => {
      this.checkMemoryUsage();
    }, this.options.monitoringInterval);
  }
  
  /**
   * Stops memory usage monitoring.
   */
  stopMonitoring(): void {
    if (this.monitoringIntervalId) {
      clearInterval(this.monitoringIntervalId);
      this.monitoringIntervalId = null;
    }
  }
  
  /**
   * Checks memory usage and frees memory if necessary.
   */
  private checkMemoryUsage(): void {
    const memoryUsage = process.memoryUsage();
    
    // Check if memory usage exceeds threshold
    if (memoryUsage.heapUsed > this.options.memoryThreshold!) {
      logger.warn({
        heapUsed: memoryUsage.heapUsed,
        threshold: this.options.memoryThreshold
      }, 'Memory usage exceeds threshold. Freeing memory...');
      
      // Free memory
      this.freeMemory();
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }
  
  /**
   * Frees memory by clearing caches.
   */
  private freeMemory(): void {
    // Clear source cache
    this.sourceCache.clear();
    
    // Clear AST cache
    this.astCache.clear();
    
    logger.info('Memory freed by clearing caches.');
  }
  
  /**
   * Gets memory usage statistics.
   * 
   * @returns Memory usage statistics.
   */
  getMemoryStats(): {
    astCacheSize: number,
    sourceCacheSize: number,
    processMemoryUsage: NodeJS.MemoryUsage
  } {
    return {
      astCacheSize: this.astCache.size,
      sourceCacheSize: this.sourceCache.size,
      processMemoryUsage: process.memoryUsage()
    };
  }
  
  /**
   * Disposes the memory manager.
   */
  dispose(): void {
    this.stopMonitoring();
    this.clearCaches();
  }
}
```

**Rationale**: The memory manager coordinates memory usage across different components of the Code Map Generator. It provides caching for ASTs and source code, with configurable limits on cache size and age. It also includes memory usage monitoring to automatically free memory when usage exceeds a threshold. This helps prevent out-of-memory errors when processing large codebases.

### Epic: FD-3.4 - Performance Optimization

#### FD-3.4.1 - Implement Incremental Processing

**Description**: Implement incremental processing to handle large codebases efficiently.

**File Path**: `src/tools/code-map-generator/processing/incrementalProcessor.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import path from 'path';
import fs from 'fs/promises';
import { SyntaxNode, Tree } from 'web-tree-sitter';
import { CodeMapGeneratorConfig } from '../types.js';
import { parseCode } from '../parser.js';
import { getLanguageHandler } from '../languageHandlers/registry.js';
import { MemoryManager } from '../memory/memoryManager.js';
import { isLanguageEnabled, getLanguageSupportConfig } from '../config/languageSupport.js';
import { readFileSecure } from '../utils/fileUtils.js';
import logger from '../../../logger.js';

/**
 * Result of incremental processing.
 */
export interface ProcessingResult {
  /**
   * The processed files.
   */
  files: string[];
  
  /**
   * The number of functions found.
   */
  functionCount: number;
  
  /**
   * The number of classes found.
   */
  classCount: number;
  
  /**
   * The number of imports found.
   */
  importCount: number;
  
  /**
   * Processing statistics.
   */
  stats: {
    /**
     * The total number of files processed.
     */
    totalFiles: number;
    
    /**
     * The number of files successfully processed.
     */
    successfulFiles: number;
    
    /**
     * The number of files that failed to process.
     */
    failedFiles: number;
    
    /**
     * The total processing time in milliseconds.
     */
    totalTime: number;
    
    /**
     * The average processing time per file in milliseconds.
     */
    averageTimePerFile: number;
    
    /**
     * Memory usage statistics.
     */
    memoryUsage: NodeJS.MemoryUsage;
  };
}

/**
 * Progress callback function.
 */
export type ProgressCallback = (
  progress: number,
  status: string,
  currentFile?: string
) => void;

/**
 * Incremental processor for the Code Map Generator.
 * Processes files in batches to handle large codebases efficiently.
 */
export class IncrementalProcessor {
  /**
   * The memory manager.
   */
  private memoryManager: MemoryManager;
  
  /**
   * The set of processed files.
   */
  private processedFiles = new Set<string>();
  
  /**
   * The queue of files to process.
   */
  private fileQueue: string[] = [];
  
  /**
   * The processing results.
   */
  private results: {
    files: string[];
    functionCount: number;
    classCount: number;
    importCount: number;
  } = {
    files: [],
    functionCount: 0,
    classCount: 0,
    importCount: 0
  };
  
  /**
   * Creates a new incremental processor.
   * 
   * @param memoryManager The memory manager to use.
   */
  constructor(memoryManager?: MemoryManager) {
    this.memoryManager = memoryManager || new MemoryManager();
  }
  
  /**
   * Processes a directory incrementally.
   * 
   * @param directory The directory to process.
   * @param config The Code Map Generator configuration.
   * @param progressCallback Optional callback for progress reporting.
   * @returns The processing results.
   */
  async processDirectory(
    directory: string,
    config: CodeMapGeneratorConfig,
    progressCallback?: ProgressCallback
  ): Promise<ProcessingResult> {
    // Reset state
    this.processedFiles.clear();
    this.fileQueue = [];
    this.results = {
      files: [],
      functionCount: 0,
      classCount: 0,
      importCount: 0
    };
    
    // Start timing
    const startTime = Date.now();
    
    // Collect files to process
    await this.collectFiles(directory, config);
    
    const totalFiles = this.fileQueue.length;
    let processedCount = 0;
    let successfulCount = 0;
    let failedCount = 0;
    
    // Process files in batches
    const batchSize = config.processing?.batchSize || 20;
    
    while (this.fileQueue.length > 0) {
      const batch = this.fileQueue.splice(0, batchSize);
      
      // Process batch in parallel
      await Promise.all(batch.map(async (file) => {
        try {
          // Report progress
          if (progressCallback) {
            progressCallback(
              Math.round((processedCount / totalFiles) * 100),
              `Processing file ${processedCount + 1} of ${totalFiles}`,
              file
            );
          }
          
          // Process file
          const success = await this.processFile(file, config);
          
          // Update counters
          processedCount++;
          if (success) {
            successfulCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          logger.error({ err: error, file }, `Error processing file: ${file}`);
          processedCount++;
          failedCount++;
        }
      }));
      
      // Allow event loop to process other events
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Check memory usage and free memory if necessary
      const memoryStats = this.memoryManager.getMemoryStats();
      if (memoryStats.processMemoryUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB
        logger.warn('Memory usage is high. Clearing caches...');
        this.memoryManager.clearCaches();
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }
    }
    
    // End timing
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    // Report final progress
    if (progressCallback) {
      progressCallback(
        100,
        `Processed ${totalFiles} files in ${totalTime}ms`,
        undefined
      );
    }
    
    // Return results
    return {
      files: this.results.files,
      functionCount: this.results.functionCount,
      classCount: this.results.classCount,
      importCount: this.results.importCount,
      stats: {
        totalFiles,
        successfulFiles: successfulCount,
        failedFiles: failedCount,
        totalTime,
        averageTimePerFile: totalFiles > 0 ? totalTime / totalFiles : 0,
        memoryUsage: process.memoryUsage()
      }
    };
  }
  
  /**
   * Collects files to process from a directory.
   * 
   * @param directory The directory to collect files from.
   * @param config The Code Map Generator configuration.
   */
  private async collectFiles(directory: string, config: CodeMapGeneratorConfig): Promise<void> {
    try {
      // Get supported extensions
      const supportedExtensions = Object.keys(getLanguageSupportConfig(config.languageSupport));
      
      // Get ignore patterns
      const ignorePatterns = config.ignorePatterns || [
        'node_modules',
        '.git',
        'dist',
        'build',
        'out',
        'coverage'
      ];
      
      // Walk directory recursively
      await this.walkDirectory(
        directory,
        supportedExtensions,
        ignorePatterns,
        config.allowedMappingDirectory
      );
    } catch (error) {
      logger.error({ err: error, directory }, `Error collecting files from directory: ${directory}`);
    }
  }
  
  /**
   * Walks a directory recursively to collect files.
   * 
   * @param directory The directory to walk.
   * @param supportedExtensions The supported file extensions.
   * @param ignorePatterns The patterns to ignore.
   * @param allowedMappingDirectory The allowed mapping directory.
   */
  private async walkDirectory(
    directory: string,
    supportedExtensions: string[],
    ignorePatterns: string[],
    allowedMappingDirectory?: string
  ): Promise<void> {
    // Check if directory is allowed
    if (allowedMappingDirectory && !directory.startsWith(allowedMappingDirectory)) {
      logger.warn(`Directory not allowed: ${directory}`);
      return;
    }
    
    // Check if directory should be ignored
    const dirName = path.basename(directory);
    if (ignorePatterns.some(pattern => dirName === pattern || dirName.match(pattern))) {
      logger.debug(`Ignoring directory: ${directory}`);
      return;
    }
    
    try {
      // Read directory entries
      const entries = await fs.readdir(directory, { withFileTypes: true });
      
      // Process entries
      for (const entry of entries) {
        const entryPath = path.join(directory, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively walk subdirectory
          await this.walkDirectory(
            entryPath,
            supportedExtensions,
            ignorePatterns,
            allowedMappingDirectory
          );
        } else if (entry.isFile()) {
          // Check if file extension is supported
          const fileExtension = path.extname(entry.name);
          if (supportedExtensions.includes(fileExtension)) {
            // Add file to queue
            this.fileQueue.push(entryPath);
          }
        }
      }
    } catch (error) {
      logger.error({ err: error, directory }, `Error walking directory: ${directory}`);
    }
  }
  
  /**
   * Processes a single file.
   * 
   * @param filePath The path of the file to process.
   * @param config The Code Map Generator configuration.
   * @returns Whether the file was successfully processed.
   */
  private async processFile(filePath: string, config: CodeMapGeneratorConfig): Promise<boolean> {
    // Skip if already processed
    if (this.processedFiles.has(filePath)) {
      return true;
    }
    
    try {
      const extension = path.extname(filePath);
      
      // Skip if language is not enabled
      if (!isLanguageEnabled(extension, getLanguageSupportConfig(config.languageSupport))) {
        return true;
      }
      
      // Get source code from cache or read file
      let sourceCode = this.memoryManager.getSourceCode(filePath);
      if (!sourceCode) {
        sourceCode = await readFileSecure(filePath, config.allowedMappingDirectory);
        this.memoryManager.setSourceCode(filePath, sourceCode);
      }
      
      // Get AST from cache or parse file
      const cacheKey = `${filePath}:${sourceCode.length}`;
      let tree = this.memoryManager.getAst(cacheKey);
      if (!tree) {
        tree = await parseCode(sourceCode, extension, filePath, config);
        if (tree) {
          this.memoryManager.setAst(cacheKey, tree);
        }
      }
      
      if (!tree) {
        logger.warn(`Failed to parse file: ${filePath}`);
        return false;
      }
      
      // Get language handler
      const handler = getLanguageHandler(extension);
      
      // Extract information
      const functions = handler.extractFunctions(tree.rootNode, sourceCode);
      const classes = handler.extractClasses(tree.rootNode, sourceCode);
      const imports = handler.extractImports(tree.rootNode, sourceCode);
      
      // Update results
      this.results.files.push(filePath);
      this.results.functionCount += functions.length;
      this.results.classCount += classes.length;
      this.results.importCount += imports.length;
      
      // Mark as processed
      this.processedFiles.add(filePath);
      
      return true;
    } catch (error) {
      logger.error({ err: error, filePath }, `Error processing file: ${filePath}`);
      return false;
    }
  }
}
```

**Rationale**: Incremental processing handles large codebases efficiently by processing files in batches and monitoring memory usage. It collects files to process, processes them in parallel batches, and reports progress. It also integrates with the memory manager to cache ASTs and source code, and to free memory when usage is high. This approach allows the Code Map Generator to process large codebases without running out of memory or becoming unresponsive.
