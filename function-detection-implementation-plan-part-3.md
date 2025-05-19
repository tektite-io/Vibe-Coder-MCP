# Enhanced Function Name Detection Implementation Plan - Part 3

## Phase 2: Language-Specific Handlers

### Epic: FD-2.0 - JavaScript/TypeScript Handler

#### FD-2.1 - JavaScript Language Handler

**Description**: Create a language handler for JavaScript that provides enhanced function name detection.

**File Path**: `src/tools/code-map-generator/languageHandlers/javascript.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Language handler for JavaScript.
 * Provides enhanced function name detection for JavaScript files.
 */
export class JavaScriptHandler extends BaseLanguageHandler {
  /**
   * Whether this handler should handle JSX syntax.
   */
  private readonly isJsx: boolean;
  
  /**
   * Creates a new JavaScript language handler.
   * 
   * @param isJsx Whether this handler should handle JSX syntax.
   */
  constructor(isJsx: boolean = false) {
    super();
    this.isJsx = isJsx;
  }
  
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'arrow_function',
      'method_definition',
      'function'
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
    // Handle function declarations
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
    }
    
    // Handle arrow functions
    if (node.type === 'arrow_function') {
      // Variable assignment: const x = () => {}
      if (node.parent?.type === 'variable_declarator') {
        const nameNode = node.parent.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);
          
          // React hook detection
          if (name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase()) {
            return `${name}Hook`;
          }
          
          // Event handler detection
          if (name.startsWith('handle') || name.startsWith('on')) {
            return `${name}Handler`;
          }
          
          return name;
        }
      }
      
      // Object property: { onClick: () => {} }
      if (node.parent?.type === 'pair') {
        const keyNode = node.parent.childForFieldName('key');
        if (keyNode) {
          const name = getNodeText(keyNode, sourceCode);
          
          // Event handler detection
          if (name.startsWith('on') && name.length > 2 && name[2] === name[2].toUpperCase()) {
            return `${name}Handler`;
          }
          
          return name;
        }
      }
      
      // React component detection
      if (this.isJsx && this.isReactComponent(node, sourceCode)) {
        // Try to find component name from variable assignment
        if (node.parent?.type === 'variable_declarator') {
          const nameNode = node.parent.childForFieldName('name');
          if (nameNode) {
            const name = getNodeText(nameNode, sourceCode);
            if (name[0] === name[0].toUpperCase()) {
              return `${name}Component`;
            }
          }
        }
        
        return 'ReactComponent';
      }
      
      // Function argument: array.map(() => {})
      if (node.parent?.type === 'arguments' && node.parent.parent?.type === 'call_expression') {
        const callExpr = node.parent.parent;
        const funcNode = callExpr.childForFieldName('function');
        
        if (funcNode?.type === 'member_expression') {
          const propertyNode = funcNode.childForFieldName('property');
          
          if (propertyNode) {
            const methodName = getNodeText(propertyNode, sourceCode);
            
            // Array methods
            if (['map', 'filter', 'reduce', 'forEach', 'find'].includes(methodName)) {
              return `${methodName}Callback`;
            }
            
            // Event handlers
            if (methodName === 'addEventListener') {
              const args = callExpr.childForFieldName('arguments');
              if (args?.firstChild?.type === 'string') {
                const eventType = getNodeText(args.firstChild, sourceCode).replace(/['"]/g, '');
                return `${eventType}EventHandler`;
              }
              return 'eventHandler';
            }
            
            // Promise methods
            if (['then', 'catch', 'finally'].includes(methodName)) {
              return `promise${methodName.charAt(0).toUpperCase() + methodName.slice(1)}Callback`;
            }
          }
        }
        
        // React hooks
        if (funcNode?.type === 'identifier') {
          const hookName = getNodeText(funcNode, sourceCode);
          if (hookName === 'useEffect' || hookName === 'useLayoutEffect') {
            return `${hookName}Callback`;
          }
        }
      }
    }
    
    // Handle method definitions
    if (node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = getNodeText(nameNode, sourceCode);
        
        // Handle private methods (ES2022+)
        if (name.startsWith('#')) {
          return `private_${name.substring(1)}`;
        }
        
        // React lifecycle methods
        if (this.isReactLifecycleMethod(name)) {
          return `lifecycle_${name}`;
        }
        
        return name;
      }
    }
    
    // Handle function expressions
    if (node.type === 'function') {
      // Variable assignment: const x = function() {}
      if (node.parent?.type === 'variable_declarator') {
        const nameNode = node.parent.childForFieldName('name');
        return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
      }
      
      // IIFE: (function() {})()
      if (node.parent?.type === 'parenthesized_expression' && 
          node.parent.parent?.type === 'call_expression') {
        return 'iife';
      }
    }
    
    return 'anonymous';
  }
  
  /**
   * Checks if a function is a React component.
   */
  private isReactComponent(node: SyntaxNode, sourceCode: string): boolean {
    // Check for JSX in the function body
    const bodyNode = node.childForFieldName('body');
    if (bodyNode) {
      const bodyText = getNodeText(bodyNode, sourceCode);
      return bodyText.includes('<') && bodyText.includes('/>');
    }
    return false;
  }
  
  /**
   * Checks if a method name is a React lifecycle method.
   */
  private isReactLifecycleMethod(name: string): boolean {
    const lifecycleMethods = [
      'componentDidMount',
      'componentDidUpdate',
      'componentWillUnmount',
      'shouldComponentUpdate',
      'getSnapshotBeforeUpdate',
      'componentDidCatch',
      'render'
    ];
    return lifecycleMethods.includes(name);
  }
  
  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Look for JSDoc comments
    let current = node;
    
    // If node is part of a variable declaration, move up to the declaration
    if (node.type === 'arrow_function' || node.type === 'function') {
      if (node.parent?.type === 'variable_declarator') {
        current = node.parent;
        if (current.parent?.type === 'variable_declaration') {
          current = current.parent;
        }
      }
    }
    
    // Check for comments before the node
    const startPosition = current.startPosition;
    const lineStart = sourceCode.lastIndexOf('\n', current.startIndex) + 1;
    const textBeforeNode = sourceCode.substring(0, lineStart).trim();
    
    // Look for JSDoc comment
    const jsdocEnd = textBeforeNode.lastIndexOf('*/');
    if (jsdocEnd !== -1) {
      const jsdocStart = textBeforeNode.lastIndexOf('/**', jsdocEnd);
      if (jsdocStart !== -1) {
        const comment = textBeforeNode.substring(jsdocStart + 3, jsdocEnd).trim();
        
        // Extract first sentence or description
        const lines = comment.split('\n');
        const description = lines
          .map(line => line.trim().replace(/^\* ?/, ''))
          .filter(line => !line.startsWith('@'))
          .join(' ')
          .trim();
        
        return description;
      }
    }
    
    // Look for single-line comments
    const lines = textBeforeNode.split('\n');
    const commentLines = [];
    
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.startsWith('//')) {
        commentLines.unshift(line.substring(2).trim());
      } else if (line === '') {
        // Skip empty lines
        continue;
      } else {
        // Stop at non-comment, non-empty line
        break;
      }
    }
    
    if (commentLines.length > 0) {
      return commentLines.join(' ');
    }
    
    return undefined;
  }
  
  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    // React detection
    if (sourceCode.includes('React') || 
        sourceCode.includes('react') || 
        sourceCode.includes('jsx') || 
        sourceCode.includes('</>')) {
      return 'react';
    }
    
    // Angular detection
    if (sourceCode.includes('Angular') || 
        sourceCode.includes('@Component') || 
        sourceCode.includes('@NgModule')) {
      return 'angular';
    }
    
    // Vue detection
    if (sourceCode.includes('Vue') || 
        sourceCode.includes('createApp') || 
        sourceCode.includes('<template>')) {
      return 'vue';
    }
    
    // Express detection
    if (sourceCode.includes('express') || 
        sourceCode.includes('app.get(') || 
        sourceCode.includes('app.post(')) {
      return 'express';
    }
    
    return null;
  }
}
```

