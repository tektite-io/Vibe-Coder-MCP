/**
 * Context tracking system for the Code-Map Generator tool.
 * This file contains the context tracker for tracking nested functions and their contexts.
 */

import { SyntaxNode } from '../parser.js';
import logger from '../../../logger.js';

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
    try {
      const parent = this.getCurrentContext();
      this.contextStack.push({ type, node, name, parent });
      logger.debug(`Entered ${type} context${name ? ` '${name}'` : ''}`);
    } catch (error) {
      logger.warn({ err: error }, `Error entering ${type} context`);
    }
  }
  
  /**
   * Pops a context from the stack.
   */
  exitContext(): void {
    try {
      const context = this.contextStack.pop();
      if (context) {
        logger.debug(`Exited ${context.type} context${context.name ? ` '${context.name}'` : ''}`);
      }
    } catch (error) {
      logger.warn({ err: error }, 'Error exiting context');
    }
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
   * Gets the context hierarchy as a string.
   * 
   * @param separator The separator to use between context names.
   * @returns A string representation of the context hierarchy.
   */
  getContextHierarchyString(separator: string = '.'): string {
    return this.getContextHierarchy().join(separator);
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
   * Gets all contexts of a specific type.
   * 
   * @param type The type to look for.
   * @returns An array of all contexts of the specified type.
   */
  getContextsOfType(type: string): Context[] {
    return this.contextStack.filter(ctx => ctx.type === type);
  }
  
  /**
   * Gets the depth of the current context.
   * 
   * @returns The depth of the current context.
   */
  getContextDepth(): number {
    return this.contextStack.length;
  }
  
  /**
   * Clears the context stack.
   */
  clear(): void {
    this.contextStack = [];
    logger.debug('Context stack cleared');
  }
  
  /**
   * Executes a function within a context and automatically exits the context when done.
   * 
   * @param type The type of context.
   * @param node The AST node associated with this context.
   * @param name The name of the context (optional).
   * @param fn The function to execute within the context.
   * @returns The result of the function.
   */
  withContext<T>(type: string, node: SyntaxNode, name: string | undefined, fn: () => T): T {
    this.enterContext(type, node, name);
    try {
      return fn();
    } finally {
      this.exitContext();
    }
  }
}
