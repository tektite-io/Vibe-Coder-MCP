import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { createMockConfig } from '../utils/test-setup.js';
import { mockOpenRouterResponse } from '../../../../testUtils/mockLLM.js';
import type { AtomicTask, ProjectContext } from '../../types.js';

describe('Decomposition Performance Validation', () => {
  let decompositionService: DecompositionService;
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = createMockConfig();
    decompositionService = new DecompositionService(mockConfig);
  });

  it('should complete decomposition within 200ms performance target', async () => {
    // Mock LLM response for fast execution
    mockOpenRouterResponse({
      responseContent: {
        tasks: [
          {
            title: 'Setup database schema',
            description: 'Design and implement database schema',
            acceptanceCriteria: ['Database schema defined', 'Tables created'],
            priority: 'high',
            status: 'pending',
            type: 'development',
            estimatedHours: 4
          },
          {
            title: 'Create API endpoints',
            description: 'Implement REST API endpoints',
            acceptanceCriteria: ['All endpoints implemented', 'Tests passing'],
            priority: 'high',
            status: 'pending',
            type: 'development',
            estimatedHours: 6
          }
        ]
      }
    });

    const task: AtomicTask = {
      id: 'perf-test-task',
      title: 'Build user authentication',
      description: 'Implement complete user authentication system',
      acceptanceCriteria: ['User can register', 'User can login', 'JWT tokens implemented'],
      priority: 'high',
      status: 'pending',
      type: 'development',
      estimatedHours: 8,
      projectId: 'perf-test-project',
      epicId: 'E001',
      dependencies: []
    };

    const projectContext: ProjectContext = {
      projectId: 'perf-test-project',
      core: {
        name: 'Test Project',
        type: 'web',
        domain: 'e-commerce',
        description: 'Test project for performance validation'
      },
      technical: {
        primaryLanguage: 'typescript',
        languages: ['typescript', 'javascript'],
        frameworks: ['react', 'express'],
        developmentTools: ['vscode', 'npm']
      },
      context: {
        businessContext: 'Test business context',
        targetAudience: 'Developers',
        successCriteria: ['Fast performance', 'Reliable']
      },
      structure: {
        suggestedStructure: [],
        keyFiles: []
      },
      metadata: {
        createdAt: new Date(),
        lastUpdated: new Date(),
        version: '1.0.0'
      }
    };

    // Measure decomposition time
    const startTime = Date.now();
    const result = await decompositionService.decomposeTask(task, projectContext);
    const endTime = Date.now();
    const duration = endTime - startTime;

    // Verify performance target
    expect(duration).toBeLessThan(200); // <200ms target
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.length).toBeGreaterThan(0);
  });

});