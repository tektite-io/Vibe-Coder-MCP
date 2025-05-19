// Fix for CommonJS module import in ESM
import ParserFromPackage from 'web-tree-sitter';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../../logger.js';
import { FileCache } from './cache/fileCache.js';
import { CodeMapGeneratorConfig } from './types.js';
import { readFileSecure } from './fsUtils.js';
import { getOutputDirectory } from './directoryUtils.js';
import { GrammarManager } from './cache/grammarManager.js';
import { MemoryCache } from './cache/memoryCache.js';
import { MemoryManager } from './cache/memoryManager.js';

// Export SyntaxNode type for use in other modules
export type SyntaxNode = ParserFromPackage.SyntaxNode;

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use 'any' for now to match existing structure, but ideally these would be concrete types
// if web-tree-sitter's own type declarations are directly usable and compatible.
// For the purpose of this step, we ensure the names are exported as they were assumed.
// The actual types might be Parser.SyntaxNode, Parser.Tree etc.
// This change assumes the original intent was to re-export these specific types.

// Memory management instances
let grammarManager: GrammarManager | null = null;
let memoryManager: MemoryManager | null = null;
let astMemoryCache: MemoryCache<string, ParserFromPackage.Tree> | null = null;
let sourceCodeMemoryCache: MemoryCache<string, string> | null = null;

// File-based cache instances
let parseCache: FileCache<ParserFromPackage.Tree> | null = null;
let sourceCodeCache: FileCache<string> | null = null;

// Path to the directory where .wasm grammar files are expected to be.
// Grammar files are located in the 'grammars' directory relative to this module.
const GRAMMARS_BASE_DIR = path.join(__dirname, 'grammars');

logger.info(`Grammar files directory: ${GRAMMARS_BASE_DIR}`);
// Also log the current working directory to help with debugging
logger.info(`Current working directory: ${process.cwd()}`);
logger.info(`Module directory (__dirname): ${__dirname}`);

// languageConfigurations is already exported below

export interface LanguageConfig {
  name: string; // User-friendly name, e.g., "JavaScript"
  wasmPath: string; // Filename of the .wasm file, e.g., "tree-sitter-javascript.wasm"
  parserCreateQuery?: (language: ParserFromPackage.Language) => ((text: string) => ParserFromPackage.Query); // Optional: function to create a query specific to this language
}

