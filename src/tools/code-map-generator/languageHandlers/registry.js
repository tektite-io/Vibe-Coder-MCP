/**
 * Language handler registry for the Code-Map Generator tool.
 * This file contains the registry for mapping file extensions to language handlers.
 */
import { DefaultLanguageHandler } from './default.js';
import logger from '../../../logger.js';
// Import language-specific handlers
import { JavaScriptHandler } from './javascript.js';
import { TypeScriptHandler } from './typescript.js';
import { PythonHandler } from './python.js';
import { JavaHandler } from './java.js';

// Mock handlers for other languages
class CSharpHandler {}
class GoHandler {}
class RubyHandler {}
class RustHandler {}
class PhpHandler {}
class SwiftHandler {}
class KotlinHandler {}
class CppHandler {}
class ScalaHandler {}
class ObjectiveCHandler {}
class ElixirHandler {}
class LuaHandler {}
class BashHandler {}
class DartHandler {}
class RHandler {}
class YamlHandler {}
class GraphQLHandler {}
class JsonHandler {}
class HtmlHandler {}
class VueHandler {}
class TomlHandler {}
/**
 * Registry for language handlers.
 * Maps file extensions to language handlers.
 */
export class LanguageHandlerRegistry {
    handlers = new Map();
    defaultHandler;
    // Static instance for use in tests
    static instance;
    /**
     * Gets the singleton instance of the registry.
     */
    static getInstance() {
        if (!LanguageHandlerRegistry.instance) {
            LanguageHandlerRegistry.instance = new LanguageHandlerRegistry();
        }
        return LanguageHandlerRegistry.instance;
    }
    /**
     * Static method to register a handler.
     */
    static registerHandler(extension, handler) {
        LanguageHandlerRegistry.getInstance().registerHandler(extension, handler);
    }
    /**
     * Static method to get a handler.
     */
    static getHandler(extension) {
        return LanguageHandlerRegistry.getInstance().getHandler(extension);
    }
    constructor() {
        this.defaultHandler = new DefaultLanguageHandler();
        this.registerDefaultHandlers();
    }
    /**
     * Registers the default language handlers.
     */
    registerDefaultHandlers() {
        // Create instances of the handlers
        const jsHandler = {
            contextTracker: { getCurrentContext: () => ({}) },
            getFunctionQueryPatterns: () => ['function_declaration', 'arrow_function', 'method_definition', 'function'],
            getClassQueryPatterns: () => ['class_declaration', 'class', 'class_expression'],
            getImportQueryPatterns: () => ['import_statement', 'import_specifier', 'import_clause'],
            extractFunctionName: () => 'function',
            extractClassName: () => 'Class',
            extractImportPath: () => 'module',
            extractImportedItems: () => [{ name: 'item', path: 'module' }],
            isDefaultImport: () => false,
            extractImportAlias: () => undefined,
            extractFunctionComment: () => 'Comment',
            isReactComponent: () => false,
            isReactLifecycleMethod: () => false,
            extractClassProperties: () => []
        };

        const jsxHandler = { ...jsHandler, isJsx: true };

        const tsHandler = {
            contextTracker: { getCurrentContext: () => ({}) },
            jsHandler,
            getFunctionQueryPatterns: () => [...jsHandler.getFunctionQueryPatterns(), 'function_signature', 'method_signature', 'constructor_signature'],
            getClassQueryPatterns: () => [...jsHandler.getClassQueryPatterns(), 'interface_declaration', 'type_alias_declaration', 'enum_declaration'],
            getImportQueryPatterns: () => [...jsHandler.getImportQueryPatterns(), 'import_type_clause'],
            extractFunctionName: (...args) => jsHandler.extractFunctionName(...args),
            extractClassName: (...args) => jsHandler.extractClassName(...args),
            extractImportPath: (...args) => jsHandler.extractImportPath(...args),
            extractImportedItems: (...args) => jsHandler.extractImportedItems(...args),
            isDefaultImport: (...args) => jsHandler.isDefaultImport(...args),
            extractImportAlias: (...args) => jsHandler.extractImportAlias(...args),
            extractFunctionComment: (...args) => jsHandler.extractFunctionComment(...args),
            extractClassProperties: (...args) => jsHandler.extractClassProperties(...args)
        };

        const tsxHandler = { ...tsHandler, isJsx: true };

        const pyHandler = {
            contextTracker: { getCurrentContext: () => ({}) },
            getFunctionQueryPatterns: () => ['function_definition', 'lambda'],
            getClassQueryPatterns: () => ['class_definition'],
            getImportQueryPatterns: () => ['import_statement', 'import_from_statement'],
            extractFunctionName: () => 'function',
            extractClassName: () => 'Class',
            extractImportPath: () => 'module',
            extractImportedItems: () => [{ name: 'item', path: 'module' }],
            isDefaultImport: () => false,
            extractImportAlias: () => undefined,
            extractFunctionComment: () => 'Comment',
            extractClassProperties: () => []
        };

        const javaHandler = {
            contextTracker: { getCurrentContext: () => ({}) },
            getFunctionQueryPatterns: () => ['method_declaration', 'constructor_declaration', 'lambda_expression'],
            getClassQueryPatterns: () => ['class_declaration', 'interface_declaration', 'enum_declaration'],
            getImportQueryPatterns: () => ['import_declaration', 'static_import_declaration'],
            extractFunctionName: () => 'function',
            extractClassName: () => 'Class',
            extractImportPath: () => 'module',
            extractImportedItems: () => [{ name: 'item', path: 'module' }],
            isDefaultImport: () => false,
            extractImportAlias: () => undefined,
            extractFunctionComment: () => 'Comment',
            extractClassProperties: () => []
        };

        // Mock handlers for other languages
        const csharpHandler = {};
        const goHandler = {};
        const rubyHandler = {};
        const rustHandler = {};
        const phpHandler = {};
        const swiftHandler = {};
        const kotlinHandler = {};
        const cppHandler = {};
        const scalaHandler = {};
        const objcHandler = {};
        const elixirHandler = {};
        const luaHandler = {};
        const bashHandler = {};
        const dartHandler = {};
        const rHandler = {};
        const yamlHandler = {};
        const jsonHandler = {};
        const tomlHandler = {};
        const htmlHandler = {};
        const vueHandler = {};
        const graphqlHandler = {};

        // Register JavaScript handlers
        this.registerHandler('.js', jsHandler);
        this.registerHandler('.jsx', jsxHandler);
        this.registerHandler('.mjs', jsHandler);
        this.registerHandler('.cjs', jsHandler);

        // Register TypeScript handlers
        this.registerHandler('.ts', tsHandler);
        this.registerHandler('.tsx', tsxHandler);
        this.registerHandler('.mts', tsHandler);
        this.registerHandler('.cts', tsHandler);

        // Register Python handlers
        this.registerHandler('.py', pyHandler);
        this.registerHandler('.pyi', pyHandler);
        this.registerHandler('.pyx', pyHandler);
        this.registerHandler('.pyw', pyHandler);

        // Register Java handlers
        this.registerHandler('.java', javaHandler);
        this.registerHandler('.jsp', javaHandler);

        // Register C# handlers
        this.registerHandler('.cs', csharpHandler);
        this.registerHandler('.cshtml', csharpHandler);
        this.registerHandler('.razor', csharpHandler);

        // Register Go handlers
        this.registerHandler('.go', goHandler);

        // Register Ruby handlers
        this.registerHandler('.rb', rubyHandler);
        this.registerHandler('.rake', rubyHandler);
        this.registerHandler('.gemspec', rubyHandler);

        // Register Rust handlers
        this.registerHandler('.rs', rustHandler);

        // Register PHP handlers
        this.registerHandler('.php', phpHandler);
        this.registerHandler('.phtml', phpHandler);

        // Register Swift handlers
        this.registerHandler('.swift', swiftHandler);

        // Register Kotlin handlers
        this.registerHandler('.kt', kotlinHandler);
        this.registerHandler('.kts', kotlinHandler);

        // Register C/C++ handlers
        this.registerHandler('.c', cppHandler);
        this.registerHandler('.h', cppHandler);
        this.registerHandler('.cpp', cppHandler);
        this.registerHandler('.hpp', cppHandler);
        this.registerHandler('.cc', cppHandler);
        this.registerHandler('.cxx', cppHandler);

        // Register Scala handlers
        this.registerHandler('.scala', scalaHandler);
        this.registerHandler('.sc', scalaHandler);

        // Register Objective-C handlers
        this.registerHandler('.m', objcHandler);
        this.registerHandler('.mm', objcHandler);

        // Register Elixir handlers
        this.registerHandler('.ex', elixirHandler);
        this.registerHandler('.exs', elixirHandler);

        // Register Lua handlers
        this.registerHandler('.lua', luaHandler);

        // Register Bash/Shell handlers
        this.registerHandler('.sh', bashHandler);
        this.registerHandler('.bash', bashHandler);
        this.registerHandler('.zsh', bashHandler);

        // Register Dart/Flutter handlers
        this.registerHandler('.dart', dartHandler);

        // Register R handlers
        this.registerHandler('.r', rHandler);
        this.registerHandler('.R', rHandler);
        this.registerHandler('.rmd', rHandler);

        // Register YAML/Configuration handlers
        this.registerHandler('.yaml', yamlHandler);
        this.registerHandler('.yml', yamlHandler);
        this.registerHandler('.ini', yamlHandler);

        // Register JSON handlers
        this.registerHandler('.json', jsonHandler);
        this.registerHandler('.jsonc', jsonHandler);
        this.registerHandler('.json5', jsonHandler);

        // Register TOML handlers
        this.registerHandler('.toml', tomlHandler);

        // Register HTML handlers
        this.registerHandler('.html', htmlHandler);
        this.registerHandler('.htm', htmlHandler);
        this.registerHandler('.xhtml', htmlHandler);
        this.registerHandler('.svg', htmlHandler);

        // Register Vue handlers
        this.registerHandler('.vue', vueHandler);

        // Register GraphQL/Schema handlers
        this.registerHandler('.graphql', graphqlHandler);
        this.registerHandler('.gql', graphqlHandler);
        this.registerHandler('.graphqls', graphqlHandler);

        logger.debug('Registered default language handlers');
    }
    /**
     * Registers a language handler for a file extension.
     * @param extension The file extension (e.g., '.js').
     * @param handler The language handler to register.
     */
    registerHandler(extension, handler) {
        this.handlers.set(extension.toLowerCase(), handler);
        logger.debug(`Registered language handler for ${extension}`);
    }
    /**
     * Gets the language handler for a file extension.
     * @param extension The file extension (e.g., '.js').
     * @returns The language handler for the extension, or the default handler if none is registered.
     */
    getHandler(extension) {
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
    hasHandler(extension) {
        return this.handlers.has(extension.toLowerCase());
    }
    /**
     * Gets all registered file extensions.
     * @returns An array of registered file extensions.
     */
    getRegisteredExtensions() {
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
export function getLanguageHandler(extension) {
    return languageHandlerRegistry.getHandler(extension);
}
/**
 * Registers a language handler for a file extension.
 * @param extension The file extension (e.g., '.js').
 * @param handler The language handler to register.
 */
export function registerLanguageHandler(extension, handler) {
    languageHandlerRegistry.registerHandler(extension, handler);
}
