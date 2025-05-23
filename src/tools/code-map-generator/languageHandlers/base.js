/**
 * Base language handler for the Code-Map Generator tool.
 * This file contains the base class for language-specific handlers.
 */
import { getNodeText } from '../astAnalyzer.js';
import logger from '../../../logger.js';
import { ContextTracker } from '../context/contextTracker.js';
/**
 * Base class for language-specific handlers.
 * Implements common functionality for all language handlers.
 */
export class BaseLanguageHandler {
    /**
     * Context tracker for nested function analysis.
     */
    contextTracker = new ContextTracker();
    /**
     * Extracts functions from an AST node.
     * This is a template method that delegates to language-specific implementations.
     */
    extractFunctions(rootNode, sourceCode, options = {}) {
        // Reset context tracker
        this.contextTracker.clear();
        // Get query patterns for this language
        const queryPatterns = this.getFunctionQueryPatterns();
        // Extract functions using the query patterns
        const functions = [];
        // Process each query pattern
        for (const pattern of queryPatterns) {
            try {
                rootNode.descendantsOfType(pattern).forEach(node => {
                    // Skip nested functions if not extracting methods
                    if (!options.isMethodExtraction && this.isNestedFunction(node)) {
                        return;
                    }
                    // Skip if exceeding maximum nested depth
                    if (options.maxNestedFunctionDepth !== undefined &&
                        this.getNodeDepth(node) > options.maxNestedFunctionDepth) {
                        return;
                    }
                    // Extract function information using the context tracker
                    const functionInfo = this.contextTracker.withContext('function', node, undefined, () => {
                        // Extract function name
                        const name = this.extractFunctionName(node, sourceCode, options);
                        // Update context with the name
                        if (name) {
                            this.contextTracker.exitContext();
                            this.contextTracker.enterContext('function', node, name);
                        }
                        // Extract function signature
                        const signature = this.extractFunctionSignature(node, sourceCode);
                        // Extract function comment
                        const comment = this.extractFunctionComment(node, sourceCode) ||
                            this.generateHeuristicComment(name, options.isMethodExtraction ? 'method' : 'function', signature, options.className);
                        // Create function info
                        return {
                            name,
                            signature,
                            comment,
                            startLine: node.startPosition.row + 1,
                            endLine: node.endPosition.row + 1,
                            isAsync: this.isAsyncFunction(node, sourceCode),
                            isExported: this.isExportedFunction(node, sourceCode),
                            isMethod: options.isMethodExtraction || false,
                            isConstructor: name === 'constructor',
                            isGetter: name.startsWith('get') && name.length > 3,
                            isSetter: name.startsWith('set') && name.length > 3,
                            isGenerator: this.isGeneratorFunction ? this.isGeneratorFunction(node, sourceCode) : false,
                            isHook: name.startsWith('use') && name.length > 3 && name[3] === name[3].toUpperCase(),
                            isEventHandler: name.startsWith('handle') || name.startsWith('on'),
                            framework: this.detectFramework(sourceCode) || undefined,
                            class: options.className,
                        };
                    });
                    functions.push(functionInfo);
                });
            }
            catch (error) {
                logger.warn({ err: error, pattern }, `Error processing pattern ${pattern} for function extraction`);
            }
        }
        return functions;
    }
    /**
     * Extracts classes from an AST node.
     * This is a template method that delegates to language-specific implementations.
     */
    extractClasses(rootNode, sourceCode, options = {}) {
        const classes = [];
        const queryPatterns = this.getClassQueryPatterns();
        for (const pattern of queryPatterns) {
            try {
                rootNode.descendantsOfType(pattern).forEach(node => {
                    // Skip nested classes if not extracting them
                    if (!options.extractNestedClasses && this.isNestedClass(node)) {
                        return;
                    }
                    // Skip if exceeding maximum nested depth
                    if (options.maxNestedClassDepth !== undefined &&
                        this.getNodeDepth(node) > options.maxNestedClassDepth) {
                        return;
                    }
                    // Extract class information using the context tracker
                    const classInfo = this.contextTracker.withContext('class', node, undefined, () => {
                        // Extract class name
                        const name = this.extractClassName(node, sourceCode);
                        // Update context with the name
                        if (name) {
                            this.contextTracker.exitContext();
                            this.contextTracker.enterContext('class', node, name);
                        }
                        // Extract class methods if requested
                        const methods = options.extractMethods !== false ?
                            this.extractFunctions(node, sourceCode, { isMethodExtraction: true, className: name }) : [];
                        // Extract class properties if requested
                        const properties = options.extractProperties !== false ?
                            this.extractClassProperties(node, sourceCode) : [];
                        // Extract parent class
                        const parentClass = this.extractParentClass(node, sourceCode);
                        // Extract implemented interfaces
                        const implementedInterfaces = this.extractImplementedInterfaces(node, sourceCode);
                        // Extract class comment
                        const comment = this.extractClassComment(node, sourceCode) ||
                            this.generateHeuristicComment(name, 'class');
                        // Create class info
                        return {
                            name,
                            methods,
                            properties,
                            parentClass,
                            implementedInterfaces,
                            comment,
                            startLine: node.startPosition.row + 1,
                            endLine: node.endPosition.row + 1,
                            isExported: this.isExportedClass(node, sourceCode),
                        };
                    });
                    classes.push(classInfo);
                });
            }
            catch (error) {
                logger.warn({ err: error, pattern }, `Error processing pattern ${pattern} for class extraction`);
            }
        }
        return classes;
    }
    /**
     * Extracts imports from an AST node.
     * This is a template method that delegates to language-specific implementations.
     */
    extractImports(rootNode, sourceCode, options = {}) {
        const imports = [];
        const queryPatterns = this.getImportQueryPatterns();
        for (const pattern of queryPatterns) {
            try {
                rootNode.descendantsOfType(pattern).forEach(node => {
                    try {
                        // Extract import information using the context tracker
                        const importInfo = this.contextTracker.withContext('import', node, undefined, () => {
                            // Extract import path
                            const path = this.extractImportPath(node, sourceCode);
                            // Update context with the path
                            if (path) {
                                this.contextTracker.exitContext();
                                this.contextTracker.enterContext('import', node, path);
                            }
                            // Extract imported items
                            const importedItems = this.extractImportedItems(node, sourceCode);
                            // Check if it's a default import
                            const isDefault = this.isDefaultImport(node, sourceCode);
                            // Extract alias if any
                            const alias = this.extractImportAlias(node, sourceCode);
                            // Extract import comment
                            const comment = options.extractComments ?
                                this.extractImportComment(node, sourceCode) : undefined;
                            // Create import info
                            return {
                                path,
                                importedItems,
                                isDefault,
                                alias,
                                comment,
                                startLine: node.startPosition.row + 1,
                                endLine: node.endPosition.row + 1,
                            };
                        });
                        imports.push(importInfo);
                    }
                    catch (error) {
                        logger.warn({ err: error, node: node.type }, `Error extracting import information`);
                    }
                });
            }
            catch (error) {
                logger.warn({ err: error, pattern }, `Error processing pattern ${pattern} for import extraction`);
            }
        }
        return imports;
    }
    /**
     * Detects the framework used in the source code.
     * This can be overridden by language-specific handlers.
     */
    detectFramework(_sourceCode) {
        // Default implementation returns null
        return null;
    }
    /**
     * Extracts the function signature from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractFunctionSignature(node, sourceCode) {
        const nameNode = node.childForFieldName('name');
        const paramsNode = node.childForFieldName('parameters');
        const name = nameNode ? getNodeText(nameNode, sourceCode) : 'anonymous';
        const params = paramsNode ? getNodeText(paramsNode, sourceCode) : '()';
        return `${name}${params}`;
    }
    /**
     * Extracts the function comment from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractFunctionComment(_node, _sourceCode) {
        // Default implementation looks for comments before the node
        // This is a basic implementation that should be overridden by language-specific handlers
        return undefined;
    }
    /**
     * Extracts the class comment from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractClassComment(_node, _sourceCode) {
        // Default implementation looks for comments before the node
        // This is a basic implementation that should be overridden by language-specific handlers
        return undefined;
    }
    /**
     * Extracts the import comment from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractImportComment(_node, _sourceCode) {
        // Default implementation looks for comments before the node
        // This is a basic implementation that should be overridden by language-specific handlers
        return undefined;
    }
    /**
     * Extracts the parent class from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractParentClass(_node, _sourceCode) {
        // Default implementation returns undefined
        return undefined;
    }
    /**
     * Extracts implemented interfaces from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractImplementedInterfaces(_node, _sourceCode) {
        // Default implementation returns undefined
        return undefined;
    }
    /**
     * Extracts imported items from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractImportedItems(_node, _sourceCode) {
        // Default implementation returns undefined
        return undefined;
    }
    /**
     * Checks if an import is a default import.
     * This can be overridden by language-specific handlers.
     */
    isDefaultImport(_node, _sourceCode) {
        // Default implementation returns undefined
        return undefined;
    }
    /**
     * Extracts the import alias from an AST node.
     * This can be overridden by language-specific handlers.
     */
    extractImportAlias(_node, _sourceCode) {
        // Default implementation returns undefined
        return undefined;
    }
    /**
     * Generates a heuristic comment for a function.
     * This can be overridden by language-specific handlers.
     */
    generateHeuristicComment(name, type, signature, parentClass) {
        // Default implementation generates a comment based on the name
        if (type === 'function' || type === 'method') {
            if (name.startsWith('get') && name.length > 3) {
                const propertyName = name.charAt(3).toLowerCase() + name.slice(4);
                return `Gets the ${propertyName}.`;
            }
            else if (name.startsWith('set') && name.length > 3) {
                const propertyName = name.charAt(3).toLowerCase() + name.slice(4);
                return `Sets the ${propertyName}.`;
            }
            else if (name.startsWith('is') && name.length > 2) {
                const propertyName = name.charAt(2).toLowerCase() + name.slice(3);
                return `Checks if ${propertyName}.`;
            }
            else if (name.startsWith('has') && name.length > 3) {
                const propertyName = name.charAt(3).toLowerCase() + name.slice(4);
                return `Checks if has ${propertyName}.`;
            }
            else if (name.startsWith('on') && name.length > 2) {
                const eventName = name.charAt(2).toLowerCase() + name.slice(3);
                return `Handles the ${eventName} event.`;
            }
            else if (name.includes('callback')) {
                return `Callback function for handling an operation.`;
            }
            else if (name.includes('handler')) {
                return `Handler function for processing an event or action.`;
            }
            else if (name === 'constructor') {
                return parentClass ? `Creates a new instance of ${parentClass}.` : `Creates a new instance.`;
            }
            else {
                return `Performs an action related to ${name}.`;
            }
        }
        else if (type === 'class') {
            return `Represents a ${name} object.`;
        }
        else if (type === 'property') {
            return `The ${name} property.`;
        }
        else if (type === 'import') {
            return `Imports from ${name}.`;
        }
        else if (type === 'file') {
            return `Contains functionality related to ${name}.`;
        }
        return `Performs an action related to ${name}.`;
    }
    /**
     * Checks if a function is asynchronous.
     * This can be overridden by language-specific handlers.
     */
    isAsyncFunction(node, _sourceCode) {
        // Default implementation checks if the function has the 'async' keyword
        return node.text.startsWith('async ');
    }
    /**
     * Checks if a function is a generator.
     * This can be overridden by language-specific handlers.
     */
    isGeneratorFunction(_node, _sourceCode) {
        // Default implementation returns false
        return false;
    }
    /**
     * Checks if a function is exported.
     * This can be overridden by language-specific handlers.
     */
    isExportedFunction(node, _sourceCode) {
        // Default implementation checks if the function is part of an export statement
        return node.parent?.type === 'export_statement';
    }
    /**
     * Checks if a class is exported.
     * This can be overridden by language-specific handlers.
     */
    isExportedClass(node, _sourceCode) {
        // Default implementation checks if the class is part of an export statement
        return node.parent?.type === 'export_statement';
    }
    /**
     * Checks if a function is nested within another function.
     * This can be overridden by language-specific handlers.
     */
    isNestedFunction(node) {
        // Default implementation checks if the function is within another function
        let parent = node.parent;
        while (parent) {
            if (this.getFunctionQueryPatterns().includes(parent.type)) {
                return true;
            }
            parent = parent.parent;
        }
        return false;
    }
    /**
     * Checks if a class is nested within another class.
     * This can be overridden by language-specific handlers.
     */
    isNestedClass(node) {
        // Default implementation checks if the class is within another class
        let parent = node.parent;
        while (parent) {
            if (this.getClassQueryPatterns().includes(parent.type)) {
                return true;
            }
            parent = parent.parent;
        }
        return false;
    }
    /**
     * Gets the depth of a node in the AST.
     * This can be overridden by language-specific handlers.
     */
    getNodeDepth(node) {
        let depth = 0;
        let parent = node.parent;
        while (parent) {
            depth++;
            parent = parent.parent;
        }
        return depth;
    }
    /**
     * Gets the current context.
     */
    getCurrentContext() {
        const context = this.contextTracker.getCurrentContext();
        if (!context)
            return undefined;
        return {
            type: context.type,
            name: context.name,
            parent: context.parent ? {
                type: context.parent.type,
                name: context.parent.name,
                parent: context.parent.parent
            } : undefined
        };
    }
    /**
     * Extracts class properties from an AST node.
     * This should be overridden by language-specific handlers.
     *
     * @param node The class node to extract properties from
     * @param sourceCode The source code containing the class
     * @returns An array of class property information
     */
    extractClassProperties(node, sourceCode) {
        return [];
    }
    /**
     * Enhances import information using third-party resolvers.
     * This method can be overridden by language-specific handlers.
     *
     * @param filePath Path to the file containing the imports
     * @param imports Array of imports to enhance
     * @param options Options for import resolution
     * @returns Enhanced import information
     */
    async enhanceImportInfo(filePath, imports, options) {
        try {
            // Import the factory dynamically to avoid circular dependencies
            const { ImportResolverFactory } = await import('../importResolvers/importResolverFactory.js');
            // Create import resolver factory
            const factory = new ImportResolverFactory({
                allowedDir: options.allowedDir,
                outputDir: options.outputDir,
                maxDepth: options.maxDepth || 3,
                tsConfig: options.tsConfig,
                pythonPath: options.pythonPath,
                pythonVersion: options.pythonVersion,
                venvPath: options.venvPath,
                clangdPath: options.clangdPath,
                compileFlags: options.compileFlags,
                includePaths: options.includePaths,
                semgrepPatterns: options.semgrepPatterns,
                semgrepTimeout: options.semgrepTimeout,
                semgrepMaxMemory: options.semgrepMaxMemory,
                disableSemgrepFallback: options.disableSemgrepFallback
            });
            // Get resolver for the file
            const resolver = factory.getImportResolver(filePath);
            if (!resolver) {
                return imports;
            }
            // Analyze imports with the resolver
            const enhancedImports = await resolver.analyzeImports(filePath, options);
            // Merge original and enhanced imports
            return this.mergeImportInfo(imports, enhancedImports);
        }
        catch (error) {
            logger.error({ err: error, filePath }, 'Error enhancing import info in base handler');
            return imports;
        }
    }
    /**
     * Merges original and enhanced import information.
     * This method can be overridden by language-specific handlers.
     *
     * @param original Original import information
     * @param enhanced Enhanced import information
     * @returns Merged import information
     */
    mergeImportInfo(original, enhanced) {
        const result = [];
        // Create a map of original imports by path
        const originalImportMap = new Map();
        for (const importInfo of original) {
            originalImportMap.set(importInfo.path, importInfo);
        }
        // Process enhanced imports
        for (const enhancedImport of enhanced) {
            const originalImport = originalImportMap.get(enhancedImport.path);
            if (originalImport) {
                // Merge with original import
                result.push({
                    ...originalImport,
                    // Keep original imported items but add metadata from enhanced import
                    metadata: {
                        ...originalImport.metadata,
                        ...enhancedImport.metadata
                    },
                    // Use enhanced values for these properties
                    isCore: enhancedImport.isCore,
                    isDynamic: enhancedImport.isDynamic,
                    isExternalPackage: enhancedImport.isExternalPackage,
                    moduleSystem: enhancedImport.moduleSystem || originalImport.moduleSystem
                });
                // Remove from map to track processed imports
                originalImportMap.delete(enhancedImport.path);
            }
            else {
                // Add new import discovered by the resolver
                result.push(enhancedImport);
            }
        }
        // Add remaining original imports
        for (const importInfo of originalImportMap.values()) {
            result.push(importInfo);
        }
        return result;
    }
}
