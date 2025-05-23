/**
 * TypeScript language handler for the Code-Map Generator tool.
 * This file contains the language handler for TypeScript files.
 */
import { JavaScriptHandler } from './javascript.js';
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ContextTracker } from '../context/contextTracker.js';

/**
 * Language handler for TypeScript.
 * Extends the JavaScript handler with TypeScript-specific features.
 */
export class TypeScriptHandler {
    /**
     * Context tracker for nested function analysis.
     */
    contextTracker = new ContextTracker();

    /**
     * JavaScript handler instance to delegate to.
     */
    jsHandler;

    /**
     * Creates a new TypeScript language handler.
     *
     * @param isJsx Whether this handler should handle TSX syntax.
     */
    constructor(isJsx = false) {
        this.jsHandler = new JavaScriptHandler(isJsx);
    }
    /**
     * Gets the query patterns for function detection.
     */
    getFunctionQueryPatterns() {
        // Include JavaScript patterns plus TypeScript-specific patterns
        return [
            ...this.jsHandler.getFunctionQueryPatterns(),
            'function_signature',
            'method_signature',
            'constructor_signature'
        ];
    }
    /**
     * Gets the query patterns for class detection.
     */
    getClassQueryPatterns() {
        return [
            ...this.jsHandler.getClassQueryPatterns(),
            'interface_declaration',
            'type_alias_declaration',
            'enum_declaration'
        ];
    }
    /**
     * Gets the query patterns for import detection.
     */
    getImportQueryPatterns() {
        return [
            ...this.jsHandler.getImportQueryPatterns(),
            'import_type_clause'
        ];
    }
    /**
     * Extracts the function name from an AST node.
     */
    extractFunctionName(node, sourceCode, options) {
        try {
            // Handle TypeScript-specific nodes
            if (node.type === 'function_signature' || node.type === 'method_signature') {
                const nameNode = node.childForFieldName('name');
                return nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
            }
            if (node.type === 'constructor_signature') {
                return 'constructor';
            }
            // Delegate to JavaScript handler for common patterns
            return this.jsHandler.extractFunctionName(node, sourceCode, options);
        }
        catch (error) {
            logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript function name');
            return 'anonymous';
        }
    }
    /**
     * Extracts the class name from an AST node.
     */
    extractClassName(node, sourceCode) {
        try {
            // Handle TypeScript-specific nodes
            if (node.type === 'interface_declaration' ||
                node.type === 'type_alias_declaration' ||
                node.type === 'enum_declaration') {
                const nameNode = node.childForFieldName('name');
                return nameNode ? getNodeText(nameNode, sourceCode) : 'Anonymous';
            }
            // Delegate to JavaScript handler for common patterns
            return this.jsHandler.extractClassName(node, sourceCode);
        }
        catch (error) {
            logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript class name');
            return 'AnonymousClass';
        }
    }
    /**
     * Extracts the parent class from an AST node.
     */
    extractParentClass(node, sourceCode) {
        try {
            if (node.type === 'class_declaration') {
                // Look for 'extends' clause
                const extendsClause = node.childForFieldName('extends_clause');
                if (extendsClause) {
                    const typeNode = extendsClause.childForFieldName('type');
                    if (typeNode) {
                        return getNodeText(typeNode, sourceCode);
                    }
                }
            }
            return undefined;
        }
        catch (error) {
            logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript parent class');
            return undefined;
        }
    }
    /**
     * Extracts implemented interfaces from an AST node.
     */
    extractImplementedInterfaces(node, sourceCode) {
        try {
            if (node.type === 'class_declaration') {
                // Look for 'implements' clause
                const implementsClause = node.childForFieldName('implements_clause');
                if (implementsClause) {
                    const interfaces = [];
                    // Extract each implemented interface
                    implementsClause.descendantsOfType('type_reference').forEach(typeRef => {
                        interfaces.push(getNodeText(typeRef, sourceCode));
                    });
                    return interfaces.length > 0 ? interfaces : undefined;
                }
            }
            return undefined;
        }
        catch (error) {
            logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript implemented interfaces');
            return undefined;
        }
    }
    /**
     * Extracts the function comment from an AST node.
     */
    extractFunctionComment(node, sourceCode) {
        try {
            // Handle TypeScript-specific nodes
            if (node.type === 'function_signature' || node.type === 'method_signature' || node.type === 'constructor_signature') {
                // Look for TSDoc comments
                const current = node;
                // Check for comments before the node
                const startPosition = current.startPosition;
                const lineStart = sourceCode.lastIndexOf('\n', current.startIndex) + 1;
                const textBeforeNode = sourceCode.substring(0, lineStart).trim();
                // Look for TSDoc comment
                const tsdocEnd = textBeforeNode.lastIndexOf('*/');
                if (tsdocEnd !== -1) {
                    const tsdocStart = textBeforeNode.lastIndexOf('/**', tsdocEnd);
                    if (tsdocStart !== -1) {
                        const comment = textBeforeNode.substring(tsdocStart + 3, tsdocEnd).trim();
                        // Extract first sentence or description
                        const lines = comment.split('\n');
                        const description = lines
                            .map(line => line.trim().replace(/^\* ?/, ''))
                            .filter(line => !line.startsWith('@'))
                            .join(' ')
                            .trim();
                        return description;
                    }
                }
                return undefined;
            }
            // Delegate to JavaScript handler for common patterns
            return this.jsHandler.extractFunctionComment(node, sourceCode);
        }
        catch (error) {
            logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript function comment');
            return undefined;
        }
    }
    /**
     * Extracts class properties from an AST node.
     */
    extractClassProperties(node, sourceCode) {
        // First get the properties from the JavaScript handler
        const jsProperties = this.jsHandler.extractClassProperties(node, sourceCode);
        try {
            // Add TypeScript-specific property handling
            if (node.type === 'interface_declaration' || node.type === 'type_alias_declaration') {
                const bodyNode = node.childForFieldName('body');
                if (bodyNode) {
                    // Extract property signatures from interfaces
                    bodyNode.descendantsOfType(['property_signature']).forEach(propNode => {
                        const nameNode = propNode.childForFieldName('name');
                        if (nameNode) {
                            const name = getNodeText(nameNode, sourceCode);
                            // Extract type annotation
                            let type;
                            const typeNode = propNode.childForFieldName('type');
                            if (typeNode) {
                                type = getNodeText(typeNode, sourceCode);
                            }
                            // Extract comment using the JavaScript handler's method
                            const comment = this.jsHandler.extractPropertyComment ? this.jsHandler.extractPropertyComment(propNode, sourceCode) : undefined;
                            // Determine if optional
                            const isOptional = propNode.text.includes('?:');
                            jsProperties.push({
                                name,
                                type: type ? (isOptional ? `${type} | undefined` : type) : undefined,
                                comment: comment ? (isOptional ? `${comment} (Optional)` : comment) : (isOptional ? 'Optional property' : undefined),
                                startLine: propNode.startPosition.row + 1,
                                endLine: propNode.endPosition.row + 1,
                                accessModifier: 'public', // Interface properties are always public
                                isStatic: false
                            });
                        }
                    });
                }
            }
            else if (node.type === 'enum_declaration') {
                const bodyNode = node.childForFieldName('body');
                if (bodyNode) {
                    // Extract enum members
                    bodyNode.descendantsOfType(['enum_member']).forEach(memberNode => {
                        const nameNode = memberNode.childForFieldName('name');
                        if (nameNode) {
                            const name = getNodeText(nameNode, sourceCode);
                            // Extract value if present
                            let type = 'enum';
                            const valueNode = memberNode.childForFieldName('value');
                            if (valueNode) {
                                const value = getNodeText(valueNode, sourceCode);
                                type = `enum (${value})`;
                            }
                            // Extract comment using the JavaScript handler's method
                            const comment = this.jsHandler.extractPropertyComment ? this.jsHandler.extractPropertyComment(memberNode, sourceCode) : undefined;
                            jsProperties.push({
                                name,
                                type,
                                comment: comment || `Enum member ${name}`,
                                startLine: memberNode.startPosition.row + 1,
                                endLine: memberNode.endPosition.row + 1,
                                accessModifier: 'public', // Enum members are always public
                                isStatic: true // Enum members are static
                            });
                        }
                    });
                }
            }
            return jsProperties;
        }
        catch (error) {
            logger.warn({ err: error, nodeType: node.type }, 'Error extracting TypeScript class properties');
            return jsProperties;
        }
    }
    /**
     * Detects the framework used in the source code.
     */
    detectFramework(sourceCode) {
        try {
            // TypeScript-specific framework detection
            if (sourceCode.includes('@angular/core') || sourceCode.includes('@Component')) {
                return 'angular';
            }
            if (sourceCode.includes('@nestjs/common') || sourceCode.includes('@Controller')) {
                return 'nestjs';
            }
            if (sourceCode.includes('next/app') || sourceCode.includes('NextPage')) {
                return 'nextjs';
            }
            // Delegate to JavaScript handler for common frameworks
            return this.jsHandler.detectFramework(sourceCode);
        }
        catch (error) {
            logger.warn({ err: error }, 'Error detecting TypeScript framework');
            return null;
        }
    }

