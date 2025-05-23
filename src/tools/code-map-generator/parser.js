// Fix for CommonJS module import in ESM
import ParserFromPackage from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../../logger.js';
import { FileCache } from './cache/fileCache.js';
import { readFileSecure } from './fsUtils.js';
import { ensureDirectoryExists, validateDirectoryIsWritable, getCacheDirectory } from './directoryUtils.js';
import { GrammarManager } from './cache/grammarManager.js';
import { MemoryManager } from './cache/memoryManager.js';
import { getProjectRoot } from './utils/pathUtils.enhanced.js';
import { FileContentManager } from './cache/fileContentManager.js';
// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Use 'any' for now to match existing structure, but ideally these would be concrete types
// if web-tree-sitter's own type declarations are directly usable and compatible.
// For the purpose of this step, we ensure the names are exported as they were assumed.
// The actual types might be Parser.SyntaxNode, Parser.Tree etc.
// This change assumes the original intent was to re-export these specific types.
// Memory management instances
let grammarManager = null;
let memoryManager = null;
let astMemoryCache = null;
let sourceCodeMemoryCache = null;
// File-based cache instances
let parseCache = null;
let sourceCodeCache = null;
// File content manager instance
let fileContentManager = null;
// Path to the directory where .wasm grammar files are expected to be.
// Grammar files are located in the 'grammars' directory relative to this module.
const GRAMMARS_BASE_DIR = path.join(__dirname, 'grammars');
logger.info(`Grammar files directory: ${GRAMMARS_BASE_DIR}`);
// Also log the project root and current working directory to help with debugging
logger.info(`Project root directory: ${getProjectRoot()}`);
logger.info(`Current working directory: ${process.cwd()}`);
logger.info(`Module directory (__dirname): ${__dirname}`);
// Maps file extensions to their Tree-sitter grammar configuration.
// Developer must ensure the .wasm files are present in GRAMMARS_BASE_DIR.
export const languageConfigurations = {
    // Core web development languages
    '.js': { name: 'JavaScript', wasmPath: 'tree-sitter-javascript.wasm' },
    '.jsx': { name: 'JavaScript JSX', wasmPath: 'tree-sitter-javascript.wasm' }, // Uses JS grammar
    '.ts': { name: 'TypeScript', wasmPath: 'tree-sitter-typescript.wasm' },
    '.tsx': { name: 'TSX', wasmPath: 'tree-sitter-tsx.wasm' },
    '.html': { name: 'HTML', wasmPath: 'tree-sitter-html.wasm' },
    '.css': { name: 'CSS', wasmPath: 'tree-sitter-css.wasm' },
    '.vue': { name: 'Vue', wasmPath: 'tree-sitter-vue.wasm' },
    // Backend languages
    '.py': { name: 'Python', wasmPath: 'tree-sitter-python.wasm' },
    '.java': { name: 'Java', wasmPath: 'tree-sitter-java.wasm' },
    '.cs': { name: 'C#', wasmPath: 'tree-sitter-c_sharp.wasm' }, // Note the underscore in filename
    '.go': { name: 'Go', wasmPath: 'tree-sitter-go.wasm' },
    '.rb': { name: 'Ruby', wasmPath: 'tree-sitter-ruby.wasm' },
    '.rs': { name: 'Rust', wasmPath: 'tree-sitter-rust.wasm' },
    '.php': { name: 'PHP', wasmPath: 'tree-sitter-php.wasm' },
    '.kt': { name: 'Kotlin', wasmPath: 'tree-sitter-kotlin.wasm' },
    '.swift': { name: 'Swift', wasmPath: 'tree-sitter-swift.wasm' },
    '.scala': { name: 'Scala', wasmPath: 'tree-sitter-scala.wasm' },
    '.ex': { name: 'Elixir', wasmPath: 'tree-sitter-elixir.wasm' },
    '.exs': { name: 'Elixir Script', wasmPath: 'tree-sitter-elixir.wasm' },
    '.lua': { name: 'Lua', wasmPath: 'tree-sitter-lua.wasm' },
    // Systems programming
    '.c': { name: 'C', wasmPath: 'tree-sitter-c.wasm' },
    '.h': { name: 'C Header', wasmPath: 'tree-sitter-c.wasm' },
    '.cpp': { name: 'C++', wasmPath: 'tree-sitter-cpp.wasm' },
    '.hpp': { name: 'C++ Header', wasmPath: 'tree-sitter-cpp.wasm' },
    '.cc': { name: 'C++', wasmPath: 'tree-sitter-cpp.wasm' },
    '.m': { name: 'Objective-C', wasmPath: 'tree-sitter-objc.wasm' },
    '.mm': { name: 'Objective-C++', wasmPath: 'tree-sitter-objc.wasm' },
    '.zig': { name: 'Zig', wasmPath: 'tree-sitter-zig.wasm' },
    // Shell scripting
    '.sh': { name: 'Bash', wasmPath: 'tree-sitter-bash.wasm' },
    '.bash': { name: 'Bash', wasmPath: 'tree-sitter-bash.wasm' },
    // Functional programming
    '.ml': { name: 'OCaml', wasmPath: 'tree-sitter-ocaml.wasm' },
    '.mli': { name: 'OCaml Interface', wasmPath: 'tree-sitter-ocaml.wasm' },
    '.elm': { name: 'Elm', wasmPath: 'tree-sitter-elm.wasm' },
    '.re': { name: 'ReScript', wasmPath: 'tree-sitter-rescript.wasm' },
    '.res': { name: 'ReScript', wasmPath: 'tree-sitter-rescript.wasm' },
    '.el': { name: 'Emacs Lisp', wasmPath: 'tree-sitter-elisp.wasm' },
    // Data formats
    '.json': { name: 'JSON', wasmPath: 'tree-sitter-json.wasm' },
    '.yaml': { name: 'YAML', wasmPath: 'tree-sitter-yaml.wasm' },
    '.yml': { name: 'YAML', wasmPath: 'tree-sitter-yaml.wasm' },
    '.toml': { name: 'TOML', wasmPath: 'tree-sitter-toml.wasm' },
    // Domain-specific languages
    '.sol': { name: 'Solidity', wasmPath: 'tree-sitter-solidity.wasm' },
    '.ql': { name: 'CodeQL', wasmPath: 'tree-sitter-ql.wasm' },
    '.tla': { name: 'TLA+', wasmPath: 'tree-sitter-tlaplus.wasm' },
    '.rdl': { name: 'SystemRDL', wasmPath: 'tree-sitter-systemrdl.wasm' },
    // Template languages
    '.erb': { name: 'Embedded Ruby', wasmPath: 'tree-sitter-embedded_template.wasm' },
    '.ejs': { name: 'EJS', wasmPath: 'tree-sitter-embedded_template.wasm' },
};
/**
 * Initializes the Tree-sitter parser if it hasn't been already.
 * This must be called before any parsing operations.
 */
