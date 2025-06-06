import { describe, it, expect } from 'vitest';
import {
  PROMPT_REFINEMENT_SYSTEM_PROMPT,
  buildPromptRefinementPrompt,
  PROMPT_REFINEMENT_RESPONSE_SCHEMA,
  PROMPT_REFINEMENT_EXAMPLES,
  getPromptRefinementTaskId,
  validatePromptRefinementResponse,
  calculateImprovementMetrics,
  extractContextualEnhancements
} from '../../../prompts/prompt-refinement.js';
import { ContextCuratorLLMTask } from '../../../types/llm-tasks.js';
import type { IntentAnalysisResult } from '../../../types/llm-tasks.js';

describe('Prompt Refinement Templates', () => {
  describe('PROMPT_REFINEMENT_SYSTEM_PROMPT', () => {
    it('should contain comprehensive system instructions', () => {
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('prompt engineer');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('software development analyst');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('enhancing development requests');
    });

    it('should define refinement strategies', () => {
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Context Integration');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Technical Specification');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Scope Clarification');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Development Guidance');
    });

    it('should include enhancement categories', () => {
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('architectural');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('technical');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('scope');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('quality');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('integration');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('performance');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('security');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('usability');
    });

    it('should specify JSON response format', () => {
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('JSON object');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('refinedPrompt');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('enhancementReasoning');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('addedContext');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('originalLength');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('refinedLength');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('improvementScore');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('contextualEnhancements');
    });

    it('should include refinement guidelines', () => {
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Be Comprehensive');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Stay Focused');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Be Specific');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Add Value');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Maintain Clarity');
      expect(PROMPT_REFINEMENT_SYSTEM_PROMPT).toContain('Consider Constraints');
    });
  });

  describe('buildPromptRefinementPrompt', () => {
    const originalPrompt = 'Add user authentication to the application';
    const codemapContent = 'React application with Express.js backend, using MongoDB for data storage';
    const intentAnalysis: IntentAnalysisResult = {
      taskType: 'feature_addition',
      confidence: 0.9,
      reasoning: ['Clear feature request for authentication'],
      architecturalComponents: ['frontend', 'backend', 'authentication'],
      scopeAssessment: {
        complexity: 'moderate',
        estimatedFiles: 8,
        riskLevel: 'medium'
      },
      suggestedFocusAreas: ['security-patterns', 'user-management'],
      estimatedEffort: 'medium'
    };

    it('should build basic prompt with required sections', () => {
      const prompt = buildPromptRefinementPrompt(originalPrompt, intentAnalysis, codemapContent);

      expect(prompt).toContain('ORIGINAL DEVELOPMENT REQUEST:');
      expect(prompt).toContain(originalPrompt);
      expect(prompt).toContain('INTENT ANALYSIS RESULTS:');
      expect(prompt).toContain('Task Type: feature_addition');
      expect(prompt).toContain('Confidence: 0.9');
      expect(prompt).toContain('Complexity: moderate');
      expect(prompt).toContain('Risk Level: medium');
      expect(prompt).toContain('Estimated Files: 8');
      expect(prompt).toContain('Estimated Effort: medium');
      expect(prompt).toContain('COMPLETE CODEBASE CONTENT:');
      expect(prompt).toContain(codemapContent);
      expect(prompt).toContain('Refine this development request');
      expect(prompt).toContain('required JSON format');
    });

    it('should include intent analysis details', () => {
      const prompt = buildPromptRefinementPrompt(originalPrompt, intentAnalysis, codemapContent);
      
      expect(prompt).toContain('Reasoning: Clear feature request for authentication');
      expect(prompt).toContain('Architectural Components: frontend, backend, authentication');
      expect(prompt).toContain('Suggested Focus Areas: security-patterns, user-management');
    });

    it('should include additional context when provided', () => {
      const additionalContext = {
        existingPatterns: ['JWT', 'OAuth2'],
        technicalConstraints: ['Node.js 18+', 'MongoDB 5.0+'],
        qualityRequirements: ['Unit tests', 'Integration tests'],
        timelineConstraints: '2 weeks',
        teamExpertise: ['React', 'Express.js', 'MongoDB']
      };
      
      const prompt = buildPromptRefinementPrompt(originalPrompt, intentAnalysis, codemapContent, additionalContext);
      
      expect(prompt).toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('Existing Patterns: JWT, OAuth2');
      expect(prompt).toContain('Technical Constraints: Node.js 18+, MongoDB 5.0+');
      expect(prompt).toContain('Quality Requirements: Unit tests, Integration tests');
      expect(prompt).toContain('Timeline Constraints: 2 weeks');
      expect(prompt).toContain('Team Expertise: React, Express.js, MongoDB');
    });

    it('should handle partial additional context', () => {
      const additionalContext = {
        existingPatterns: ['JWT'],
        timelineConstraints: '1 week'
      };
      
      const prompt = buildPromptRefinementPrompt(originalPrompt, intentAnalysis, codemapContent, additionalContext);
      
      expect(prompt).toContain('Existing Patterns: JWT');
      expect(prompt).toContain('Timeline Constraints: 1 week');
      expect(prompt).not.toContain('Technical Constraints:');
      expect(prompt).not.toContain('Quality Requirements:');
      expect(prompt).not.toContain('Team Expertise:');
    });

    it('should handle empty additional context', () => {
      const prompt = buildPromptRefinementPrompt(originalPrompt, intentAnalysis, codemapContent, {});
      
      expect(prompt).not.toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('ORIGINAL DEVELOPMENT REQUEST:');
      expect(prompt).toContain('INTENT ANALYSIS RESULTS:');
      expect(prompt).toContain('COMPLETE CODEBASE CONTENT:');
    });

    it('should handle empty arrays in additional context', () => {
      const additionalContext = {
        existingPatterns: [],
        technicalConstraints: ['Node.js 18+'],
        qualityRequirements: []
      };
      
      const prompt = buildPromptRefinementPrompt(originalPrompt, intentAnalysis, codemapContent, additionalContext);
      
      expect(prompt).toContain('Technical Constraints: Node.js 18+');
      expect(prompt).not.toContain('Existing Patterns:');
      expect(prompt).not.toContain('Quality Requirements:');
    });
  });

  describe('PROMPT_REFINEMENT_RESPONSE_SCHEMA', () => {
    it('should define correct schema structure', () => {
      expect(PROMPT_REFINEMENT_RESPONSE_SCHEMA.type).toBe('object');
      expect(PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties).toBeDefined();
      expect(PROMPT_REFINEMENT_RESPONSE_SCHEMA.required).toEqual([
        'refinedPrompt',
        'enhancementReasoning',
        'addedContext',
        'originalLength',
        'refinedLength',
        'improvementScore',
        'contextualEnhancements'
      ]);
      expect(PROMPT_REFINEMENT_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    });

    it('should define refinedPrompt correctly', () => {
      const refinedPromptProperty = PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties.refinedPrompt;
      expect(refinedPromptProperty.type).toBe('string');
      expect(refinedPromptProperty.minLength).toBe(1);
    });

    it('should define enhancementReasoning as array of strings', () => {
      const reasoningProperty = PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties.enhancementReasoning;
      expect(reasoningProperty.type).toBe('array');
      expect(reasoningProperty.items.type).toBe('string');
      expect(reasoningProperty.minItems).toBe(1);
    });

    it('should define numeric properties correctly', () => {
      const originalLengthProperty = PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties.originalLength;
      const refinedLengthProperty = PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties.refinedLength;
      const improvementScoreProperty = PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties.improvementScore;
      
      expect(originalLengthProperty.type).toBe('number');
      expect(originalLengthProperty.minimum).toBe(0);
      expect(refinedLengthProperty.type).toBe('number');
      expect(refinedLengthProperty.minimum).toBe(0);
      expect(improvementScoreProperty.type).toBe('number');
      expect(improvementScoreProperty.minimum).toBe(0);
      expect(improvementScoreProperty.maximum).toBe(1);
    });

    it('should define contextualEnhancements enum correctly', () => {
      const enhancementsProperty = PROMPT_REFINEMENT_RESPONSE_SCHEMA.properties.contextualEnhancements;
      expect(enhancementsProperty.type).toBe('array');
      expect(enhancementsProperty.items.enum).toEqual([
        'architectural', 'technical', 'scope', 'quality', 'integration', 'performance', 'security', 'usability'
      ]);
    });
  });

  describe('PROMPT_REFINEMENT_EXAMPLES', () => {
    it('should contain examples for all task types', () => {
      expect(PROMPT_REFINEMENT_EXAMPLES.refactoring).toBeDefined();
      expect(PROMPT_REFINEMENT_EXAMPLES.feature_addition).toBeDefined();
      expect(PROMPT_REFINEMENT_EXAMPLES.bug_fix).toBeDefined();
      expect(PROMPT_REFINEMENT_EXAMPLES.general).toBeDefined();
    });

    it('should have valid refactoring example', () => {
      const example = PROMPT_REFINEMENT_EXAMPLES.refactoring;

      expect(example.originalPrompt).toContain('Refactor');
      expect(example.intentAnalysis.taskType).toBe('refactoring');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.8);
      expect(example.expectedResponse.refinedPrompt).toContain('security');
      expect(example.expectedResponse.refinedPrompt).toContain('maintainability');
      expect(example.expectedResponse.enhancementReasoning).toHaveLength(4);
      expect(example.expectedResponse.addedContext).toContain('Token-based authentication patterns');
      expect(example.expectedResponse.improvementScore).toBeGreaterThan(0.8);
      expect(example.expectedResponse.contextualEnhancements).toContain('architectural');
      expect(example.expectedResponse.contextualEnhancements).toContain('security');
    });

    it('should have valid feature addition example', () => {
      const example = PROMPT_REFINEMENT_EXAMPLES.feature_addition;

      expect(example.originalPrompt).toContain('Add');
      expect(example.intentAnalysis.taskType).toBe('feature_addition');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.refinedPrompt).toContain('dashboard');
      expect(example.expectedResponse.refinedPrompt).toContain('analytics');
      expect(example.expectedResponse.enhancementReasoning).toHaveLength(4);
      expect(example.expectedResponse.addedContext).toContain('Real-time WebSocket integration');
      expect(example.expectedResponse.improvementScore).toBeGreaterThan(0.9);
      expect(example.expectedResponse.contextualEnhancements).toContain('usability');
      expect(example.expectedResponse.contextualEnhancements).toContain('performance');
    });

    it('should have valid bug fix example', () => {
      const example = PROMPT_REFINEMENT_EXAMPLES.bug_fix;

      expect(example.originalPrompt).toContain('Fix');
      expect(example.intentAnalysis.taskType).toBe('bug_fix');
      expect(example.intentAnalysis.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.refinedPrompt).toContain('memory leak');
      expect(example.expectedResponse.refinedPrompt).toContain('profiling');
      expect(example.expectedResponse.enhancementReasoning).toHaveLength(4);
      expect(example.expectedResponse.addedContext).toContain('Memory profiling techniques');
      expect(example.expectedResponse.improvementScore).toBeGreaterThan(0.8);
      expect(example.expectedResponse.contextualEnhancements).toContain('technical');
      expect(example.expectedResponse.contextualEnhancements).toContain('performance');
    });

    it('should have valid general example', () => {
      const example = PROMPT_REFINEMENT_EXAMPLES.general;

      expect(example.originalPrompt).toContain('documentation');
      expect(example.intentAnalysis.taskType).toBe('general');
      expect(example.expectedResponse.refinedPrompt).toContain('documentation');
      expect(example.expectedResponse.refinedPrompt).toContain('setup');
      expect(example.expectedResponse.enhancementReasoning).toHaveLength(4);
      expect(example.expectedResponse.addedContext).toContain('API documentation standards');
      expect(example.expectedResponse.improvementScore).toBeGreaterThan(0.8);
      expect(example.expectedResponse.contextualEnhancements).toContain('scope');
      expect(example.expectedResponse.contextualEnhancements).toContain('quality');
    });

    it('should have consistent response structure across examples', () => {
      Object.values(PROMPT_REFINEMENT_EXAMPLES).forEach(example => {
        const response = example.expectedResponse;

        expect(response.refinedPrompt).toBeDefined();
        expect(typeof response.refinedPrompt).toBe('string');
        expect(response.refinedPrompt.length).toBeGreaterThan(0);

        expect(response.enhancementReasoning).toBeInstanceOf(Array);
        expect(response.enhancementReasoning.length).toBeGreaterThan(0);

        expect(response.addedContext).toBeInstanceOf(Array);
        expect(response.addedContext.length).toBeGreaterThan(0);

        expect(response.originalLength).toBeGreaterThanOrEqual(0);
        expect(response.refinedLength).toBeGreaterThan(response.originalLength);

        expect(response.improvementScore).toBeGreaterThanOrEqual(0);
        expect(response.improvementScore).toBeLessThanOrEqual(1);

        expect(response.contextualEnhancements).toBeInstanceOf(Array);
        expect(response.contextualEnhancements.length).toBeGreaterThan(0);
      });
    });

    it('should show significant improvement in all examples', () => {
      Object.values(PROMPT_REFINEMENT_EXAMPLES).forEach(example => {
        const response = example.expectedResponse;
        const lengthIncrease = response.refinedLength / response.originalLength;

        expect(lengthIncrease).toBeGreaterThan(10); // At least 10x longer
        expect(response.improvementScore).toBeGreaterThan(0.8); // High improvement score
        expect(response.enhancementReasoning.length).toBeGreaterThanOrEqual(3); // Multiple reasons
        expect(response.addedContext.length).toBeGreaterThanOrEqual(3); // Multiple context items
      });
    });
  });

  describe('getPromptRefinementTaskId', () => {
    it('should return correct LLM task identifier', () => {
      const taskId = getPromptRefinementTaskId();
      expect(taskId).toBe(ContextCuratorLLMTask.PROMPT_REFINEMENT);
      expect(taskId).toBe('context_curator_prompt_refinement');
    });
  });

  describe('validatePromptRefinementResponse', () => {
    it('should validate correct response structure', () => {
      const validResponse = {
        refinedPrompt: 'Enhanced prompt with detailed requirements and context',
        enhancementReasoning: ['Added technical details', 'Included security requirements'],
        addedContext: ['Authentication patterns', 'Security best practices'],
        originalLength: 25,
        refinedLength: 150,
        improvementScore: 0.85,
        contextualEnhancements: ['technical', 'security']
      };

      expect(validatePromptRefinementResponse(validResponse)).toBe(true);
    });

    it('should reject invalid enhancement categories', () => {
      const invalidResponse = {
        refinedPrompt: 'Enhanced prompt',
        enhancementReasoning: ['test'],
        addedContext: ['test'],
        originalLength: 25,
        refinedLength: 150,
        improvementScore: 0.85,
        contextualEnhancements: ['invalid_category'] // Invalid category
      };

      expect(validatePromptRefinementResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompleteResponse = {
        refinedPrompt: 'Enhanced prompt',
        enhancementReasoning: ['test']
        // Missing other required fields
      };

      expect(validatePromptRefinementResponse(incompleteResponse)).toBe(false);
    });

    it('should reject invalid improvement score range', () => {
      const invalidResponse = {
        refinedPrompt: 'Enhanced prompt',
        enhancementReasoning: ['test'],
        addedContext: ['test'],
        originalLength: 25,
        refinedLength: 150,
        improvementScore: 1.5, // Invalid: > 1
        contextualEnhancements: ['technical']
      };

      expect(validatePromptRefinementResponse(invalidResponse)).toBe(false);
    });

    it('should reject empty refinedPrompt', () => {
      const invalidResponse = {
        refinedPrompt: '', // Invalid: empty string
        enhancementReasoning: ['test'],
        addedContext: ['test'],
        originalLength: 25,
        refinedLength: 150,
        improvementScore: 0.85,
        contextualEnhancements: ['technical']
      };

      expect(validatePromptRefinementResponse(invalidResponse)).toBe(false);
    });

    it('should reject empty enhancementReasoning array', () => {
      const invalidResponse = {
        refinedPrompt: 'Enhanced prompt',
        enhancementReasoning: [], // Invalid: empty array
        addedContext: ['test'],
        originalLength: 25,
        refinedLength: 150,
        improvementScore: 0.85,
        contextualEnhancements: ['technical']
      };

      expect(validatePromptRefinementResponse(invalidResponse)).toBe(false);
    });
  });

  describe('calculateImprovementMetrics', () => {
    it('should calculate correct metrics for basic improvement', () => {
      const originalPrompt = 'Add authentication';
      const refinedPrompt = 'Implement comprehensive user authentication system with JWT tokens, password hashing, and session management';
      const enhancementCount = 4;

      const metrics = calculateImprovementMetrics(originalPrompt, refinedPrompt, enhancementCount);

      expect(metrics.originalLength).toBe(originalPrompt.length);
      expect(metrics.refinedLength).toBe(refinedPrompt.length);
      expect(metrics.improvementScore).toBeGreaterThan(0);
      expect(metrics.improvementScore).toBeLessThanOrEqual(1);
    });

    it('should handle very short original prompts', () => {
      const originalPrompt = 'Fix bug';
      const refinedPrompt = 'Investigate and fix the critical bug in the user authentication system that prevents users from logging in. Include comprehensive testing and documentation.';
      const enhancementCount = 6;

      const metrics = calculateImprovementMetrics(originalPrompt, refinedPrompt, enhancementCount);

      expect(metrics.originalLength).toBe(originalPrompt.length);
      expect(metrics.refinedLength).toBe(refinedPrompt.length);
      expect(metrics.improvementScore).toBeGreaterThan(0.8);
    });

    it('should cap improvement score at 1.0', () => {
      const originalPrompt = 'Test';
      const refinedPrompt = 'A'.repeat(1000); // Very long refined prompt
      const enhancementCount = 10; // Many enhancements

      const metrics = calculateImprovementMetrics(originalPrompt, refinedPrompt, enhancementCount);

      expect(metrics.improvementScore).toBeLessThanOrEqual(1.0);
    });

    it('should handle zero enhancements', () => {
      const originalPrompt = 'Add feature';
      const refinedPrompt = 'Add new feature to the application';
      const enhancementCount = 0;

      const metrics = calculateImprovementMetrics(originalPrompt, refinedPrompt, enhancementCount);

      expect(metrics.improvementScore).toBeGreaterThanOrEqual(0);
      expect(metrics.improvementScore).toBeLessThan(0.5); // Should be low with no enhancements
    });

    it('should round improvement score to 2 decimal places', () => {
      const originalPrompt = 'Test prompt';
      const refinedPrompt = 'Enhanced test prompt with additional context';
      const enhancementCount = 3;

      const metrics = calculateImprovementMetrics(originalPrompt, refinedPrompt, enhancementCount);

      // Check that the score has at most 2 decimal places
      const decimalPlaces = (metrics.improvementScore.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('extractContextualEnhancements', () => {
    it('should extract architectural enhancements', () => {
      const enhancementReasoning = ['Added architectural patterns', 'Included component design'];
      const addedContext = ['Service architecture', 'Design patterns'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('architectural');
    });

    it('should extract technical enhancements', () => {
      const enhancementReasoning = ['Added technical requirements', 'Specified implementation details'];
      const addedContext = ['Technical specifications', 'Implementation guidelines'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('technical');
    });

    it('should extract security enhancements', () => {
      const enhancementReasoning = ['Added security considerations', 'Included authentication requirements'];
      const addedContext = ['Security best practices', 'Authorization patterns'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('security');
    });

    it('should extract performance enhancements', () => {
      const enhancementReasoning = ['Added performance requirements', 'Included optimization strategies'];
      const addedContext = ['Performance benchmarks', 'Scalability considerations'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('performance');
    });

    it('should extract quality enhancements', () => {
      const enhancementReasoning = ['Added testing requirements', 'Included quality standards'];
      const addedContext = ['Test coverage guidelines', 'Documentation standards'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('quality');
    });

    it('should extract usability enhancements', () => {
      const enhancementReasoning = ['Added user experience considerations', 'Included accessibility requirements'];
      const addedContext = ['User interface guidelines', 'Accessibility standards'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('usability');
    });

    it('should extract integration enhancements', () => {
      const enhancementReasoning = ['Added integration requirements', 'Included API compatibility'];
      const addedContext = ['Integration patterns', 'API interfaces'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('integration');
    });

    it('should extract scope enhancements', () => {
      const enhancementReasoning = ['Added scope clarification', 'Included acceptance criteria'];
      const addedContext = ['Project boundaries', 'Deliverable specifications'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('scope');
    });

    it('should extract multiple enhancement types', () => {
      const enhancementReasoning = [
        'Added technical requirements and security considerations',
        'Included performance optimization and quality standards'
      ];
      const addedContext = [
        'Technical specifications and security patterns',
        'Performance benchmarks and test coverage'
      ];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('technical');
      expect(enhancements).toContain('security');
      expect(enhancements).toContain('performance');
      expect(enhancements).toContain('quality');
      expect(enhancements.length).toBeGreaterThanOrEqual(4);
    });

    it('should handle empty inputs', () => {
      const enhancements = extractContextualEnhancements([], []);

      expect(enhancements).toBeInstanceOf(Array);
      expect(enhancements.length).toBe(0);
    });

    it('should be case insensitive', () => {
      const enhancementReasoning = ['Added TECHNICAL requirements', 'Included Security considerations'];
      const addedContext = ['PERFORMANCE benchmarks', 'quality Standards'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      expect(enhancements).toContain('technical');
      expect(enhancements).toContain('security');
      expect(enhancements).toContain('performance');
      expect(enhancements).toContain('quality');
    });

    it('should return unique enhancement types', () => {
      const enhancementReasoning = [
        'Added technical requirements',
        'Included more technical specifications',
        'Enhanced technical implementation'
      ];
      const addedContext = ['Technical patterns', 'Technical guidelines'];

      const enhancements = extractContextualEnhancements(enhancementReasoning, addedContext);

      // Should only contain 'technical' once, even though it appears multiple times
      const technicalCount = enhancements.filter(e => e === 'technical').length;
      expect(technicalCount).toBe(1);
    });
  });
});
