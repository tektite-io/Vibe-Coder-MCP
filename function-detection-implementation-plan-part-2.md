# Enhanced Function Name Detection Implementation Plan - Part 2

## Phase 1: Core Architecture (Continued)

### Epic: FD-1.0 - Base Architecture (Continued)

#### FD-1.4 - Language Handler Registry

**Description**: Create a registry for language handlers that maps file extensions to their corresponding handlers.

**File Path**: `src/tools/code-map-generator/languageHandlers/registry.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { LanguageHandler } from '../types.js';
import { DefaultLanguageHandler } from './default.js';

// Import language-specific handlers
// These will be implemented in later tasks
import { JavaScriptHandler } from './javascript.js';
import { TypeScriptHandler } from './typescript.js';
import { PythonHandler } from './python.js';
// Additional imports will be added as handlers are implemented

/**
 * Registry of language-specific handlers.
 * Maps file extensions to their corresponding handlers.
 */
const handlers: Record<string, LanguageHandler> = {
  // JavaScript/TypeScript
  '.js': new JavaScriptHandler(),
  '.jsx': new JavaScriptHandler(true), // JSX-aware
  '.ts': new TypeScriptHandler(),
  '.tsx': new TypeScriptHandler(true), // TSX-aware
  
  // Python
  '.py': new PythonHandler(),
  
  // Additional handlers will be added as they are implemented
};

// Default handler for languages without specific implementations
const defaultHandler = new DefaultLanguageHandler();

/**
 * Gets the appropriate language handler for a file extension.
 * Falls back to the default handler if no specific handler exists.
 * 
 * @param extension The file extension (e.g., '.js').
 * @returns The language handler for the extension.
 */
export function getLanguageHandler(extension: string): LanguageHandler {
  return handlers[extension] || defaultHandler;
}

/**
 * Registers a language handler for a file extension.
 * 
 * @param extension The file extension (e.g., '.js').
 * @param handler The language handler to register.
 */
export function registerLanguageHandler(extension: string, handler: LanguageHandler): void {
  handlers[extension] = handler;
}

/**
 * Gets all registered language handlers.
 * 
 * @returns A record of all registered language handlers.
 */
export function getAllLanguageHandlers(): Record<string, LanguageHandler> {
  return { ...handlers };
}

/**
 * Gets all supported file extensions.
 * 
 * @returns An array of all supported file extensions.
 */
export function getSupportedExtensions(): string[] {
  return Object.keys(handlers);
}
```

**Rationale**: The language handler registry provides a central location for registering and retrieving language handlers. It maps file extensions to their corresponding handlers and provides a default handler for languages without specific implementations. This allows for easy extension of the system with new language handlers.

#### FD-1.5 - Context Tracking System

**Description**: Create a context tracking system for tracking nested functions and their contexts.

**File Path**: `src/tools/code-map-generator/context/contextTracker.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { SyntaxNode } from '../parser.js';

/**
 * Context information for AST traversal.
 */
export interface Context {
  /**
   * The type of context (e.g., 'class', 'function', 'object').
   */
  type: string;
  
  /**
   * The AST node associated with this context.
   */
  node: SyntaxNode;
  
  /**
   * The name of the context (e.g., class name, function name).
   */
  name?: string;
  
  /**
   * The parent context, if any.
   */
  parent?: Context;
}

/**
 * Tracks context during AST traversal.
 * Used for tracking nested functions and their contexts.
 */
export class ContextTracker {
  /**
   * The context stack.
   */
  private contextStack: Context[] = [];
  
  /**
   * Pushes a context onto the stack.
   * 
   * @param type The type of context.
   * @param node The AST node associated with this context.
   * @param name The name of the context (optional).
   */
  enterContext(type: string, node: SyntaxNode, name?: string): void {
    const parent = this.getCurrentContext();
    this.contextStack.push({ type, node, name, parent });
  }
  
  /**
   * Pops a context from the stack.
   */
  exitContext(): void {
    this.contextStack.pop();
  }
  
  /**
   * Gets the current context.
   * 
   * @returns The current context, or undefined if the stack is empty.
   */
  getCurrentContext(): Context | undefined {
    return this.contextStack.length > 0 ? this.contextStack[this.contextStack.length - 1] : undefined;
  }
  
  /**
   * Gets the context hierarchy as an array of names.
   * 
   * @returns An array of context names, from outermost to innermost.
   */
  getContextHierarchy(): string[] {
    return this.contextStack.map(ctx => ctx.name || 'anonymous').filter(Boolean);
  }
  
  /**
   * Checks if the current context is of a specific type.
   * 
   * @param type The type to check for.
   * @returns Whether the current context is of the specified type.
   */
  isInContext(type: string): boolean {
    return this.contextStack.some(ctx => ctx.type === type);
  }
  
  /**
   * Gets the nearest context of a specific type.
   * 
   * @param type The type to look for.
   * @returns The nearest context of the specified type, or undefined if none exists.
   */
  getNearestContext(type: string): Context | undefined {
    for (let i = this.contextStack.length - 1; i >= 0; i--) {
      if (this.contextStack[i].type === type) {
        return this.contextStack[i];
      }
    }
    return undefined;
  }
  
  /**
   * Clears the context stack.
   */
  clear(): void {
    this.contextStack = [];
  }
}
```