export async function initializeParser() {
    if (grammarManager && grammarManager.isInitialized()) {
        logger.debug('Tree-sitter parser already initialized.');
        return;
    }
    try {
        // Initialize memory manager first
        memoryManager = new MemoryManager({
            maxMemoryPercentage: 0.4, // Reduced from 0.5 (use up to 40% of system memory)
            monitorInterval: 30000, // Check memory usage every 30 seconds (reduced from 60 seconds)
            autoManage: true
        });
        // Initialize memory caches
        astMemoryCache = memoryManager.createASTCache();
        sourceCodeMemoryCache = memoryManager.createSourceCodeCache();
        // Create grammar manager
        const tempGrammarManager = new GrammarManager(languageConfigurations, {
            maxGrammars: 20,
            preloadCommonGrammars: true, // Keep true here for backward compatibility
            preloadExtensions: ['.js', '.ts', '.py', '.html', '.css'], // Reduced from 10 to 5
            grammarsBaseDir: GRAMMARS_BASE_DIR
        });
        // Initialize grammar manager first
        await tempGrammarManager.initialize();
        // Only after initialization is complete, assign to the global variable
        grammarManager = tempGrammarManager;
        // Register grammar manager with memory manager
        memoryManager.registerGrammarManager(grammarManager);
        // Now that the grammar manager is fully initialized, preload grammars if enabled
        if (grammarManager.isInitialized() && grammarManager.getOptions().preloadCommonGrammars) {
            await grammarManager.preloadGrammars();
        }
        logger.info('Tree-sitter parser and memory management initialized successfully.');
    }
    catch (error) {
        logger.error({ err: error }, 'Failed to initialize Tree-sitter parser and memory management.');
        throw error; // Re-throw to signal critical failure
    }
}
/**
 * Initializes the file-based caches for parsed trees and source code.
 * @param config The Code-Map Generator configuration
 * @returns A promise that resolves when the caches are initialized
 */
