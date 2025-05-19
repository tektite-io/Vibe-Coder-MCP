# Enhanced Function Name Detection Implementation Plan - Part 1

## Overview

This implementation plan outlines the approach for enhancing the function name detection capabilities in the Code Map Generator tool. The enhanced system will provide more accurate and context-aware function names for 30 programming languages, improving the quality of generated documentation.

The implementation is organized into logical phases with clear dependencies, ensuring a systematic approach to development. Each task is atomic and includes detailed specifications for implementation.

## Phase 1: Core Architecture

### Epic: FD-1.0 - Base Architecture

#### FD-1.1 - Language Handler Interface

**Description**: Define the core interface for language handlers that will be implemented for each supported language.

**File Path**: `src/tools/code-map-generator/types.ts`

**Nature of Change**: Modify

**Implementation**:
```typescript
/**
 * Interface for language-specific function detection handlers.
 */
export interface LanguageHandler {
  /**
   * Extracts functions from an AST node.
   * @param rootNode The root node to extract functions from.
   * @param sourceCode The source code string.
   * @param options Additional options for function extraction.
   * @returns Array of extracted function information.
   */
  extractFunctions(
    rootNode: SyntaxNode, 
    sourceCode: string, 
    options?: FunctionExtractionOptions
  ): FunctionInfo[];
  
  /**
   * Extracts classes from an AST node.
   * @param rootNode The root node to extract classes from.
   * @param sourceCode The source code string.
   * @param options Additional options for class extraction.
   * @returns Array of extracted class information.
   */
  extractClasses(
    rootNode: SyntaxNode, 
    sourceCode: string, 
    options?: ClassExtractionOptions
  ): ClassInfo[];
  
  /**
   * Extracts imports from an AST node.
   * @param rootNode The root node to extract imports from.
   * @param sourceCode The source code string.
   * @param options Additional options for import extraction.
   * @returns Array of extracted import information.
   */
  extractImports(
    rootNode: SyntaxNode, 
    sourceCode: string, 
    options?: ImportExtractionOptions
  ): ImportInfo[];
  
  /**
   * Detects the framework used in the source code.
   * @param sourceCode The source code string.
   * @returns The detected framework, if any.
   */
  detectFramework?(sourceCode: string): string | null;
}

/**
 * Options for function extraction.
 */
export interface FunctionExtractionOptions {
  /**
   * Whether to extract methods within a class.
   */
  isMethodExtraction?: boolean;
  
  /**
   * The name of the parent class if extracting methods.
   */
  className?: string;
  
  /**
   * Maximum depth for nested function analysis.
   */
  maxNestedFunctionDepth?: number;
  
  /**
   * Whether to enable context analysis.
   */
  enableContextAnalysis?: boolean;
  
  /**
   * Whether to enable role detection.
   */
  enableRoleDetection?: boolean;
  
  /**
   * Whether to enable heuristic naming.
   */
  enableHeuristicNaming?: boolean;
}

/**
 * Context information for function extraction.
 */
export interface FunctionContext {
  /**
   * The type of context (e.g., 'class', 'function', 'object').
   */
  type: string;
  
  /**
   * The name of the context (e.g., class name, function name).
   */
  name?: string;
  
  /**
   * The parent context, if any.
   */
  parent?: FunctionContext;
}
```

**Rationale**: This interface provides a standardized way for language-specific handlers to extract functions, classes, and imports from AST nodes. It includes options for customizing the extraction process and context tracking for nested functions.

#### FD-1.2 - Base Language Handler

**Description**: Create a base language handler class that implements common functionality for all language handlers.

