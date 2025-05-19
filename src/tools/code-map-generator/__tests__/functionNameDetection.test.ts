import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractFunctions } from '../astAnalyzer.js';
import { SyntaxNode } from '../parser.js';

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
vi.mock('../parser.js', async () => {
  const originalModule = await vi.importActual('../parser.js');
  return {
    ...originalModule,
    initializeParser: vi.fn().mockResolvedValue(undefined),
    getParserForFileExtension: vi.fn(),
    parseCode: vi.fn(),
  };
});

describe('Function Name Detection', () => {
  // Helper function to create a mock SyntaxNode
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

  describe('Variable Assignment Functions', () => {
    it('should extract name from variable assignment with arrow function', () => {
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

    it('should extract name from variable assignment with function expression', () => {
      // Create a mock for: const myFunc = function() {}
      const identifierNode = createMockNode('identifier', 'myFunc');
      const functionNode = createMockNode('function', 'function() {}');
      const variableDeclaratorNode = createMockNode('variable_declarator', 'myFunc = function() {}', [identifierNode, functionNode], [identifierNode, functionNode], null, { name: identifierNode });
      
      // Set parent relationship
      const functionWithParent = functionNode as SyntaxNode & { parent: SyntaxNode };
      functionWithParent.parent = variableDeclaratorNode;
      
      const rootNode = createMockNode('program', 'const myFunc = function() {}', [variableDeclaratorNode]);
      
      // Mock the descendantsOfType to return our function
      rootNode.descendantsOfType = vi.fn().mockReturnValue([functionNode]);
      
      const functions = extractFunctions(rootNode, rootNode.text, '.js');
      expect(functions).toHaveLength(1);
      expect(functions[0].name).toBe('myFunc');
    });
  });

  describe('Test Framework Functions', () => {
    it('should extract name from describe block', () => {
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
  });

  describe('Array Method Callbacks', () => {
    it('should extract name from array method callback', () => {
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
});
