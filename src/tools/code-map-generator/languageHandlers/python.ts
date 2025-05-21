/**
 * Python language handler for the Code-Map Generator tool.
 * This file contains the language handler for Python files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ImportedItem } from '../codeMapModel.js';

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
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'class_definition'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'import_statement',
      'import_from_statement'
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
    try {
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
            return name; // Return the original name for dunder methods
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
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python function name');
      return 'anonymous';
    }
  }

  /**
   * Extracts decorators from a function definition.
   */
  private extractDecorators(node: SyntaxNode, sourceCode: string): string[] {
    try {
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
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python decorators');
      return [];
    }
  }

  /**
   * Extracts the HTTP method from decorators.
   */
  private extractHttpMethod(decorators: string[]): string {
    try {
      for (const decorator of decorators) {
        if (decorator.includes('get(')) return 'get';
        if (decorator.includes('post(')) return 'post';
        if (decorator.includes('put(')) return 'put';
        if (decorator.includes('delete(')) return 'delete';
        if (decorator.includes('patch(')) return 'patch';
      }

      // Default to route if no specific method found
      return 'route';
    } catch (error) {
      logger.warn({ err: error }, 'Error extracting HTTP method from Python decorators');
      return 'route';
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'class_definition') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'AnonymousClass';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python class name');
      return 'AnonymousClass';
    }
  }

  /**
   * Extracts the parent class from an AST node.
   */
  protected extractParentClass(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      if (node.type === 'class_definition') {
        const argListNode = node.childForFieldName('argument_list');
        if (argListNode?.firstChild?.type === 'identifier') {
          return getNodeText(argListNode.firstChild, sourceCode);
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python parent class');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'import_statement') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'import_from_statement') {
        const moduleNameNode = node.childForFieldName('module_name');
        if (moduleNameNode) {
          return getNodeText(moduleNameNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python import path');
      return 'unknown';
    }
  }

  /**
   * Extracts imported items from an AST node.
   */
  protected extractImportedItems(node: SyntaxNode, sourceCode: string): ImportedItem[] | undefined {
    try {
      if (node.type === 'import_from_statement') {
        const items: ImportedItem[] = [];

        // Get the module path
        const moduleNode = node.childForFieldName('module_name');
        const modulePath = moduleNode ? getNodeText(moduleNode, sourceCode) : '';

        // Extract names from import_from_statement
        node.descendantsOfType(['dotted_name', 'identifier', 'aliased_import']).forEach(itemNode => {
          if (itemNode.parent?.type === 'import_from_statement' &&
              itemNode.previousSibling?.text === 'import') {
            const name = getNodeText(itemNode, sourceCode);
            items.push({
              name,
              path: modulePath,
              isDefault: false,
              isNamespace: false,
              nodeText: itemNode.text
            });
          } else if (itemNode.type === 'aliased_import') {
            const nameNode = itemNode.childForFieldName('name');
            const aliasNode = itemNode.childForFieldName('alias');
            if (nameNode && aliasNode) {
              const name = getNodeText(nameNode, sourceCode);
              const alias = getNodeText(aliasNode, sourceCode);
              items.push({
                name: `${name} as ${alias}`,
                path: modulePath,
                isDefault: false,
                isNamespace: false,
                nodeText: itemNode.text
              });
            }
          }
        });

        // Handle wildcard import
        if (node.descendantsOfType('wildcard_import').length > 0) {
          items.push({
            name: '*',
            path: modulePath,
            isDefault: false,
            isNamespace: true,
            nodeText: '*'
          });
        }

        return items.length > 0 ? items : undefined;
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python imported items');
      return undefined;
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
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
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for docstring in class body
      if (node.type === 'class_definition') {
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
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Python class comment');
      return undefined;
    }
  }

  /**
   * Parses a docstring into a clean comment.
   */
  private parseDocstring(docstring: string): string {
    try {
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
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Python docstring');
      return docstring;
    }
  }

  /**
   * Checks if a function is a generator.
   */
  protected isGeneratorFunction(node: SyntaxNode, sourceCode: string): boolean {
    try {
      if (node.type === 'function_definition') {
        const bodyNode = node.childForFieldName('body');
        if (bodyNode) {
          // Check for yield statements in the function body
          return bodyNode.descendantsOfType('yield').length > 0;
        }
      }
      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Python function is a generator');
      return false;
    }
  }

  /**
   * Override the isAsyncFunction method to detect async functions.
   */
  protected isAsyncFunction(node: SyntaxNode, sourceCode: string): boolean {
    try {
      if (node.type === 'function_definition') {
        // Check for async keyword
        return node.text.startsWith('async ');
      }
      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking if Python function is async');
      return false;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
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
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Python framework');
      return null;
    }
  }
}
