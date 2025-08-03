/**
 * Unit tests for file discovery format detection and correction
 * Tests the detectAndCorrectFileDiscoveryFormat function
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { intelligentJsonParse } from '../llmHelper.js';

// Mock the logger
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn((data, msg) => console.log('LOGGER INFO:', msg, data)),
    debug: vi.fn((data, msg) => console.log('LOGGER DEBUG:', msg, data)),
    warn: vi.fn((data, msg) => console.log('LOGGER WARN:', msg, data)),
    error: vi.fn((data, msg) => console.log('LOGGER ERROR:', msg, data))
  }
}));

describe('File Discovery Format Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Single File Object Format', () => {
    it('should auto-correct single file object to standard format', () => {
      const singleFileResponse = JSON.stringify({
        path: "src/index.ts",
        priority: "high",
        reasoning: "Main entry point of the application",
        confidence: 0.8,
        estimatedTokens: 150,
        modificationLikelihood: "medium"
      });

      const result = intelligentJsonParse(singleFileResponse, 'context_curator_file_discovery_semantic_similarity');

      expect(result).toEqual({
        relevantFiles: [{
          path: "src/index.ts",
          priority: "high",
          reasoning: "Main entry point of the application",
          confidence: 0.8,
          estimatedTokens: 150,
          modificationLikelihood: "medium"
        }],
        totalFilesAnalyzed: 1,
        processingTimeMs: 0,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: 150,
          averageConfidence: 0.8
        }
      });
    });

    it('should extract correct search strategy from context', () => {
      const singleFileResponse = JSON.stringify({
        path: "src/utils/helper.ts",
        priority: "medium",
        confidence: 0.6,
        estimatedTokens: 100
      });

      const strategies = ['keyword_matching', 'structural_analysis', 'semantic_and_keyword'];
      
      strategies.forEach(strategy => {
        const result = intelligentJsonParse(
          singleFileResponse, 
          `context_curator_file_discovery_${strategy}`
        ) as { searchStrategy: string };
        
        expect(result.searchStrategy).toBe(strategy);
      });
    });
  });

  describe('Bare Array Format', () => {
    it('should auto-correct bare array to standard format', () => {
      const bareArrayResponse = JSON.stringify([
        {
          path: "src/services/auth.ts",
          priority: "high",
          confidence: 0.9,
          estimatedTokens: 200
        },
        {
          path: "src/services/user.ts",
          priority: "medium",
          confidence: 0.7,
          estimatedTokens: 150
        }
      ]);

      const result = intelligentJsonParse(bareArrayResponse, 'context_curator_file_discovery_keyword_matching');

      expect(result).toEqual({
        relevantFiles: [
          {
            path: "src/services/auth.ts",
            priority: "high",
            confidence: 0.9,
            estimatedTokens: 200
          },
          {
            path: "src/services/user.ts",
            priority: "medium",
            confidence: 0.7,
            estimatedTokens: 150
          }
        ],
        totalFilesAnalyzed: 2,
        processingTimeMs: 0,
        searchStrategy: 'keyword_matching',
        coverageMetrics: {
          totalTokens: 350,
          averageConfidence: 0.8
        }
      });
    });

    it('should calculate correct aggregate metrics for arrays', () => {
      const bareArrayResponse = JSON.stringify([
        { path: "file1.ts", confidence: 0.5, estimatedTokens: 100 },
        { path: "file2.ts", confidence: 0.7, estimatedTokens: 200 },
        { path: "file3.ts", confidence: 0.9, estimatedTokens: 300 }
      ]);

      const result = intelligentJsonParse(bareArrayResponse, 'context_curator_file_discovery_test') as { coverageMetrics: { totalTokens: number; averageConfidence: number } };

      expect(result.coverageMetrics.totalTokens).toBe(600);
      expect(result.coverageMetrics.averageConfidence).toBeCloseTo(0.7, 2);
    });
  });

  describe('Already Correct Format', () => {
    it('should not modify correctly formatted responses', () => {
      const correctResponse = {
        relevantFiles: [
          { path: "src/main.ts", priority: "high" }
        ],
        totalFilesAnalyzed: 1,
        processingTimeMs: 123,
        searchStrategy: "semantic_similarity",
        coverageMetrics: {
          totalTokens: 100,
          averageConfidence: 0.85
        }
      };

      const result = intelligentJsonParse(
        JSON.stringify(correctResponse), 
        'context_curator_file_discovery_semantic_similarity'
      );

      expect(result).toEqual(correctResponse);
    });
  });

  describe('Non-File Discovery Contexts', () => {
    it('should not apply corrections to non-file-discovery contexts', () => {
      const nonFileDiscoveryResponse = {
        path: "some/path.ts",
        data: "some data"
      };

      const contexts = [
        'context_curator_intent_analysis',
        'context_curator_relevance_scoring',
        'context_curator_prompt_refinement',
        'some_other_context'
      ];

      contexts.forEach(context => {
        const result = intelligentJsonParse(JSON.stringify(nonFileDiscoveryResponse), context);
        expect(result).toEqual(nonFileDiscoveryResponse);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty arrays', () => {
      const emptyArrayResponse = JSON.stringify([]);
      
      const result = intelligentJsonParse(emptyArrayResponse, 'context_curator_file_discovery_test');
      
      // Should not be modified since it's an empty array
      expect(result).toEqual([]);
    });

    it('should handle null and undefined values', () => {
      const responseWithNulls = JSON.stringify({
        path: "src/test.ts",
        priority: "low",
        confidence: null,
        estimatedTokens: undefined,
        reasoning: "Test file"
      });

      const result = intelligentJsonParse(responseWithNulls, 'context_curator_file_discovery_test') as { relevantFiles: unknown[]; coverageMetrics: { totalTokens: number; averageConfidence: number } };

      expect(result.relevantFiles).toHaveLength(1);
      expect(result.coverageMetrics.totalTokens).toBe(0);
      expect(result.coverageMetrics.averageConfidence).toBe(0);
    });

    it('should handle malformed context strings', () => {
      const singleFileResponse = JSON.stringify({
        path: "src/index.ts",
        priority: "high",
        confidence: 0.8,
        estimatedTokens: 150
      });

      // Context without proper structure (no strategy after file_discovery)
      const result = intelligentJsonParse(singleFileResponse, 'file_discovery') as { searchStrategy: string };
      
      // Should return 'unknown' when no strategy is specified
      expect(result.searchStrategy).toBe('unknown');
    });

    it('should handle objects without path property', () => {
      const responseWithoutPath = JSON.stringify({
        name: "index.ts",
        priority: "high"
      });

      const result = intelligentJsonParse(responseWithoutPath, 'context_curator_file_discovery_test');
      
      // Should not be modified since it doesn't have 'path' property
      expect(result).toEqual({
        name: "index.ts",
        priority: "high"
      });
    });
  });

  describe('Performance', () => {
    it('should handle large arrays efficiently', () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => ({
        path: `src/file${i}.ts`,
        confidence: Math.random(),
        estimatedTokens: Math.floor(Math.random() * 500)
      }));

      const startTime = Date.now();
      const result = intelligentJsonParse(
        JSON.stringify(largeArray), 
        'context_curator_file_discovery_test'
) as { relevantFiles: unknown[] };
      const endTime = Date.now();

      expect(result.relevantFiles).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100); // Should process in less than 100ms
    });
  });
});