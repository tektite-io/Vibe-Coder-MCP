import { SyntaxNode } from './parser.js';
import { FunctionInfo, ClassInfo, ImportInfo } from './codeMapModel.js';
import { FunctionExtractionOptions, ClassExtractionOptions, ImportExtractionOptions } from './types.js';
import { getLanguageHandler } from './languageHandlers/registry.js';
import logger from '../../logger.js';

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
  const A_AN = ['a', 'e', 'i', 'o', 'u'].includes(name.charAt(0).toLowerCase()) ? 'An' : 'A';
  const nameParts = name.replace(/([A-Z])/g, ' $1').toLowerCase().split(/[\s_]+/).filter(Boolean);
  const readableName = nameParts.join(' ');

  switch (type) {
    case 'function':
      return `Performs an action related to ${readableName}.`;
    case 'method':
      return `Method ${readableName} of class ${parentClass || 'N/A'}.`;
    case 'class':
      return `${A_AN} ${readableName} class definition.`;
    case 'property':
      return `Property ${readableName} of class ${parentClass || 'N/A'}.`;
    case 'import':
      return `Imports module or items from '${readableName}'.`;
    case 'file':
      return `File containing code related to ${readableName}.`; // For file-level comments
    default:
      return `Symbol ${readableName}.`;
  }
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
  try {
    // Get the appropriate language handler
    const handler = getLanguageHandler(languageId);

    // Create options object
    const options: FunctionExtractionOptions = {
      isMethodExtraction,
      className,
      enableContextAnalysis: true,
      enableRoleDetection: true,
      enableHeuristicNaming: true
    };

    // Extract functions using the handler
    return handler.extractFunctions(parentNode, sourceCode, options);
  } catch (error) {
    logger.error({ err: error, languageId }, `Error extracting functions for language ${languageId}`);
    return [];
  }
}

/**
 * Extracts classes from an AST node using the appropriate language handler.
 * @param rootNode The root node to extract classes from.
 * @param sourceCode The source code string.
 * @param languageId The language identifier (e.g., '.js', '.py').
 * @returns An array of extracted class information.
 */
export function extractClasses(rootNode: SyntaxNode, sourceCode: string, languageId: string): ClassInfo[] {
  try {
    // Get the appropriate language handler
    const handler = getLanguageHandler(languageId);

    // Create options object
    const options: ClassExtractionOptions = {
      extractNestedClasses: false,
      extractMethods: true,
      extractProperties: true
    };

    // Extract classes using the handler
    return handler.extractClasses(rootNode, sourceCode, options);
  } catch (error) {
    logger.error({ err: error, languageId }, `Error extracting classes for language ${languageId}`);
    return [];
  }
}

/**
 * Extracts imports from an AST node using the appropriate language handler.
 * @param rootNode The root node to extract imports from.
 * @param sourceCode The source code string.
 * @param languageId The language identifier (e.g., '.js', '.py').
 * @returns An array of extracted import information.
 */
export function extractImports(rootNode: SyntaxNode, sourceCode: string, languageId: string): ImportInfo[] {
  try {
    // Get the appropriate language handler
    const handler = getLanguageHandler(languageId);

    // Create options object
    const options: ImportExtractionOptions = {
      resolveImportPaths: true,
      extractComments: true
    };

    // Extract imports using the handler
    return handler.extractImports(rootNode, sourceCode, options);
  } catch (error) {
    logger.error({ err: error, languageId }, `Error extracting imports for language ${languageId}`);
    return [];
  }
}