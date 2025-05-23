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
 * Attempts to find a comment (docstring or preceding block/line comment) for a given AST node.
 * This is a simplified example; robust comment extraction is language-specific and complex.
 * @param node The SyntaxNode for which to find a comment.
 * @param sourceCode The full source code.
 * @param languageId The language identifier (e.g., '.js', '.py').
 * @returns The extracted comment string or undefined.
 */
function findCommentForNode(node: SyntaxNode, sourceCode: string, languageId: string): string | undefined {
  let commentNode: SyntaxNode | null = null;

  // Try to find Python-style docstring (string literal as first child of function/class body)
  if (languageId === '.py') {
    const bodyNode = node.childForFieldName('body');
    if (bodyNode?.firstChild?.type === 'expression_statement' && bodyNode.firstChild.firstChild?.type === 'string') {
      commentNode = bodyNode.firstChild.firstChild;
      const text = getNodeText(commentNode, sourceCode);
      return text.substring(1, text.length - 1).trim(); // Remove quotes
    }
  }

  // Try to find JSDoc-style block comment immediately preceding the node
  // This requires checking previous siblings that are comments.
  let prevSibling = node.previousNamedSibling;
  if (prevSibling?.type === 'comment' && prevSibling.text.startsWith('/**')) {
     commentNode = prevSibling;
  } else if (node.parent?.type === 'export_statement' && node.parent.previousNamedSibling?.type === 'comment' && node.parent.previousNamedSibling.text.startsWith('/**')) {
    // Handle comments before export statements like `/** Comment */ export class MyClass {}`
    commentNode = node.parent.previousNamedSibling;
  }


  if (commentNode) {
    let text = getNodeText(commentNode, sourceCode);
    // Basic JSDoc/block comment cleaning
    if (text.startsWith('/**') && text.endsWith('*/')) {
      text = text.substring(3, text.length - 2);
    } else if (text.startsWith('/*') && text.endsWith('*/')) {
      text = text.substring(2, text.length - 2);
    }
    // Extract first sentence or a summary
    return text.trim().split('\n')[0].trim(); // Simplistic: take first line
  }

  // Look for single-line comments immediately preceding the node
  // This can be tricky due to whitespace and multiple comments.
  // For now, a very simple check:
  prevSibling = node.previousSibling;
  while(prevSibling && prevSibling.type === 'comment') { // Skip whitespace or other non-named nodes
    if (prevSibling.type === 'comment' && (prevSibling.text.startsWith('//') || prevSibling.text.startsWith('#'))) {
        return prevSibling.text.substring(prevSibling.text.startsWith('//') ? 2 : 1).trim();
    }
    prevSibling = prevSibling.previousSibling;
  }


  return undefined;
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