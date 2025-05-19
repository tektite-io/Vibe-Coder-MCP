# Enhanced Function Name Detection Implementation Plan - Part 7

## Phase 4: Testing and Documentation

### Epic: FD-4.0 - Unit Tests

#### FD-4.1 - Base Language Handler Tests

**Description**: Create unit tests for the base language handler.

**File Path**: `src/tools/code-map-generator/__tests__/languageHandlers/base.test.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseLanguageHandler } from '../../languageHandlers/base.js';
import { SyntaxNode } from '../../parser.js';
import { FunctionExtractionOptions } from '../../types.js';

// Mock implementation of BaseLanguageHandler for testing
class TestLanguageHandler extends BaseLanguageHandler {
  protected getFunctionQueryPatterns(): string[] {
    return ['function_declaration', 'method_definition'];
  }
  
  protected extractFunctionName(
    node: SyntaxNode, 
    sourceCode: string, 
    options?: FunctionExtractionOptions
  ): string {
    if (node.type === 'function_declaration') {
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : 'anonymous';
    }
    
    if (node.type === 'method_definition') {
      const nameNode = node.childForFieldName('name');
      return nameNode ? nameNode.text : 'anonymous';
    }
    
    return 'anonymous';
  }
}

// Mock SyntaxNode for testing
function createMockNode(type: string, text: string, children: any[] = [], namedChildren: any[] = [], parent: any = null, fields: Record<string, any> = {}): SyntaxNode {
  const node: any = {
    type,
    text,
    children,
    namedChildren,
    parent,
    childCount: children.length,
    namedChildCount: namedChildren.length,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    
    child: (index: number) => children[index] || null,
    namedChild: (index: number) => namedChildren[index] || null,
    childForFieldName: (fieldName: string) => fields[fieldName] || null,
    
    nextSibling: null,
    previousSibling: null,
    nextNamedSibling: null,
    previousNamedSibling: null,
    
    descendantsOfType: vi.fn().mockImplementation((types: string[]) => {
      if (types.includes(type)) {
        return [node];
      }
      return [];
    })
  };
  
  return node as SyntaxNode;
}

describe('BaseLanguageHandler', () => {
  let handler: TestLanguageHandler;
  
  beforeEach(() => {
    handler = new TestLanguageHandler();
  });
  
  describe('extractFunctions', () => {
    it('should extract functions from an AST node', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'myFunction');
      const paramsNode = createMockNode('parameters', '()');
      const bodyNode = createMockNode('body', '{}');
      
      const funcNode = createMockNode(
        'function_declaration',
        'function myFunction() {}',
        [nameNode, paramsNode, bodyNode],
        [nameNode, paramsNode, bodyNode],
        null,
        { name: nameNode, parameters: paramsNode, body: bodyNode }
      );
      
      const rootNode = createMockNode('program', 'function myFunction() {}', [funcNode], [funcNode]);
      
      // Mock descendantsOfType to return our function node
      rootNode.descendantsOfType = vi.fn().mockReturnValue([funcNode]);
      
      // Extract functions
      const functions = handler.extractFunctions(rootNode, rootNode.text);
      
      // Verify results
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('myFunction');
      expect(functions[0].signature).toBe('myFunction()');
      expect(functions[0].startLine).toBe(1);
      expect(functions[0].endLine).toBe(1);
    });
    
    it('should skip nested functions when not extracting methods', () => {
      // Create mock nodes for nested functions
      const innerNameNode = createMockNode('identifier', 'innerFunction');
      const innerParamsNode = createMockNode('parameters', '()');
      const innerBodyNode = createMockNode('body', '{}');
      
      const innerFuncNode = createMockNode(
        'function_declaration',
        'function innerFunction() {}',
        [innerNameNode, innerParamsNode, innerBodyNode],
        [innerNameNode, innerParamsNode, innerBodyNode],
        null,
        { name: innerNameNode, parameters: innerParamsNode, body: innerBodyNode }
      );
      
      const outerNameNode = createMockNode('identifier', 'outerFunction');
      const outerParamsNode = createMockNode('parameters', '()');
      const outerBodyNode = createMockNode('body', '{ function innerFunction() {} }', [innerFuncNode], [innerFuncNode]);
      
      const outerFuncNode = createMockNode(
        'function_declaration',
        'function outerFunction() { function innerFunction() {} }',
        [outerNameNode, outerParamsNode, outerBodyNode],
        [outerNameNode, outerParamsNode, outerBodyNode],
        null,
        { name: outerNameNode, parameters: outerParamsNode, body: outerBodyNode }
      );
      
      // Set parent relationship
      (innerFuncNode as any).parent = outerBodyNode;
      
      const rootNode = createMockNode('program', 'function outerFunction() { function innerFunction() {} }', [outerFuncNode], [outerFuncNode]);
      
      // Mock descendantsOfType to return both function nodes
      rootNode.descendantsOfType = vi.fn().mockReturnValue([outerFuncNode, innerFuncNode]);
      
      // Mock isNestedFunction to return true for innerFuncNode
      vi.spyOn(handler as any, 'isNestedFunction').mockImplementation((node: SyntaxNode) => {
        return node === innerFuncNode;
      });
      
      // Extract functions
      const functions = handler.extractFunctions(rootNode, rootNode.text);
      
      // Verify results
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('outerFunction');
    });
    
    it('should respect maxNestedFunctionDepth option', () => {
      // Create mock nodes for nested functions
      const innerNameNode = createMockNode('identifier', 'innerFunction');
      const innerParamsNode = createMockNode('parameters', '()');
      const innerBodyNode = createMockNode('body', '{}');
      
      const innerFuncNode = createMockNode(
        'function_declaration',
        'function innerFunction() {}',
        [innerNameNode, innerParamsNode, innerBodyNode],
        [innerNameNode, innerParamsNode, innerBodyNode],
        null,
        { name: innerNameNode, parameters: innerParamsNode, body: innerBodyNode }
      );
      
      const outerNameNode = createMockNode('identifier', 'outerFunction');
      const outerParamsNode = createMockNode('parameters', '()');
      const outerBodyNode = createMockNode('body', '{ function innerFunction() {} }', [innerFuncNode], [innerFuncNode]);
      
      const outerFuncNode = createMockNode(
        'function_declaration',
        'function outerFunction() { function innerFunction() {} }',
        [outerNameNode, outerParamsNode, outerBodyNode],
        [outerNameNode, outerParamsNode, outerBodyNode],
        null,
        { name: outerNameNode, parameters: outerParamsNode, body: outerBodyNode }
      );
      
      // Set parent relationship
      (innerFuncNode as any).parent = outerBodyNode;
      
      const rootNode = createMockNode('program', 'function outerFunction() { function innerFunction() {} }', [outerFuncNode], [outerFuncNode]);
      
      // Mock descendantsOfType to return both function nodes
      rootNode.descendantsOfType = vi.fn().mockReturnValue([outerFuncNode, innerFuncNode]);
      
      // Mock getNodeDepth to return 1 for outerFuncNode and 2 for innerFuncNode
      vi.spyOn(handler as any, 'getNodeDepth').mockImplementation((node: SyntaxNode) => {
        return node === outerFuncNode ? 1 : 2;
      });
      
      // Extract functions with maxNestedFunctionDepth = 1
      const functions = handler.extractFunctions(rootNode, rootNode.text, {
        maxNestedFunctionDepth: 1
      });
      
      // Verify results
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('outerFunction');
    });
  });
  
  describe('context tracking', () => {
    it('should track context during function extraction', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'myFunction');
      const paramsNode = createMockNode('parameters', '()');
      const bodyNode = createMockNode('body', '{}');
      
      const funcNode = createMockNode(
        'function_declaration',
        'function myFunction() {}',
        [nameNode, paramsNode, bodyNode],
        [nameNode, paramsNode, bodyNode],
        null,
        { name: nameNode, parameters: paramsNode, body: bodyNode }
      );
      
      const rootNode = createMockNode('program', 'function myFunction() {}', [funcNode], [funcNode]);
      
      // Mock descendantsOfType to return our function node
      rootNode.descendantsOfType = vi.fn().mockReturnValue([funcNode]);
      
      // Spy on context tracking methods
      const pushContextSpy = vi.spyOn(handler as any, 'pushContext');
      const popContextSpy = vi.spyOn(handler as any, 'popContext');
      
      // Extract functions
      handler.extractFunctions(rootNode, rootNode.text);
      
      // Verify context tracking
      expect(pushContextSpy).toHaveBeenCalledWith('function', funcNode);
      expect(popContextSpy).toHaveBeenCalled();
    });
  });
});
```