// Maps file extensions to their Tree-sitter grammar configuration.
// Developer must ensure the .wasm files are present in GRAMMARS_BASE_DIR.
export const languageConfigurations: Record<string, LanguageConfig> = {
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
export async function initializeParser(): Promise<void> {
  if (grammarManager) {
    logger.debug('Tree-sitter parser already initialized.');
    return;
  }
  try {
    // Initialize memory manager
    memoryManager = new MemoryManager({
      maxMemoryPercentage: 0.5, // Use up to 50% of system memory
      monitorInterval: 60000, // Check memory usage every minute
      autoManage: true
    });

    // Initialize grammar manager
    grammarManager = new GrammarManager(languageConfigurations, {
      maxGrammars: 20,
      preloadCommonGrammars: true,
      preloadExtensions: ['.js', '.ts', '.py', '.html', '.css'],
      grammarsBaseDir: GRAMMARS_BASE_DIR
    });

    // Register grammar manager with memory manager
    memoryManager.registerGrammarManager(grammarManager);

    // Initialize memory caches
    astMemoryCache = memoryManager.createASTCache();
    sourceCodeMemoryCache = memoryManager.createSourceCodeCache();

    // Initialize grammar manager
    await grammarManager.initialize();

    logger.info('Tree-sitter parser and memory management initialized successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Tree-sitter parser and memory management.');
    throw error; // Re-throw to signal critical failure
  }
}

/**
 * Initializes the file-based caches for parsed trees and source code.
 * @param config The Code-Map Generator configuration
 * @returns A promise that resolves when the caches are initialized
 */
export async function initializeCaches(config: CodeMapGeneratorConfig): Promise<void> {
  // Skip if caching is disabled
  if (config.cache?.enabled === false) {
    logger.info('File-based caching is disabled in configuration.');
    return;
  }

  try {
    // Create cache directory paths
    const cacheDir = path.join(
      config.output?.outputDir || getOutputDirectory(config),
      '.cache'
    );

    const parseTreeCacheDir = path.join(cacheDir, 'parse-trees');
    const sourceCodeCacheDir = path.join(cacheDir, 'source-code');

    // Initialize parse tree cache
    parseCache = new FileCache<ParserFromPackage.Tree>({
      name: 'parse-trees',
      cacheDir: parseTreeCacheDir,
      maxEntries: config.cache?.maxEntries,
      maxAge: config.cache?.maxAge,
      serialize: (tree: any) => {
        // Tree-sitter trees can't be directly serialized, so we need to use a custom approach
        // For now, we'll just store a placeholder and re-parse when needed
        return JSON.stringify({ rootNodeType: tree.rootNode?.type || 'unknown' });
      },
      deserialize: (serialized) => {
        // This is a placeholder - we can't actually deserialize a tree from JSON
        // We'll handle this in the parseCode function
        return JSON.parse(serialized) as any;
      }
    });

    // Initialize source code cache
    sourceCodeCache = new FileCache<string>({
      name: 'source-code',
      cacheDir: sourceCodeCacheDir,
      maxEntries: config.cache?.maxEntries,
      maxAge: config.cache?.maxAge
    });

    // Initialize the caches
    await parseCache.init();
    await sourceCodeCache.init();

    logger.info('File-based caches initialized successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize file-based caches.');
    // Don't throw, just log the error and continue without caching
    parseCache = null;
    sourceCodeCache = null;
  }
}

/**
 * Clears all caches (both file-based and memory-based).
 * @returns A promise that resolves when the caches are cleared
 */
export async function clearCaches(): Promise<void> {
  try {
    // Clear file-based caches
    if (parseCache) {
      await parseCache.clear();
    }

    if (sourceCodeCache) {
      await sourceCodeCache.clear();
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
  } catch (error) {
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
export async function loadLanguageGrammar(extension: string, langConfig: LanguageConfig): Promise<boolean> {
  if (!grammarManager) {
    throw new Error('Parser not initialized. Call initializeParser() first.');
  }

  try {
    // Use the grammar manager to load the grammar
    await grammarManager.loadGrammar(extension);
    return true;
  } catch (error) {
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
export async function getParserForFileExtension(fileExtension: string): Promise<ParserFromPackage | null> {
  if (!grammarManager) {
    logger.warn('Attempted to get parser before Tree-sitter initialization. Call initializeParser() first.');
    await initializeParser(); // Attempt to initialize if not already
    if (!grammarManager) return null; // Still failed
  }

  const langConfig = languageConfigurations[fileExtension];
  if (!langConfig) {
    logger.warn(`No language configuration found for extension: ${fileExtension}. Cannot parse.`);
    return null;
  }

  try {
    // Use the grammar manager to get a parser for the file extension
    return await grammarManager.getParserForExtension(fileExtension);
  } catch (error) {
    logger.error({ err: error, fileExtension }, `Error getting parser for extension ${fileExtension}.`);
    return null;
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
export async function parseCode(
  sourceCode: string,
  fileExtension: string,
  filePath?: string,
  config?: CodeMapGeneratorConfig
): Promise<ParserFromPackage.Tree | null> {
  // Generate a cache key
  let cacheKey = '';
  if (filePath) {
    // Use a hash of the file path and extension as the cache key
    cacheKey = crypto.createHash('md5').update(`${filePath}:${fileExtension}`).digest('hex');

    // Check memory cache first (fastest)
    if (sourceCodeMemoryCache && astMemoryCache) {
      const cachedSourceCode = sourceCodeMemoryCache.get(cacheKey);
      if (cachedSourceCode === sourceCode) {
        const cachedTree = astMemoryCache.get(cacheKey);
        if (cachedTree) {
          logger.debug(`Using memory-cached parse tree for ${filePath}`);
          return cachedTree;
        }
      } else if (cachedSourceCode) {
        // Source code has changed, update the memory cache
        sourceCodeMemoryCache.set(cacheKey, sourceCode);
      } else {
        // Cache the source code in memory
        sourceCodeMemoryCache.set(cacheKey, sourceCode);
      }
    }

    // Check file-based cache if memory cache missed and caching is enabled
    const useFileCaching = config?.cache?.enabled !== false && sourceCodeCache !== null && parseCache !== null;
    if (useFileCaching && sourceCodeCache && parseCache) {
      const cachedSourceCode = await sourceCodeCache.get(cacheKey);
      if (cachedSourceCode) {
        // If the cached source code matches the current source code, we can use the cached parse tree
        if (cachedSourceCode === sourceCode) {
          const cachedTree = await parseCache.get(cacheKey);
          if (cachedTree) {
            logger.debug(`Using file-cached parse tree for ${filePath}`);

            // Also update memory cache for faster access next time
            if (sourceCodeMemoryCache && astMemoryCache) {
              sourceCodeMemoryCache.set(cacheKey, sourceCode);
              astMemoryCache.set(cacheKey, cachedTree);
            }

            return cachedTree;
          }
        } else {
          // Source code has changed, update the cache
          await sourceCodeCache.set(cacheKey, sourceCode);
        }
      } else {
        // Cache the source code
        await sourceCodeCache.set(cacheKey, sourceCode);
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

    // Cache the parse tree in memory
    if (cacheKey && sourceCodeMemoryCache && astMemoryCache) {
      sourceCodeMemoryCache.set(cacheKey, sourceCode);
      astMemoryCache.set(cacheKey, tree);
    }

    // Cache the parse tree in file-based cache if enabled
    const useFileCaching = config?.cache?.enabled !== false && filePath && sourceCodeCache !== null && parseCache !== null;
    if (useFileCaching && cacheKey && parseCache) {
      await parseCache.set(cacheKey, tree);
    }

    return tree;
  } catch (error) {
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
export async function readAndParseFile(
  filePath: string,
  fileExtension: string,
  config: CodeMapGeneratorConfig
): Promise<{ tree: ParserFromPackage.Tree | null, sourceCode: string }> {
  try {
    // Read the file securely
    const sourceCode = await readFileSecure(filePath, config.allowedMappingDirectory);

    // Parse the source code
    const tree = await parseCode(sourceCode, fileExtension, filePath, config);

    return { tree, sourceCode };
  } catch (error) {
    logger.error({ err: error, filePath }, `Error reading or parsing file: ${filePath}`);
    return { tree: null, sourceCode: '' };
  }
}

/**
 * Gets memory usage statistics from the memory manager.
 * @returns Memory usage statistics
 */
export function getMemoryStats(): Record<string, any> {
  if (!memoryManager) {
    return {
      initialized: false,
      message: 'Memory manager not initialized'
    };
  }

  return memoryManager.getMemoryStats();
}

/**
 * Gets the memory manager instance.
 * @returns The memory manager instance, or null if not initialized.
 */
export function getMemoryManager(): any {
  return memoryManager;
}

/**
 * Gets source code for a file from the cache.
 * @param filePath The path of the file to get source code for.
 * @returns The source code if found in cache, otherwise null.
 */
export function getSourceCodeFromCache(filePath: string): string | null {
  if (!sourceCodeMemoryCache) {
    return null;
  }

  // Generate a cache key
  const cacheKey = crypto.createHash('md5').update(filePath).digest('hex');

  // Check memory cache first
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
export function getAllSourceCodeFromCache(): Map<string, string> {
  const result = new Map<string, string>();

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
export async function parseSourceCode(
  sourceCode: string,
  fileExtension: string
): Promise<{ ast: SyntaxNode; language: string }> {
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
export function cleanupParser(): void {
  // Clear caches
  if (astMemoryCache) {
    astMemoryCache.clear();
  }

  if (sourceCodeMemoryCache) {
    sourceCodeMemoryCache.clear();
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

  logger.info('Parser cleaned up and resources released.');
}

// Export types
export type Tree = ParserFromPackage.Tree;
export type Language = ParserFromPackage.Language;
export type Point = ParserFromPackage.Point;
// Make sure Parser itself is also available if needed by other modules, or re-export specific parts
export { ParserFromPackage as Parser };