**File Path**: `src/tools/code-map-generator/languageHandlers/base.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { LanguageHandler, FunctionInfo, ClassInfo, ImportInfo, FunctionExtractionOptions, ClassExtractionOptions, ImportExtractionOptions, FunctionContext } from '../types.js';
import { SyntaxNode } from '../parser.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Base class for language-specific handlers.
 * Implements common functionality for all language handlers.
 */
export abstract class BaseLanguageHandler implements LanguageHandler {
  /**
   * Context tracker for nested function analysis.
   */
  protected contextStack: FunctionContext[] = [];
  
  /**
   * Extracts functions from an AST node.
   * This is a template method that delegates to language-specific implementations.
   */
  extractFunctions(
    rootNode: SyntaxNode, 
    sourceCode: string, 
    options: FunctionExtractionOptions = {}
  ): FunctionInfo[] {
    // Reset context stack
    this.contextStack = [];
    
    // Get query patterns for this language
    const queryPatterns = this.getFunctionQueryPatterns();
    
    // Extract functions using the query patterns
    const functions: FunctionInfo[] = [];
    
    // Process each query pattern
    for (const pattern of queryPatterns) {
      rootNode.descendantsOfType(pattern).forEach(node => {
        // Skip nested functions if not extracting methods
        if (!options.isMethodExtraction && this.isNestedFunction(node)) {
          return;
        }
        
        // Skip if exceeding maximum nested depth
        if (options.maxNestedFunctionDepth !== undefined && 
            this.getNodeDepth(node) > options.maxNestedFunctionDepth) {
          return;
        }
        
        // Extract function information
        try {
          // Push current context
          this.pushContext('function', node);
          
          // Extract function name
          const name = this.extractFunctionName(node, sourceCode, options);
          
          // Extract function signature
          const signature = this.extractFunctionSignature(node, sourceCode);
          
          // Extract function comment
          const comment = this.extractFunctionComment(node, sourceCode) || 
                         this.generateHeuristicComment(name, options.isMethodExtraction ? 'method' : 'function', signature, options.className);
          
          // Create function info
          functions.push({
            name,
            signature,
            comment,
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            isAsync: this.isAsyncFunction(node, sourceCode),
            isExported: this.isExportedFunction(node, sourceCode),
          });
        } finally {
          // Pop context
          this.popContext();
        }
      });
    }
    
    return functions;
  }
  
  /**
   * Extracts classes from an AST node.
   * This is a template method that delegates to language-specific implementations.
   */
  extractClasses(
    rootNode: SyntaxNode, 
    sourceCode: string, 
    options: ClassExtractionOptions = {}
  ): ClassInfo[] {
    // Implementation similar to extractFunctions
    // ...
    return [];
  }
  
  /**
   * Extracts imports from an AST node.
   * This is a template method that delegates to language-specific implementations.
   */
  extractImports(
    rootNode: SyntaxNode, 
    sourceCode: string, 
    options: ImportExtractionOptions = {}
  ): ImportInfo[] {
    // Implementation similar to extractFunctions
    // ...
    return [];
  }
  
  /**
   * Gets the query patterns for function detection.
   * This should be overridden by language-specific handlers.
   */
  protected abstract getFunctionQueryPatterns(): string[];
  
  /**
   * Extracts the function name from an AST node.
   * This should be overridden by language-specific handlers.
   */
  protected abstract extractFunctionName(
    node: SyntaxNode, 
    sourceCode: string, 
    options?: FunctionExtractionOptions
  ): string;
  
  /**
   * Extracts the function signature from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractFunctionSignature(node: SyntaxNode, sourceCode: string): string {
    const nameNode = node.childForFieldName('name');
    const paramsNode = node.childForFieldName('parameters');
    
    const name = nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
    const params = paramsNode ? getNodeText(paramsNode, sourceCode) : '()';
    
    return `${name}${params}`;
  }
  
  /**
   * Extracts the function comment from an AST node.
   * This can be overridden by language-specific handlers.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Default implementation looks for comments before the node
    // ...
    return undefined;
  }
  
  /**
   * Generates a heuristic comment for a function.
   * This can be overridden by language-specific handlers.
   */
  protected generateHeuristicComment(
    name: string,
    type: 'function' | 'method' | 'class' | 'property' | 'import' | 'file',
    signature?: string,
    parentClass?: string
  ): string {
    // Default implementation generates a comment based on the name
    // ...
    return `Performs an action related to ${name}.`;
  }
  
  /**
   * Checks if a function is asynchronous.
   * This can be overridden by language-specific handlers.
   */
  protected isAsyncFunction(node: SyntaxNode, sourceCode: string): boolean {
    // Default implementation checks if the function has the 'async' keyword
    return node.text.startsWith('async ');
  }
  
  /**
   * Checks if a function is exported.
   * This can be overridden by language-specific handlers.
   */
  protected isExportedFunction(node: SyntaxNode, sourceCode: string): boolean {
    // Default implementation checks if the function is part of an export statement
    return node.parent?.type === 'export_statement';
  }
  
  /**
   * Checks if a function is nested within another function.
   * This can be overridden by language-specific handlers.
   */
  protected isNestedFunction(node: SyntaxNode): boolean {
    // Default implementation checks if the function is within another function
    let parent = node.parent;
    while (parent) {
      if (this.getFunctionQueryPatterns().includes(parent.type)) {
        return true;
      }
      parent = parent.parent;
    }
    return false;
  }
  
  /**
   * Gets the depth of a node in the AST.
   * This can be overridden by language-specific handlers.
   */
  protected getNodeDepth(node: SyntaxNode): number {
    let depth = 0;
    let parent = node.parent;
    while (parent) {
      depth++;
      parent = parent.parent;
    }
    return depth;
  }
  
  /**
   * Pushes a context onto the context stack.
   */
  protected pushContext(type: string, node: SyntaxNode, name?: string): void {
    const parent = this.contextStack.length > 0 ? this.contextStack[this.contextStack.length - 1] : undefined;
    this.contextStack.push({ type, name, parent });
  }
  
  /**
   * Pops a context from the context stack.
   */
  protected popContext(): void {
    this.contextStack.pop();
  }
  
  /**
   * Gets the current context.
   */
  protected getCurrentContext(): FunctionContext | undefined {
    return this.contextStack.length > 0 ? this.contextStack[this.contextStack.length - 1] : undefined;
  }
}
```

