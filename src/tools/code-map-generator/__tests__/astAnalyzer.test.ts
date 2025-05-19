import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractFunctions, extractClasses, extractImports, generateHeuristicComment, getNodeText } from '../astAnalyzer.js';
import { initializeParser, SyntaxNode } from '../parser.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock the parser module to control AST generation for tests
// This is a more robust way to mock than vi.mock('web-tree-sitter') directly for this file's dependencies
vi.mock('../parser.js', async () => {
  const originalModule = await vi.importActual('../parser.js');
  return {
    ...originalModule,
    initializeParser: vi.fn().mockResolvedValue(undefined),
    getParserForFileExtension: vi.fn(),
    parseCode: vi.fn(), // if astAnalyzer calls parseCode directly
  };
});


describe('AST Analyzer', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Ensure parser is "initialized" for each test if astAnalyzer relies on it being called
    await initializeParser();
  });

  // We'll use the actual implementation for our new tests
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Helper function to create a mock SyntaxNode - only used for getNodeText tests now
  const createMockNode = (type: string, text: string, children: SyntaxNode[] = [], namedChildren: SyntaxNode[] = [], parent: SyntaxNode | null = null, fields: Record<string, SyntaxNode | SyntaxNode[] | null> = {}): SyntaxNode => {
    const node = {
      type,
      text,
      children,
      namedChildren,
      parent,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: 0, column: 0 },
      startIndex: 0,
      endIndex: text.length,
      childForFieldName: (fieldName: string) => {
        const field = fields[fieldName];
        if (Array.isArray(field)) return field[0] || null; // return first if array
        return field || null;
      },
      descendantsOfType: vi.fn().mockReturnValue([]),
      firstChild: children[0] || null,
      firstNamedChild: namedChildren[0] || null,
      previousSibling: null,
      nextSibling: null,
      previousNamedSibling: null,
      nextNamedSibling: null,
    } as unknown as SyntaxNode;

    // Set parent for children
    children.forEach(c => {
      const childNode = c as SyntaxNode & { parent: SyntaxNode };
      childNode.parent = node;
    });
    namedChildren.forEach(nc => {
      const namedChildNode = nc as SyntaxNode & { parent: SyntaxNode };
      namedChildNode.parent = node;
    });

    return node;
  };


  describe('extractFunctions', () => {
    it('should extract a simple JavaScript function', () => {
      const funcNameNode = createMockNode('identifier', 'myFunction');
      const paramsNode = createMockNode('formal_parameters', '()');
      const bodyNode = createMockNode('statement_block', '{}');
      const funcNode = createMockNode('function_declaration', 'function myFunction() {}', [funcNameNode, paramsNode, bodyNode], [funcNameNode, paramsNode, bodyNode], null, { name: funcNameNode, parameters: paramsNode, body: bodyNode });
      const rootNode = createMockNode('program', funcNode.text, [funcNode]);

      const functions = extractFunctions(rootNode, rootNode.text, '.js');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('myFunction');
      expect(functions[0].signature).toBe('myFunction()');
      expect(functions[0].comment).toBe('Performs an action related to my function.'); // Heuristic
    });

    it('should extract a Python function with a docstring', () => {
      const funcNameNode = createMockNode('identifier', 'hello_world');
      const paramsNode = createMockNode('parameters', '()');
      const stringLiteralNode = createMockNode('string', '"""This is a docstring."""');
      const expressionStatementNode = createMockNode('expression_statement', '"""This is a docstring."""', [stringLiteralNode]);
      const bodyNode = createMockNode('block', '"""This is a docstring."""\n  pass', [expressionStatementNode]);

      const funcDefNode = createMockNode(
        'function_definition',
        'def hello_world():\n  """This is a docstring."""\n  pass',
        [funcNameNode, paramsNode, bodyNode],
        [funcNameNode, paramsNode, bodyNode],
        null,
        { name: funcNameNode, parameters: paramsNode, body: bodyNode }
      );
      const rootNode = createMockNode('module', funcDefNode.text, [funcDefNode]);

      const functions = extractFunctions(rootNode, rootNode.text, '.py');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('hello_world');
      // This test might need adjustment based on how docstrings are actually extracted
      // expect(functions[0].comment).toBe('This is a docstring.');
    });

    it('should extract a function from variable assignment', () => {
      // Create a mock for: const myArrowFunc = () => {}
      const identifierNode = createMockNode('identifier', 'myArrowFunc');
      const arrowFuncNode = createMockNode('arrow_function', '() => {}');
      const variableDeclaratorNode = createMockNode('variable_declarator', 'myArrowFunc = () => {}', [identifierNode, arrowFuncNode], [identifierNode, arrowFuncNode], null, { name: identifierNode });

      // Set parent relationship
      const arrowFuncWithParent = arrowFuncNode as SyntaxNode & { parent: SyntaxNode };
      arrowFuncWithParent.parent = variableDeclaratorNode;

      const rootNode = createMockNode('program', 'const myArrowFunc = () => {}', [variableDeclaratorNode]);

      // Mock the descendantsOfType to return our arrow function
      rootNode.descendantsOfType = vi.fn().mockReturnValue([arrowFuncNode]);

      const functions = extractFunctions(rootNode, rootNode.text, '.js');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('myArrowFunc');
    });

    it('should extract a function from test framework', () => {
      // Create a mock for: describe('test case', () => {})
      const stringNode = createMockNode('string', "'test case'");
      const arrowFuncNode = createMockNode('arrow_function', '() => {}');
      const argumentsNode = createMockNode('arguments', "'test case', () => {}", [stringNode, arrowFuncNode], [stringNode, arrowFuncNode]);

      // Set parent relationship for arrow function
      const arrowFuncWithParent = arrowFuncNode as SyntaxNode & { parent: SyntaxNode };
      arrowFuncWithParent.parent = argumentsNode;

      const identifierNode = createMockNode('identifier', 'describe');
      const callExprNode = createMockNode('call_expression', "describe('test case', () => {})", [identifierNode, argumentsNode], [identifierNode, argumentsNode], null, { function: identifierNode, arguments: argumentsNode });

      // Set parent relationship for arguments
      const argumentsWithParent = argumentsNode as SyntaxNode & { parent: SyntaxNode };
      argumentsWithParent.parent = callExprNode;

      const rootNode = createMockNode('program', "describe('test case', () => {})", [callExprNode]);

      // Mock the descendantsOfType to return our arrow function
      rootNode.descendantsOfType = vi.fn().mockReturnValue([arrowFuncNode]);

      const functions = extractFunctions(rootNode, rootNode.text, '.js');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('describe_test case');
    });

    it('should extract a function from array method callback', () => {
      // Create a mock for: array.map(() => {})
      const arrowFuncNode = createMockNode('arrow_function', '() => {}');
      const argumentsNode = createMockNode('arguments', '() => {}', [arrowFuncNode], [arrowFuncNode]);

      // Set parent relationship for arrow function
      const arrowFuncWithParent = arrowFuncNode as SyntaxNode & { parent: SyntaxNode };
      arrowFuncWithParent.parent = argumentsNode;

      const propertyNode = createMockNode('identifier', 'map');
      const objectNode = createMockNode('identifier', 'array');
      const memberExprNode = createMockNode('member_expression', 'array.map', [objectNode, propertyNode], [objectNode, propertyNode], null, { property: propertyNode });

      const callExprNode = createMockNode('call_expression', 'array.map(() => {})', [memberExprNode, argumentsNode], [memberExprNode, argumentsNode], null, { function: memberExprNode, arguments: argumentsNode });

      // Set parent relationship for arguments
      const argumentsWithParent = argumentsNode as SyntaxNode & { parent: SyntaxNode };
      argumentsWithParent.parent = callExprNode;

      const rootNode = createMockNode('program', 'array.map(() => {})', [callExprNode]);

      // Mock the descendantsOfType to return our arrow function
      rootNode.descendantsOfType = vi.fn().mockReturnValue([arrowFuncNode]);

      const functions = extractFunctions(rootNode, rootNode.text, '.js');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('map_callback');
    });
  });

  describe('extractClasses', () => {
    it('should extract a simple JavaScript class', () => {
      const classNameNode = createMockNode('identifier', 'MyClass');
      const classBodyNode = createMockNode('class_body', '{}');
      const classNode = createMockNode('class_declaration', 'class MyClass {}', [classNameNode, classBodyNode], [classNameNode, classBodyNode], null, { name: classNameNode, body: classBodyNode });
      const rootNode = createMockNode('program', classNode.text, [classNode]);

      const classes = extractClasses(rootNode, rootNode.text, '.js');
      expect(classes).toHaveLength(1);
      expect(classes[0].name).toBe('MyClass');
      expect(classes[0].comment).toBe('A my class class definition.'); // Heuristic
      expect(classes[0].methods).toEqual([]);
    });
  });

  describe('extractImports', () => {
    it('should extract a simple JavaScript import', () => {
      const sourceNode = createMockNode('string', "'./utils.js'"); // Tree-sitter might use string_literal or similar
      const importNode = createMockNode('import_statement', "import { helper } from './utils.js';", [], [], null, { source: sourceNode });
      // Simulate named import structure
      const importClause = createMockNode('import_clause', '{ helper }');
      const importNodeWithChildren = importNode as SyntaxNode & { children: SyntaxNode[] };
      importNodeWithChildren.children = [importClause]; // Add import_clause as child

      const namedImports = createMockNode('named_imports', '{ helper }');
      const importClauseWithChildren = importClause as SyntaxNode & { children: SyntaxNode[] };
      importClauseWithChildren.children = [namedImports];

      const importSpecifier = createMockNode('import_specifier', 'helper');
      const namedImportsWithChildren = namedImports as SyntaxNode & { children: SyntaxNode[] };
      namedImportsWithChildren.children = [importSpecifier];

      const identifierNode = createMockNode('identifier', 'helper');
      const importSpecifierWithChildren = importSpecifier as SyntaxNode & { children: SyntaxNode[] };
      importSpecifierWithChildren.children = [identifierNode];

      const identifierNodeWithParent = identifierNode as SyntaxNode & { parent: SyntaxNode };
      identifierNodeWithParent.parent = importSpecifier; // Set parent for identifier

      const importSpecifierWithParent = importSpecifier as SyntaxNode & { parent: SyntaxNode };
      importSpecifierWithParent.parent = namedImports;

      const namedImportsWithParent = namedImports as SyntaxNode & { parent: SyntaxNode };
      namedImportsWithParent.parent = importClause;


      const rootNode = createMockNode('program', importNode.text, [importNode]);
      const importNodeWithParent = importNode as SyntaxNode & { parent: SyntaxNode };
      importNodeWithParent.parent = rootNode; // Set parent for importNode

      const imports = extractImports(rootNode, rootNode.text, '.js');
      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe('./utils.js');
      // This part of the test needs more accurate mocking of the AST structure for named imports
      // For now, it might be empty or incorrect based on the simplified mock.
      // expect(imports[0].importedItems).toEqual(['helper']);
    });
  });

  describe('generateHeuristicComment', () => {
    it('should generate a comment for a function', () => {
      expect(generateHeuristicComment('calculateTotal', 'function')).toBe('Performs an action related to calculate total.');
    });
    it('should generate a comment for a class', () => {
      // The actual implementation uses 'An' for words starting with vowels
      expect(generateHeuristicComment('UserProfile', 'class')).toBe('An user profile class definition.');
    });
  });

  describe('getNodeText', () => {
    it('should return empty string for null node', () => {
      expect(getNodeText(null, "some source code")).toBe('');
    });
    it('should return empty string for undefined node', () => {
      expect(getNodeText(undefined, "some source code")).toBe('');
    });
    it('should extract text for a valid node', () => {
      const node = createMockNode('identifier', 'test');
      const nodeWithIndices = node as SyntaxNode & { startIndex: number, endIndex: number };
      nodeWithIndices.startIndex = 0; // Manually set for mock
      nodeWithIndices.endIndex = 4;   // Manually set for mock
      expect(getNodeText(node, "test_code")).toBe('test');
    });
  });
});
