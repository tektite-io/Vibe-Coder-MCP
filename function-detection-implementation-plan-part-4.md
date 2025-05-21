# Enhanced Function Name Detection Implementation Plan - Part 4

## Phase 2: Language-Specific Handlers (Continued)

### Epic: FD-2.3 - Python Handler

#### FD-2.3.1 - Python Language Handler

**Description**: Create a language handler for Python that provides enhanced function name detection.

**File Path**: `src/tools/code-map-generator/languageHandlers/python.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Language handler for Python.
 * Provides enhanced function name detection for Python files.
 */
export class PythonHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_definition',
      'lambda'
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
    // Handle function definitions
    if (node.type === 'function_definition') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = getNodeText(nameNode, sourceCode);
        
        // Check for test functions
        if (name.startsWith('test_')) {
          return name;
        }
        
        // Check for dunder methods
        if (name.startsWith('__') && name.endsWith('__')) {
          return `dunder_${name.slice(2, -2)}`;
        }
        
        // Check for decorators
        const decorators = this.extractDecorators(node, sourceCode);
        
        // Flask/FastAPI route handlers
        if (decorators.some(d => d.includes('route') || 
                              d.includes('get') || 
                              d.includes('post') || 
                              d.includes('put') || 
                              d.includes('delete'))) {
          const method = this.extractHttpMethod(decorators);
          return `${method}_handler_${name}`;
        }
        
        // Django view decorators
        if (decorators.some(d => d.includes('login_required') || d.includes('permission_required'))) {
          return `view_${name}`;
        }
        
        // Property decorators
        if (decorators.includes('@property')) {
          return `property_${name}`;
        }
        
        // Static method
        if (decorators.includes('@staticmethod')) {
          return `static_${name}`;
        }
        
        // Class method
        if (decorators.includes('@classmethod')) {
          return `classmethod_${name}`;
        }
        
        return name;
      }
    }
    
    // Handle lambda expressions
    if (node.type === 'lambda') {
      // Check if assigned to a variable
      if (node.parent?.type === 'assignment') {
        const targets = node.parent.childForFieldName('targets');
        if (targets?.firstChild) {
          return getNodeText(targets.firstChild, sourceCode);
        }
      }
      
      // Check if used in a higher-order function
      if (node.parent?.type === 'argument_list' && node.parent.parent?.type === 'call') {
        const funcNode = node.parent.parent.childForFieldName('function');
        if (funcNode) {
          const funcName = getNodeText(funcNode, sourceCode);
          if (['map', 'filter', 'reduce'].includes(funcName)) {
            return `${funcName}_lambda`;
          }
        }
      }
      
      return 'lambda';
    }
    
    return 'anonymous';
  }
  
  /**
   * Extracts decorators from a function definition.
   */
  private extractDecorators(node: SyntaxNode, sourceCode: string): string[] {
    const decorators: string[] = [];
    
    // Check for decorated_definition parent
    if (node.parent?.type === 'decorated_definition') {
      const decoratorListNode = node.parent.childForFieldName('decorator_list');
      if (decoratorListNode) {
        decoratorListNode.children.forEach(child => {
          if (child.type === 'decorator') {
            decorators.push(getNodeText(child, sourceCode));
          }
        });
      }
    }
    
    return decorators;
  }
  
  /**
   * Extracts the HTTP method from decorators.
   */
  private extractHttpMethod(decorators: string[]): string {
    for (const decorator of decorators) {
      if (decorator.includes('get(')) return 'get';
      if (decorator.includes('post(')) return 'post';
      if (decorator.includes('put(')) return 'put';
      if (decorator.includes('delete(')) return 'delete';
      if (decorator.includes('patch(')) return 'patch';
    }
    
    // Default to route if no specific method found
    return 'route';
  }
  
  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Look for docstring in function body
    if (node.type === 'function_definition') {
      const bodyNode = node.childForFieldName('body');
      if (bodyNode?.firstChild?.type === 'expression_statement' && 
          bodyNode.firstChild.firstChild?.type === 'string') {
        const docstringNode = bodyNode.firstChild.firstChild;
        const docstring = getNodeText(docstringNode, sourceCode);
        
        // Parse docstring
        return this.parseDocstring(docstring);
      }
    }
    
    return undefined;
  }
  
  /**
   * Parses a docstring into a clean comment.
   */
  private parseDocstring(docstring: string): string {
    // Remove quotes
    let text = docstring;
    if (text.startsWith('"""') && text.endsWith('"""')) {
      text = text.substring(3, text.length - 3);
    } else if (text.startsWith("'''") && text.endsWith("'''")) {
      text = text.substring(3, text.length - 3);
    } else if (text.startsWith('"') && text.endsWith('"')) {
      text = text.substring(1, text.length - 1);
    } else if (text.startsWith("'") && text.endsWith("'")) {
      text = text.substring(1, text.length - 1);
    }
    
    // Split into lines and remove common indentation
    const lines = text.split('\n');
    const trimmedLines = lines.map(line => line.trim());
    
    // Extract the first paragraph (summary)
    const paragraphs = trimmedLines.join('\n').split('\n\n');
    return paragraphs[0].replace(/\n/g, ' ').trim();
  }
  
  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    // Django detection
    if (sourceCode.includes('django') || 
        sourceCode.includes('from django import') || 
        sourceCode.includes('models.Model')) {
      return 'django';
    }
    
    // Flask detection
    if (sourceCode.includes('flask') || 
        sourceCode.includes('from flask import') || 
        sourceCode.includes('Flask(__name__)')) {
      return 'flask';
    }
    
    // FastAPI detection
    if (sourceCode.includes('fastapi') || 
        sourceCode.includes('from fastapi import') || 
        sourceCode.includes('FastAPI()')) {
      return 'fastapi';
    }
    
    // Pytest detection
    if (sourceCode.includes('pytest') || 
        sourceCode.includes('from pytest import') || 
        sourceCode.includes('@pytest.fixture')) {
      return 'pytest';
    }
    
    return null;
  }
}
```

