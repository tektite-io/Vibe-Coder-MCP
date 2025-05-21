/**
 * Rust language handler for the Code-Map Generator tool.
 * This file contains the language handler for Rust files.
 */

import { BaseLanguageHandler } from './base.js';
import { SyntaxNode } from '../parser.js';
import { FunctionExtractionOptions } from '../types.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';

/**
 * Language handler for Rust.
 * Provides enhanced function name detection for Rust files.
 */
export class RustHandler extends BaseLanguageHandler {
  /**
   * Gets the query patterns for function detection.
   */
  protected getFunctionQueryPatterns(): string[] {
    return [
      'function_item',
      'function_signature_item',
      'closure_expression',
      'impl_method',
      'trait_method'
    ];
  }

  /**
   * Gets the query patterns for class detection.
   */
  protected getClassQueryPatterns(): string[] {
    return [
      'struct_item',
      'enum_item',
      'trait_item',
      'impl_item'
    ];
  }

  /**
   * Gets the query patterns for import detection.
   */
  protected getImportQueryPatterns(): string[] {
    return [
      'use_declaration',
      'extern_crate_declaration'
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
      // Handle function items
      if (node.type === 'function_item' || node.type === 'function_signature_item') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check for main function
          if (name === 'main') {
            return 'main_entrypoint';
          }

          // Check for test functions
          if (this.hasAttribute(node, 'test')) {
            return `test_${name}`;
          }

          // Check for benchmark functions
          if (this.hasAttribute(node, 'bench')) {
            return `benchmark_${name}`;
          }

          return name;
        }
      }

      // Handle impl methods
      if (node.type === 'impl_method') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          const name = getNodeText(nameNode, sourceCode);

          // Check if it's a self method
          if (this.hasSelfParameter(node, sourceCode)) {
            return `self_${name}`;
          }