**Rationale**: The base language handler provides a template method pattern for function extraction, with common functionality implemented in the base class and language-specific functionality delegated to subclasses. It includes context tracking for nested functions and methods for extracting function names, signatures, and comments.

#### FD-1.3 - Default Language Handler

**Description**: Create a default language handler that provides basic function detection for languages without specific handlers.

**File Path**: `src/tools/code-map-generator/languageHandlers/default.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Default language handler that provides basic function detection for languages without specific handlers.
 */
export class DefaultLanguageHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'function_definition',
      'method_declaration',
      'method_definition',
      'function',
      'arrow_function',
      'lambda',
      'lambda_expression'
    ];
  }
  
  /**
   * Extracts the function name from an AST node.
   */
  protected extractFunctionName(
    node: SyntaxNode, 
    sourceCode: string, 
    options?: FunctionExtractionOptions
  ): string {
    // Try to get name from 'name' field
    const nameNode = node.childForFieldName('name');
    if (nameNode) {
      return getNodeText(nameNode, sourceCode);
    }
    
    // Try to get name from parent if it's a variable declaration
    if (node.parent?.type === 'variable_declarator') {
      const parentNameNode = node.parent.childForFieldName('name');
      if (parentNameNode) {
        return getNodeText(parentNameNode, sourceCode);
      }
    }
    
    // Try to get name from parent if it's a property
    if (node.parent?.type === 'pair') {
      const keyNode = node.parent.childForFieldName('key');
      if (keyNode) {
        return getNodeText(keyNode, sourceCode);
      }
    }
    
    return 'anonymous';
  }
}
```

**Rationale**: The default language handler provides basic function detection for languages without specific handlers. It uses common patterns found in many languages to extract function names, providing a fallback for languages that are not explicitly supported.