**Rationale**: These unit tests verify the functionality of the base language handler, including function extraction, nested function handling, and context tracking. They use mock syntax nodes to simulate AST structures and test the handler's behavior in different scenarios.

#### FD-4.2 - JavaScript Language Handler Tests

**Description**: Create unit tests for the JavaScript language handler.

**File Path**: `src/tools/code-map-generator/__tests__/languageHandlers/javascript.test.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JavaScriptHandler } from '../../languageHandlers/javascript.js';
import { SyntaxNode } from '../../parser.js';

// Mock SyntaxNode for testing
function createMockNode(type: string, text: string, children: any[] = [], namedChildren: any[] = [], parent: any = null, fields: Record<string, any> = {}): SyntaxNode {
  const node: any = {
    type,
    text,
    children,
    namedChildren,
    parent,
    childCount: children.length,
    namedChildCount: namedChildren.length,
    startIndex: 0,
    endIndex: text.length,
    startPosition: { row: 0, column: 0 },
    endPosition: { row: 0, column: text.length },
    
    child: (index: number) => children[index] || null,
    namedChild: (index: number) => namedChildren[index] || null,
    childForFieldName: (fieldName: string) => fields[fieldName] || null,
    
    nextSibling: null,
    previousSibling: null,
    nextNamedSibling: null,
    previousNamedSibling: null,
    
    descendantsOfType: vi.fn().mockImplementation((types: string[]) => {
      if (types.includes(type)) {
        return [node];
      }
      return [];
    })
  };
  
  return node as SyntaxNode;
}

describe('JavaScriptHandler', () => {
  let handler: JavaScriptHandler;
  
  beforeEach(() => {
    handler = new JavaScriptHandler();
  });
  
  describe('extractFunctionName', () => {
    it('should extract name from function declaration', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'myFunction');
      const funcNode = createMockNode(
        'function_declaration',
        'function myFunction() {}',
        [],
        [],
        null,
        { name: nameNode }
      );
      
      // Extract function name
      const name = (handler as any).extractFunctionName(funcNode, funcNode.text);
      
      // Verify result
      expect(name).toBe('myFunction');
    });
    
    it('should extract name from arrow function in variable declaration', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'myArrowFunc');
      const arrowFuncNode = createMockNode('arrow_function', '() => {}');
      const varDeclNode = createMockNode(
        'variable_declarator',
        'myArrowFunc = () => {}',
        [],
        [],
        null,
        { name: nameNode }
      );
      
      // Set parent relationship
      (arrowFuncNode as any).parent = varDeclNode;
      
      // Extract function name
      const name = (handler as any).extractFunctionName(arrowFuncNode, 'const myArrowFunc = () => {}');
      
      // Verify result
      expect(name).toBe('myArrowFunc');
    });
    
    it('should detect React hooks', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'useCustomHook');
      const arrowFuncNode = createMockNode('arrow_function', '() => {}');
      const varDeclNode = createMockNode(
        'variable_declarator',
        'useCustomHook = () => {}',
        [],
        [],
        null,
        { name: nameNode }
      );
      
      // Set parent relationship
      (arrowFuncNode as any).parent = varDeclNode;
      
      // Extract function name
      const name = (handler as any).extractFunctionName(arrowFuncNode, 'const useCustomHook = () => {}');
      
      // Verify result
      expect(name).toBe('useCustomHookHook');
    });
    
    it('should detect event handlers', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'handleClick');
      const arrowFuncNode = createMockNode('arrow_function', '() => {}');
      const varDeclNode = createMockNode(
        'variable_declarator',
        'handleClick = () => {}',
        [],
        [],
        null,
        { name: nameNode }
      );
      
      // Set parent relationship
      (arrowFuncNode as any).parent = varDeclNode;
      
      // Extract function name
      const name = (handler as any).extractFunctionName(arrowFuncNode, 'const handleClick = () => {}');
      
      // Verify result
      expect(name).toBe('handleClickHandler');
    });
    
    it('should detect React components', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'MyComponent');
      const bodyNode = createMockNode('body', 'return <div />');
      const arrowFuncNode = createMockNode(
        'arrow_function',
        '() => { return <div /> }',
        [],
        [],
        null,
        { body: bodyNode }
      );
      const varDeclNode = createMockNode(
        'variable_declarator',
        'MyComponent = () => { return <div /> }',
        [],
        [],
        null,
        { name: nameNode }
      );
      
      // Set parent relationship
      (arrowFuncNode as any).parent = varDeclNode;
      
      // Mock isReactComponent to return true
      vi.spyOn(handler as any, 'isReactComponent').mockReturnValue(true);
      
      // Create JSX-aware handler
      const jsxHandler = new JavaScriptHandler(true);
      
      // Extract function name
      const name = (jsxHandler as any).extractFunctionName(arrowFuncNode, 'const MyComponent = () => { return <div /> }');
      
      // Verify result
      expect(name).toBe('MyComponentComponent');
    });
  });
  
  describe('extractFunctionComment', () => {
    it('should extract JSDoc comment', () => {
      // Create mock nodes
      const nameNode = createMockNode('identifier', 'myFunction');
      const funcNode = createMockNode(
        'function_declaration',
        'function myFunction() {}',
        [],
        [],
        null,
        { name: nameNode }
      );
      
      // Mock source code with JSDoc comment
      const sourceCode = `
