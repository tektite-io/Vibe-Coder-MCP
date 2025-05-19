import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  extractMethodCallSequences,
  extractParticipants,
  generateSequenceDiagram,
  optimizeSequenceDiagram
} from '../sequenceDiagramGenerator.js';
import { GraphNode, GraphEdge } from '../graphBuilder.js';

// Mock logger
vi.mock('../../../logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Sequence Diagram Generator', () => {
  let mockNodes: GraphNode[];
  let mockEdges: GraphEdge[];

  beforeEach(() => {
    // Set up mock nodes and edges for testing
    mockNodes = [
      {
        id: 'file1.js::functionA',
        label: 'functionA — Does something important',
        type: 'function',
        comment: 'Does something important',
        filePath: 'file1.js'
      },
      {
        id: 'file1.js::functionB',
        label: 'functionB — Helper function',
        type: 'function',
        comment: 'Helper function',
        filePath: 'file1.js'
      },
      {
        id: 'file2.js::ClassA.methodA',
        label: 'ClassA.methodA — Main method',
        type: 'method',
        comment: 'Main method',
        filePath: 'file2.js'
      }
    ];

    mockEdges = [
      {
        from: 'file1.js::functionA',
        to: 'file1.js::functionB',
        label: 'calls'
      },
      {
        from: 'file1.js::functionA',
        to: 'file2.js::ClassA.methodA',
        label: 'calls'
      }
    ];
  });

  describe('extractMethodCallSequences', () => {
    it('should extract method calls from nodes and edges', () => {
      const result = extractMethodCallSequences(mockNodes, mockEdges);

      expect(result).toHaveLength(2);
      expect(result[0].from).toBe('file1.js::functionA');
      expect(result[0].to).toBe('file1.js::functionB');
      expect(result[0].message).toContain('calls');
      expect(result[0].order).toBe(0);
    });

    it('should limit the number of calls to maxCalls', () => {
      const result = extractMethodCallSequences(mockNodes, mockEdges, 1);

      expect(result).toHaveLength(1);
    });

    it('should handle empty input', () => {
      const result = extractMethodCallSequences([], []);

      expect(result).toHaveLength(0);
    });
  });

  describe('extractParticipants', () => {
    it('should extract unique participants from method calls', () => {
      const methodCalls = extractMethodCallSequences(mockNodes, mockEdges);
      const result = extractParticipants(methodCalls, mockNodes);

      expect(result).toHaveLength(3);

      // Check that all participants are included
      const participantIds = result.map((p: { id: string }) => p.id);

      // The IDs are generated using generateSafeMermaidId which transforms the original IDs

      // Check that we have the expected number of participants
      expect(participantIds.length).toBe(3);

      // Check that the IDs contain the expected values
      expect(participantIds.some(id => id.includes('file1'))).toBe(true);
      expect(participantIds.some(id => id.includes('file2'))).toBe(true);
    });

    it('should handle empty input', () => {
      const result = extractParticipants([], []);

      expect(result).toHaveLength(0);
    });
  });

  describe('generateSequenceDiagram', () => {
    it('should generate a valid Mermaid sequence diagram', () => {
      const methodCalls = extractMethodCallSequences(mockNodes, mockEdges);
      const participants = extractParticipants(methodCalls, mockNodes);
      const result = generateSequenceDiagram(methodCalls, participants);

      expect(result).toContain('sequenceDiagram');
      expect(result).toContain('participant');

      // Check that all participants are included
      mockNodes.forEach(node => {
        const id = node.id.replace(/[^a-zA-Z0-9]/g, '_');
        expect(result).toContain(id);
      });

      // Check that all calls are included
      mockEdges.forEach(edge => {
        const fromId = edge.from.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = edge.to.replace(/[^a-zA-Z0-9]/g, '_');
        expect(result).toContain(`${fromId}`);
        expect(result).toContain(`${toId}`);
      });
    });

    it('should handle empty input', () => {
      const result = generateSequenceDiagram([], []);

      expect(result).toContain('sequenceDiagram');
      expect(result).toContain('No method calls detected');
    });
  });

  describe('optimizeSequenceDiagram', () => {
    it('should limit the number of participants if too many', () => {
      // Create a diagram with many participants
      const manyNodes = Array.from({ length: 15 }, (_, i) => ({
        id: `file${i}.js::function${i}`,
        label: `function${i}`,
        type: 'function' as const,
        filePath: `file${i}.js`
      }));

      const manyEdges = Array.from({ length: 14 }, (_, i) => ({
        from: `file${i}.js::function${i}`,
        to: `file${i+1}.js::function${i+1}`,
        label: 'calls'
      }));

      const methodCalls = extractMethodCallSequences(manyNodes, manyEdges);
      const participants = extractParticipants(methodCalls, manyNodes);
      const diagram = generateSequenceDiagram(methodCalls, participants);

      const result = optimizeSequenceDiagram(diagram, 5);

      // Should contain a note about limitation
      expect(result).toContain('Diagram limited to 5 participants');

      // Count the number of participant lines
      const participantLines = result.split('\n').filter((line: string) => line.trim().startsWith('participant'));
      expect(participantLines.length).toBeLessThanOrEqual(5);
    });

    it('should not modify diagrams with few participants', () => {
      const methodCalls = extractMethodCallSequences(mockNodes, mockEdges);
      const participants = extractParticipants(methodCalls, mockNodes);
      const diagram = generateSequenceDiagram(methodCalls, participants);

      const result = optimizeSequenceDiagram(diagram, 10);

      // Should be the same as the input
      expect(result).toBe(diagram);
    });
  });
});