          return name;
        }
      }

      // Handle trait methods
      if (node.type === 'trait_method') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      // Handle closure expressions
      if (node.type === 'closure_expression') {
        // Check if assigned to a variable
        if (node.parent?.type === 'let_declaration') {
          const patternNode = node.parent.childForFieldName('pattern');
          if (patternNode) {
            return getNodeText(patternNode, sourceCode);
          }
        }

        // Check if used in a function call
        if (node.parent?.type === 'arguments' &&
            node.parent.parent?.type === 'call_expression') {
          const funcNode = node.parent.parent.childForFieldName('function');
          if (funcNode) {
            const funcName = getNodeText(funcNode, sourceCode);

            // Common iterator methods
            if (['map', 'filter', 'for_each', 'fold'].includes(funcName)) {
              return `${funcName}_closure`;
            }
          }
        }

        return 'closure';
      }

      return 'anonymous';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Rust function name');
      return 'anonymous';
    }
  }

  /**
   * Checks if a node has a specific attribute.
   */
  private hasAttribute(node: SyntaxNode, attributeName: string): boolean {
    try {
      const attributesNode = node.childForFieldName('attributes');
      if (!attributesNode) return false;

      // Check each attribute
      for (let i = 0; i < attributesNode.childCount; i++) {
        const attribute = attributesNode.child(i);
        if (attribute?.text.includes(`#[${attributeName}]`)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Rust attribute');
      return false;
    }
  }

  /**
   * Checks if a method has a self parameter.
   */
  private hasSelfParameter(node: SyntaxNode, sourceCode: string): boolean {
    try {
      const parametersNode = node.childForFieldName('parameters');
      if (!parametersNode) return false;

      // Check if the first parameter is self
      const firstParam = parametersNode.firstChild;
      if (firstParam) {
        const paramText = getNodeText(firstParam, sourceCode);
        return paramText.includes('self');
      }

      return false;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error checking Rust self parameter');
      return false;
    }
  }

  /**
   * Extracts the class name from an AST node.
   */
  protected extractClassName(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'struct_item' ||
          node.type === 'enum_item' ||
          node.type === 'trait_item') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      } else if (node.type === 'impl_item') {
        const typeNode = node.childForFieldName('type');
        if (typeNode) {
          return `Impl_${getNodeText(typeNode, sourceCode)}`;
        }
      }

      return 'AnonymousType';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Rust class name');
      return 'AnonymousType';
    }
  }

  /**
   * Extracts implemented interfaces (traits) from an AST node.
   */
  protected extractImplementedInterfaces(node: SyntaxNode, sourceCode: string): string[] | undefined {
    try {
      if (node.type === 'impl_item') {
        const traitNode = node.childForFieldName('trait');
        if (traitNode) {
          return [getNodeText(traitNode, sourceCode)];
        }
      } else if (node.type === 'struct_item') {
        // Look for derive attributes
        const attributesNode = node.childForFieldName('attributes');
        if (attributesNode) {
          const traits: string[] = [];

          // Extract traits from derive attributes
          for (let i = 0; i < attributesNode.childCount; i++) {
            const attribute = attributesNode.child(i);
            if (attribute?.text.includes('#[derive(')) {
              const deriveText = attribute.text;
              const match = deriveText.match(/#\[derive\((.*?)\)\]/);
              if (match && match[1]) {
                const derivedTraits = match[1].split(',').map(t => t.trim());
                traits.push(...derivedTraits);
              }
            }
          }

          return traits.length > 0 ? traits : undefined;
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Rust implemented interfaces');
      return undefined;
    }
  }

  /**
   * Extracts the import path from an AST node.
   */
  protected extractImportPath(node: SyntaxNode, sourceCode: string): string {
    try {
      if (node.type === 'use_declaration') {
        const treeNode = node.childForFieldName('tree');
        if (treeNode) {
          return getNodeText(treeNode, sourceCode);
        }
      } else if (node.type === 'extern_crate_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode) {
          return getNodeText(nameNode, sourceCode);
        }
      }

      return 'unknown';
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Rust import path');
      return 'unknown';
    }
  }

  /**
   * Extracts the function comment from an AST node.
   */
  protected extractFunctionComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for doc comments
      const attributesNode = node.childForFieldName('attributes');
      if (attributesNode) {
        for (let i = 0; i < attributesNode.childCount; i++) {
          const attribute = attributesNode.child(i);
          if (attribute?.text.startsWith('///') || attribute?.text.startsWith('//!') ||
              attribute?.text.includes('#[doc =')) {
            return this.parseRustDocComment(attribute.text);
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Rust function comment');
      return undefined;
    }
  }

  /**
   * Extracts the class comment from an AST node.
   */
  protected extractClassComment(node: SyntaxNode, sourceCode: string): string | undefined {
    try {
      // Look for doc comments
      const attributesNode = node.childForFieldName('attributes');
      if (attributesNode) {
        for (let i = 0; i < attributesNode.childCount; i++) {
          const attribute = attributesNode.child(i);
          if (attribute?.text.startsWith('///') || attribute?.text.startsWith('//!') ||
              attribute?.text.includes('#[doc =')) {
            return this.parseRustDocComment(attribute.text);
          }
        }
      }

      return undefined;
    } catch (error) {
      logger.warn({ err: error, nodeType: node.type }, 'Error extracting Rust class comment');
      return undefined;
    }
  }

  /**
   * Parses a Rust doc comment into a clean comment.
   */
  private parseRustDocComment(comment: string): string {
    try {
      if (comment.startsWith('///')) {
        // Line doc comment
        return comment.replace(/^\/\/\/\s*/mg, '').trim();
      } else if (comment.startsWith('//!')) {
        // Inner line doc comment
        return comment.replace(/^\/\/!\s*/mg, '').trim();
      } else if (comment.includes('#[doc =')) {
        // Attribute doc comment
        const match = comment.match(/#\[doc\s*=\s*"(.*?)"\]/);
        if (match && match[1]) {
          return match[1].replace(/\\"/g, '"').trim();
        }
      }

      return comment;
    } catch (error) {
      logger.warn({ err: error }, 'Error parsing Rust doc comment');
      return comment;
    }
  }

  /**
   * Detects the framework used in the source code.
   */
  detectFramework(sourceCode: string): string | null {
    try {
      // Actix detection
      if (sourceCode.includes('actix_web') ||
          sourceCode.includes('HttpServer') ||
          sourceCode.includes('App::new()')) {
        return 'actix';
      }

      // Rocket detection
      if (sourceCode.includes('rocket') ||
          sourceCode.includes('#[get(') ||
          sourceCode.includes('#[post(')) {
        return 'rocket';
      }

      // Tokio detection
      if (sourceCode.includes('tokio') ||
          sourceCode.includes('#[tokio::main]') ||
          sourceCode.includes('async fn')) {
        return 'tokio';
      }

      // Diesel detection
      if (sourceCode.includes('diesel') ||
          sourceCode.includes('table!') ||
          sourceCode.includes('QueryDsl')) {
        return 'diesel';
      }

      return null;
    } catch (error) {
      logger.warn({ err: error }, 'Error detecting Rust framework');
      return null;
    }
  }
}