/**
 * This is a test function.
 * @param {string} name - The name parameter.
 * @returns {void}
 */
function myFunction() {}
      `;
      
      // Extract function comment
      const comment = (handler as any).extractFunctionComment(funcNode, sourceCode);
      
      // Verify result
      expect(comment).toContain('This is a test function');
    });
  });
  
  describe('detectFramework', () => {
    it('should detect React framework', () => {
      const sourceCode = `
import React from 'react';
import { useState } from 'react';

function MyComponent() {
  const [state, setState] = useState(0);
  return <div>{state}</div>;
}
      `;
      
      const framework = handler.detectFramework(sourceCode);
      
      expect(framework).toBe('react');
    });
    
    it('should detect Express framework', () => {
      const sourceCode = `
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Hello World');
});

app.listen(3000);
      `;
      
      const framework = handler.detectFramework(sourceCode);
      
      expect(framework).toBe('express');
    });
  });
});
```

**Rationale**: These unit tests verify the functionality of the JavaScript language handler, including function name extraction, comment extraction, and framework detection. They test the handler's ability to detect React hooks, event handlers, React components, and different frameworks.

#### FD-4.3 - Integration Tests

**Description**: Create integration tests for the enhanced function name detection system.

**File Path**: `src/tools/code-map-generator/__tests__/integration/functionDetection.test.ts`