**Rationale**: The context tracking system provides a way to track nested functions and their contexts during AST traversal. This is essential for accurate function name detection in complex code structures, such as nested functions, callbacks, and closures. The system maintains a stack of contexts and provides methods for entering and exiting contexts, as well as querying the current context hierarchy.

#### FD-1.6 - Update AST Analyzer to Use Language Handlers

**Description**: Update the AST analyzer to use the language handler registry for function extraction.

**File Path**: `src/tools/code-map-generator/astAnalyzer.ts`

**Nature of Change**: Modify

**Implementation**:
```typescript
import { SyntaxNode } from './parser.js';
import { FunctionInfo, ClassInfo, ImportInfo } from './codeMapModel.js';
import { getLanguageHandler } from './languageHandlers/registry.js';

/**
 * Extracts the text content of a given AST node from the source code.
 * @param node The SyntaxNode from which to extract text.
 * @param sourceCode The full source code string.
 * @returns The text content of the node.
 */
export function getNodeText(node: SyntaxNode | null | undefined, sourceCode: string): string {
  if (!node) return '';
  return sourceCode.substring(node.startIndex, node.endIndex);
}

/**
 * Generates a simple heuristic comment for a symbol if no explicit comment is found.
 * @param name Name of the symbol.
 * @param type Type of the symbol ('function' or 'class').
 * @param signature Optional signature for functions/methods.
 * @param parentClass Optional parent class name for methods.
 * @returns A heuristic comment string.
 */
export function generateHeuristicComment(
  name: string,
  type: 'function' | 'class' | 'method' | 'property' | 'import' | 'file',
  signature?: string,
  parentClass?: string
): string {
  // Existing implementation...
  return `Performs an action related to ${name}.`;
}

/**
 * Extracts functions from an AST node using the appropriate language handler.
 * @param parentNode The parent node to extract functions from.
 * @param sourceCode The source code string.
 * @param languageId The language identifier (e.g., '.js', '.py').
 * @param isMethodExtraction Whether to extract methods within a class.
 * @param className The name of the parent class if extracting methods.
 * @returns An array of extracted function information.
 */
export function extractFunctions(
  parentNode: SyntaxNode,
  sourceCode: string,
  languageId: string,
  isMethodExtraction: boolean = false,
  className?: string
): FunctionInfo[] {
  // Get the appropriate language handler
  const handler = getLanguageHandler(languageId);
  
  // Extract functions using the handler
  return handler.extractFunctions(parentNode, sourceCode, {
    isMethodExtraction,
    className,
    maxNestedFunctionDepth: 5, // Default value, can be configured
    enableContextAnalysis: true, // Default value, can be configured
    enableRoleDetection: true, // Default value, can be configured
    enableHeuristicNaming: true // Default value, can be configured
  });
}

/**
 * Extracts classes from an AST node using the appropriate language handler.
 * @param rootNode The root node to extract classes from.
 * @param sourceCode The source code string.
 * @param languageId The language identifier (e.g., '.js', '.py').
 * @returns An array of extracted class information.
 */
export function extractClasses(
  rootNode: SyntaxNode,
  sourceCode: string,
  languageId: string
): ClassInfo[] {
  // Get the appropriate language handler
  const handler = getLanguageHandler(languageId);
  
  // Extract classes using the handler
  return handler.extractClasses(rootNode, sourceCode);
}

/**
 * Extracts imports from an AST node using the appropriate language handler.
 * @param rootNode The root node to extract imports from.
 * @param sourceCode The source code string.
 * @param languageId The language identifier (e.g., '.js', '.py').
 * @returns An array of extracted import information.
 */
export function extractImports(
  rootNode: SyntaxNode,
  sourceCode: string,
  languageId: string
): ImportInfo[] {
  // Get the appropriate language handler
  const handler = getLanguageHandler(languageId);
  
  // Extract imports using the handler
  return handler.extractImports(rootNode, sourceCode);
}
```

**Rationale**: This update modifies the AST analyzer to use the language handler registry for function, class, and import extraction. It delegates the extraction logic to the appropriate language handler based on the file extension, allowing for language-specific handling of AST nodes. This approach provides better separation of concerns and makes it easier to add support for new languages.

#### FD-1.7 - Add Feature Flags for Enhanced Function Detection

**Description**: Add feature flags to enable or disable enhanced function detection features.

