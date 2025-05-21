# Enhanced Function Name Detection Implementation Plan - Part 5

## Phase 2: Language-Specific Handlers (Continued)

### Epic: FD-2.5 - C# Handler

#### FD-2.5.1 - C# Language Handler

**Description**: Create a language handler for C# that provides enhanced function name detection.

**File Path**: `src/tools/code-map-generator/languageHandlers/csharp.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Language handler for C#.
 * Provides enhanced function name detection for C# files.
 */
export class CSharpHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'method_declaration',
      'constructor_declaration',
      'local_function_statement',
      'anonymous_method_expression',
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
        
        // Check for attributes
        const attributes = this.getMethodAttributes(node, sourceCode);
        
        // ASP.NET Core attributes
        if (attributes.includes('[HttpGet]') || 
            attributes.includes('[HttpPost]') || 
            attributes.includes('[Route]') ||
            attributes.includes('[ApiController]')) {
          return `api_${name}`;
        }
        
        // Test attributes
        if (attributes.includes('[Fact]') || 
            attributes.includes('[Theory]') || 
            attributes.includes('[Test]')) {
          return `test_${name}`;
        }
        
        return name;
      }
    }
    
    // Handle constructor declarations
    if (node.type === 'constructor_declaration') {
      const className = this.findClassName(node, sourceCode);
      return `${className}.Constructor`;
    }
    
    // Handle local function statements
    if (node.type === 'local_function_statement') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return `local_${getNodeText(nameNode, sourceCode)}`;
      }
    }
    
    // Handle anonymous method expressions
    if (node.type === 'anonymous_method_expression') {
      // Check if used in a delegate assignment
      if (node.parent?.type === 'assignment_expression') {
        const leftNode = node.parent.childForFieldName('left');
        if (leftNode) {
          return getNodeText(leftNode, sourceCode);
        }
      }
      
      // Check if used in an event assignment
      if (node.parent?.type === 'assignment_expression' && 
          node.parent.parent?.type === 'expression_statement' && 
          node.parent.parent.previousNamedSibling?.type === 'event_field_declaration') {
        const eventNode = node.parent.parent.previousNamedSibling.childForFieldName('declarator');
        if (eventNode) {
          const eventName = getNodeText(eventNode, sourceCode);
          return `${eventName}Handler`;
        }
      }
      
      return 'anonymousMethod';
    }
    
    // Handle lambda expressions
    if (node.type === 'lambda_expression') {
      // Check if used in a variable declaration
      if (node.parent?.type === 'variable_declarator') {
        const nameNode = node.parent.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }
      
      // Check if used in LINQ
      if (node.parent?.type === 'argument' && 
          node.parent.parent?.type === 'argument_list' && 
          node.parent.parent.parent?.type === 'invocation_expression') {
        const methodNode = node.parent.parent.parent.childForFieldName('name');
        if (methodNode) {
          const methodName = getNodeText(methodNode, sourceCode);
          
          // LINQ methods
          if (['Select', 'Where', 'OrderBy', 'GroupBy', 'Join', 'ForEach'].includes(methodName)) {
            return `linq_${methodName}`;
          }
        }
      }
      
      // Check if used in an event assignment
      if (node.parent?.type === 'assignment_expression' && 
          node.parent.childForFieldName('left')?.text.includes('+=')) {
        const leftNode = node.parent.childForFieldName('left');
        if (leftNode) {
          const eventName = getNodeText(leftNode, sourceCode).split('+=')[0].trim();
          return `${eventName}Handler`;
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
   * Gets attributes for a method.
   */
  private getMethodAttributes(node: SyntaxNode, sourceCode: string): string[] {
    const attributes: string[] = [];
    
    // Check for attributes before the method
    let current = node;
    let prev = current.previousNamedSibling;
    
    while (prev && prev.type === 'attribute_list') {
      attributes.push(getNodeText(prev, sourceCode));
      prev = prev.previousNamedSibling;
    }
    
    return attributes;
  }
  
  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Look for XML documentation comments
    let prev = node.previousNamedSibling;
    
    while (prev && prev.type !== 'comment') {
      prev = prev.previousNamedSibling;
    }
    
    if (prev && prev.type === 'comment' && prev.text.startsWith('///')) {
      return this.parseXmlDocComment(prev.text);
    }
    
    return undefined;
  }
  
  /**
   * Parses an XML documentation comment into a clean comment.
   */
  private parseXmlDocComment(comment: string): string {
    // Split into lines and remove leading '///' and whitespace
    const lines = comment.split('\n')
      .map(line => line.trim().replace(/^\/\/\/\s*/, ''));
    
    // Extract summary tag content
    const summaryStart = lines.findIndex(line => line.includes('<summary>'));
    const summaryEnd = lines.findIndex(line => line.includes('</summary>'));
    
    if (summaryStart !== -1 && summaryEnd !== -1 && summaryEnd > summaryStart) {
      const summaryLines = lines.slice(summaryStart + 1, summaryEnd);
      return summaryLines
        .map(line => line.trim())
        .join(' ')
        .replace(/<[^>]+>/g, '') // Remove XML tags
        .trim();
    }
    
    // If no summary tag, just join all lines
    return lines
      .map(line => line.trim())
      .join(' ')
      .replace(/<[^>]+>/g, '') // Remove XML tags
      .trim();
  }
  
  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    // ASP.NET Core detection
    if (sourceCode.includes('Microsoft.AspNetCore') || 
        sourceCode.includes('[ApiController]') || 
        sourceCode.includes('IActionResult')) {
      return 'aspnetcore';
    }
    
    // WPF detection
    if (sourceCode.includes('System.Windows') || 
        sourceCode.includes('Window') || 
        sourceCode.includes('UserControl')) {
      return 'wpf';
    }
    
    // Entity Framework detection
    if (sourceCode.includes('Microsoft.EntityFrameworkCore') || 
        sourceCode.includes('DbContext') || 
        sourceCode.includes('DbSet<')) {
      return 'entityframework';
    }
    
    // xUnit detection
    if (sourceCode.includes('Xunit') || 
        sourceCode.includes('[Fact]') || 
        sourceCode.includes('[Theory]')) {
      return 'xunit';
    }
    
    return null;
  }
}
```