**Nature of Change**: Create

**Implementation**:
```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeParser, parseCode } from '../../parser.js';
import { extractFunctions } from '../../astAnalyzer.js';
import { getLanguageHandler } from '../../languageHandlers/registry.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the test fixtures directory
const FIXTURES_DIR = path.join(__dirname, '../fixtures');

describe('Function Detection Integration Tests', () => {
  beforeAll(async () => {
    // Initialize the parser
    await initializeParser();
  });
  
  describe('Cross-Language Function Detection', () => {
    const testCases = [
      {
        language: 'JavaScript',
        extension: '.js',
        fixture: 'javascript-functions.js',
        expectedFunctions: ['regularFunction', 'arrowFunction', 'methodFunction', 'ReactComponent', 'useCustomHook']
      },
      {
        language: 'Python',
        extension: '.py',
        fixture: 'python-functions.py',
        expectedFunctions: ['regular_function', 'class_method', 'get_handler_users', 'test_functionality']
      },
      {
        language: 'Java',
        extension: '.java',
        fixture: 'java-functions.java',
        expectedFunctions: ['regularMethod', 'endpoint_getUsers', 'UserController.Constructor', 'test_userCreation']
      }
    ];
    
    for (const testCase of testCases) {
      it(`should correctly detect functions in ${testCase.language}`, async () => {
        // Read the fixture file
        const fixturePath = path.join(FIXTURES_DIR, testCase.fixture);
        const sourceCode = await fs.readFile(fixturePath, 'utf-8');
        
        // Parse the code
        const tree = await parseCode(sourceCode, testCase.extension);
        expect(tree).not.toBeNull();
        
        // Extract functions
        const functions = extractFunctions(tree!.rootNode, sourceCode, testCase.extension);
        
        // Verify that all expected functions are detected
        const functionNames = functions.map(f => f.name);
        for (const expectedFunction of testCase.expectedFunctions) {
          expect(functionNames).toContain(expectedFunction);
        }
      });
    }
  });
  
  describe('Framework Detection', () => {
    it('should detect React components and hooks', async () => {
      // Read the fixture file
      const fixturePath = path.join(FIXTURES_DIR, 'react-component.jsx');
      const sourceCode = await fs.readFile(fixturePath, 'utf-8');
      
      // Parse the code
      const tree = await parseCode(sourceCode, '.jsx');
      expect(tree).not.toBeNull();
      
      // Extract functions
      const functions = extractFunctions(tree!.rootNode, sourceCode, '.jsx');
      
      // Verify React component detection
      const componentFunction = functions.find(f => f.name.includes('Component'));
      expect(componentFunction).toBeDefined();
      
      // Verify hook detection
      const hookFunction = functions.find(f => f.name.includes('Hook'));
      expect(hookFunction).toBeDefined();
      
      // Verify event handler detection
      const handlerFunction = functions.find(f => f.name.includes('Handler'));
      expect(handlerFunction).toBeDefined();
    });
    
    it('should detect Spring controllers in Java', async () => {
      // Read the fixture file
      const fixturePath = path.join(FIXTURES_DIR, 'spring-controller.java');
      const sourceCode = await fs.readFile(fixturePath, 'utf-8');
      
      // Parse the code
      const tree = await parseCode(sourceCode, '.java');
      expect(tree).not.toBeNull();
      
      // Extract functions
      const functions = extractFunctions(tree!.rootNode, sourceCode, '.java');
      
      // Verify controller endpoint detection
      const endpointFunction = functions.find(f => f.name.startsWith('endpoint_'));
      expect(endpointFunction).toBeDefined();
    });
  });
  
  describe('Before and After Comparison', () => {
    it('should show improvement in function naming', async () => {
      // Read the fixture file
      const fixturePath = path.join(FIXTURES_DIR, 'before-after.js');
      const sourceCode = await fs.readFile(fixturePath, 'utf-8');
      
      // Parse the code
      const tree = await parseCode(sourceCode, '.js');
      expect(tree).not.toBeNull();
      
      // Extract functions with basic detection (mocked)
      const basicFunctions = [
        { name: 'anonymous', signature: 'anonymous()', comment: 'Performs an action related to anonymous.' },
        { name: 'anonymous', signature: 'anonymous()', comment: 'Performs an action related to anonymous.' },
        { name: 'Component', signature: 'Component()', comment: 'Performs an action related to component.' }
      ];
      
      // Extract functions with enhanced detection
      const enhancedFunctions = extractFunctions(tree!.rootNode, sourceCode, '.js');
      
      // Verify improvement
      expect(enhancedFunctions.some(f => f.name.includes('Handler'))).toBe(true);
      expect(enhancedFunctions.some(f => f.name.includes('Component'))).toBe(true);
      expect(enhancedFunctions.some(f => f.name.includes('Hook'))).toBe(true);
      
      // Verify that enhanced detection has fewer anonymous functions
      const anonymousBasic = basicFunctions.filter(f => f.name === 'anonymous').length;
      const anonymousEnhanced = enhancedFunctions.filter(f => f.name === 'anonymous').length;
      expect(anonymousEnhanced).toBeLessThan(anonymousBasic);
    });
  });
});
```

**Rationale**: These integration tests verify the functionality of the enhanced function name detection system across different languages and frameworks. They test the system's ability to detect functions in JavaScript, Python, and Java, as well as framework-specific patterns like React components and Spring controllers. They also compare the results of basic and enhanced function detection to show the improvement in function naming.
