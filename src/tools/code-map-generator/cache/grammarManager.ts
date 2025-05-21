/**
 * Grammar Manager for the Code-Map Generator tool.
 * This file contains the GrammarManager class for lazy loading and managing Tree-sitter grammars.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import ParserFromPackage from 'web-tree-sitter';
import logger from '../../../logger.js';
import { LanguageConfig } from '../parser.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the directory where .wasm grammar files are expected to be.
// Grammar files are located in the 'grammars' directory relative to the parser module.
const GRAMMARS_BASE_DIR = path.join(__dirname, '..', 'grammars');

/**
 * Options for the GrammarManager.
 */
export interface GrammarManagerOptions {
  /**
   * The maximum number of grammars to keep in memory.
   * Default: 20
   */
  maxGrammars?: number;

  /**
   * Whether to preload common grammars on initialization.
   * Default: false
   */
  preloadCommonGrammars?: boolean;

  /**
   * The list of file extensions to preload.
   * Default: ['.js', '.ts', '.py', '.html', '.css']
   */
  preloadExtensions?: string[];

  /**
   * The base directory for grammar files.
   * Default: GRAMMARS_BASE_DIR
   */
  grammarsBaseDir?: string;
}

/**
 * Manages Tree-sitter grammars with lazy loading and LRU eviction.
 */
export class GrammarManager {
  private initialized: boolean = false;
  private parser: ParserFromPackage | null = null;
  private grammars: Map<string, ParserFromPackage.Language> = new Map();
  private grammarConfigs: Record<string, LanguageConfig> = {};
  private lruList: string[] = []; // Tracks grammar usage for LRU eviction
  private options: Required<GrammarManagerOptions>;
  private grammarsBaseDir: string;

  /**
   * Default options for the GrammarManager.
   */
  private static readonly DEFAULT_OPTIONS: Required<GrammarManagerOptions> = {
    maxGrammars: 20,
    preloadCommonGrammars: false,
    preloadExtensions: ['.js', '.ts', '.py', '.html', '.css'],
    grammarsBaseDir: GRAMMARS_BASE_DIR
  };

  /**
   * Creates a new GrammarManager instance.
   * @param grammarConfigs The language configurations
   * @param options The manager options
   */
  constructor(
    grammarConfigs: Record<string, LanguageConfig>,
    options: GrammarManagerOptions = {}
  ) {
    this.grammarConfigs = grammarConfigs;

    // Apply default options
    this.options = {
      ...GrammarManager.DEFAULT_OPTIONS,
      ...options
    };

    this.grammarsBaseDir = this.options.grammarsBaseDir;

    logger.info(`Grammar files directory: ${this.grammarsBaseDir}`);
    logger.debug(`GrammarManager created with max grammars: ${this.options.maxGrammars}`);
  }

  /**
   * Initializes the grammar manager.
   * @returns A promise that resolves when the manager is initialized
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Initialize Tree-sitter
      await ParserFromPackage.init();
      this.parser = new ParserFromPackage();

      // Preload common grammars if enabled
      if (this.options.preloadCommonGrammars) {
        await this.preloadGrammars();
      }

      this.initialized = true;
      logger.info('GrammarManager initialized successfully.');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize GrammarManager.');
      throw error;
    }
  }

  /**
   * Preloads common grammars.
   * @returns A promise that resolves when the grammars are preloaded
   */
  public async preloadGrammars(): Promise<void> {
    logger.debug(`Preloading grammars for extensions: ${this.options.preloadExtensions.join(', ')}`);

    const preloadPromises = this.options.preloadExtensions.map(ext =>
      this.loadGrammar(ext).catch(error => {
        logger.warn({ err: error, extension: ext }, `Failed to preload grammar for ${ext}`);
      })
    );

    await Promise.all(preloadPromises);
  }

  /**
   * Loads a grammar for a file extension.
   * @param extension The file extension
   * @returns A promise that resolves to the loaded language
   */
  public async loadGrammar(extension: string): Promise<ParserFromPackage.Language> {
    this.ensureInitialized();

    // Check if the grammar is already loaded
    if (this.grammars.has(extension)) {
      // Update LRU list
      this.updateLRU(extension);
      return this.grammars.get(extension)!;
    }

    // Get the language configuration
    const langConfig = this.grammarConfigs[extension];
    if (!langConfig) {
      throw new Error(`No language configuration found for extension: ${extension}`);
    }

    // Load the grammar
    try {
      const wasmPath = path.join(this.grammarsBaseDir, langConfig.wasmPath);

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
        }, `File not found: Tree-sitter grammar for ${langConfig.name}. Ensure '${langConfig.wasmPath}' exists in '${this.grammarsBaseDir}'.`);