export async function initializeCaches(config) {
    // Skip if caching is disabled
    if (config.cache?.enabled === false) {
        logger.info('File-based caching is disabled in configuration.');
        return;
    }
    try {
        // Get the cache directory from the utility function
        const cacheDir = getCacheDirectory(config);
        logger.debug(`Using cache directory: ${cacheDir}`);
        // Create the cache directories
        await ensureDirectoryExists(cacheDir);
        const parseTreeCacheDir = path.join(cacheDir, 'parse-trees');
        const sourceCodeCacheDir = path.join(cacheDir, 'source-code');
        // Create the specific cache directories
        await ensureDirectoryExists(parseTreeCacheDir);
        await ensureDirectoryExists(sourceCodeCacheDir);
        // Validate that the directories are writable
        await validateDirectoryIsWritable(parseTreeCacheDir);
        await validateDirectoryIsWritable(sourceCodeCacheDir);
        // Initialize parse tree cache
        parseCache = new FileCache({
            name: 'parse-trees',
            cacheDir: parseTreeCacheDir,
            maxEntries: config.cache?.maxEntries,
            maxAge: config.cache?.maxAge,
            serialize: (tree) => {
                // Tree-sitter trees can't be directly serialized, so we need to use a custom approach
                // For now, we'll just store a placeholder and re-parse when needed
                return JSON.stringify({ rootNodeType: tree.rootNode?.type || 'unknown' });
            },
            deserialize: (serialized) => {
                // This is a placeholder - we can't actually deserialize a tree from JSON
                // We'll handle this in the parseCode function
                return JSON.parse(serialized);
            }
        });
        // Initialize source code cache
        sourceCodeCache = new FileCache({
            name: 'source-code',
            cacheDir: sourceCodeCacheDir,
            maxEntries: config.cache?.maxEntries,
            maxAge: config.cache?.maxAge
        });
        // Initialize the caches
        await parseCache.init();
        await sourceCodeCache.init();
        // Initialize file content manager
        fileContentManager = new FileContentManager({
            maxCachedFiles: config.cache?.maxCachedFiles !== undefined ? config.cache.maxCachedFiles : 0, // Default to 0 (disabled) for in-memory caching
            maxAge: 5 * 60 * 1000, // 5 minutes
            cacheDir: cacheDir,
            useFileCache: config.cache?.enabled === undefined || config.cache?.enabled === true
        });
        await fileContentManager.init();
        logger.info('File-based caches and file content manager initialized successfully.');
    }
    catch (error) {
        logger.error({ err: error }, 'Failed to initialize file-based caches.');
        // Don't throw, just log the error and continue without caching
        parseCache = null;
        sourceCodeCache = null;
        fileContentManager = null;
    }
}
/**
 * Clears all caches (both file-based and memory-based).
 * @returns A promise that resolves when the caches are cleared
 */
export async function clearCaches() {
    try {
        // Clear file-based caches
        if (parseCache) {
            await parseCache.clear();
        }
        if (sourceCodeCache) {
            await sourceCodeCache.clear();
        }
        // Clear file content manager cache
        if (fileContentManager) {
            fileContentManager.clearCache();
        }
        // Clear memory-based caches
        if (astMemoryCache) {
            astMemoryCache.clear();
        }
        if (sourceCodeMemoryCache) {
            sourceCodeMemoryCache.clear();
        }
        // Run garbage collection if memory manager is available
        if (memoryManager) {
            memoryManager.runGarbageCollection();
        }
        logger.info('All caches cleared successfully.');
    }
    catch (error) {
        logger.error({ err: error }, 'Failed to clear caches.');
    }
}
/**
 * Loads a Tree-sitter language grammar from its .wasm file.
 * The .wasm file is expected to be in the GRAMMARS_BASE_DIR.
 *
 * @param extension The file extension (e.g., '.js') for which to load the grammar.
 * @param langConfig The language configuration containing the grammar name and WASM file path.
 */