**Rationale**: The Python language handler provides enhanced function name detection for Python files. It includes support for function definitions and lambda expressions. It also includes special handling for test functions, dunder methods, decorators, and framework-specific patterns. The handler extracts function comments from docstrings and detects the framework used in the source code.

### Epic: FD-2.4 - Java Handler

#### FD-2.4.1 - Java Language Handler

**Description**: Create a language handler for Java that provides enhanced function name detection.

**File Path**: `src/tools/code-map-generator/languageHandlers/java.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Language handler for Java.
 * Provides enhanced function name detection for Java files.
 */
export class JavaHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'method_declaration',
      'constructor_declaration',
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
    // Handle method declarations
    if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const name = getNodeText(nameNode, sourceCode);
        
        // Check for annotations
        const annotations = this.getMethodAnnotations(node, sourceCode);
        
        // Spring REST endpoints
        if (annotations.includes('@GetMapping') || 
            annotations.includes('@PostMapping') || 
            annotations.includes('@RequestMapping') ||
            annotations.includes('@PutMapping') ||
            annotations.includes('@DeleteMapping')) {
          return `endpoint_${name}`;
        }
        
        // JUnit tests
        if (annotations.includes('@Test')) {
          return `test_${name}`;
        }
        
        // Android lifecycle methods
        if (this.isAndroidLifecycleMethod(name)) {
          return `lifecycle_${name}`;
        }
        
        return name;
      }
    }
    
    // Handle constructor declarations
    if (node.type === 'constructor_declaration') {
      const className = this.findClassName(node, sourceCode);
      return `${className}.Constructor`;
    }
    
    // Handle lambda expressions
    if (node.type === 'lambda_expression') {
      // Check if used in a method call
      if (node.parent?.type === 'argument_list' && node.parent.parent?.type === 'method_invocation') {
        const methodNode = node.parent.parent.childForFieldName('name');
        if (methodNode) {
          const methodName = getNodeText(methodNode, sourceCode);
          
          // Stream operations
          if (['map', 'filter', 'forEach', 'reduce'].includes(methodName)) {
            return `${methodName}Lambda`;
          }
          
          // Event handlers
          if (methodName.startsWith('set') && methodName.endsWith('Listener')) {
            const eventType = methodName.substring(3, methodName.length - 8);
            return `${eventType}Handler`;
          }
        }
      }
      
      return 'lambda';
    }
    
    return 'anonymous';
  }
  
  /**
   * Finds the class name for a node.
   */
  private findClassName(node: SyntaxNode, sourceCode: string): string {
    // Find the parent class declaration
    let current = node.parent;
    while (current && current.type !== 'class_declaration') {
      current = current.parent;
    }
    
    if (current) {
      const nameNode = current.childForFieldName('name');
      if (nameNode) {
        return getNodeText(nameNode, sourceCode);
      }
    }
    
    return 'Unknown';
  }
  
  /**
   * Gets annotations for a method.
   */
  private getMethodAnnotations(node: SyntaxNode, sourceCode: string): string[] {
    const annotations: string[] = [];
    
    // Check for annotations before the method
    let current = node;
    let prev = current.previousNamedSibling;
    
    while (prev && prev.type === 'annotation') {
      annotations.push(getNodeText(prev, sourceCode));
      prev = prev.previousNamedSibling;
    }
    
    return annotations;
  }
  
  /**
   * Checks if a method name is an Android lifecycle method.
   */
  private isAndroidLifecycleMethod(name: string): boolean {
    const lifecycleMethods = [
      'onCreate',
      'onStart',
      'onResume',
      'onPause',
      'onStop',
      'onDestroy',
      'onCreateView',
      'onViewCreated'
    ];
    
    return lifecycleMethods.includes(name);
  }
  
  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Look for Javadoc comments
    let prev = node.previousNamedSibling;
    
    while (prev && prev.type !== 'comment') {
      prev = prev.previousNamedSibling;
    }
    
    if (prev && prev.type === 'comment' && prev.text.startsWith('/**')) {
      return this.parseJavadocComment(prev.text);
    }
    
    return undefined;
  }
  
  /**
   * Parses a Javadoc comment into a clean comment.
   */
  private parseJavadocComment(comment: string): string {
    // Remove comment markers and asterisks
    let text = comment.substring(3, comment.length - 2);
    
    // Split into lines and remove leading asterisks and whitespace
    const lines = text.split('\n')
      .map(line => line.trim().replace(/^\*\s*/, ''))
      .filter(line => !line.startsWith('@')); // Remove tag lines
    
    // Join lines and return the description
    return lines.join(' ').trim();
  }
  
  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    // Spring detection
    if (sourceCode.includes('org.springframework') || 
        sourceCode.includes('@Controller') || 
        sourceCode.includes('@Service')) {
      return 'spring';
    }
    
    // Android detection
    if (sourceCode.includes('android.') || 
        sourceCode.includes('androidx.') || 
        sourceCode.includes('extends Activity') ||
        sourceCode.includes('extends Fragment')) {
      return 'android';
    }
    
    // JUnit detection
    if (sourceCode.includes('org.junit') || 
        sourceCode.includes('@Test') || 
        sourceCode.includes('extends TestCase')) {
      return 'junit';
    }
    
    return null;
  }
}
```

**Rationale**: The Java language handler provides enhanced function name detection for Java files. It includes support for method declarations, constructor declarations, and lambda expressions. It also includes special handling for Spring REST endpoints, JUnit tests, and Android lifecycle methods. The handler extracts function comments from Javadoc comments and detects the framework used in the source code.
