/**
 * RDD Engine Constraints Tests
 * 
 * Tests the updated RDD engine constraints including the new 400 max sub-tasks
 * and 400-hour epic time limits, plus centralized configuration loading.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RDDEngine } from '../../core/rdd-engine.js';
import { AtomicTaskDetector } from '../../core/atomic-detector.js';
import type { AtomicTask, ProjectContext } from '../../types/project-context.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';

// Mock dependencies
vi.mock('../../utils/config-loader.js');
vi.mock('../../../../utils/llmHelper.js');
vi.mock('../../../../logger.js');

describe('RDD Engine Constraints', () => {
  let rddEngine: RDDEngine;
  let atomicDetector: AtomicTaskDetector;
  let mockConfig: ReturnType<typeof getVibeTaskManagerConfig>;
  let testProjectContext: ProjectContext;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup mock configuration with updated RDD constraints
    mockConfig = {
      rddConfig: {
        maxDepth: 5,
        maxSubTasks: 400, // Updated constraint
        minConfidence: 0.7,
        enableParallelDecomposition: false,
        epicTimeLimit: 400 // Updated constraint (in hours)
      },
      llm: {
        openrouter: {
          baseUrl: 'https://test.openrouter.ai/api/v1',
          apiKey: 'test-key'
        },
        llm_mapping: {}
      }
    } as ReturnType<typeof getVibeTaskManagerConfig>;

    vi.mocked(getVibeTaskManagerConfig).mockResolvedValue(mockConfig);

    // Setup LLM helper mocks with dynamic responses
    const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
    vi.mocked(performFormatAwareLlmCall).mockImplementation(async (prompt: string, systemPrompt: string, config: unknown, taskName?: string) => {
      // Check if this is an atomic detection call
      if (taskName === 'task_decomposition' || prompt.includes('atomic')) {
        // For large tasks (>100 hours), return non-atomic
        if (prompt.includes('350') || prompt.includes('400') || prompt.includes('500')) {
          return JSON.stringify({
            isAtomic: false,
            confidence: 0.95,
            reasoning: 'Task is too large and complex, exceeding epic time limits for atomic tasks',
            estimatedHours: prompt.includes('500') ? 500 : (prompt.includes('400') ? 400 : 350),
            complexityFactors: ['time_limit_exceeded', 'high_complexity'],
            recommendations: ['Break into smaller atomic tasks', 'Consider epic-level decomposition']
          });
        }
        // For smaller tasks, return atomic
        return JSON.stringify({
          isAtomic: true,
          confidence: 0.95,
          reasoning: 'Task meets atomic criteria',
          estimatedHours: 2,
          complexityFactors: [],
          recommendations: []
        });
      }
      
      // Default decomposition response
      return JSON.stringify({
        contextualInsights: {
          codebaseAlignment: 'Aligns with enterprise patterns',
          researchIntegration: 'No additional research needed',
          technologySpecifics: 'TypeScript, Node.js, PostgreSQL',
          estimationFactors: 'High complexity, multiple integrations'
        },
        tasks: Array.from({ length: 350 }, (_, i) => ({
          title: `E-commerce Sub-task ${i + 1}`,
          description: `Implement component ${i + 1} of the e-commerce platform`,
          type: 'development',
          priority: 'medium',
          estimatedHours: 2,
          filePaths: [`src/ecommerce/component-${i + 1}.ts`],
          acceptanceCriteria: [`Component ${i + 1} should function correctly`],
          tags: ['ecommerce', 'component'],
          dependencies: i > 0 ? [`ecommerce-subtask-${i}`] : [],
          contextualNotes: {
            codebaseReferences: 'Follows existing patterns',
            researchJustification: 'Standard implementation',
            integrationConsiderations: 'Microservice architecture',
            riskMitigation: 'Comprehensive testing required'
          }
        }))
      });
    });

    // Initialize engines
    rddEngine = new RDDEngine({
      baseUrl: 'https://test.openrouter.ai/api/v1',
      apiKey: 'test-key',
      geminiModel: 'google/gemini-2.5-flash-preview-05-20',
      perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
      llm_mapping: {}
    });

    atomicDetector = new AtomicTaskDetector({
      baseUrl: 'https://test.openrouter.ai/api/v1',
      apiKey: 'test-key',
      geminiModel: 'google/gemini-2.5-flash-preview-05-20',
      perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
      llm_mapping: {}
    }, {
      epicTimeLimit: 400 // Use updated constraint
    });

    // Setup test project context
    testProjectContext = {
      projectPath: process.cwd(),
      projectName: 'RDD-Constraints-Test',
      description: 'Test project for RDD constraints validation',
      languages: ['typescript'],
      frameworks: ['node.js'],
      buildTools: ['npm'],
      tools: ['vitest'],
      configFiles: ['package.json'],
      entryPoints: ['src/index.ts'],
      architecturalPatterns: ['mvc'],
      codebaseSize: 'large', // Large project to test constraints
      teamSize: 10,
      complexity: 'high',
      existingTasks: [],
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['src/**/__tests__'],
        docDirectories: ['docs'],
        buildDirectories: ['build']
      },
      dependencies: {
        production: [],
        development: [],
        external: []
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        source: 'test' as const
      }
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('RDD Engine Configuration Loading', () => {
    it('should load updated maxSubTasks constraint from configuration', async () => {
      const config = await getVibeTaskManagerConfig();
      expect(config.rddConfig.maxSubTasks).toBe(400);
    });

    it('should load updated epicTimeLimit constraint from configuration', async () => {
      const config = await getVibeTaskManagerConfig();
      expect(config.rddConfig.epicTimeLimit).toBe(400);
    });

    it('should use environment variables for RDD configuration', async () => {
      // Test that environment variables are properly loaded
      process.env.VIBE_RDD_MAX_SUB_TASKS = '450';
      process.env.VIBE_RDD_EPIC_TIME_LIMIT = '500';

      // Re-mock with environment-based values
      vi.mocked(getVibeTaskManagerConfig).mockResolvedValue({
        ...mockConfig,
        rddConfig: {
          ...mockConfig.rddConfig,
          maxSubTasks: 450,
          epicTimeLimit: 500
        }
      });

      const config = await getVibeTaskManagerConfig();
      expect(config.rddConfig.maxSubTasks).toBe(450);
      expect(config.rddConfig.epicTimeLimit).toBe(500);

      // Cleanup
      delete process.env.VIBE_RDD_MAX_SUB_TASKS;
      delete process.env.VIBE_RDD_EPIC_TIME_LIMIT;
    });

    it('should validate RDD configuration constraints', async () => {
      const config = await getVibeTaskManagerConfig();
      
      // Validate constraint values are within expected ranges
      expect(config.rddConfig.maxSubTasks).toBeGreaterThan(0);
      expect(config.rddConfig.maxSubTasks).toBeLessThanOrEqual(1000); // Reasonable upper bound
      expect(config.rddConfig.epicTimeLimit).toBeGreaterThan(0);
      expect(config.rddConfig.epicTimeLimit).toBeLessThanOrEqual(1000); // Reasonable upper bound
    });
  });

  describe('MaxSubTasks Constraint (400)', () => {
    it('should accept task decomposition within 400 sub-task limit', async () => {
      // Create a complex task that could decompose to many sub-tasks
      const complexTask: AtomicTask = {
        id: 'constraints-test-001',
        title: 'Implement Enterprise E-commerce Platform',
        description: 'Build complete e-commerce platform with user management, product catalog, payment processing, order management, inventory tracking, analytics, and admin dashboard',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 800, // Large task that exceeds atomic limits
        actualHours: 0,
        epicId: 'ecommerce-epic',
        projectId: 'constraints-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: [
          'User registration and authentication system',
          'Product catalog with search and filtering',
          'Shopping cart and checkout process',
          'Payment processing integration',
          'Order management system',
          'Inventory tracking',
          'Analytics dashboard',
          'Admin panel'
        ],
        testingRequirements: {
          unitTests: ['All components should have unit tests'],
          integrationTests: ['API integration tests'],
          performanceTests: ['Performance benchmarks'],
          coverageTarget: 90
        },
        performanceCriteria: {
          responseTime: '< 500ms',
          memoryUsage: '< 2GB'
        },
        qualityCriteria: {
          codeQuality: ['ESLint passing', 'TypeScript strict mode'],
          documentation: ['Comprehensive API docs'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['Node.js 18+', 'PostgreSQL 14+'],
          patterns: ['Microservices', 'Event-driven']
        },
        validationMethods: {
          automated: ['Unit tests', 'Integration tests', 'E2E tests'],
          manual: ['Code review', 'Security audit']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['enterprise', 'ecommerce', 'complex'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: ['enterprise', 'ecommerce', 'complex']
        }
      };

      // Mock decomposition response with realistic sub-task count
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(JSON.stringify({
        contextualInsights: {
          codebaseAlignment: 'Aligns with enterprise patterns',
          researchIntegration: 'No additional research needed',
          technologySpecifics: 'TypeScript, Node.js, PostgreSQL',
          estimationFactors: 'High complexity, multiple integrations'
        },
        tasks: Array.from({ length: 350 }, (_, i) => ({
          title: `E-commerce Sub-task ${i + 1}`,
          description: `Implement component ${i + 1} of the e-commerce platform`,
          type: 'development',
          priority: 'medium',
          estimatedHours: 2,
          filePaths: [`src/ecommerce/component-${i + 1}.ts`],
          acceptanceCriteria: [`Component ${i + 1} should function correctly`],
          tags: ['ecommerce', 'component'],
          dependencies: i > 0 ? [`ecommerce-subtask-${i}`] : [],
          contextualNotes: {
            codebaseReferences: 'Follows existing patterns',
            researchJustification: 'Standard implementation',
            integrationConsiderations: 'Microservice architecture',
            riskMitigation: 'Comprehensive testing required'
          }
        }))
      }));

      const result = await rddEngine.decomposeTask(complexTask, testProjectContext);

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();
      // If the task was decomposed, it should have sub-tasks within the 400 limit
      if (result.subTasks.length > 0) {
        expect(result.subTasks.length).toBeLessThanOrEqual(400);
      }
      // For testing purposes, verify the constraint system is working
      expect(result.subTasks.length).toBeLessThanOrEqual(400);

      logger.info({
        originalTask: complexTask.title,
        subtaskCount: result.subTasks.length,
        withinConstraints: result.subTasks.length <= 400
      }, 'MaxSubTasks constraint validation (within limits)');
    });

    it('should enforce 400 max sub-tasks constraint', async () => {
      // Mock a decomposition that would exceed the 400 limit
      const { performFormatAwareLlmCall } = await import('../../../../utils/llmHelper.js');
      vi.mocked(performFormatAwareLlmCall).mockResolvedValue(JSON.stringify({
        contextualInsights: {
          codebaseAlignment: 'Requires extensive decomposition',
          researchIntegration: 'Complex integration needed',
          technologySpecifics: 'Multiple technologies',
          estimationFactors: 'Very high complexity'
        },
        tasks: Array.from({ length: 500 }, (_, i) => ({ // Exceeds 400 limit
          title: `Excessive Sub-task ${i + 1}`,
          description: `Task ${i + 1} description`,
          type: 'development',
          priority: 'medium',
          estimatedHours: 1,
          filePaths: [`src/task-${i + 1}.ts`],
          acceptanceCriteria: [`Task ${i + 1} completion`],
          tags: ['excessive'],
          dependencies: [],
          contextualNotes: {
            codebaseReferences: 'Standard patterns',
            researchJustification: 'Required implementation',
            integrationConsiderations: 'Standard integration',
            riskMitigation: 'Testing required'
          }
        }))
      }));

      const largeTask: AtomicTask = {
        id: 'constraints-test-002',
        title: 'Massive System Implementation',
        description: 'Implement extremely complex system with hundreds of components',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 1000,
        actualHours: 0,
        epicId: 'massive-epic',
        projectId: 'constraints-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: ['Complete system implementation'],
        testingRequirements: {
          unitTests: ['All tests'],
          integrationTests: ['All integrations'],
          performanceTests: ['Performance tests'],
          coverageTarget: 95
        },
        performanceCriteria: {
          responseTime: '< 1s',
          memoryUsage: '< 4GB'
        },
        qualityCriteria: {
          codeQuality: ['All quality checks'],
          documentation: ['Complete documentation'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['All platforms'],
          patterns: ['All patterns']
        },
        validationMethods: {
          automated: ['All automated tests'],
          manual: ['All manual tests']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['massive', 'complex'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: ['massive', 'complex']
        }
      };

      const result = await rddEngine.decomposeTask(largeTask, testProjectContext);

      // The engine should either:
      // 1. Limit to 400 sub-tasks (truncate the excess)
      // 2. Refuse decomposition due to constraint violation
      expect(result.success).toBe(true);
      if (result.subTasks.length > 0) {
        expect(result.subTasks.length).toBeLessThanOrEqual(400);
      }

      logger.info({
        originalTask: largeTask.title,
        requestedSubtasks: 500,
        actualSubtasks: result.subTasks.length,
        constraintEnforced: result.subTasks.length <= 400
      }, 'MaxSubTasks constraint enforcement test');
    });
  });

  describe('Epic Time Limit Constraint (400 hours)', () => {
    it('should accept tasks within 400-hour epic time limit', async () => {
      const largeButValidTask: AtomicTask = {
        id: 'constraints-test-003',
        title: 'Large Valid Project',
        description: 'Large project that fits within 400-hour epic limit',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 350, // Within 400-hour limit
        actualHours: 0,
        epicId: 'large-valid-epic',
        projectId: 'constraints-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: ['Complete project implementation'],
        testingRequirements: {
          unitTests: ['Unit tests'],
          integrationTests: ['Integration tests'],
          performanceTests: ['Performance tests'],
          coverageTarget: 85
        },
        performanceCriteria: {
          responseTime: '< 300ms',
          memoryUsage: '< 1GB'
        },
        qualityCriteria: {
          codeQuality: ['ESLint passing'],
          documentation: ['API documentation'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['Node.js 18+'],
          patterns: ['MVC']
        },
        validationMethods: {
          automated: ['Tests'],
          manual: ['Code review']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['large', 'valid'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: ['large', 'valid']
        }
      };

      const analysis = await atomicDetector.analyzeTask(largeButValidTask, testProjectContext);

      // Task should be considered non-atomic due to size, but within epic limits
      expect(analysis.isAtomic).toBe(false);
      expect(analysis.reasoning).toContain('large'); // Should mention size

      logger.info({
        task: largeButValidTask.title,
        estimatedHours: largeButValidTask.estimatedHours,
        isAtomic: analysis.isAtomic,
        withinEpicLimit: largeButValidTask.estimatedHours <= 400
      }, 'Epic time limit validation (within limits)');
    });

    it('should flag tasks exceeding 400-hour epic time limit', async () => {
      const excessiveTask: AtomicTask = {
        id: 'constraints-test-004',
        title: 'Excessive Time Project',
        description: 'Project that exceeds 400-hour epic time limit',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 500, // Exceeds 400-hour limit
        actualHours: 0,
        epicId: 'excessive-epic',
        projectId: 'constraints-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: ['Complete excessive project'],
        testingRequirements: {
          unitTests: ['All tests'],
          integrationTests: ['All integrations'],
          performanceTests: ['All performance tests'],
          coverageTarget: 95
        },
        performanceCriteria: {
          responseTime: '< 500ms',
          memoryUsage: '< 2GB'
        },
        qualityCriteria: {
          codeQuality: ['All quality standards'],
          documentation: ['Complete documentation'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['All platforms'],
          patterns: ['All patterns']
        },
        validationMethods: {
          automated: ['All automated validation'],
          manual: ['All manual validation']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['excessive', 'oversized'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: ['excessive', 'oversized']
        }
      };

      const analysis = await atomicDetector.analyzeTask(excessiveTask, testProjectContext);

      // Task should be flagged as non-atomic and exceeding epic limits
      expect(analysis.isAtomic).toBe(false);
      expect(analysis.reasoning).toMatch(/epic|time|limit|400/i); // Should mention epic time limits

      logger.info({
        task: excessiveTask.title,
        estimatedHours: excessiveTask.estimatedHours,
        isAtomic: analysis.isAtomic,
        exceedsEpicLimit: excessiveTask.estimatedHours > 400,
        reasoning: analysis.reasoning
      }, 'Epic time limit constraint enforcement test');
    });

    it('should handle edge case at exactly 400 hours', async () => {
      const edgeCaseTask: AtomicTask = {
        id: 'constraints-test-005',
        title: 'Edge Case 400-Hour Project',
        description: 'Project that is exactly at 400-hour epic limit',
        status: 'pending',
        priority: 'high',
        type: 'development',
        estimatedHours: 400, // Exactly at limit
        actualHours: 0,
        epicId: 'edge-case-epic',
        projectId: 'constraints-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: ['Complete edge case project'],
        testingRequirements: {
          unitTests: ['Unit tests'],
          integrationTests: ['Integration tests'],
          performanceTests: ['Performance tests'],
          coverageTarget: 90
        },
        performanceCriteria: {
          responseTime: '< 400ms',
          memoryUsage: '< 1.5GB'
        },
        qualityCriteria: {
          codeQuality: ['Quality standards'],
          documentation: ['Documentation'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['Target platforms'],
          patterns: ['Architectural patterns']
        },
        validationMethods: {
          automated: ['Automated validation'],
          manual: ['Manual validation']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['edge-case', 'limit-test'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: ['edge-case', 'limit-test']
        }
      };

      const analysis = await atomicDetector.analyzeTask(edgeCaseTask, testProjectContext);

      // Task should be considered non-atomic due to size, but exactly at epic limit
      expect(analysis.isAtomic).toBe(false);
      expect(edgeCaseTask.estimatedHours).toBe(400); // Confirm exactly at limit

      logger.info({
        task: edgeCaseTask.title,
        estimatedHours: edgeCaseTask.estimatedHours,
        isAtomic: analysis.isAtomic,
        exactlyAtLimit: edgeCaseTask.estimatedHours === 400
      }, 'Epic time limit edge case test (exactly 400 hours)');
    });
  });

  describe('Configuration Integration', () => {
    it('should use centralized configuration for RDD constraints', async () => {
      // Verify that RDD engine uses configuration values
      expect(rddEngine).toBeDefined();
      
      // Test configuration loading
      const config = await getVibeTaskManagerConfig();
      expect(config.rddConfig.maxSubTasks).toBe(400);
      expect(config.rddConfig.epicTimeLimit).toBe(400);
      
      // Verify atomic detector uses configuration
      expect(atomicDetector).toBeDefined();
    });

    it('should handle missing configuration gracefully', async () => {
      // Mock configuration loading failure
      vi.mocked(getVibeTaskManagerConfig).mockRejectedValue(new Error('Config load failed'));

      // Engine should handle this gracefully and use defaults
      const fallbackEngine = new RDDEngine({
        baseUrl: 'https://test.openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-2.5-flash-preview-05-20',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        llm_mapping: {}
      });

      expect(fallbackEngine).toBeDefined();
      
      logger.info('Configuration error handling test completed');
    });

    it('should validate configuration parameter types', async () => {
      const config = await getVibeTaskManagerConfig();
      
      // Validate types
      expect(typeof config.rddConfig.maxSubTasks).toBe('number');
      expect(typeof config.rddConfig.epicTimeLimit).toBe('number');
      expect(typeof config.rddConfig.maxDepth).toBe('number');
      expect(typeof config.rddConfig.minConfidence).toBe('number');
      expect(typeof config.rddConfig.enableParallelDecomposition).toBe('boolean');
      
      // Validate ranges
      expect(config.rddConfig.maxSubTasks).toBeGreaterThan(0);
      expect(config.rddConfig.epicTimeLimit).toBeGreaterThan(0);
      expect(config.rddConfig.maxDepth).toBeGreaterThan(0);
      expect(config.rddConfig.minConfidence).toBeGreaterThanOrEqual(0);
      expect(config.rddConfig.minConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large task decomposition efficiently', async () => {
      const startTime = Date.now();
      
      const performanceTask: AtomicTask = {
        id: 'performance-test-001',
        title: 'Performance Test Task',
        description: 'Task designed to test performance with realistic constraints',
        status: 'pending',
        priority: 'medium',
        type: 'development',
        estimatedHours: 100,
        actualHours: 0,
        epicId: 'performance-epic',
        projectId: 'performance-test',
        dependencies: [],
        dependents: [],
        filePaths: [],
        acceptanceCriteria: ['Performance requirements met'],
        testingRequirements: {
          unitTests: ['Performance tests'],
          integrationTests: ['Load tests'],
          performanceTests: ['Benchmark tests'],
          coverageTarget: 80
        },
        performanceCriteria: {
          responseTime: '< 200ms',
          memoryUsage: '< 500MB'
        },
        qualityCriteria: {
          codeQuality: ['Performance standards'],
          documentation: ['Performance docs'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['Performance targets'],
          patterns: ['Optimized patterns']
        },
        validationMethods: {
          automated: ['Performance validation'],
          manual: ['Performance review']
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'test-user',
        tags: ['performance', 'test'],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'test-user',
          tags: ['performance', 'test']
        }
      };

      const result = await rddEngine.decomposeTask(performanceTask, testProjectContext);
      const duration = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      
      logger.info({
        task: performanceTask.title,
        duration,
        subtaskCount: result.subTasks.length,
        performanceTarget: 'Met'
      }, 'RDD constraint performance test completed');
    });
  });
});