**Rationale**: The JavaScript language handler provides enhanced function name detection for JavaScript files. It includes support for function declarations, arrow functions, method definitions, and function expressions. It also includes special handling for React components, hooks, and lifecycle methods, as well as event handlers and array method callbacks. The handler extracts function comments from JSDoc comments and single-line comments, and it detects the framework used in the source code.

#### FD-2.2 - TypeScript Language Handler

**Description**: Create a language handler for TypeScript that extends the JavaScript handler with TypeScript-specific features.

**File Path**: `src/tools/code-map-generator/languageHandlers/typescript.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { JavaScriptHandler } from './javascript.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Language handler for TypeScript.
 * Extends the JavaScript handler with TypeScript-specific features.
 */
export class TypeScriptHandler extends JavaScriptHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    // Include JavaScript patterns plus TypeScript-specific patterns
    return [
      ...super.getFunctionQueryPatterns(),
      'function_signature',
      'method_signature',
      'constructor_signature'
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
    // Handle TypeScript-specific nodes
    if (node.type === 'function_signature' || node.type === 'method_signature') {
      const nameNode = node.childForFieldName('name');
      return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
    }
    
    if (node.type === 'constructor_signature') {
      return 'constructor';
    }
    
    // Delegate to JavaScript handler for common patterns
    return super.extractFunctionName(node, sourceCode, options);
  }
  
  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Handle TypeScript-specific nodes
    if (node.type === 'function_signature' || node.type === 'method_signature' || node.type === 'constructor_signature') {
      // Look for TSDoc comments
      let current = node;
      
      // Check for comments before the node
      const startPosition = current.startPosition;
      const lineStart = sourceCode.lastIndexOf('\n', current.startIndex) + 1;
      const textBeforeNode = sourceCode.substring(0, lineStart).trim();
      
      // Look for TSDoc comment
      const tsdocEnd = textBeforeNode.lastIndexOf('*/');
      if (tsdocEnd !== -1) {
        const tsdocStart = textBeforeNode.lastIndexOf('/**', tsdocEnd);
        if (tsdocStart !== -1) {
          const comment = textBeforeNode.substring(tsdocStart + 3, tsdocEnd).trim();
          
          // Extract first sentence or description
          const lines = comment.split('\n');
          const description = lines
            .map(line => line.trim().replace(/^\* ?/, ''))
            .filter(line => !line.startsWith('@'))
            .join(' ')
            .trim();
          
          return description;
        }
      }
      
      return undefined;
    }
    
    // Delegate to JavaScript handler for common patterns
    return super.extractFunctionComment(node, sourceCode);
  }
  
  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    // TypeScript-specific framework detection
    if (sourceCode.includes('@angular/core') || sourceCode.includes('@Component')) {
      return 'angular';
    }
    
    if (sourceCode.includes('@nestjs/common') || sourceCode.includes('@Controller')) {
      return 'nestjs';
    }
    
    // Delegate to JavaScript handler for common frameworks
    return super.detectFramework(sourceCode);
  }
}
```

**Rationale**: The TypeScript language handler extends the JavaScript handler with TypeScript-specific features. It includes support for function signatures, method signatures, and constructor signatures. It also includes special handling for TSDoc comments and TypeScript-specific framework detection. By extending the JavaScript handler, it inherits all the JavaScript-specific functionality while adding TypeScript-specific features.
