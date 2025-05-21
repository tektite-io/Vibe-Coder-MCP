/**
 * Language handler registry for the Code-Map Generator tool.
 * This file contains the registry for mapping file extensions to language handlers.
 */

import { LanguageHandler } from '../types.js';
import { DefaultLanguageHandler } from './default.js';
import logger from '../../../logger.js';

// Import language-specific handlers
import { JavaScriptHandler } from './javascript.js';
import { TypeScriptHandler } from './typescript.js';
import { PythonHandler } from './python.js';
import { JavaHandler } from './java.js';
import { CSharpHandler } from './csharp.js';
import { GoHandler } from './go.js';
import { RubyHandler } from './ruby.js';
import { RustHandler } from './rust.js';
import { PhpHandler } from './php.js';
import { SwiftHandler } from './swift.js';
import { KotlinHandler } from './kotlin.js';
import { CppHandler } from './cpp.js';
import { ScalaHandler } from './scala.js';
import { ObjectiveCHandler } from './objectivec.js';
import { ElixirHandler } from './elixir.js';
import { LuaHandler } from './lua.js';
import { BashHandler } from './bash.js';
import { DartHandler } from './dart.js';
import { RHandler } from './r.js';
import { YamlHandler } from './yaml.js';
import { GraphQLHandler } from './graphql.js';
import { JsonHandler } from './json.js';
import { HtmlHandler } from './html.js';
import { VueHandler } from './vue.js';
import { TomlHandler } from './toml.js';

/**
 * Registry for language handlers.
 * Maps file extensions to language handlers.
 */
export class LanguageHandlerRegistry {
  private handlers: Map<string, LanguageHandler> = new Map();
  private defaultHandler: DefaultLanguageHandler;

  // Static instance for use in tests
  private static instance: LanguageHandlerRegistry;

  /**
   * Gets the singleton instance of the registry.
   */
  public static getInstance(): LanguageHandlerRegistry {
    if (!LanguageHandlerRegistry.instance) {
      LanguageHandlerRegistry.instance = new LanguageHandlerRegistry();
    }
    return LanguageHandlerRegistry.instance;
  }

  /**
   * Static method to register a handler.
   */
  public static registerHandler(extension: string, handler: LanguageHandler): void {
    LanguageHandlerRegistry.getInstance().registerHandler(extension, handler);
  }

  /**
   * Static method to get a handler.
   */
  public static getHandler(extension: string): LanguageHandler {
    return LanguageHandlerRegistry.getInstance().getHandler(extension);
  }

  constructor() {
    this.defaultHandler = new DefaultLanguageHandler();
    this.registerDefaultHandlers();
  }