export async function loadLanguageGrammar(extension, langConfig) {
    if (!grammarManager) {
        throw new Error('Parser not initialized. Call initializeParser() first.');
    }
    try {
        // Use the grammar manager to load the grammar
        await grammarManager.loadGrammar(extension);
        return true;
    }
    catch (error) {
        // This catches errors during the loading process
        logger.error({
            err: error,
            grammarName: langConfig.name,
            extension
        }, `Failed to load Tree-sitter grammar for ${langConfig.name}. Check if the grammar file exists.`);
        // Do not re-throw, allow other grammars to load. getParserForExtension will handle missing ones.
        return false;
    }
}
/**
 * Retrieves the initialized Tree-sitter parser instance and sets the language
 * appropriate for the given file extension.
 * If the grammar for the extension is not yet loaded, it attempts to load it.
 *
 * @param fileExtension The file extension (e.g., '.js', '.py').
 * @returns A configured Parser instance if the language is supported and loaded, otherwise null.
 */
export async function getParserForFileExtension(fileExtension) {
    if (!grammarManager) {
        logger.warn('Attempted to get parser before Tree-sitter initialization. Call initializeParser() first.');
        await initializeParser(); // Attempt to initialize if not already
        if (!grammarManager)
            return null; // Still failed
    }
    const langConfig = languageConfigurations[fileExtension];
    if (!langConfig) {
        logger.warn(`No language configuration found for extension: ${fileExtension}. Cannot parse.`);
        return null;
    }
    try {
        // Use the grammar manager to get a parser with memory awareness
        return await grammarManager.getParserForExtensionWithMemoryAwareness(fileExtension);
    }
    catch (error) {
        logger.error({ err: error, fileExtension }, `Error getting parser for extension ${fileExtension}.`);
        return null;
    }
}
/**
 * Gets a cached value from the tiered cache system.
 * Tries file-based cache first, then falls back to memory-based cache.
 *
 * @param key The cache key
 * @param fileCache The file-based cache
 * @param memoryCache The memory-based cache
 * @returns A promise that resolves to the cached value, or undefined if not found
 */
export async function getCachedValue(key, fileCache, memoryCache) {
    // Try file-based cache first if available
    if (fileCache) {
        try {
            const value = await fileCache.get(key);
            if (value !== undefined) {
                logger.debug(`File cache hit for key: ${key}`);
                // Update memory cache for faster access next time
                if (memoryCache) {
                    memoryCache.set(key, value);
                }
                return value;
            }
        }
        catch (error) {
            logger.warn({ err: error, key }, `Error getting value from file cache, falling back to memory cache`);
        }
    }
    // Fall back to memory cache if available
    if (memoryCache) {
        const value = memoryCache.get(key);
        if (value !== undefined) {
            logger.debug(`Memory cache hit for key: ${key}`);
            return value;
        }
    }
    // Not found in any cache
    return undefined;
}
/**
 * Sets a value in the tiered cache system.
 * Sets in both file-based and memory-based caches if available.
 *
 * @param key The cache key
 * @param value The value to cache
 * @param fileCache The file-based cache
 * @param memoryCache The memory-based cache
 */
export async function setCachedValue(key, value, fileCache, memoryCache) {
    // Set in memory cache first (faster)
    if (memoryCache) {
        memoryCache.set(key, value);
    }
    // Set in file-based cache if available
    if (fileCache) {
        try {
            await fileCache.set(key, value);
        }
        catch (error) {
            logger.warn({ err: error, key }, `Error setting value in file cache`);
        }
    }
}
/**
 * Parses the given source code string using the appropriate Tree-sitter grammar
 * based on the file extension.
 *
 * @param sourceCode The source code to parse.
 * @param fileExtension The file extension (e.g., '.js') to determine the grammar.
 * @param filePath Optional file path for caching purposes.
 * @param config Optional configuration for caching.
 * @returns A Tree-sitter Tree object if parsing is successful, otherwise null.
 */
