import { describe, it, expect, beforeEach } from 'vitest';
import { PromptOptimizer, getPromptOptimizer, optimizeJsonPrompts } from '../prompt-optimizer.js';

describe('Prompt Optimizer', () => {
  let optimizer: PromptOptimizer;

  beforeEach(() => {
    // Reset singleton instance for clean tests
    PromptOptimizer.resetInstance();

    // Get a fresh instance for each test
    optimizer = getPromptOptimizer({
      enableJsonOptimization: true,
      includeSchemaHints: true,
      useErrorPatternLearning: true,
      maxPromptLength: 4000
    });
  });

  describe('JSON Prompt Optimization', () => {
    it('should enhance system prompt for JSON generation', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Generate a JSON object with user data.';
      const taskName = 'json_generation';

      const result = optimizer.optimizeForJsonGeneration(
        systemPrompt,
        userPrompt,
        taskName
      );

      expect(result.optimizedSystemPrompt).toContain('CRITICAL JSON OUTPUT REQUIREMENTS');
      expect(result.optimizedSystemPrompt).toContain('valid, parseable JSON only');
      expect(result.optimizedSystemPrompt).toContain('Do NOT include markdown code blocks');
      expect(result.optimizationApplied).toContain('json-system-enhancement');
    });

    it('should enhance user prompt for JSON generation', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Generate a JSON object with user data.';
      const taskName = 'json_generation';

      const result = optimizer.optimizeForJsonGeneration(
        systemPrompt,
        userPrompt,
        taskName
      );

      expect(result.optimizedUserPrompt).toContain('OUTPUT FORMAT');
      expect(result.optimizedUserPrompt).toContain('single, valid JSON object');
      expect(result.optimizedUserPrompt).toContain('IMPORTANT: Your entire response must be a single, valid JSON object');
      expect(result.optimizationApplied).toContain('json-user-enhancement');
    });

    it('should include schema hints when provided', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Generate a JSON object.';
      const taskName = 'json_generation';
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' }
        }
      };

      const result = optimizer.optimizeForJsonGeneration(
        systemPrompt,
        userPrompt,
        taskName,
        schema
      );

      expect(result.optimizedUserPrompt).toContain('EXPECTED JSON STRUCTURE EXAMPLE');
      expect(result.optimizedUserPrompt).toContain('"name"');
      expect(result.optimizedUserPrompt).toContain('"age"');
      expect(result.optimizationApplied).toContain('schema-hints');
    });

    it('should add error prevention rules for module selection tasks', () => {
      const systemPrompt = 'You are a module selector.';
      const userPrompt = 'Select modules for the project.';
      const taskName = 'fullstack_starter_kit_module_selection';

      const result = optimizer.optimizeForJsonGeneration(
        systemPrompt,
        userPrompt,
        taskName
      );

      expect(result.optimizedSystemPrompt).toContain('AVOID:');
      expect(result.optimizationApplied).toContain('error-prevention-rules');
    });

    it('should not optimize when JSON optimization is disabled', () => {
      // Reset and create a new instance with disabled optimization
      PromptOptimizer.resetInstance();
      const disabledOptimizer = getPromptOptimizer({
        enableJsonOptimization: false,
        includeSchemaHints: false,
        useErrorPatternLearning: false,
        maxPromptLength: 4000
      });

      const systemPrompt = 'You are a helpful assistant.';
      const userPrompt = 'Generate a JSON object.';
      const taskName = 'json_generation';

      const result = disabledOptimizer.optimizeForJsonGeneration(
        systemPrompt,
        userPrompt,
        taskName
      );

      expect(result.optimizedSystemPrompt).toBe(systemPrompt);
      expect(result.optimizedUserPrompt).toBe(userPrompt);
      expect(result.optimizationApplied).toHaveLength(0);
    });
  });

  describe('Error Pattern Learning', () => {
    it('should record parsing success', () => {
      const taskName = 'test_task';

      optimizer.recordParsingResult(taskName, true);

      const stats = optimizer.getOptimizationStats();
      expect(stats.totalTasks).toBe(1);
      expect(stats.averageSuccessRate).toBe(1.0);
    });

    it('should record parsing failure and learn from error', () => {
      const taskName = 'test_task';
      const error = 'Unexpected token at position 2572, missing comma';

      optimizer.recordParsingResult(taskName, false, error);

      const stats = optimizer.getOptimizationStats();
      expect(stats.totalTasks).toBe(1);
      expect(stats.averageSuccessRate).toBe(0.0);
      expect(stats.errorPatterns).toBeGreaterThan(0);
    });

    it('should extract error patterns from error messages', () => {
      const taskName = 'test_task';

      // Test missing comma error
      optimizer.recordParsingResult(taskName, false, 'position 2572 missing comma');

      // Test control character error
      optimizer.recordParsingResult(taskName, false, 'control character at position 1210');

      // Test trailing comma error
      optimizer.recordParsingResult(taskName, false, 'trailing comma not allowed');

      const stats = optimizer.getOptimizationStats();
      expect(stats.errorPatterns).toBe(3);
      expect(stats.topErrors).toHaveLength(3);
    });

    it('should calculate confidence score based on historical success', () => {
      const taskName = 'test_task';

      // Record some successes and failures
      optimizer.recordParsingResult(taskName, true);
      optimizer.recordParsingResult(taskName, true);
      optimizer.recordParsingResult(taskName, false, 'some error');

      const result = optimizer.optimizeForJsonGeneration(
        'System prompt',
        'User prompt',
        taskName
      );

      // Should have higher confidence due to 2/3 success rate
      expect(result.confidenceScore).toBeGreaterThan(0.7);
      expect(result.confidenceScore).toBeLessThan(1.0);
    });
  });

  describe('Task-Specific Optimizations', () => {
    it('should apply module selection specific optimizations', () => {
      const result = optimizer.optimizeForJsonGeneration(
        'System prompt',
        'User prompt',
        'fullstack_starter_kit_module_selection'
      );

      expect(result.optimizedSystemPrompt).toContain('large numbers');
      expect(result.optimizedSystemPrompt).toContain('nested object properties');
      expect(result.optimizedSystemPrompt).toContain('schema fields');
    });

    it('should apply YAML generation specific optimizations', () => {
      const result = optimizer.optimizeForJsonGeneration(
        'System prompt',
        'User prompt',
        'fullstack_starter_kit_dynamic_yaml_module_generation'
      );

      expect(result.optimizedSystemPrompt).toContain('large numbers');
      expect(result.optimizedSystemPrompt).toContain('nested object properties');
    });
  });

  describe('Convenience Functions', () => {
    it('should work with optimizeJsonPrompts convenience function', () => {
      const result = optimizeJsonPrompts(
        'System prompt',
        'User prompt',
        'json_task'
      );

      expect(result.optimizedSystemPrompt).toContain('CRITICAL JSON OUTPUT REQUIREMENTS');
      expect(result.optimizationApplied.length).toBeGreaterThan(0);
    });
  });

  describe('Optimization Statistics', () => {
    it('should provide comprehensive optimization statistics', () => {
      // Record some data
      optimizer.recordParsingResult('task1', true);
      optimizer.recordParsingResult('task1', false, 'missing comma error');
      optimizer.recordParsingResult('task2', true);

      const stats = optimizer.getOptimizationStats();

      expect(stats.totalTasks).toBe(2);
      expect(stats.averageSuccessRate).toBeCloseTo(0.75); // 2 successes out of 3 total
      expect(stats.errorPatterns).toBeGreaterThan(0);
      expect(stats.topErrors).toBeDefined();
    });
  });
});
