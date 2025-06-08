import { describe, it, expect } from 'vitest';
import { preprocessRelevanceScoringResponse } from '../../../utils/json-preprocessing.js';

describe('preprocessRelevanceScoringResponse', () => {
  it('should return original response for small responses', () => {
    const smallResponse = '{"fileScores": [{"filePath": "test.ts", "relevanceScore": 0.9}]}';
    const result = preprocessRelevanceScoringResponse(smallResponse);
    expect(result).toBe(smallResponse);
  });

  it('should extract largest valid relevance scoring object from large mixed content', () => {
    const largeResponse = `
      Some text before JSON
      {"filePath": "single.ts", "relevanceScore": 0.9}
      More text
      {
        "fileScores": [
          {"filePath": "file1.ts", "relevanceScore": 0.9, "confidence": 0.8},
          {"filePath": "file2.ts", "relevanceScore": 0.7, "confidence": 0.6},
          {"filePath": "file3.ts", "relevanceScore": 0.5, "confidence": 0.4}
        ],
        "overallMetrics": {"averageRelevance": 0.7},
        "scoringStrategy": "hybrid"
      }
      Some text after
    `.repeat(100); // Make it large enough to trigger preprocessing

    const result = preprocessRelevanceScoringResponse(largeResponse);
    const parsed = JSON.parse(result);
    
    expect(parsed.fileScores).toHaveLength(3);
    expect(parsed.overallMetrics).toBeDefined();
    expect(parsed.scoringStrategy).toBe('hybrid');
  });

  it('should handle responses with multiple valid JSON objects', () => {
    const responseWithMultipleObjects = `
      {"someOtherObject": "value"}
      {
        "fileScores": [
          {"filePath": "file1.ts", "relevanceScore": 0.9}
        ],
        "overallMetrics": {"averageRelevance": 0.9}
      }
      {"anotherObject": "value"}
    `.repeat(50);

    const result = preprocessRelevanceScoringResponse(responseWithMultipleObjects);
    const parsed = JSON.parse(result);
    
    expect(parsed.fileScores).toBeDefined();
    expect(Array.isArray(parsed.fileScores)).toBe(true);
  });

  it('should return original response if no valid relevance scoring objects found', () => {
    const responseWithoutRelevanceScoring = `
      {"someObject": "value"}
      {"anotherObject": "value"}
    `.repeat(100);

    const result = preprocessRelevanceScoringResponse(responseWithoutRelevanceScoring);
    expect(result).toBe(responseWithoutRelevanceScoring);
  });

  it('should handle malformed JSON gracefully', () => {
    const malformedResponse = `
      Some text
      {"fileScores": [{"filePath": "file1.ts", "relevanceScore": 0.9}
      More text
      {"validObject": "value"}
    `.repeat(100);

    const result = preprocessRelevanceScoringResponse(malformedResponse);
    // Should return original since no valid relevance scoring objects found
    expect(result).toBe(malformedResponse);
  });

  it('should prioritize larger relevance scoring objects', () => {
    const responseWithMultipleScoringObjects = `
      {
        "fileScores": [
          {"filePath": "file1.ts", "relevanceScore": 0.9}
        ],
        "overallMetrics": {"averageRelevance": 0.9}
      }
      Some text
      {
        "fileScores": [
          {"filePath": "file1.ts", "relevanceScore": 0.9, "confidence": 0.8},
          {"filePath": "file2.ts", "relevanceScore": 0.7, "confidence": 0.6},
          {"filePath": "file3.ts", "relevanceScore": 0.5, "confidence": 0.4},
          {"filePath": "file4.ts", "relevanceScore": 0.3, "confidence": 0.2}
        ],
        "overallMetrics": {"averageRelevance": 0.625, "totalFilesScored": 4},
        "scoringStrategy": "hybrid"
      }
    `.repeat(50);

    const result = preprocessRelevanceScoringResponse(responseWithMultipleScoringObjects);
    const parsed = JSON.parse(result);
    
    // Should select the larger object with 4 files
    expect(parsed.fileScores).toHaveLength(4);
    expect(parsed.overallMetrics.totalFilesScored).toBe(4);
  });

  it('should handle empty fileScores array', () => {
    const responseWithEmptyFileScores = `
      {
        "fileScores": [],
        "overallMetrics": {"averageRelevance": 0}
      }
      {"someOtherObject": "value"}
    `.repeat(100);

    const result = preprocessRelevanceScoringResponse(responseWithEmptyFileScores);
    // Should return original since empty fileScores is not considered valid
    expect(result).toBe(responseWithEmptyFileScores);
  });

  it('should handle responses with nested objects', () => {
    const responseWithNestedObjects = `
      {
        "fileScores": [
          {
            "filePath": "file1.ts", 
            "relevanceScore": 0.9,
            "metadata": {
              "nested": {
                "deep": "value"
              }
            }
          }
        ],
        "overallMetrics": {"averageRelevance": 0.9}
      }
    `.repeat(100);

    const result = preprocessRelevanceScoringResponse(responseWithNestedObjects);
    const parsed = JSON.parse(result);
    
    expect(parsed.fileScores).toHaveLength(1);
    expect(parsed.fileScores[0].metadata.nested.deep).toBe('value');
  });
});
