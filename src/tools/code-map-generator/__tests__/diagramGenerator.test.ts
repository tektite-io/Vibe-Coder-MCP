import { describe, it, expect, vi } from 'vitest';
import {
  generateMermaidFileDependencyDiagram,
  generateMermaidClassDiagram,
  generateMermaidFunctionCallDiagram,
} from '../diagramGenerator.js';
import { GraphNode, GraphEdge } from '../graphBuilder.js';
import { ClassInfo } from '../codeMapModel.js';

// Mock logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

describe('Diagram Generator', () => {
  describe('generateMermaidFileDependencyDiagram', () => {
    it('should generate an empty diagram if no nodes or edges', () => {
      const diagram = generateMermaidFileDependencyDiagram([], []);
      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('No dependencies found');
    });

    it('should generate a diagram for file dependencies', () => {
      const nodes: GraphNode[] = [
        { id: 'fileA.js', label: 'fileA.js — Main file', type: 'file' },
        { id: 'fileB.js', label: 'fileB.js — Utility', type: 'file' },
      ];
      const edges: GraphEdge[] = [{ from: 'fileA.js', to: 'fileB.js', label: 'imports' }];
      const diagram = generateMermaidFileDependencyDiagram(nodes, edges);

      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('subgraph "File Dependencies"');
      expect(diagram).toContain('fileA.js["fileA.js — Main file"]');
      expect(diagram).toContain('fileB.js["fileB.js — Utility"]');
      expect(diagram).toContain('fileA.js -->|imports| fileB.js');
    });
  });

  describe('generateMermaidClassDiagram', () => {
    it('should generate an empty class diagram if no nodes or edges', () => {
      const diagram = generateMermaidClassDiagram([], [], []);
      expect(diagram).toContain('classDiagram');
      expect(diagram).toContain('class Empty~"No classes or inheritance found"~');
    });

    it('should generate a class diagram with inheritance and methods', () => {
      const classAInfo: ClassInfo = {
        name: 'ClassA',
        comment: 'Base class',
        methods: [{ name: 'methodA', signature: 'methodA()', comment: 'Does A', startLine: 1, endLine: 1}],
        properties: [],
        startLine: 1, endLine: 10,
      };
      const classBInfo: ClassInfo = {
        name: 'ClassB',
        comment: 'Derived class',
        parentClass: 'ClassA',
        methods: [{ name: 'methodB', signature: 'methodB()', comment: 'Does B', startLine: 1, endLine: 1}],
        properties: [],
        startLine: 1, endLine: 10,
      };
       const allClassInfos: ClassInfo[] = [classAInfo, classBInfo];


      const nodes: GraphNode[] = [
        { id: 'fileA.js::ClassA', label: 'ClassA — Base class', type: 'class', filePath: 'fileA.js' },
        { id: 'fileB.js::ClassB', label: 'ClassB — Derived class', type: 'class', filePath: 'fileB.js' },
      ];
      const edges: GraphEdge[] = [{ from: 'fileA.js::ClassA', to: 'fileB.js::ClassB', label: 'inherits' }];
      const diagram = generateMermaidClassDiagram(nodes, edges, allClassInfos);

      expect(diagram).toContain('classDiagram');
      expect(diagram).toContain('class fileA.js::ClassA["ClassA — Base class"]');
      expect(diagram).toContain('class fileB.js::ClassB["ClassB — Derived class"]');
      expect(diagram).toContain('fileA.js::ClassA <|-- fileB.js::ClassB : inherits');
    });
  });

  describe('generateMermaidFunctionCallDiagram', () => {
    it('should generate an empty function call diagram if no nodes or edges', () => {
      const diagram = generateMermaidFunctionCallDiagram([], []);
      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('No calls detected or mapped');
    });

    it('should generate a function call diagram', () => {
      const nodes: GraphNode[] = [
        { id: 'fileA.js::funcA', label: 'funcA — Does A', type: 'function' },
        { id: 'fileA.js::funcB', label: 'funcB — Calls A', type: 'function' },
      ];
      const edges: GraphEdge[] = [{ from: 'fileA.js::funcB', to: 'fileA.js::funcA', label: 'calls?' }];
      const diagram = generateMermaidFunctionCallDiagram(nodes, edges);

      expect(diagram).toContain('graph LR');
      expect(diagram).toContain('subgraph "Function Calls (Heuristic)"');
      expect(diagram).toContain('fileA.js::funcA["funcA — Does A"]');
      expect(diagram).toContain('fileA.js::funcB["funcB — Calls A"]');
      expect(diagram).toContain('fileA.js::funcB -->|calls?| fileA.js::funcA');
    });
  });
});