        throw new Error(`Grammar file not found: ${wasmPath}`);
      }

      // Load the grammar
      const language = await ParserFromPackage.Language.load(wasmPath);

      // Evict least recently used grammar if we've reached the limit
      if (this.grammars.size >= this.options.maxGrammars) {
        this.evictLRU();
      }

      // Add the grammar to the cache
      this.grammars.set(extension, language);
      this.updateLRU(extension);

      logger.info(`Successfully loaded Tree-sitter grammar for ${langConfig.name} (${extension})`);

      return language;
    } catch (error) {
      logger.error({
        err: error,
        grammarName: langConfig.name,
        extension
      }, `Failed to load Tree-sitter grammar for ${langConfig.name}`);
      throw error;
    }
  }

  /**
   * Updates the LRU list for a grammar.
   * @param extension The file extension
   */
  private updateLRU(extension: string): void {
    // Remove the extension from the LRU list if it exists
    const index = this.lruList.indexOf(extension);
    if (index !== -1) {
      this.lruList.splice(index, 1);
    }

    // Add the extension to the front of the LRU list
    this.lruList.unshift(extension);
  }

  /**
   * Evicts the least recently used grammar.
   */
  private evictLRU(): void {
    if (this.lruList.length === 0) {
      return;
    }

    // Get the least recently used extension
    const lruExtension = this.lruList.pop();
    if (lruExtension) {
      // Remove the grammar from the cache
      this.grammars.delete(lruExtension);
      logger.debug(`Evicted grammar for extension ${lruExtension} due to LRU policy`);
    }
  }

  /**
   * Gets a parser configured for a file extension.
   * @param extension The file extension
   * @returns A promise that resolves to the configured parser
   */
  public async getParserForExtension(extension: string): Promise<ParserFromPackage> {
    this.ensureInitialized();

    // Load the grammar if not already loaded
    const language = await this.loadGrammar(extension);

    // Set the language on the parser
    this.parser!.setLanguage(language);

    return this.parser!;
  }

  /**
   * Ensures the grammar manager is initialized.
   * @throws Error if the manager is not initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('GrammarManager is not initialized. Call initialize() first.');
    }
  }

  /**
   * Checks if the grammar manager is initialized.
   * @returns Whether the grammar manager is initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the list of loaded grammar extensions.
   * @returns The list of loaded grammar extensions
   */
  public getLoadedGrammars(): string[] {
    return Array.from(this.grammars.keys());
  }

  /**
   * Gets statistics about the grammar manager.
   * @returns The grammar manager statistics
   */
  public getStats(): Record<string, any> {
    return {
      loadedGrammars: this.grammars.size,
      maxGrammars: this.options.maxGrammars,
      lruList: [...this.lruList],
      initialized: this.initialized
    };
  }

  /**
   * Gets the options used by the grammar manager.
   * @returns The grammar manager options
   */
  public getOptions(): Required<GrammarManagerOptions> {
    return { ...this.options };
  }

  /**
   * Unloads all grammars except for the most recently used ones.
   * This helps reduce memory usage when grammars are no longer needed.
   *
   * @param keepCount The number of most recently used grammars to keep (default: 5)
   * @returns The number of unloaded grammars
   */
  public unloadUnusedGrammars(keepCount: number = 5): number {
    this.ensureInitialized();

    // If we have fewer grammars than the keep count, don't unload anything
    if (this.grammars.size <= keepCount) {
      logger.debug(`Not unloading any grammars. Only ${this.grammars.size} loaded, keeping ${keepCount}`);
      return 0;
    }

    // Get the grammars to keep (most recently used)
    const grammarsToKeep = this.lruList.slice(0, keepCount);

    // Get the grammars to unload
    const grammarsToUnload = this.lruList.slice(keepCount);

    // Unload the grammars
    let unloadedCount = 0;
    for (const extension of grammarsToUnload) {
      this.grammars.delete(extension);
      unloadedCount++;
    }

    // Update the LRU list
    this.lruList = grammarsToKeep;

    logger.info(`Unloaded ${unloadedCount} unused grammars. Keeping ${grammarsToKeep.length} most recently used.`);
    return unloadedCount;
  }
}