    /**
     * Extracts the import path from an AST node.
     */
    extractImportPath(node, sourceCode) {
        return this.jsHandler.extractImportPath(node, sourceCode);
    }

    /**
     * Extracts imported items from an AST node.
     */
    extractImportedItems(node, sourceCode) {
        return this.jsHandler.extractImportedItems(node, sourceCode);
    }

    /**
     * Checks if an import is a default import.
     */
    isDefaultImport(node, sourceCode) {
        return this.jsHandler.isDefaultImport(node, sourceCode);
    }

    /**
     * Extracts the import alias from an AST node.
     */
    extractImportAlias(node, sourceCode) {
        return this.jsHandler.extractImportAlias(node, sourceCode);
    }

    /**
     * Checks if a function is asynchronous.
     */
    isAsyncFunction(node, sourceCode) {
        return this.jsHandler.isAsyncFunction(node, sourceCode);
    }

    /**
     * Checks if a function is a generator.
     */
    isGeneratorFunction(node, sourceCode) {
        return this.jsHandler.isGeneratorFunction(node, sourceCode);
    }

    /**
     * Checks if a function is exported.
     */
    isExportedFunction(node, sourceCode) {
        return this.jsHandler.isExportedFunction(node, sourceCode);
    }

    /**
     * Checks if a class is exported.
     */
    isExportedClass(node, sourceCode) {
        return this.jsHandler.isExportedClass(node, sourceCode);
    }

