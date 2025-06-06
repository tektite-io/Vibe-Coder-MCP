import { describe, it, expect } from 'vitest';
import {
  INTENT_ANALYSIS_SYSTEM_PROMPT,
  buildIntentAnalysisPrompt,
  INTENT_ANALYSIS_RESPONSE_SCHEMA,
  INTENT_ANALYSIS_EXAMPLES,
  getIntentAnalysisTaskId,
  validateIntentAnalysisResponse
} from '../../../prompts/intent-analysis.js';
import { ContextCuratorLLMTask } from '../../../types/llm-tasks.js';

describe('Intent Analysis Prompts', () => {
  describe('INTENT_ANALYSIS_SYSTEM_PROMPT', () => {
    it('should contain comprehensive system instructions', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('software architect');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('development analyst');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('codebase contexts');
    });

    it('should define all task types', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('refactoring');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('feature_addition');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('bug_fix');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('general');
    });

    it('should include task type definitions', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Improving code structure');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Adding new functionality');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Resolving defects');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Broad development tasks');
    });

    it('should specify architectural components', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Frontend/UI layers');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Backend services');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Authentication/authorization');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Data models');
    });

    it('should define complexity levels', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('simple');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('moderate');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('complex');
    });

    it('should define risk levels', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('low');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('medium');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('high');
    });

    it('should define effort levels', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('very_high');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('1-3 days');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('1-2 weeks');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('2-4 weeks');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('More than 4 weeks');
    });

    it('should specify JSON response format', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('JSON object');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('taskType');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('confidence');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('reasoning');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('architecturalComponents');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('scopeAssessment');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('suggestedFocusAreas');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('estimatedEffort');
    });

    it('should include analysis guidelines', () => {
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Be Specific');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Consider Context');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Be Conservative');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Focus on Impact');
      expect(INTENT_ANALYSIS_SYSTEM_PROMPT).toContain('Provide Value');
    });
  });

  describe('buildIntentAnalysisPrompt', () => {
    const userPrompt = 'Add user authentication to the application';
    const codemapContent = 'React application with Express.js backend, using MongoDB for data storage';

    it('should build basic prompt with required sections', () => {
      const prompt = buildIntentAnalysisPrompt(userPrompt, codemapContent);

      expect(prompt).toContain('DEVELOPMENT REQUEST:');
      expect(prompt).toContain(userPrompt);
      expect(prompt).toContain('COMPLETE CODEBASE CONTENT:');
      expect(prompt).toContain(codemapContent);
      expect(prompt).toContain('Analyze this development request');
      expect(prompt).toContain('required JSON format');
    });

    it('should include additional context when provided', () => {
      const additionalContext = {
        projectType: 'web-application',
        teamSize: 3,
        timeConstraints: '2 weeks',
        existingIssues: ['performance', 'security']
      };
      
      const prompt = buildIntentAnalysisPrompt(userPrompt, codemapContent, additionalContext);
      
      expect(prompt).toContain('ENHANCED PROJECT ANALYSIS:');
      expect(prompt).toContain('Project Type: web-application');
      expect(prompt).toContain('Team Size: 3 developers');
      expect(prompt).toContain('Time Constraints: 2 weeks');
      expect(prompt).toContain('Known Issues: performance, security');
    });

    it('should handle partial additional context', () => {
      const additionalContext = {
        projectType: 'mobile-app',
        teamSize: 5
      };
      
      const prompt = buildIntentAnalysisPrompt(userPrompt, codemapContent, additionalContext);
      
      expect(prompt).toContain('Project Type: mobile-app');
      expect(prompt).toContain('Team Size: 5 developers');
      expect(prompt).not.toContain('Time Constraints:');
      expect(prompt).not.toContain('Known Issues:');
    });

    it('should handle empty additional context', () => {
      const prompt = buildIntentAnalysisPrompt(userPrompt, codemapContent, {});
      
      expect(prompt).not.toContain('ADDITIONAL CONTEXT:');
      expect(prompt).toContain('DEVELOPMENT REQUEST:');
      expect(prompt).toContain('COMPLETE CODEBASE CONTENT:');
    });

    it('should handle empty existing issues array', () => {
      const additionalContext = {
        projectType: 'web-app',
        existingIssues: []
      };
      
      const prompt = buildIntentAnalysisPrompt(userPrompt, codemapContent, additionalContext);
      
      expect(prompt).toContain('Project Type: web-app');
      expect(prompt).not.toContain('Known Issues:');
    });
  });

  describe('INTENT_ANALYSIS_RESPONSE_SCHEMA', () => {
    it('should define correct schema structure', () => {
      expect(INTENT_ANALYSIS_RESPONSE_SCHEMA.type).toBe('object');
      expect(INTENT_ANALYSIS_RESPONSE_SCHEMA.properties).toBeDefined();
      expect(INTENT_ANALYSIS_RESPONSE_SCHEMA.required).toEqual([
        'taskType',
        'confidence',
        'reasoning',
        'architecturalComponents',
        'scopeAssessment',
        'suggestedFocusAreas',
        'estimatedEffort'
      ]);
      expect(INTENT_ANALYSIS_RESPONSE_SCHEMA.additionalProperties).toBe(false);
    });

    it('should define taskType enum correctly', () => {
      const taskTypeProperty = INTENT_ANALYSIS_RESPONSE_SCHEMA.properties.taskType;
      expect(taskTypeProperty.type).toBe('string');
      expect(taskTypeProperty.enum).toEqual(['refactoring', 'feature_addition', 'bug_fix', 'general']);
    });

    it('should define confidence range correctly', () => {
      const confidenceProperty = INTENT_ANALYSIS_RESPONSE_SCHEMA.properties.confidence;
      expect(confidenceProperty.type).toBe('number');
      expect(confidenceProperty.minimum).toBe(0);
      expect(confidenceProperty.maximum).toBe(1);
    });

    it('should define reasoning as array of strings', () => {
      const reasoningProperty = INTENT_ANALYSIS_RESPONSE_SCHEMA.properties.reasoning;
      expect(reasoningProperty.type).toBe('array');
      expect(reasoningProperty.items.type).toBe('string');
      expect(reasoningProperty.minItems).toBe(1);
    });

    it('should define scopeAssessment structure correctly', () => {
      const scopeProperty = INTENT_ANALYSIS_RESPONSE_SCHEMA.properties.scopeAssessment;
      expect(scopeProperty.type).toBe('object');
      expect(scopeProperty.properties.complexity.enum).toEqual(['simple', 'moderate', 'complex']);
      expect(scopeProperty.properties.riskLevel.enum).toEqual(['low', 'medium', 'high']);
      expect(scopeProperty.properties.estimatedFiles.type).toBe('number');
      expect(scopeProperty.properties.estimatedFiles.minimum).toBe(0);
      expect(scopeProperty.required).toEqual(['complexity', 'estimatedFiles', 'riskLevel']);
    });

    it('should define estimatedEffort enum correctly', () => {
      const effortProperty = INTENT_ANALYSIS_RESPONSE_SCHEMA.properties.estimatedEffort;
      expect(effortProperty.type).toBe('string');
      expect(effortProperty.enum).toEqual(['low', 'medium', 'high', 'very_high']);
    });
  });

  describe('INTENT_ANALYSIS_EXAMPLES', () => {
    it('should contain examples for all task types', () => {
      expect(INTENT_ANALYSIS_EXAMPLES.refactoring).toBeDefined();
      expect(INTENT_ANALYSIS_EXAMPLES.feature_addition).toBeDefined();
      expect(INTENT_ANALYSIS_EXAMPLES.bug_fix).toBeDefined();
      expect(INTENT_ANALYSIS_EXAMPLES.general).toBeDefined();
    });

    it('should have valid refactoring example', () => {
      const example = INTENT_ANALYSIS_EXAMPLES.refactoring;
      
      expect(example.userPrompt).toContain('Refactor');
      expect(example.expectedResponse.taskType).toBe('refactoring');
      expect(example.expectedResponse.confidence).toBeGreaterThan(0.8);
      expect(example.expectedResponse.reasoning).toHaveLength(3);
      expect(example.expectedResponse.architecturalComponents).toContain('authentication');
      expect(example.expectedResponse.scopeAssessment.complexity).toBe('moderate');
      expect(example.expectedResponse.suggestedFocusAreas).toContain('security-patterns');
    });

    it('should have valid feature addition example', () => {
      const example = INTENT_ANALYSIS_EXAMPLES.feature_addition;
      
      expect(example.userPrompt).toContain('Add');
      expect(example.expectedResponse.taskType).toBe('feature_addition');
      expect(example.expectedResponse.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.architecturalComponents).toContain('frontend');
      expect(example.expectedResponse.scopeAssessment.complexity).toBe('complex');
      expect(example.expectedResponse.estimatedEffort).toBe('high');
    });

    it('should have valid bug fix example', () => {
      const example = INTENT_ANALYSIS_EXAMPLES.bug_fix;
      
      expect(example.userPrompt).toContain('Fix');
      expect(example.expectedResponse.taskType).toBe('bug_fix');
      expect(example.expectedResponse.confidence).toBeGreaterThan(0.9);
      expect(example.expectedResponse.architecturalComponents).toContain('file-upload');
      expect(example.expectedResponse.scopeAssessment.riskLevel).toBe('high');
      expect(example.expectedResponse.suggestedFocusAreas).toContain('memory-profiling');
    });

    it('should have valid general example', () => {
      const example = INTENT_ANALYSIS_EXAMPLES.general;
      
      expect(example.userPrompt).toContain('documentation');
      expect(example.expectedResponse.taskType).toBe('general');
      expect(example.expectedResponse.architecturalComponents).toContain('documentation');
      expect(example.expectedResponse.scopeAssessment.complexity).toBe('simple');
      expect(example.expectedResponse.scopeAssessment.riskLevel).toBe('low');
      expect(example.expectedResponse.estimatedEffort).toBe('low');
    });

    it('should have consistent response structure across examples', () => {
      Object.values(INTENT_ANALYSIS_EXAMPLES).forEach(example => {
        const response = example.expectedResponse;
        
        expect(response.taskType).toBeDefined();
        expect(response.confidence).toBeGreaterThanOrEqual(0);
        expect(response.confidence).toBeLessThanOrEqual(1);
        expect(response.reasoning).toBeInstanceOf(Array);
        expect(response.reasoning.length).toBeGreaterThan(0);
        expect(response.architecturalComponents).toBeInstanceOf(Array);
        expect(response.scopeAssessment).toBeDefined();
        expect(response.scopeAssessment.complexity).toBeDefined();
        expect(response.scopeAssessment.estimatedFiles).toBeGreaterThanOrEqual(0);
        expect(response.scopeAssessment.riskLevel).toBeDefined();
        expect(response.suggestedFocusAreas).toBeInstanceOf(Array);
        expect(response.estimatedEffort).toBeDefined();
      });
    });
  });

  describe('getIntentAnalysisTaskId', () => {
    it('should return correct LLM task identifier', () => {
      const taskId = getIntentAnalysisTaskId();
      expect(taskId).toBe(ContextCuratorLLMTask.INTENT_ANALYSIS);
      expect(taskId).toBe('context_curator_intent_analysis');
    });
  });

  describe('validateIntentAnalysisResponse', () => {
    it('should validate correct response structure', () => {
      const validResponse = {
        taskType: 'feature_addition',
        confidence: 0.9,
        reasoning: ['Clear feature request'],
        architecturalComponents: ['frontend', 'backend'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 5,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['ui-design'],
        estimatedEffort: 'medium'
      };
      
      expect(validateIntentAnalysisResponse(validResponse)).toBe(true);
    });

    it('should reject invalid task type', () => {
      const invalidResponse = {
        taskType: 'invalid_type',
        confidence: 0.9,
        reasoning: ['test'],
        architecturalComponents: ['test'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 5,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };
      
      expect(validateIntentAnalysisResponse(invalidResponse)).toBe(false);
    });

    it('should reject missing required fields', () => {
      const incompleteResponse = {
        taskType: 'feature_addition',
        confidence: 0.9
        // Missing other required fields
      };
      
      expect(validateIntentAnalysisResponse(incompleteResponse)).toBe(false);
    });

    it('should reject invalid confidence range', () => {
      const invalidResponse = {
        taskType: 'feature_addition',
        confidence: 1.5, // Invalid: > 1
        reasoning: ['test'],
        architecturalComponents: ['test'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 5,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };
      
      expect(validateIntentAnalysisResponse(invalidResponse)).toBe(false);
    });

    it('should reject empty reasoning array', () => {
      const invalidResponse = {
        taskType: 'feature_addition',
        confidence: 0.9,
        reasoning: [], // Invalid: empty array
        architecturalComponents: ['test'],
        scopeAssessment: {
          complexity: 'moderate',
          estimatedFiles: 5,
          riskLevel: 'medium'
        },
        suggestedFocusAreas: ['test'],
        estimatedEffort: 'medium'
      };
      
      expect(validateIntentAnalysisResponse(invalidResponse)).toBe(false);
    });
  });
});
