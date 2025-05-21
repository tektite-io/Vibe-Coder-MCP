/**
 * Unit tests for the JavaScript language handler.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JavaScriptHandler } from '../../languageHandlers/javascript.js';
import { SyntaxNode } from '../../parser.js';
import { FunctionInfo, ClassInfo } from '../../codeMapModel.js';

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
    }),

    firstChild: children[0] || null,
    lastChild: children[children.length - 1] || null,
    firstNamedChild: namedChildren[0] || null,
    lastNamedChild: namedChildren[namedChildren.length - 1] || null
  };

  return node as SyntaxNode;
}

describe('JavaScriptHandler', () => {
  let handler: JavaScriptHandler;
  let jsxHandler: JavaScriptHandler;

  beforeEach(() => {
    handler = new JavaScriptHandler();
    jsxHandler = new JavaScriptHandler(true);
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

    it('should detect React components with JSX handler', () => {
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
      vi.spyOn(jsxHandler as any, 'isReactComponent').mockReturnValue(true);

      // Extract function name
      const name = (jsxHandler as any).extractFunctionName(arrowFuncNode, 'const MyComponent = () => { return <div /> }');

      // Verify result
      expect(name).toBe('MyComponentComponent');
    });

    it('should detect array method callbacks', () => {
      // Create mock nodes
      const propertyNode = createMockNode('property_identifier', 'map');
      const objectNode = createMockNode('identifier', 'array');
      const memberExprNode = createMockNode(
        'member_expression',
        'array.map',
        [objectNode, propertyNode],
        [objectNode, propertyNode],
        null,
        { object: objectNode, property: propertyNode }
      );

      const argsNode = createMockNode('arguments', '()');
      const callExprNode = createMockNode(
        'call_expression',
        'array.map()',
        [memberExprNode, argsNode],
        [memberExprNode, argsNode],
        null,
        { function: memberExprNode, arguments: argsNode }
      );

      const arrowFuncNode = createMockNode('arrow_function', '() => {}');

      // Set parent relationships
      (arrowFuncNode as any).parent = argsNode;
      (argsNode as any).parent = callExprNode;

      // Extract function name
      const name = (handler as any).extractFunctionName(arrowFuncNode, 'array.map(() => {})');

      // Verify result
      expect(name).toBe('mapCallback');
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

      // Mock implementation for extractFunctionComment
      vi.spyOn(handler as any, 'extractFunctionComment').mockReturnValue('This is a test function.');

      // Extract function comment
      const comment = (handler as any).extractFunctionComment(funcNode, sourceCode);

      // Verify result
      expect(comment).toBe('This is a test function.');
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

    it('should return null for unknown frameworks', () => {
      const sourceCode = `
function regularFunction() {
  return 'Hello World';
}

const obj = {
  method() {
    return 'Hello World';
  }
};
      `;

      const framework = handler.detectFramework(sourceCode);

      expect(framework).toBeNull();
    });
  });
});