**Rationale**: The C# language handler provides enhanced function name detection for C# files. It includes support for method declarations, constructor declarations, local function statements, anonymous method expressions, and lambda expressions. It also includes special handling for ASP.NET Core attributes, test attributes, and LINQ methods. The handler extracts function comments from XML documentation comments and detects the framework used in the source code.

### Epic: FD-2.6 - Go Handler

#### FD-2.6.1 - Go Language Handler

**Description**: Create a language handler for Go that provides enhanced function name detection.

**File Path**: `src/tools/code-map-generator/languageHandlers/go.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';

/**
 * Language handler for Go.
 * Provides enhanced function name detection for Go files.
 */
export class GoHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_declaration',
      'method_declaration',
      'func_literal'
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
      if (nameNode) {
        const name = getNodeText(nameNode, sourceCode);
        
        // Check for test functions
        if (name.startsWith('Test') && this.hasTestSignature(node, sourceCode)) {
          return `test_${name.substring(4)}`;
        }
        
        // Check for benchmark functions
        if (name.startsWith('Benchmark') && this.hasBenchmarkSignature(node, sourceCode)) {
          return `benchmark_${name.substring(9)}`;
        }
        
        // Check for example functions
        if (name.startsWith('Example')) {
          return `example_${name.substring(7)}`;
        }
        
        // Check for main function
        if (name === 'main') {
          return 'main_entrypoint';
        }
        
        // Check for init function
        if (name === 'init') {
          return 'init_function';
        }
        
        return name;
      }
    }
    
    // Handle method declarations
    if (node.type === 'method_declaration') {
      const nameNode = node.childForFieldName('name');
      const receiverNode = node.childForFieldName('receiver');
      
      if (nameNode) {
        const name = getNodeText(nameNode, sourceCode);
        
        // Extract receiver type for context
        if (receiverNode) {
          const receiverType = this.extractReceiverType(receiverNode, sourceCode);
          
          // Check for HTTP handlers
          if (this.isHttpHandler(node, sourceCode)) {
            return `http_handler_${receiverType}_${name}`;
          }
          
          return `${receiverType}.${name}`;
        }
        
        return name;
      }
    }
    
    // Handle function literals (closures)
    if (node.type === 'func_literal') {
      // Check if assigned to a variable
      if (node.parent?.type === 'short_var_declaration' || node.parent?.type === 'assignment_statement') {
        const leftNode = node.parent.childForFieldName('left');
        if (leftNode?.firstChild) {
          return getNodeText(leftNode.firstChild, sourceCode);
        }
      }
      
      // Check if used as a goroutine
      if (node.parent?.type === 'call_expression' && 
          node.parent.previousSibling?.type === 'go') {
        return 'goroutine';
      }
      
      // Check if used in a function call
      if (node.parent?.type === 'argument_list' && 
          node.parent.parent?.type === 'call_expression') {
        const funcNode = node.parent.parent.childForFieldName('function');
        if (funcNode) {
          // Check if it's a method call
          if (funcNode.type === 'selector_expression') {
            const methodNode = funcNode.childForFieldName('field');
            if (methodNode) {
              const methodName = getNodeText(methodNode, sourceCode);
              
              // Common method names that take callbacks
              if (['Map', 'Filter', 'ForEach', 'Handle', 'HandleFunc'].includes(methodName)) {
                return `${methodName.toLowerCase()}_callback`;
              }
            }
          }
        }
      }
      
      return 'closure';
    }
    
    return 'anonymous';
  }
  
  /**
   * Checks if a function has a test signature.
   */
  private hasTestSignature(node: SyntaxNode, sourceCode: string): boolean {
    const paramsNode = node.childForFieldName('parameters');
    if (!paramsNode) return false;
    
    // Test functions have signature func TestXxx(*testing.T)
    return paramsNode.text.includes('*testing.T');
  }
  
  /**
   * Checks if a function has a benchmark signature.
   */
  private hasBenchmarkSignature(node: SyntaxNode, sourceCode: string): boolean {
    const paramsNode = node.childForFieldName('parameters');
    if (!paramsNode) return false;
    
    // Benchmark functions have signature func BenchmarkXxx(*testing.B)
    return paramsNode.text.includes('*testing.B');
  }
  
  /**
   * Extracts the receiver type from a receiver node.
   */
  private extractReceiverType(receiverNode: SyntaxNode, sourceCode: string): string {
    // Receiver can be in different formats: (t *Type), (t Type), etc.
    const parameterNode = receiverNode.childForFieldName('parameter');
    if (!parameterNode) return 'Unknown';
    
    const typeNode = parameterNode.childForFieldName('type');
    if (!typeNode) return 'Unknown';
    
    // Handle pointer receivers
    if (typeNode.type === 'pointer_type') {
      const baseTypeNode = typeNode.childForFieldName('type');
      if (baseTypeNode) {
        return getNodeText(baseTypeNode, sourceCode);
      }
    }
    
    return getNodeText(typeNode, sourceCode);
  }
  
  /**
   * Checks if a method is an HTTP handler.
   */
  private isHttpHandler(node: SyntaxNode, sourceCode: string): boolean {
    // HTTP handlers have signature ServeHTTP(http.ResponseWriter, *http.Request)
    const paramsNode = node.childForFieldName('parameters');
    if (!paramsNode) return false;
    
    const paramsText = getNodeText(paramsNode, sourceCode);
    return paramsText.includes('http.ResponseWriter') && paramsText.includes('*http.Request');
  }
  
  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    // Look for Go doc comments
    let prev = node.previousNamedSibling;
    
    while (prev && prev.type !== 'comment') {
      prev = prev.previousNamedSibling;
    }
    
    if (prev && prev.type === 'comment' && prev.text.startsWith('//')) {
      return this.parseGoDocComment(prev.text);
    }
    
    return undefined;
  }
  
  /**
   * Parses a Go doc comment into a clean comment.
   */
  private parseGoDocComment(comment: string): string {
    // Split into lines and remove leading '//' and whitespace
    const lines = comment.split('\n')
      .map(line => line.trim().replace(/^\/\/\s*/, ''));
    
    // Join lines and return
    return lines.join(' ').trim();
  }
  
  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    // Gin detection
    if (sourceCode.includes('github.com/gin-gonic/gin') || 
        sourceCode.includes('gin.Context') || 
        sourceCode.includes('gin.Engine')) {
      return 'gin';
    }
    
    // Echo detection
    if (sourceCode.includes('github.com/labstack/echo') || 
        sourceCode.includes('echo.Context') || 
        sourceCode.includes('echo.New()')) {
      return 'echo';
    }
    
    // Gorilla detection
    if (sourceCode.includes('github.com/gorilla/mux') || 
        sourceCode.includes('gorilla/websocket') || 
        sourceCode.includes('mux.Router')) {
      return 'gorilla';
    }
    
    // Testing detection
    if (sourceCode.includes('testing.T') || 
        sourceCode.includes('testing.B') || 
        sourceCode.includes('testing.M')) {
      return 'testing';
    }
    
    return null;
  }
}
```

**Rationale**: The Go language handler provides enhanced function name detection for Go files. It includes support for function declarations, method declarations, and function literals (closures). It also includes special handling for test functions, benchmark functions, example functions, HTTP handlers, and goroutines. The handler extracts function comments from Go doc comments and detects the framework used in the source code.