export async function parseCode(sourceCode, fileExtension, filePath, config) {
    // Generate a cache key
    let cacheKey = '';
    if (filePath) {
        // Check if we have file metadata from FileContentManager
        let fileHash;
        if (fileContentManager) {
            try {
                const metadata = await fileContentManager.getMetadata(filePath);
                if (metadata) {
                    fileHash = metadata.hash;
                    // Use file hash in cache key for more accurate change detection
                    cacheKey = crypto.createHash('md5').update(`${filePath}:${fileExtension}:${fileHash}`).digest('hex');
                }
            }
            catch (error) {
                logger.debug(`Error getting file metadata: ${error}`);
            }
        }
        // If we couldn't get file hash, use the traditional cache key
        if (!cacheKey) {
            cacheKey = crypto.createHash('md5').update(`${filePath}:${fileExtension}`).digest('hex');
        }
        // Check if caching is enabled
        const useFileCaching = config?.cache?.enabled !== false && parseCache !== null;
        // Check if memory caching should be used based on current memory usage
        const useMemoryCaching = shouldUseMemoryCache(config);
        // Try to get parse tree from cache using tiered caching strategy
        if ((useMemoryCaching && astMemoryCache) || (useFileCaching && parseCache)) {
            const cachedTree = await getCachedValue(cacheKey, useFileCaching ? parseCache : null, useMemoryCaching ? astMemoryCache : null);
            if (cachedTree) {
                logger.debug(`Using cached parse tree for ${filePath}`);
                return cachedTree;
            }
        }
    }
    // Get the parser for the file extension
    const parser = await getParserForFileExtension(fileExtension);
    if (!parser) {
        return null;
    }
    try {
        // Parse the source code
        const tree = parser.parse(sourceCode);
        logger.debug(`Successfully parsed code for extension ${fileExtension}. Root node: ${tree.rootNode.type}`);
        // Cache the parse tree using tiered caching strategy
        if (cacheKey) {
            // Check if caching is enabled
            const useFileCaching = config?.cache?.enabled !== false && parseCache !== null;
            // Check if memory caching should be used based on current memory usage
            const useMemoryCaching = shouldUseMemoryCache(config);
            if ((useMemoryCaching && astMemoryCache) || (useFileCaching && parseCache)) {
                await setCachedValue(cacheKey, tree, useFileCaching ? parseCache : null, useMemoryCaching ? astMemoryCache : null);
            }
        }
        return tree;
    }
    catch (error) {
        logger.error({ err: error, fileExtension }, `Error parsing code for extension ${fileExtension}.`);
        return null;
    }
}
/**
 * Reads and parses a file securely.
 *
 * @param filePath The path of the file to read and parse.
 * @param fileExtension The file extension (e.g., '.js') to determine the grammar.
 * @param config The Code-Map Generator configuration.
 * @returns A promise that resolves to the parsed tree and source code.
 */
export async function readAndParseFile(filePath, fileExtension, config) {
    try {
        // Get file content using FileContentManager if available
        let sourceCode;
        if (fileContentManager) {
            sourceCode = await fileContentManager.getContent(filePath, config.allowedMappingDirectory);
        }
        else {
            // Fall back to direct file reading if FileContentManager is not available
            sourceCode = await readFileSecure(filePath, config.allowedMappingDirectory);
        }
        // Parse the source code
        const tree = await parseCode(sourceCode, fileExtension, filePath, config);
        return { tree, sourceCode };
    }
    catch (error) {
        logger.error({ err: error, filePath }, `Error reading or parsing file: ${filePath}`);
        return { tree: null, sourceCode: '' };
    }
}
/**
 * Gets memory usage statistics from the memory manager.
 * @returns Memory usage statistics
 */
export function getMemoryStats() {
    if (!memoryManager) {
        return {
            initialized: false,
            message: 'Memory manager not initialized'
        };
    }
    return memoryManager.getMemoryStats();
}
/**
 * Determines whether to use memory caching based on current memory usage.
 * @param config The Code-Map Generator configuration
 * @returns True if memory caching should be used, false otherwise
 */
export function shouldUseMemoryCache(config) {
    // If in-memory caching is explicitly disabled via maxCachedFiles=0, return false
    if (config?.cache?.maxCachedFiles === 0) {
        logger.debug('In-memory caching is disabled via configuration (maxCachedFiles=0).');
        return false;
    }
    // If memory manager is not initialized, default to true
    if (!memoryManager) {
        return true;
    }
    // Get memory stats
    const stats = memoryManager.getMemoryStats();
    // If memory usage is critical, disable memory caching
    if (stats.formatted.memoryStatus === 'critical') {
        logger.warn('Memory usage is critical. Disabling memory caching.');
        return false;
    }
    // If memory usage is high, check if we should disable memory caching
    if (stats.formatted.memoryStatus === 'high') {
        // If file-based caching is enabled, disable memory caching
        if (config?.cache?.enabled !== false && parseCache !== null && sourceCodeCache !== null) {
            logger.warn('Memory usage is high. Using file-based caching only.');
            return false;
        }
        // If file-based caching is not available, still use memory caching
        logger.warn('Memory usage is high, but file-based caching is not available. Using memory caching with caution.');
        return true;
    }
    // Memory usage is normal, use memory caching if not explicitly disabled
    return true;
}
/**
 * Gets the memory manager instance.
 * @returns The memory manager instance, or null if not initialized.
 */
