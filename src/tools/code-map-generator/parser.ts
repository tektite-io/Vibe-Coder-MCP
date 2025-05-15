// Fix for CommonJS module import in ESM
import ParserFromPackage from 'web-tree-sitter';
import path from 'path';
import fs from 'fs/promises'; // Using fs/promises for async file check
import logger from '../../logger.js';

// Use 'any' for now to match existing structure, but ideally these would be concrete types
// if web-tree-sitter's own type declarations are directly usable and compatible.
// For the purpose of this step, we ensure the names are exported as they were assumed.
// The actual types might be Parser.SyntaxNode, Parser.Tree etc.
// This change assumes the original intent was to re-export these specific types.

let parserInstance: ParserFromPackage | null = null; // Use the imported Parser type
const loadedGrammars = new Map<string, ParserFromPackage.Language>(); // Key: file extension (e.g., '.js')

// Path to the directory where .wasm grammar files are expected to be.
// Assumes a 'public/grammars' directory in the project root.
// This might need to be configurable or determined differently in a deployed environment.
const GRAMMARS_BASE_DIR = path.resolve(process.cwd(), 'public/grammars');

export interface LanguageConfig {
  name: string; // User-friendly name, e.g., "JavaScript"
  wasmPath: string; // Filename of the .wasm file, e.g., "tree-sitter-javascript.wasm"
  parserCreateQuery?: (language: any) => ((text: string) => any); // Optional: function to create a query specific to this language
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

  const fullWasmPath = path.join(GRAMMARS_BASE_DIR, langConfig.wasmPath);

  try {
    // Check if the .wasm file exists before attempting to load
    await fs.access(fullWasmPath, fs.constants.F_OK);
    const language = await ParserFromPackage.Language.load(fullWasmPath);
    loadedGrammars.set(extension, language);
    logger.info(`Successfully loaded Tree-sitter grammar for ${langConfig.name} (${extension}) from ${fullWasmPath}`);
    return true;
  } catch (error) {
    logger.error({ err: error, grammarName: langConfig.name, wasmPath: fullWasmPath }, `Failed to load Tree-sitter grammar for ${langConfig.name}. Ensure '${langConfig.wasmPath}' exists in '${GRAMMARS_BASE_DIR}'.`);
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
export async function getParserForFileExtension(fileExtension: string): Promise<any | null> {
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
 * @returns A Tree-sitter Tree object if parsing is successful, otherwise null.
 */
export async function parseCode(sourceCode: string, fileExtension: string): Promise<any | null> {
  const parser = await getParserForFileExtension(fileExtension);
  if (!parser) {
    return null;
  }
  try {
    const tree = parser.parse(sourceCode);
    logger.debug(`Successfully parsed code for extension ${fileExtension}. Root node: ${tree.rootNode.type}`);
    return tree;
  } catch (error) {
    logger.error({ err: error, fileExtension }, `Error parsing code for extension ${fileExtension}.`);
    return null;
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