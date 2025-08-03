/**
 * Unit tests for Context Curator prompt enhancements
 * Tests the enhanced file discovery prompts with explicit format requirements
 */

import { describe, it, expect } from 'vitest';
import {
  FILE_DISCOVERY_SYSTEM_PROMPT,
  buildFileDiscoveryPrompt,
  FILE_DISCOVERY_FORMAT_EXAMPLES
} from '../../../prompts/file-discovery.js';
import type { IntentAnalysisResult } from '../../../types/llm-tasks.js';

describe('Context Curator Prompt Enhancements', () => {
  describe('System Prompt Format Requirements', () => {
    it('should include critical format requirement section', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('## CRITICAL FORMAT REQUIREMENT');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('You MUST respond with ONLY a valid JSON object');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('Do not include markdown code blocks');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('The response must be parseable by JSON.parse()');
    });

    it('should include common format errors to avoid', () => {
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('COMMON FORMAT ERRORS TO AVOID:');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('DO NOT return a single file object when asked for multiple files');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('DO NOT return just the array without the wrapper object');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('DO NOT use single quotes - JSON requires double quotes');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('DO NOT include comments in the JSON');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('DO NOT use trailing commas');
      expect(FILE_DISCOVERY_SYSTEM_PROMPT).toContain('DO NOT return text explanations before or after the JSON');
    });
  });

  describe('User Prompt Format Examples', () => {
    const mockIntentAnalysis: IntentAnalysisResult = {
      taskType: 'refactoring',
      confidence: 0.9,
      reasoning: ['Refactoring authentication'],
      architecturalComponents: ['auth', 'security'],
      codebaseUnderstanding: {},
      suggestedApproach: ['Update auth'],
      potentialChallenges: [],
      scopeAssessment: {
        complexity: 'moderate',
        estimatedFiles: 5,
        riskLevel: 'medium'
      },
      suggestedFocusAreas: ['authentication'],
      estimatedEffort: 'medium'
    };

    it('should include correct response format example in user prompt', () => {
      const prompt = buildFileDiscoveryPrompt(
        'Refactor authentication',
        mockIntentAnalysis,
        'Codebase content here',
        'semantic_similarity'
      );

      expect(prompt).toContain('## EXAMPLE CORRECT RESPONSE FORMAT:');
      expect(prompt).toContain('"relevantFiles": [');
      expect(prompt).toContain('"path": "src/auth/authentication.ts"');
      expect(prompt).toContain('"priority": "high"');
      expect(prompt).toContain('"confidence": 0.95');
      expect(prompt).toContain('"modificationLikelihood": "very_high"');
    });

    it('should include incorrect response format examples', () => {
      const prompt = buildFileDiscoveryPrompt(
        'Refactor authentication',
        mockIntentAnalysis,
        'Codebase content here',
        'semantic_similarity'
      );

      expect(prompt).toContain('## EXAMPLE INCORRECT RESPONSE FORMATS (DO NOT USE):');
      expect(prompt).toContain('WRONG - Single file object instead of array:');
      expect(prompt).toContain('WRONG - Missing wrapper object:');
      expect(prompt).toContain('WRONG - Text before JSON:');
      expect(prompt).toContain('WRONG - Markdown code block:');
      expect(prompt).toContain('Remember: Return ONLY the JSON object, nothing else.');
    });

    it('should include the search strategy in the example', () => {
      const strategies = ['semantic_similarity', 'keyword_matching', 'semantic_and_keyword', 'structural_analysis'] as const;
      
      strategies.forEach(strategy => {
        const prompt = buildFileDiscoveryPrompt(
          'Test prompt',
          mockIntentAnalysis,
          'Codebase',
          strategy
        );
        
        expect(prompt).toContain(`"searchStrategy": "${strategy}"`);
      });
    });
  });

  describe('Format Examples Constants', () => {
    it('should provide empty response example', () => {
      const emptyExample = FILE_DISCOVERY_FORMAT_EXAMPLES.emptyResponse;
      expect(emptyExample.description).toBe('Valid response when no relevant files are found');
      expect(emptyExample.response.relevantFiles).toHaveLength(0);
      expect(emptyExample.response.coverageMetrics.totalTokens).toBe(0);
      expect(emptyExample.response.coverageMetrics.averageConfidence).toBe(0);
    });

    it('should provide single file response example', () => {
      const singleFileExample = FILE_DISCOVERY_FORMAT_EXAMPLES.singleFileResponse;
      expect(singleFileExample.description).toBe('Valid response with just one relevant file');
      expect(singleFileExample.response.relevantFiles).toHaveLength(1);
      expect(singleFileExample.response.relevantFiles[0].path).toBe('src/config/settings.ts');
    });

    it('should provide common error examples', () => {
      const errors = FILE_DISCOVERY_FORMAT_EXAMPLES.commonErrors;
      
      // Single object error
      expect(errors.singleObjectError.description).toContain('WRONG');
      expect(errors.singleObjectError.incorrectResponse).not.toHaveProperty('relevantFiles');
      expect(errors.singleObjectError.correctResponse).toHaveProperty('relevantFiles');
      
      // Text explanation error
      expect(errors.textExplanationError.description).toContain('WRONG');
      expect(errors.textExplanationError.incorrectResponse).toContain('Based on my analysis');
      
      // Wrong field name error
      expect(errors.wrongFieldNameError.incorrectResponse).toHaveProperty('fileScores');
      expect(errors.wrongFieldNameError.incorrectResponse).not.toHaveProperty('relevantFiles');
    });
  });

  describe('Edge Case Handling', () => {
    it('should handle prompts with special characters correctly', () => {
      const promptWithSpecialChars = 'Fix the "authentication" module\'s JWT implementation';
      const prompt = buildFileDiscoveryPrompt(
        promptWithSpecialChars,
        {
          taskType: 'bug_fix',
          confidence: 0.9,
          reasoning: ['Bug fix'],
          architecturalComponents: ['auth'],
          codebaseUnderstanding: {},
          suggestedApproach: ['Fix JWT'],
          potentialChallenges: [],
          scopeAssessment: {
            complexity: 'simple',
            estimatedFiles: 2,
            riskLevel: 'low'
          },
          suggestedFocusAreas: ['jwt'],
          estimatedEffort: 'low'
        },
        'Codebase',
        'keyword_matching'
      );

      // Ensure the prompt is still valid and contains key elements
      expect(prompt).toContain('DEVELOPMENT REQUEST:');
      expect(prompt).toContain(promptWithSpecialChars);
      expect(prompt).toContain('## EXAMPLE CORRECT RESPONSE FORMAT:');
    });
  });
});