import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AtomicTaskDetector, AtomicityAnalysis, ProjectContext } from '../../core/atomic-detector.js';
import { AtomicTask, TaskPriority, TaskType, TaskStatus } from '../../types/task.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';
import { createMockConfig } from '../utils/test-setup.js';

// Mock the LLM helper
vi.mock('../../../../utils/llmHelper.js', () => ({
  performDirectLlmCall: vi.fn()
}));

// Mock the config loader
vi.mock('../../utils/config-loader.js', () => ({
  getLLMModelForOperation: vi.fn().mockResolvedValue('anthropic/claude-3-sonnet')
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('AtomicTaskDetector', () => {
  let detector: AtomicTaskDetector;
  let mockConfig: OpenRouterConfig;
  let mockTask: AtomicTask;
  let mockContext: ProjectContext;

  beforeEach(() => {
    mockConfig = createMockConfig();
    detector = new AtomicTaskDetector(mockConfig);

    mockTask = {
      id: 'T0001',
      title: 'Implement user login',
      description: 'Create a login form with email and password validation',
      type: 'development' as TaskType,
      priority: 'medium' as TaskPriority,
      status: 'pending' as TaskStatus,
      projectId: 'PID-TEST-001',
      epicId: 'E001',
      estimatedHours: 3,
      actualHours: 0,
      filePaths: ['src/components/LoginForm.tsx', 'src/utils/auth.ts'],
      acceptanceCriteria: [
        'User can enter email and password',
        'Form validates input fields',
        'Successful login redirects to dashboard'
      ],
      tags: ['authentication', 'frontend'],
      dependencies: [],
      assignedAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user'
    };

    mockContext = {
      projectId: 'PID-TEST-001',
      languages: ['typescript', 'javascript'],
      frameworks: ['react', 'node.js'],
      tools: ['vite', 'vitest'],
      existingTasks: [],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium'
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeTask', () => {
    it('should analyze atomic task successfully', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.85,
        reasoning: 'Task has clear scope and can be completed in estimated time',
        estimatedHours: 3,
        complexityFactors: ['Frontend component', 'Authentication logic'],
        recommendations: ['Add unit tests', 'Consider error handling']
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(mockResponse);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result).toEqual({
        isAtomic: true,
        confidence: 0.85,
        reasoning: 'Task has clear scope and can be completed in estimated time',
        estimatedHours: 3,
        complexityFactors: ['Frontend component', 'Authentication logic'],
        recommendations: ['Add unit tests', 'Consider error handling']
      });

      expect(performDirectLlmCall).toHaveBeenCalledWith(
        expect.stringContaining('Analyze the following task'),
        expect.stringContaining('You are an expert software development task analyzer'),
        mockConfig,
        'task_decomposition',
        0.1
      );
    });

    it('should handle non-atomic task analysis', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: false,
        confidence: 0.9,
        reasoning: 'Task spans multiple components and requires significant time',
        estimatedHours: 8,
        complexityFactors: ['Multiple components', 'Complex business logic'],
        recommendations: ['Break into smaller tasks', 'Define clearer acceptance criteria']
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(mockResponse);

      const largeTask = {
        ...mockTask,
        estimatedHours: 8,
        filePaths: ['src/auth/', 'src/components/', 'src/api/', 'src/utils/', 'src/types/', 'src/hooks/']
      };

      const result = await detector.analyzeTask(largeTask, mockContext);

      expect(result.isAtomic).toBe(false);
      expect(result.confidence).toBeLessThanOrEqual(0.3); // Validation rule applied
      expect(result.recommendations).toContain('Consider breaking down tasks estimated over 6 hours');
    });

    it('should apply validation rules correctly', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Initial analysis suggests atomic',
        estimatedHours: 7, // Over 6 hours
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(mockResponse);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(false); // Validation rule overrides
      expect(result.confidence).toBeLessThanOrEqual(0.3);
      expect(result.recommendations).toContain('Consider breaking down tasks estimated over 6 hours');
    });

    it('should handle multiple file paths validation', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.8,
        reasoning: 'Task seems manageable',
        estimatedHours: 3,
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(mockResponse);

      const multiFileTask = {
        ...mockTask,
        filePaths: ['file1.ts', 'file2.ts', 'file3.ts', 'file4.ts', 'file5.ts', 'file6.ts']
      };

      const result = await detector.analyzeTask(multiFileTask, mockContext);

      expect(result.confidence).toBeLessThanOrEqual(0.6);
      expect(result.complexityFactors).toContain('Multiple file modifications');
    });

    it('should handle insufficient acceptance criteria', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Task analysis',
        estimatedHours: 3,
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(mockResponse);

      const vagueTask = {
        ...mockTask,
        acceptanceCriteria: ['Complete the feature'] // Only one vague criterion
      };

      const result = await detector.analyzeTask(vagueTask, mockContext);

      expect(result.confidence).toBeLessThanOrEqual(0.7);
      expect(result.recommendations).toContain('Add more specific acceptance criteria');
    });

    it('should handle critical tasks in complex projects', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const mockResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.9,
        reasoning: 'Task analysis',
        estimatedHours: 3,
        complexityFactors: [],
        recommendations: []
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(mockResponse);

      const criticalTask = {
        ...mockTask,
        priority: 'critical' as TaskPriority
      };

      const complexContext = {
        ...mockContext,
        complexity: 'high' as const
      };

      const result = await detector.analyzeTask(criticalTask, complexContext);

      expect(result.confidence).toBeLessThanOrEqual(0.8);
      expect(result.complexityFactors).toContain('Critical task in complex project');
    });

    it('should return fallback analysis on LLM failure', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performDirectLlmCall).mockRejectedValue(new Error('LLM API failed'));

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.confidence).toBe(0.4);
      expect(result.reasoning).toContain('Fallback analysis');
      expect(result.complexityFactors).toContain('LLM analysis unavailable');
      expect(result.recommendations).toContain('Manual review recommended due to analysis failure');
    });

    it('should handle malformed LLM response', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performDirectLlmCall).mockResolvedValue('Invalid JSON response');

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.confidence).toBe(0.4);
      expect(result.reasoning).toContain('Fallback analysis');
    });

    it('should handle partial LLM response', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      const partialResponse = JSON.stringify({
        isAtomic: true,
        confidence: 0.8
        // Missing other fields
      });

      vi.mocked(performDirectLlmCall).mockResolvedValue(partialResponse);

      const result = await detector.analyzeTask(mockTask, mockContext);

      expect(result.isAtomic).toBe(true);
      expect(result.confidence).toBe(0.8);
      expect(result.reasoning).toBe('No reasoning provided');
      expect(result.estimatedHours).toBeGreaterThan(0);
      expect(Array.isArray(result.complexityFactors)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });
  });

  describe('prompt building', () => {
    it('should build comprehensive analysis prompt', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performDirectLlmCall).mockResolvedValue('{"isAtomic": true, "confidence": 0.8}');

      await detector.analyzeTask(mockTask, mockContext);

      const callArgs = vi.mocked(performDirectLlmCall).mock.calls[0];
      const prompt = callArgs[0];

      expect(prompt).toContain(mockTask.title);
      expect(prompt).toContain(mockTask.description);
      expect(prompt).toContain(mockContext.projectId);
      expect(prompt).toContain('ANALYSIS CRITERIA');
      expect(prompt).toContain('JSON format');
    });

    it('should build appropriate system prompt', async () => {
      const { performDirectLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performDirectLlmCall).mockResolvedValue('{"isAtomic": true, "confidence": 0.8}');

      await detector.analyzeTask(mockTask, mockContext);

      const callArgs = vi.mocked(performDirectLlmCall).mock.calls[0];
      const systemPrompt = callArgs[1];

      expect(systemPrompt).toContain('expert software development task analyzer');
      expect(systemPrompt).toContain('RDD');
      expect(systemPrompt).toContain('ATOMIC TASK CRITERIA');
      expect(systemPrompt).toContain('NON-ATOMIC INDICATORS');
    });
  });
});
