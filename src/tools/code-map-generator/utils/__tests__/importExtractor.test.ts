/**
 * Tests for the import extractor utility.
 */

import { describe, it, expect, vi } from 'vitest';
import { extractJSImports, isLikelyImport, tryExtractImportPath, extractImportedItemsFromES6Import } from '../importExtractor.js';
import { SyntaxNode } from '../../parser.js';
// @ts-ignore - Mock syntax node module doesn't have type definitions
import { createMockSyntaxNode, MockSyntaxNode } from '../../__tests__/mocks/mockSyntaxNode.js';

// Mock the logger
vi.mock('../../../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

// Using the imported MockSyntaxNode class

describe('importExtractor', () => {
  describe('isLikelyImport', () => {
    it('should return true for nodes containing import keywords', () => {
      const node = createMockSyntaxNode('any', 'import React from "react"');
      expect(isLikelyImport(node as unknown as SyntaxNode)).toBe(true);

      const requireNode = createMockSyntaxNode('any', 'const fs = require("fs")');
      expect(isLikelyImport(requireNode as unknown as SyntaxNode)).toBe(true);

      const fromNode = createMockSyntaxNode('any', 'something from "somewhere"');
      expect(isLikelyImport(fromNode as unknown as SyntaxNode)).toBe(true);
    });

    it('should return false for nodes not containing import keywords', () => {
      const node = createMockSyntaxNode('any', 'const x = 5');
      expect(isLikelyImport(node as unknown as SyntaxNode)).toBe(false);
    });
  });

  describe('tryExtractImportPath', () => {
    it('should extract path from ES6 import', () => {
      const node = createMockSyntaxNode('any', 'import React from "react"');
      expect(tryExtractImportPath(node as unknown as SyntaxNode)).toBe('react');
    });

    it('should extract path from dynamic import', () => {
      const node = createMockSyntaxNode('any', 'import("./module")');
      expect(tryExtractImportPath(node as unknown as SyntaxNode)).toBe('./module');
    });

    it('should extract path from require', () => {
      const node = createMockSyntaxNode('any', 'const fs = require("fs")');
      expect(tryExtractImportPath(node as unknown as SyntaxNode)).toBe('fs');
    });

    it('should return null for non-import nodes', () => {
      const node = createMockSyntaxNode('any', 'const x = 5');
      expect(tryExtractImportPath(node as unknown as SyntaxNode)).toBe(null);
    });
  });

  describe('extractJSImports', () => {
    it('should extract ES6 static imports', () => {
      const sourceNode = createMockSyntaxNode('source', '"react"');
      sourceNode.fieldName = 'source';

      const node = createMockSyntaxNode('import_statement', 'import React from "react"', [sourceNode]);

      const imports = extractJSImports(node as unknown as SyntaxNode, 'import React from "react"');

      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe('react');
      expect(imports[0].type).toBe('static');
    });

    it('should extract dynamic imports', () => {
      const funcNode = createMockSyntaxNode('function', 'import');
      funcNode.fieldName = 'function';

      const argNode = createMockSyntaxNode('string', '"./module"');
      const argsNode = createMockSyntaxNode('arguments', '("./module")', [argNode]);
      argsNode.fieldName = 'arguments';

      const node = createMockSyntaxNode('call_expression', 'import("./module")', [funcNode, argsNode]);

      const imports = extractJSImports(node as unknown as SyntaxNode, 'import("./module")');

      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe('./module');
      expect(imports[0].type).toBe('dynamic');
    });

    it('should extract CommonJS require', () => {
      const funcNode = createMockSyntaxNode('function', 'require');
      funcNode.fieldName = 'function';

      const argNode = createMockSyntaxNode('string', '"fs"');
      const argsNode = createMockSyntaxNode('arguments', '("fs")', [argNode]);
      argsNode.fieldName = 'arguments';

      const node = createMockSyntaxNode('call_expression', 'require("fs")', [funcNode, argsNode]);

      const imports = extractJSImports(node as unknown as SyntaxNode, 'require("fs")');

      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe('fs');
      expect(imports[0].type).toBe('commonjs');
    });

    it('should extract variable declaration with require', () => {
      const valueNode = createMockSyntaxNode('call_expression', 'require("fs")');
      valueNode.fieldName = 'value';

      const funcNode = createMockSyntaxNode('function', 'require');
      funcNode.fieldName = 'function';

      const argNode = createMockSyntaxNode('string', '"fs"');
      const argsNode = createMockSyntaxNode('arguments', '("fs")', [argNode]);
      argsNode.fieldName = 'arguments';

      valueNode.children = [funcNode, argsNode];

      const declaratorNode = createMockSyntaxNode('declarator', 'fs = require("fs")', [valueNode]);
      declaratorNode.fieldName = 'declarator';

      const node = createMockSyntaxNode('variable_declaration', 'const fs = require("fs")', [declaratorNode]);

      const imports = extractJSImports(node as unknown as SyntaxNode, 'const fs = require("fs")');

      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe('fs');
      expect(imports[0].type).toBe('commonjs');
    });

    it('should use fallback extraction for likely imports', () => {
      const node = createMockSyntaxNode('unknown', 'import something from "./module"');

      const imports = extractJSImports(node as unknown as SyntaxNode, 'import something from "./module"');

      expect(imports).toHaveLength(1);
      expect(imports[0].path).toBe('./module');
      expect(imports[0].type).toBe('extracted');
    });
  });
});

describe('extractImportedItemsFromES6Import', () => {
  it('should extract default imports with detailed information', () => {
    // Create a mock import statement with default import
    const defaultNode = createMockSyntaxNode('identifier', 'React');
    defaultNode.fieldName = 'default';

    const importClauseNode = createMockSyntaxNode('import_clause', 'React', [defaultNode]);
    importClauseNode.fieldName = 'import_clause';

    const sourceNode = createMockSyntaxNode('string', '"react"');
    sourceNode.fieldName = 'source';

    const node = createMockSyntaxNode('import_statement', 'import React from "react"', [importClauseNode, sourceNode]);

    // Mock the childForFieldName method
    node.childForFieldName = (name: string) => {
      if (name === 'import_clause') return importClauseNode;
      if (name === 'source') return sourceNode;
      return null;
    };

    importClauseNode.childForFieldName = (name: string) => {
      if (name === 'default') return defaultNode;
      return null;
    };

    // Extract imported items
    const items = extractImportedItemsFromES6Import(node as unknown as SyntaxNode, 'import React from "react"');

    // Verify results
    expect(items).toHaveLength(1);
    expect(items?.[0].name).toBe('React');
    expect(items?.[0].isDefault).toBe(true);
    expect(items?.[0].isNamespace).toBe(false);
  });

  it('should extract named imports with detailed information', () => {
    // Create mock nodes for named imports
    const specifier1 = createMockSyntaxNode('import_specifier', 'useState');
    const nameNode1 = createMockSyntaxNode('identifier', 'useState');
    nameNode1.fieldName = 'name';
    specifier1.children = [nameNode1];

    const specifier2 = createMockSyntaxNode('import_specifier', 'useEffect');
    const nameNode2 = createMockSyntaxNode('identifier', 'useEffect');
    nameNode2.fieldName = 'name';
    specifier2.children = [nameNode2];

    const namedImportsNode = createMockSyntaxNode('named_imports', '{ useState, useEffect }', [specifier1, specifier2]);
    namedImportsNode.fieldName = 'named_imports';

    const importClauseNode = createMockSyntaxNode('import_clause', '{ useState, useEffect }', [namedImportsNode]);
    importClauseNode.fieldName = 'import_clause';

    const sourceNode = createMockSyntaxNode('string', '"react"');
    sourceNode.fieldName = 'source';

    const node = createMockSyntaxNode('import_statement', 'import { useState, useEffect } from "react"', [importClauseNode, sourceNode]);

    // Mock the childForFieldName method
    node.childForFieldName = (name: string) => {
      if (name === 'import_clause') return importClauseNode;
      if (name === 'source') return sourceNode;
      return null;
    };

    importClauseNode.childForFieldName = (name: string) => {
      if (name === 'named_imports') return namedImportsNode;
      return null;
    };

    // Set up named children for namedImportsNode
    const namedChildren = [specifier1, specifier2];
    namedImportsNode.namedChildren = namedChildren;
    namedImportsNode.namedChildCount = namedChildren.length;

    // Set up the named children array
    // We don't need to override the namedChild method as it will use namedChildren

    specifier1.childForFieldName = (name: string) => {
      if (name === 'name') return nameNode1;
      return null;
    };

    specifier2.childForFieldName = (name: string) => {
      if (name === 'name') return nameNode2;
      return null;
    };

    // Extract imported items
    const items = extractImportedItemsFromES6Import(node as unknown as SyntaxNode, 'import { useState, useEffect } from "react"');

    // Verify results
    expect(items).toHaveLength(2);

    const useStateItem = items?.find(item => item.name === 'useState');
    expect(useStateItem).toBeDefined();
    expect(useStateItem?.isDefault).toBe(false);
    expect(useStateItem?.isNamespace).toBe(false);

    const useEffectItem = items?.find(item => item.name === 'useEffect');
    expect(useEffectItem).toBeDefined();
    expect(useEffectItem?.isDefault).toBe(false);
    expect(useEffectItem?.isNamespace).toBe(false);
  });

  it('should extract namespace imports with detailed information', () => {
    // Create mock nodes for namespace import
    const nameNode = createMockSyntaxNode('identifier', 'React');
    nameNode.fieldName = 'name';

    const namespaceImportNode = createMockSyntaxNode('namespace_import', '* as React', [nameNode]);
    namespaceImportNode.fieldName = 'namespace_import';

    const importClauseNode = createMockSyntaxNode('import_clause', '* as React', [namespaceImportNode]);
    importClauseNode.fieldName = 'import_clause';

    const sourceNode = createMockSyntaxNode('string', '"react"');
    sourceNode.fieldName = 'source';

    const node = createMockSyntaxNode('import_statement', 'import * as React from "react"', [importClauseNode, sourceNode]);

    // Mock the childForFieldName method
    node.childForFieldName = (name: string) => {
      if (name === 'import_clause') return importClauseNode;
      if (name === 'source') return sourceNode;
      return null;
    };

    importClauseNode.childForFieldName = (name: string) => {
      if (name === 'namespace_import') return namespaceImportNode;
      return null;
    };

    namespaceImportNode.childForFieldName = (name: string) => {
      if (name === 'name') return nameNode;
      return null;
    };

    // Extract imported items
    const items = extractImportedItemsFromES6Import(node as unknown as SyntaxNode, 'import * as React from "react"');

    // Verify results
    expect(items).toHaveLength(1);
    expect(items?.[0].name).toBe('React');
    expect(items?.[0].isDefault).toBe(false);
    expect(items?.[0].isNamespace).toBe(true);
  });
});
