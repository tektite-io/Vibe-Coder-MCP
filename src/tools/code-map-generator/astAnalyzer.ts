import { SyntaxNode, Tree } from './parser.js'; // Assuming SyntaxNode and Tree are exported from parser.ts
import { FunctionInfo, ClassInfo, ImportInfo } from './codeMapModel.js';
import logger from '../../logger.js';

// Language-specific query strings or node types can be defined here or in a separate config
// For simplicity, we'll use string comparisons for node types, but queries are more robust.
// Example:
// const JS_FUNCTION_QUERY = `(function_declaration name: (identifier) @name parameters: (formal_parameters) @params body: (statement_block) @body)`;

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


export function extractFunctions(
  parentNode: SyntaxNode,
  sourceCode: string,
  languageId: string,
  isMethodExtraction: boolean = false, // True if extracting methods for a class
  className?: string // Optional class name if extracting methods
): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const queryPatterns: Record<string, string[]> = {
    '.js': ['function_declaration', 'arrow_function', 'method_definition'],
    '.ts': ['function_declaration', 'arrow_function', 'method_definition'],
    '.py': ['function_definition'],
    // Add more language patterns here
  };

  const patternsToQuery = queryPatterns[languageId] || [];
  if (patternsToQuery.length === 0) return functions;

  parentNode.descendantsOfType(patternsToQuery).forEach(node => {
    // Filter out nested functions if we are only extracting top-level functions or methods
    if (!isMethodExtraction && node.parent && patternsToQuery.includes(node.parent.type)) {
        return; // Skip nested functions if not extracting methods within this call
    }
    if (isMethodExtraction && node.type !== 'method_definition' && languageId !== '.py') { // Python methods are 'function_definition'
        // If extracting methods, only consider method_definition nodes (or equivalent for other langs)
        // unless it's Python where methods are also function_definition but within a class_definition
        if (languageId === '.py' && node.parent?.type !== 'block') { // Python methods are inside class's block
             return;
        } else if (languageId !== '.py') {
            return;
        }
    }


    let name = 'anonymous';
    let signatureParams = '()';
    const nameNode = node.childForFieldName('name') || (node.type === 'arrow_function' && node.previousNamedSibling?.type === 'identifier' ? node.previousNamedSibling : null);
    if (nameNode) {
      name = getNodeText(nameNode, sourceCode);
    }

    const paramsNode = node.childForFieldName('parameters');
    if (paramsNode) {
      signatureParams = getNodeText(paramsNode, sourceCode);
    } else if (node.type === 'arrow_function') {
        // Simpler param extraction for arrow functions if 'parameters' field isn't standard
        const firstChild = node.firstChild;
        if (firstChild?.type === 'identifier' || firstChild?.type === 'formal_parameters') {
            signatureParams = getNodeText(firstChild, sourceCode);
        }
    }


    const comment = findCommentForNode(node, sourceCode, languageId) || generateHeuristicComment(name, isMethodExtraction ? 'method' : 'function', signatureParams, className);

    functions.push({
      name,
      signature: `${name}${signatureParams}`, // Simplified signature
      comment,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isAsync: node.text.startsWith('async '), // Basic check
      isExported: node.parent?.type === 'export_statement', // Basic check
    });
  });
  return functions;
}

export function extractClasses(rootNode: SyntaxNode, sourceCode: string, languageId: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const queryPatterns: Record<string, string[]> = {
    '.js': ['class_declaration'],
    '.ts': ['class_declaration'],
    '.py': ['class_definition'],
    // Add more
  };

  const patternsToQuery = queryPatterns[languageId] || [];
  if (patternsToQuery.length === 0) return classes;

  rootNode.descendantsOfType(patternsToQuery).forEach(node => {
    const nameNode = node.childForFieldName('name');
    const name = nameNode ? getNodeText(nameNode, sourceCode) : 'AnonymousClass';

    const methods = extractFunctions(node.childForFieldName('body') || node, sourceCode, languageId, true, name);

    let parentClass: string | undefined;
    const superclassNode = node.childForFieldName('superclass'); // Common in JS/TS
    if (superclassNode) {
      parentClass = getNodeText(superclassNode, sourceCode);
    } else if (languageId === '.py') { // Python: class MyClass(ParentClass):
        const argListNode = node.childForFieldName('argument_list');
        if(argListNode?.firstChild?.type === 'identifier') {
            parentClass = getNodeText(argListNode.firstChild, sourceCode);
        }
    }

    const comment = findCommentForNode(node, sourceCode, languageId) || generateHeuristicComment(name, 'class');

    classes.push({
      name,
      methods,
      parentClass,
      // implementedInterfaces: [], // TODO: Extract interfaces
      comment,
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      isExported: node.parent?.type === 'export_statement',
    });
  });
  return classes;
}