  /**
   * Registers the default language handlers.
   */
  private registerDefaultHandlers(): void {
    // Register JavaScript handlers
    this.registerHandler('.js', new JavaScriptHandler());
    this.registerHandler('.jsx', new JavaScriptHandler(true)); // JSX support
    this.registerHandler('.mjs', new JavaScriptHandler());
    this.registerHandler('.cjs', new JavaScriptHandler());

    // Register TypeScript handlers
    this.registerHandler('.ts', new TypeScriptHandler());
    this.registerHandler('.tsx', new TypeScriptHandler(true)); // TSX support
    this.registerHandler('.mts', new TypeScriptHandler());
    this.registerHandler('.cts', new TypeScriptHandler());

    // Register Python handlers
    this.registerHandler('.py', new PythonHandler());
    this.registerHandler('.pyi', new PythonHandler());
    this.registerHandler('.pyx', new PythonHandler());
    this.registerHandler('.pyw', new PythonHandler());

    // Register Java handlers
    this.registerHandler('.java', new JavaHandler());
    this.registerHandler('.jsp', new JavaHandler());

    // Register C# handlers
    this.registerHandler('.cs', new CSharpHandler());
    this.registerHandler('.cshtml', new CSharpHandler());
    this.registerHandler('.razor', new CSharpHandler());

    // Register Go handlers
    this.registerHandler('.go', new GoHandler());

    // Register Ruby handlers
    this.registerHandler('.rb', new RubyHandler());
    this.registerHandler('.rake', new RubyHandler());
    this.registerHandler('.gemspec', new RubyHandler());

    // Register Rust handlers
    this.registerHandler('.rs', new RustHandler());

    // Register PHP handlers
    this.registerHandler('.php', new PhpHandler());
    this.registerHandler('.phtml', new PhpHandler());

    // Register Swift handlers
    this.registerHandler('.swift', new SwiftHandler());

    // Register Kotlin handlers
    this.registerHandler('.kt', new KotlinHandler());
    this.registerHandler('.kts', new KotlinHandler());

    // Register C/C++ handlers
    this.registerHandler('.c', new CppHandler());
    this.registerHandler('.h', new CppHandler());
    this.registerHandler('.cpp', new CppHandler());
    this.registerHandler('.hpp', new CppHandler());
    this.registerHandler('.cc', new CppHandler());
    this.registerHandler('.cxx', new CppHandler());

    // Register Scala handlers
    this.registerHandler('.scala', new ScalaHandler());
    this.registerHandler('.sc', new ScalaHandler());

    // Register Objective-C handlers
    this.registerHandler('.m', new ObjectiveCHandler());
    this.registerHandler('.mm', new ObjectiveCHandler());

    // Register Elixir handlers
    this.registerHandler('.ex', new ElixirHandler());
    this.registerHandler('.exs', new ElixirHandler());

    // Register Lua handlers
    this.registerHandler('.lua', new LuaHandler());

    // Register Bash/Shell handlers
    this.registerHandler('.sh', new BashHandler());
    this.registerHandler('.bash', new BashHandler());
    this.registerHandler('.zsh', new BashHandler());

    // Register Dart/Flutter handlers
    this.registerHandler('.dart', new DartHandler());

    // Register R handlers
    this.registerHandler('.r', new RHandler());
    this.registerHandler('.R', new RHandler());
    this.registerHandler('.rmd', new RHandler());

    // Register YAML/Configuration handlers
    this.registerHandler('.yaml', new YamlHandler());
    this.registerHandler('.yml', new YamlHandler());
    this.registerHandler('.ini', new YamlHandler());

    // Register JSON handlers
    this.registerHandler('.json', new JsonHandler());
    this.registerHandler('.jsonc', new JsonHandler());
    this.registerHandler('.json5', new JsonHandler());

    // Register TOML handlers
    this.registerHandler('.toml', new TomlHandler());

    // Register HTML handlers
    this.registerHandler('.html', new HtmlHandler());
    this.registerHandler('.htm', new HtmlHandler());
    this.registerHandler('.xhtml', new HtmlHandler());
    this.registerHandler('.svg', new HtmlHandler());

    // Register Vue handlers
    this.registerHandler('.vue', new VueHandler());

    // Register GraphQL/Schema handlers
    this.registerHandler('.graphql', new GraphQLHandler());
    this.registerHandler('.gql', new GraphQLHandler());
    this.registerHandler('.graphqls', new GraphQLHandler());

    logger.debug('Registered default language handlers');
  }

  /**
   * Registers a language handler for a file extension.
   * @param extension The file extension (e.g., '.js').
   * @param handler The language handler to register.
   */
  public registerHandler(extension: string, handler: LanguageHandler): void {
    this.handlers.set(extension.toLowerCase(), handler);
    logger.debug(`Registered language handler for ${extension}`);
  }

  /**
   * Gets the language handler for a file extension.
   * @param extension The file extension (e.g., '.js').
   * @returns The language handler for the extension, or the default handler if none is registered.
   */
  public getHandler(extension: string): LanguageHandler {
    const handler = this.handlers.get(extension.toLowerCase());
    if (handler) {
      return handler;
    }

    logger.debug(`No specific handler found for ${extension}, using default handler`);
    return this.defaultHandler;
  }

  /**
   * Checks if a language handler is registered for a file extension.
   * @param extension The file extension (e.g., '.js').
   * @returns True if a handler is registered, false otherwise.
   */
  public hasHandler(extension: string): boolean {
    return this.handlers.has(extension.toLowerCase());
  }

  /**
   * Gets all registered file extensions.
   * @returns An array of registered file extensions.
   */
  public getRegisteredExtensions(): string[] {
    return Array.from(this.handlers.keys());
  }
}

// Create and export a singleton instance
const languageHandlerRegistry = new LanguageHandlerRegistry();
export default languageHandlerRegistry;

/**
 * Gets the language handler for a file extension.
 * @param extension The file extension (e.g., '.js').
 * @returns The language handler for the extension, or the default handler if none is registered.
 */
export function getLanguageHandler(extension: string): LanguageHandler {
  return languageHandlerRegistry.getHandler(extension);
}

/**
 * Registers a language handler for a file extension.
 * @param extension The file extension (e.g., '.js').
 * @param handler The language handler to register.
 */
export function registerLanguageHandler(extension: string, handler: LanguageHandler): void {
  languageHandlerRegistry.registerHandler(extension, handler);
}