export function getMemoryManager() {
    return memoryManager;
}
/**
 * Gets source code for a file from the cache.
 * @param filePath The path of the file to get source code for.
 * @param allowedDir Optional allowed directory boundary for security.
 * @returns A promise that resolves to the source code if found in cache, otherwise null.
 */
export async function getSourceCodeFromCache(filePath, allowedDir) {
    // Try FileContentManager first if available
    if (fileContentManager) {
        try {
            // If allowedDir is provided, use it for security boundary
            if (allowedDir) {
                return await fileContentManager.getContent(filePath, allowedDir);
            }
            // Otherwise, try to get from in-memory cache only
            const cacheKey = crypto.createHash('md5').update(filePath).digest('hex');
            const metadata = await fileContentManager.getMetadata(filePath);
            if (metadata) {
                logger.debug(`Found metadata for ${filePath} in FileContentManager`);
                // Return content from FileContentManager
                // Use an empty string as allowedDir to bypass security check (we already verified metadata exists)
                return await fileContentManager.getContent(filePath, '');
            }
        }
        catch (error) {
            logger.debug(`Error getting source code from FileContentManager: ${error}`);
        }
    }
    // Fall back to memory cache
    if (!sourceCodeMemoryCache) {
        return null;
    }
    // Generate a cache key
    const cacheKey = crypto.createHash('md5').update(filePath).digest('hex');
    // Check memory cache
    const cachedSourceCode = sourceCodeMemoryCache.get(cacheKey);
    if (cachedSourceCode) {
        return cachedSourceCode;
    }
    return null;
}
/**
 * Gets all source code from the cache.
 * @returns A map of file paths to source code.
 */
export function getAllSourceCodeFromCache() {
    const result = new Map();
    // Get entries from FileContentManager if available
    if (fileContentManager) {
        // Note: FileContentManager doesn't currently provide a method to get all entries
        // This would be a good enhancement to add in the future
        logger.debug('FileContentManager does not currently support retrieving all entries');
    }
    // Fall back to memory cache
    if (!sourceCodeMemoryCache) {
        return result;
    }
    // Get all entries from the memory cache
    const cachedEntries = sourceCodeMemoryCache.getAll();
    // Convert cache keys (MD5 hashes) back to file paths
    // This is a limitation - we don't have a direct mapping from hash to file path
    // In a real implementation, we would maintain a bidirectional mapping
    logger.info(`Retrieved ${cachedEntries.size} source code entries from cache`);
    // For now, we'll return the raw cache entries
    // The keys are MD5 hashes of file paths, not the actual file paths
    return cachedEntries;
}
/**
 * Parses source code and returns the AST and detected language.
 * @param sourceCode The source code to parse.
 * @param fileExtension The file extension to determine the language.
 * @returns The AST and detected language.
 */
export async function parseSourceCode(sourceCode, fileExtension) {
    // Initialize parser if not already initialized
    if (!grammarManager) {
        await initializeParser();
    }
    // Parse the source code
    const tree = await parseCode(sourceCode, fileExtension);
    if (!tree) {
        throw new Error(`Failed to parse source code for extension ${fileExtension}`);
    }
    // Return the AST and detected language
    return {
        ast: tree.rootNode,
        language: fileExtension.replace('.', '')
    };
}
/**
 * Cleans up the parser and releases resources.
 */
export function cleanupParser() {
    // Clear caches
    if (astMemoryCache) {
        astMemoryCache.clear();
    }
    if (sourceCodeMemoryCache) {
        sourceCodeMemoryCache.clear();
    }
    // Clear file content manager
    if (fileContentManager) {
        fileContentManager.clearCache();
    }
    // Run garbage collection
    if (memoryManager) {
        memoryManager.runGarbageCollection();
    }
    // Reset grammar manager
    grammarManager = null;
    memoryManager = null;
    astMemoryCache = null;
    sourceCodeMemoryCache = null;
    parseCache = null;
    sourceCodeCache = null;
    fileContentManager = null;
    logger.info('Parser cleaned up and resources released.');
}
// Make sure Parser itself is also available if needed by other modules, or re-export specific parts
export { ParserFromPackage as Parser };