    /**
     * Checks if a function is nested within another function.
     */
    isNestedFunction(node) {
        return this.jsHandler.isNestedFunction(node);
    }

    /**
     * Checks if a class is nested within another class.
     */
    isNestedClass(node) {
        return this.jsHandler.isNestedClass(node);
    }

    /**
     * Gets the depth of a node in the AST.
     */
    getNodeDepth(node) {
        return this.jsHandler.getNodeDepth(node);
    }

    /**
     * Gets the current context.
     */
    getCurrentContext() {
        return this.jsHandler.getCurrentContext();
    }

    /**
     * Enhances import information using third-party resolvers.
     */
    async enhanceImportInfo(filePath, imports, options) {
        return this.jsHandler.enhanceImportInfo(filePath, imports, options);
    }

    /**
     * Merges original and enhanced import information.
     */
    mergeImportInfo(original, enhanced) {
        return this.jsHandler.mergeImportInfo(original, enhanced);
    }

    /**
     * Generates a heuristic comment for a function.
     */
    generateHeuristicComment(name, type, signature, parentClass) {
        return this.jsHandler.generateHeuristicComment(name, type, signature, parentClass);
    }

    /**
     * Extracts property comment from an AST node.
     */
    extractPropertyComment(node, sourceCode) {
        return this.jsHandler.extractPropertyComment ? this.jsHandler.extractPropertyComment(node, sourceCode) : undefined;
    }
}
