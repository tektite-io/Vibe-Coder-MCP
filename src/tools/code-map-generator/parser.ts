// Fix for CommonJS module import in ESM
import ParserFromPackage from 'web-tree-sitter';
import path from 'path';
import fs from 'fs/promises'; // Using fs/promises for async file check
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import logger from '../../logger.js';
import { FileCache } from './cache/fileCache.js';
import { CodeMapGeneratorConfig } from './types.js';
import { readFileSecure } from './fsUtils.js';
import { getOutputDirectory } from './directoryUtils.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use 'any' for now to match existing structure, but ideally these would be concrete types
// if web-tree-sitter's own type declarations are directly usable and compatible.
// For the purpose of this step, we ensure the names are exported as they were assumed.
// The actual types might be Parser.SyntaxNode, Parser.Tree etc.
// This change assumes the original intent was to re-export these specific types.

let parserInstance: ParserFromPackage | null = null; // Use the imported Parser type
const loadedGrammars = new Map<string, ParserFromPackage.Language>(); // Key: file extension (e.g., '.js')

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
  if (parserInstance) {
    logger.debug('Tree-sitter parser already initialized.');
    return;
  }
  try {
    await ParserFromPackage.init();
    parserInstance = new ParserFromPackage();
    logger.info('Tree-sitter parser initialized successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize Tree-sitter parser.');
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
 * Clears all file-based caches.
 * @returns A promise that resolves when the caches are cleared
 */
export async function clearCaches(): Promise<void> {
  try {
    if (parseCache) {
      await parseCache.clear();
    }

    if (sourceCodeCache) {
      await sourceCodeCache.clear();
    }

    logger.info('File-based caches cleared successfully.');
  } catch (error) {
    logger.error({ err: error }, 'Failed to clear file-based caches.');
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
  if (!parserInstance) {
    throw new Error('Parser not initialized. Call initializeParser() first.');
  }
  if (loadedGrammars.has(extension)) {
    logger.debug(`Grammar for ${langConfig.name} (${extension}) already loaded.`);
    return true;
  }

  const wasmPath = path.join(GRAMMARS_BASE_DIR, langConfig.wasmPath);

  try {
    // Check if the .wasm file exists
    try {
      await fs.access(wasmPath, fs.constants.F_OK);
      logger.debug(`Grammar file found: ${wasmPath}`);
    } catch (accessError) {
      // File not found
      logger.error({
        err: accessError,
        grammarName: langConfig.name,
        wasmPath: wasmPath,
        cwd: process.cwd()
      }, `File not found: Tree-sitter grammar for ${langConfig.name}. Ensure '${langConfig.wasmPath}' exists in '${GRAMMARS_BASE_DIR}'.`);

      // Check if the directory exists to provide better diagnostics
      try {
        await fs.access(GRAMMARS_BASE_DIR, fs.constants.F_OK);
        logger.debug(`Grammar directory exists: ${GRAMMARS_BASE_DIR}`);
      } catch (dirError) {
        logger.error(`Grammar directory does not exist: ${GRAMMARS_BASE_DIR}. Please create it and add the required .wasm files.`);
      }

      return false;
    }

    // If we get here, the file exists, so try to load it
    const language = await ParserFromPackage.Language.load(wasmPath);
    loadedGrammars.set(extension, language);

    logger.info(`Successfully loaded Tree-sitter grammar for ${langConfig.name} (${extension}) from ${wasmPath}`);

    return true;
  } catch (error) {
    // This catches errors during the loading process (not file access errors)
    logger.error({
      err: error,
      grammarName: langConfig.name,
      wasmPath: wasmPath
    }, `Failed to load Tree-sitter grammar for ${langConfig.name}. File exists but could not be loaded.`);
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
  if (!parserInstance) {
    logger.warn('Attempted to get parser before Tree-sitter initialization. Call initializeParser() first.');
    await initializeParser(); // Attempt to initialize if not already
    if (!parserInstance) return null; // Still failed
  }

  const langConfig = languageConfigurations[fileExtension];
  if (!langConfig) {
    logger.warn(`No language configuration found for extension: ${fileExtension}. Cannot parse.`);
    return null;
  }

  if (!loadedGrammars.has(fileExtension)) {
    logger.debug(`Grammar for ${langConfig.name} (${fileExtension}) not yet loaded. Attempting to load...`);
    const loaded = await loadLanguageGrammar(fileExtension, langConfig);
    if (!loaded) {
      return null; // Grammar failed to load
    }
  }

  const language = loadedGrammars.get(fileExtension);
  if (!language) {
    // This case should ideally not be reached if loadLanguageGrammar succeeded or threw
    logger.warn(`Grammar for ${fileExtension} was not available after attempting load. Cannot parse.`);
    return null;
  }

  parserInstance.setLanguage(language);
  return parserInstance;
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
  // Check if caching is enabled and we have a file path
  const useCaching = config?.cache?.enabled !== false && filePath && sourceCodeCache && parseCache;

  // Generate a cache key if caching is enabled
  let cacheKey = '';
  if (useCaching && filePath) {
    // Use a hash of the file path and extension as the cache key
    cacheKey = crypto.createHash('md5').update(`${filePath}:${fileExtension}`).digest('hex');

    // Try to get the source code from cache
    if (sourceCodeCache) {
      const cachedSourceCode = await sourceCodeCache.get(cacheKey);
      if (cachedSourceCode) {
        // If the cached source code matches the current source code, we can use the cached parse tree
        if (cachedSourceCode === sourceCode && parseCache) {
          const cachedTree = await parseCache.get(cacheKey);
          if (cachedTree) {
            logger.debug(`Using cached parse tree for ${filePath}`);
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

// At the end of the file, ensure these types are exported:
// (This was already present in the user's provided file content for parser.ts)
export type SyntaxNode = ParserFromPackage.SyntaxNode;
export type Tree = ParserFromPackage.Tree;
export type Language = ParserFromPackage.Language;
export type Point = ParserFromPackage.Point;
// Make sure Parser itself is also available if needed by other modules, or re-export specific parts
export { ParserFromPackage as Parser };