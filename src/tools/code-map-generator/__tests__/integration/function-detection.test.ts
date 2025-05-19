/**
 * Integration tests for the enhanced function name detection system.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { parseSourceCode, initializeParser, cleanupParser } from '../../parser.js';
import { LanguageHandlerRegistry } from '../../languageHandlers/registry.js';
import { JavaScriptHandler } from '../../languageHandlers/javascript.js';
import { PythonHandler } from '../../languageHandlers/python.js';
import { FunctionInfo } from '../../codeMapModel.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to test fixtures
const fixturesDir = path.join(__dirname, '..', 'fixtures');

describe('Enhanced Function Name Detection - Integration Tests', () => {
  beforeAll(async () => {
    // Initialize parser
    await initializeParser();

    // Create registry instance and register language handlers
    const registry = new LanguageHandlerRegistry();
    registry.registerHandler('.js', new JavaScriptHandler());
    registry.registerHandler('.py', new PythonHandler());
  });

  afterAll(() => {
    // Cleanup parser
    cleanupParser();
  });

  describe('JavaScript Function Detection', () => {
    it('should detect all functions in a JavaScript file', async () => {
      // Read the JavaScript test fixture
      const filePath = path.join(fixturesDir, 'javascript-functions.js');
      const sourceCode = fs.readFileSync(filePath, 'utf-8');

      // Parse the source code
      const { ast, language } = await parseSourceCode(sourceCode, 'javascript');

      // Get the language handler
      const registry = new LanguageHandlerRegistry();
      const handler = registry.getHandler(language === 'javascript' ? '.js' : '.py');

      // Extract functions
      const functions = handler.extractFunctions(ast, sourceCode);

      // Verify results
      expect(functions).toBeDefined();
      expect(functions.length).toBeGreaterThan(0);

      // Check for specific functions
      const functionNames = functions.map((f: FunctionInfo) => f.name);
      expect(functionNames).toContain('regularFunction');
      expect(functionNames).toContain('arrowFunction');

      // Check for class methods
      const methodNames = functions.filter((f: FunctionInfo) => f.isMethod).map((f: FunctionInfo) => f.name);
      expect(methodNames).toContain('methodFunction');

      // Check for React components
      const componentNames = functions.filter((f: FunctionInfo) => f.framework === 'react').map((f: FunctionInfo) => f.name);
      expect(componentNames.some((name: string) => name.includes('Component'))).toBe(true);

      // Check for React hooks
      const hookNames = functions.filter((f: FunctionInfo) => f.isHook).map((f: FunctionInfo) => f.name);
      expect(hookNames.some((name: string) => name.includes('Hook'))).toBe(true);

      // Check for event handlers
      const handlerNames = functions.filter((f: FunctionInfo) => f.isEventHandler).map((f: FunctionInfo) => f.name);
      expect(handlerNames.some((name: string) => name.includes('Handler'))).toBe(true);
    });

    it('should extract function comments from JSDoc', async () => {
      // Read the JavaScript test fixture
      const filePath = path.join(fixturesDir, 'javascript-functions.js');
      const sourceCode = fs.readFileSync(filePath, 'utf-8');

      // Parse the source code
      const { ast, language } = await parseSourceCode(sourceCode, 'javascript');

      // Get the language handler
      const registry = new LanguageHandlerRegistry();
      const handler = registry.getHandler(language === 'javascript' ? '.js' : '.py');

      // Extract functions
      const functions = handler.extractFunctions(ast, sourceCode);

      // Find the regularFunction
      const regularFunction = functions.find((f: FunctionInfo) => f.name === 'regularFunction');

      // Verify comment
      expect(regularFunction).toBeDefined();
      expect(regularFunction?.comment).toContain('A regular function declaration');
    });
  });

  describe('Python Function Detection', () => {
    it('should detect all functions in a Python file', async () => {
      // Read the Python test fixture
      const filePath = path.join(fixturesDir, 'python-functions.py');
      const sourceCode = fs.readFileSync(filePath, 'utf-8');

      // Parse the source code
      const { ast, language } = await parseSourceCode(sourceCode, 'python');

      // Get the language handler
      const registry = new LanguageHandlerRegistry();
      const handler = registry.getHandler(language === 'javascript' ? '.js' : '.py');

      // Extract functions
      const functions = handler.extractFunctions(ast, sourceCode);

      // Verify results
      expect(functions).toBeDefined();
      expect(functions.length).toBeGreaterThan(0);

      // Check for specific functions
      const functionNames = functions.map((f: FunctionInfo) => f.name);
      expect(functionNames).toContain('regular_function');
      expect(functionNames).toContain('decorator');
      expect(functionNames).toContain('decorated_function');
      expect(functionNames).toContain('generator_function');
      expect(functionNames).toContain('async_function');

      // Check for class methods
      const methodNames = functions.filter((f: FunctionInfo) => f.isMethod).map((f: FunctionInfo) => f.name);
      expect(methodNames).toContain('__init__');
      expect(methodNames).toContain('method_function');
      expect(methodNames).toContain('class_method');
      expect(methodNames).toContain('static_method');
    });

    it('should extract function comments from docstrings', async () => {
      // Read the Python test fixture
      const filePath = path.join(fixturesDir, 'python-functions.py');
      const sourceCode = fs.readFileSync(filePath, 'utf-8');

      // Parse the source code
      const { ast, language } = await parseSourceCode(sourceCode, 'python');

      // Get the language handler
      const registry = new LanguageHandlerRegistry();
      const handler = registry.getHandler(language === 'javascript' ? '.js' : '.py');

      // Extract functions
      const functions = handler.extractFunctions(ast, sourceCode);

      // Find the regular_function
      const regularFunction = functions.find((f: FunctionInfo) => f.name === 'regular_function');

      // Verify comment
      expect(regularFunction).toBeDefined();
      expect(regularFunction?.comment).toContain('A regular function');
    });
  });

  describe('Cross-Language Function Detection', () => {
    it('should detect functions in multiple languages', async () => {
      // Read the test fixtures
      const jsFilePath = path.join(fixturesDir, 'javascript-functions.js');
      const pyFilePath = path.join(fixturesDir, 'python-functions.py');

      const jsSourceCode = fs.readFileSync(jsFilePath, 'utf-8');
      const pySourceCode = fs.readFileSync(pyFilePath, 'utf-8');

      // Parse the source code
      const jsResult = await parseSourceCode(jsSourceCode, 'javascript');
      const pyResult = await parseSourceCode(pySourceCode, 'python');

      // Get the language handlers
      const registry = new LanguageHandlerRegistry();
      const jsHandler = registry.getHandler('.js');
      const pyHandler = registry.getHandler('.py');

      // Extract functions
      const jsFunctions = jsHandler.extractFunctions(jsResult.ast, jsSourceCode);
      const pyFunctions = pyHandler.extractFunctions(pyResult.ast, pySourceCode);

      // Verify results
      expect(jsFunctions.length).toBeGreaterThan(0);
      expect(pyFunctions.length).toBeGreaterThan(0);

      // Check for language-specific features
      const jsHooks = jsFunctions.filter((f: FunctionInfo) => f.isHook).length;
      const pyDecorators = pyFunctions.filter((f: FunctionInfo) => f.name === 'decorated_function').length;

      expect(jsHooks).toBeGreaterThan(0);
      expect(pyDecorators).toBeGreaterThan(0);
    });
  });
});