export function extractImports(rootNode: SyntaxNode, sourceCode: string, languageId: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const queryPatterns: Record<string, string[]> = {
    '.js': ['import_statement', 'lexical_declaration'], // lex_decl for require()
    '.ts': ['import_statement', 'lexical_declaration'],
    '.py': ['import_statement', 'import_from_statement'],
    // Add more
  };

  const patternsToQuery = queryPatterns[languageId] || [];
  if (patternsToQuery.length === 0) return imports;

  rootNode.descendantsOfType(patternsToQuery).forEach(node => {
    let importPath = '';
    const importedItems: string[] = [];
    let isDefault = false;

    if ((languageId === '.js' || languageId === '.ts') && node.type === 'import_statement') {
        const sourceNode = node.childForFieldName('source');
        if (sourceNode) {
            importPath = getNodeText(sourceNode, sourceCode).slice(1, -1); // Remove quotes
        }
        // Look for named imports or default import
        node.descendantsOfType(['import_clause', 'named_imports', 'identifier', 'namespace_import']).forEach(clauseNode => {
            if(clauseNode.type === 'identifier' && clauseNode.parent?.type === 'import_clause' && clauseNode.previousSibling?.type !== 'type_alias_declaration') { // basic default import
                importedItems.push(getNodeText(clauseNode, sourceCode));
                isDefault = true;
            } else if (clauseNode.type === 'identifier' && clauseNode.parent?.type === 'import_specifier') {
                 importedItems.push(getNodeText(clauseNode, sourceCode));
            } else if (clauseNode.type === 'namespace_import' && clauseNode.childForFieldName('name')) {
                importedItems.push(`* as ${getNodeText(clauseNode.childForFieldName('name'), sourceCode)}`);
            }
        });
    } else if (languageId === '.py' && (node.type === 'import_statement' || node.type === 'import_from_statement')) {
        // Python: import module or from module import item
        if (node.type === 'import_statement') {
            node.descendantsOfType('dotted_name').forEach(nameNode => {
                 imports.push({
                    path: getNodeText(nameNode, sourceCode),
                    startLine: node.startPosition.row +1,
                    endLine: node.endPosition.row + 1,
                 });
            });
            return; // Handled
        } else { // import_from_statement
            const moduleNameNode = node.childForFieldName('module_name');
            if (moduleNameNode) {
                importPath = getNodeText(moduleNameNode, sourceCode);
            }
            node.descendantsOfType(['dotted_name', 'wildcard_import']).forEach(itemNode => {
                 if (itemNode.parent?.type === 'import_from_statement' && itemNode.previousSibling?.text === 'import') { // avoid module_name
                    importedItems.push(getNodeText(itemNode, sourceCode));
                 } else if (itemNode.type === 'dotted_name' && itemNode.parent?.type === 'aliased_import') {
                    importedItems.push(getNodeText(itemNode, sourceCode) + ' as ' + getNodeText(itemNode.nextNamedSibling, sourceCode));
                 } else if (itemNode.type === 'wildcard_import') {
                    importedItems.push('*');
                 }
            });
        }
    } else if ((languageId === '.js' || languageId === '.ts') && node.type === 'lexical_declaration') {
        // Basic require: const x = require('module');
        const callNode = node.descendantsOfType('call_expression').find(c => getNodeText(c.childForFieldName('function'), sourceCode) === 'require');
        if (callNode) {
            const argNode = callNode.childForFieldName('arguments')?.firstChild;
            if (argNode && (argNode.type === 'string' || argNode.type === 'template_string')) {
                importPath = getNodeText(argNode, sourceCode).slice(1, -1);
                const varNameNode = node.descendantsOfType('identifier')[0];
                if (varNameNode) importedItems.push(getNodeText(varNameNode, sourceCode));
                isDefault = true; // require usually acts like a default import
            }
        } else {
            return; // Not a require call
        }
    }


    if (importPath) {
      imports.push({
        path: importPath,
        importedItems: importedItems.length > 0 ? importedItems : undefined,
        isDefault,

        startLine: node.startPosition.row + 1,
        endLine: node.endPosition.row + 1,
      });
    }
  });
  return imports;
}