**File Path**: `src/tools/code-map-generator/config/featureFlags.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
/**
 * Feature flags for the Code Map Generator.
 */
export interface FeatureFlags {
  /**
   * Whether to enable enhanced function detection.
   * This is the master switch for all enhanced function detection features.
   */
  enhancedFunctionDetection: boolean;
  
  /**
   * Whether to enable context analysis for function detection.
   * This analyzes the surrounding code to determine function names.
   */
  contextAnalysis: boolean;
  
  /**
   * Whether to enable role detection for functions.
   * This identifies the role of functions (e.g., event handler, callback).
   */
  roleDetection: boolean;
  
  /**
   * Whether to enable language-specific handling for function detection.
   * This uses language-specific patterns to detect function names.
   */
  languageSpecificHandling: boolean;
  
  /**
   * Whether to enable heuristic naming for anonymous functions.
   * This generates names based on function usage when no explicit name is available.
   */
  heuristicNaming: boolean;
  
  /**
   * Whether to enable framework detection for function detection.
   * This detects framework-specific patterns (e.g., React components, Express routes).
   */
  frameworkDetection: boolean;
  
  /**
   * Whether to enable documentation parsing for function detection.
   * This extracts function descriptions from documentation comments.
   */
  documentationParsing: boolean;
}

/**
 * Default feature flags.
 */
export const defaultFeatureFlags: FeatureFlags = {
  enhancedFunctionDetection: true,
  contextAnalysis: true,
  roleDetection: true,
  languageSpecificHandling: true,
  heuristicNaming: true,
  frameworkDetection: true,
  documentationParsing: true
};

/**
 * Gets the feature flags, merging user config with defaults.
 * 
 * @param userFlags User-provided feature flags.
 * @returns Merged feature flags.
 */
export function getFeatureFlags(userFlags?: Partial<FeatureFlags>): FeatureFlags {
  if (!userFlags) {
    return defaultFeatureFlags;
  }
  
  // Merge user flags with defaults
  return {
    ...defaultFeatureFlags,
    ...userFlags
  };
}

/**
 * Checks if a feature is enabled.
 * 
 * @param feature Feature name.
 * @param flags Feature flags.
 * @returns Whether the feature is enabled.
 */
export function isFeatureEnabled(feature: keyof FeatureFlags, flags: FeatureFlags): boolean {
  // Master switch: if enhancedFunctionDetection is disabled, all enhanced features are disabled
  if (feature !== 'enhancedFunctionDetection' && !flags.enhancedFunctionDetection) {
    return false;
  }
  
  return flags[feature] ?? false;
}
```

**Rationale**: Feature flags provide a way to enable or disable enhanced function detection features. This allows for gradual adoption of the new system and provides a fallback mechanism in case of issues. The feature flags include options for context analysis, role detection, language-specific handling, heuristic naming, framework detection, and documentation parsing.

### Epic: FD-1.8 - Update Configuration Options

**Description**: Update the configuration options to include settings for enhanced function detection.

**File Path**: `src/tools/code-map-generator/types.ts`

**Nature of Change**: Modify

**Implementation**:
```typescript
// Add to existing types

/**
 * Configuration for function detection.
 */
export interface FunctionDetectionConfig {
  /**
   * Whether to enable context analysis for function detection.
   * This analyzes the surrounding code to determine function names.
   * Default: true
   */
  enableContextAnalysis?: boolean;
  
  /**
   * Whether to enable role detection for functions.
   * This identifies the role of functions (e.g., event handler, callback).
   * Default: true
   */
  enableRoleDetection?: boolean;
  
  /**
   * Whether to enable language-specific handling for function detection.
   * This uses language-specific patterns to detect function names.
   * Default: true
   */
  enableLanguageSpecificHandling?: boolean;
  
  /**
   * Whether to enable heuristic naming for anonymous functions.
   * This generates names based on function usage when no explicit name is available.
   * Default: true
   */
  enableHeuristicNaming?: boolean;
  
  /**
   * Maximum depth for nested function analysis.
   * Default: 5
   */
  maxNestedFunctionDepth?: number;
  
  /**
   * Whether to prefer explicit names over inferred names.
   * Default: true
   */
  preferExplicitNames?: boolean;
}

/**
 * Language-specific configuration.
 */
export interface LanguageConfig {
  /**
   * Whether to enable advanced detection for this language.
   * Default: true
   */
  enableAdvancedDetection?: boolean;
  
  /**
   * Whether to enable framework detection for this language.
   * Default: true
   */
  enableFrameworkDetection?: boolean;
  
  /**
   * Framework-specific configuration for this language.
   */
  frameworkSpecificConfig?: Record<string, any>;
}

/**
 * Configuration for the Code Map Generator.
 */
export interface CodeMapGeneratorConfig {
  // Existing fields...
  
  /**
   * Configuration for function detection.
   */
  functionDetection?: FunctionDetectionConfig;
  
  /**
   * Language-specific configuration.
   */
  languageSpecificConfig?: Record<string, LanguageConfig>;
  
  /**
   * Feature flags.
   */
  featureFlags?: Partial<FeatureFlags>;
}
```

**Rationale**: This update adds configuration options for enhanced function detection to the Code Map Generator configuration. It includes options for context analysis, role detection, language-specific handling, heuristic naming, and framework detection. These options allow users to customize the function detection behavior to suit their needs.
