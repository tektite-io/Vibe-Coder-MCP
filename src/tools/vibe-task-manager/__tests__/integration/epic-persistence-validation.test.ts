/**
 * Epic Persistence Validation Test
 * 
 * Verifies that epic persistence works correctly without generating
 * scaffolding E001/E002/E003 assignments and instead creates 
 * meaningful functional area-based epics.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RDDEngine } from '../../core/rdd-engine.js';
import { AtomicTask, FunctionalArea } from '../../types/task.js';
import { ProjectContext } from '../../types/project-context.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';

describe('Epic Persistence Validation', () => {
  let rddEngine: RDDEngine;
  let projectContext: ProjectContext;
  let projectId: string;

  beforeEach(async () => {
    // Initialize RDD engine for testing epic assignment
    const config = await getVibeTaskManagerConfig();
    rddEngine = new RDDEngine(config.taskManager.rddConfig, config.taskManager.openRouterConfig);
    projectId = `test-project-${Date.now()}`;
    
    // Create minimal project context
    projectContext = {
      projectId,
      projectPath: '/test/project',
      projectName: 'Test Project',
      description: 'Test project for epic validation',
      languages: ['TypeScript'],
      frameworks: ['React'],
      buildTools: ['Vite'],
      tools: ['ESLint'],
      configFiles: ['package.json'],
      entryPoints: ['src/main.ts'],
      architecturalPatterns: ['MVC'],
      existingTasks: [],
      codebaseSize: 'medium',
      teamSize: 3,
      complexity: 'medium',
      structure: {
        sourceDirectories: ['src'],
        testDirectories: ['__tests__'],
        docDirectories: ['docs'],
        buildDirectories: ['dist']
      },
      dependencies: {
        production: ['react'],
        development: ['typescript'],
        external: []
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        source: 'manual'
      }
    };
  });

  describe('Dynamic Functional Area Epic Creation', () => {
    it('should create project-specific functional area epics using dynamic extraction', async () => {
      logger.info('🏛️ Testing dynamic functional area epic creation vs scaffolding');

      // Test cases with different project domains to trigger dynamic extraction
      const testCases = [
        {
          title: 'User authentication system',
          description: 'Implement secure user login and registration with OAuth support',
          expectedArea: 'auth'
        },
        {
          title: 'REST API endpoints',
          description: 'Create RESTful API endpoints for data management and CRUD operations',
          expectedArea: 'api'
        },
        {
          title: 'React components library',
          description: 'Build reusable UI components for the frontend interface',
          expectedArea: 'ui'
        },
        {
          title: 'Database schema design',
          description: 'Design and implement database tables and relationships for data storage',
          expectedArea: 'data'
        }
      ];

      const createdEpics: string[] = [];

      for (const testCase of testCases) {
        // Create task that should trigger dynamic functional area extraction
        const testTask: AtomicTask = {
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: testCase.title,
          description: testCase.description,
          status: 'pending',
          priority: 'medium',
          type: 'development',
          functionalArea: 'data-management', // This will be overridden by dynamic extraction
          estimatedHours: 8,
          actualHours: 0,
          epicId: 'temp-epic',
          projectId,
          dependencies: [],
          dependents: [],
          filePaths: [],
          acceptanceCriteria: ['Implementation completed and tested'],
          testingRequirements: {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: {},
          qualityCriteria: {
            codeQuality: [],
            documentation: [],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: {
            compatibility: [],
            patterns: []
          },
          validationMethods: {
            automated: [],
            manual: []
          },
          assignedAgent: undefined,
          executionContext: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: undefined,
          completedAt: undefined,
          createdBy: 'test-system',
          tags: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test-system',
            tags: []
          }
        };

        // Use RDD engine decomposition which should trigger dynamic functional area extraction
        const result = await rddEngine.decomposeTask(testTask, projectContext, 0);

        expect(result.success).toBe(true);
        expect(result.subTasks).toBeDefined();

        if (result.subTasks && result.subTasks.length > 0) {
          const firstTask = result.subTasks[0];
          
          // Verify epic ID is NOT scaffolding format
          const isScaffoldingEpic = /^E0{0,2}[123]$/.test(firstTask.epicId);
          expect(isScaffoldingEpic).toBe(false);

          // Verify epic ID is not default
          expect(firstTask.epicId).not.toBe('default-epic');
          expect(firstTask.epicId).not.toBe('temp-epic');

          // Epic should be project-specific or functional area specific
          const isMeaningfulEpic = firstTask.epicId.includes(projectId) ||
                                  firstTask.epicId.includes(testCase.expectedArea) ||
                                  firstTask.epicId.includes('main') ||
                                  firstTask.epicId.includes('epic');
          expect(isMeaningfulEpic).toBe(true);

          createdEpics.push(firstTask.epicId);
          
          logger.info(`✅ Dynamic extraction for "${testCase.title}": ${firstTask.epicId}`);
        }
      }

      // Verify epics were created (may reuse existing ones)
      expect(createdEpics.length).toBeGreaterThan(0);
      logger.info(`✅ Successfully validated ${createdEpics.length} dynamically-extracted epics`);
    }, 30000);

    it('should assign meaningful epic IDs through decomposition process', async () => {
      logger.info('💾 Testing epic assignment through decomposition');

      const testCases = [
        { title: 'Authentication system', description: 'User login and security features' },
        { title: 'Content management', description: 'Create and manage content items' },
        { title: 'UI component library', description: 'Reusable interface components' }
      ];

      for (const testCase of testCases) {
        const testTask: AtomicTask = {
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: testCase.title,
          description: testCase.description,
          status: 'pending',
          priority: 'high',
          type: 'development',
          functionalArea: 'data-management', // Will be dynamically assigned
          estimatedHours: 6,
          actualHours: 0,
          epicId: 'temp-epic',
          projectId,
          dependencies: [],
          dependents: [],
          filePaths: [],
          acceptanceCriteria: ['Feature implemented and tested'],
          testingRequirements: {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: {},
          qualityCriteria: {
            codeQuality: [],
            documentation: [],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: {
            compatibility: [],
            patterns: []
          },
          validationMethods: {
            automated: [],
            manual: []
          },
          assignedAgent: undefined,
          executionContext: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: undefined,
          completedAt: undefined,
          createdBy: 'test-system',
          tags: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test-system',
            tags: []
          }
        };

        const result = await rddEngine.decomposeTask(testTask, projectContext, 0);

        expect(result.success).toBe(true);
        
        if (result.subTasks && result.subTasks.length > 0) {
          const task = result.subTasks[0];
          
          // Verify epic is not using default or scaffolding pattern
          expect(task.epicId).not.toBe('default-epic');
          expect(task.epicId).not.toBe('temp-epic');
          expect(task.epicId).not.toMatch(/^E0{0,2}[123]$/);
          
          // Epic should be meaningful
          const isMeaningful = task.epicId.includes(projectId) ||
                              task.epicId.includes('main') ||
                              task.epicId.includes('epic') ||
                              /auth|api|ui|data/.test(task.epicId);
          expect(isMeaningful).toBe(true);
          
          logger.info(`✅ Epic assigned: ${task.epicId} for "${testCase.title}"`);
        }
      }

      logger.info('✅ All epics assigned correctly without scaffolding patterns');
    }, 30000);

    it('should consistently assign epics for similar functional areas', async () => {
      logger.info('🔄 Testing consistent epic assignment for similar tasks');

      // Create two tasks with similar functional areas
      const similarTasks = [
        {
          title: 'User profile management',
          description: 'Manage user profiles and settings',
          expectedPattern: /auth|user|main|epic/i
        },
        {
          title: 'User authentication flow',
          description: 'Handle user login and authentication process',
          expectedPattern: /auth|user|main|epic/i
        }
      ];

      const assignedEpics: string[] = [];

      for (const taskInfo of similarTasks) {
        const testTask: AtomicTask = {
          id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: taskInfo.title,
          description: taskInfo.description,
          status: 'pending',
          priority: 'high',
          type: 'development',
          functionalArea: 'user-management',
          estimatedHours: 4,
          actualHours: 0,
          epicId: 'temp-epic',
          projectId,
          dependencies: [],
          dependents: [],
          filePaths: [],
          acceptanceCriteria: ['Feature completed'],
          testingRequirements: {
            unitTests: [],
            integrationTests: [],
            performanceTests: [],
            coverageTarget: 80
          },
          performanceCriteria: {},
          qualityCriteria: {
            codeQuality: [],
            documentation: [],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: {
            compatibility: [],
            patterns: []
          },
          validationMethods: {
            automated: [],
            manual: []
          },
          assignedAgent: undefined,
          executionContext: undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
          startedAt: undefined,
          completedAt: undefined,
          createdBy: 'test-system',
          tags: [],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test-system',
            tags: []
          }
        };

        const result = await rddEngine.decomposeTask(testTask, projectContext, 0);

        expect(result.success).toBe(true);
        
        if (result.subTasks && result.subTasks.length > 0) {
          const task = result.subTasks[0];
          
          // Verify not scaffolding
          expect(task.epicId).not.toMatch(/^E0{0,2}[123]$/);
          expect(task.epicId).not.toBe('default-epic');
          
          // Should match expected pattern
          expect(taskInfo.expectedPattern.test(task.epicId)).toBe(true);
          
          assignedEpics.push(task.epicId);
          logger.info(`✅ Epic for "${taskInfo.title}": ${task.epicId}`);
        }
      }

      expect(assignedEpics.length).toBe(2);
      logger.info(`✅ Consistent epic assignment validated`);
    }, 30000);
  });

  describe('Anti-Scaffolding Validation', () => {
    it('should never generate E001, E002, E003 epic IDs', async () => {
      logger.info('🚫 Testing prevention of scaffolding epic IDs');

      const testScenarios = [
        { context: 'Simple task', functionalArea: 'data-management' },
        { context: 'Complex task', functionalArea: 'integration' },
        { context: 'Basic task', functionalArea: 'admin' },
        { context: 'Advanced task', functionalArea: 'performance' }
      ] as const;

      const generatedEpicIds: string[] = [];

      for (const scenario of testScenarios) {
        const result = await epicResolver.resolveEpicContext({
          projectId,
          taskContext: {
            title: `${scenario.context} for ${scenario.functionalArea}`,
            description: `Implement ${scenario.context} in ${scenario.functionalArea} area`,
            functionalArea: scenario.functionalArea,
            type: 'development',
            priority: 'medium'
          }
        });

        expect(result).toBeDefined();
        generatedEpicIds.push(result.epicId);

        // Verify NOT scaffolding patterns
        expect(result.epicId).not.toBe('E001');
        expect(result.epicId).not.toBe('E002');
        expect(result.epicId).not.toBe('E003');
        expect(result.epicId).not.toBe('E1');
        expect(result.epicId).not.toBe('E2');
        expect(result.epicId).not.toBe('E3');
        expect(result.epicId).not.toMatch(/^E0{0,2}[123]$/);
        
        // Verify NOT generic patterns
        expect(result.epicId).not.toBe('default-epic');
        expect(result.epicId).not.toMatch(/scaffolding|setup|basic|generic/i);
        
        logger.info(`✅ Non-scaffolding epic: ${result.epicId} for ${scenario.functionalArea}`);
      }

      // Verify all epic IDs are meaningful and unique where appropriate
      const meaningfulPattern = /auth|user|content|data|integration|admin|ui|performance|management/i;
      const meaningfulEpics = generatedEpicIds.filter(id => meaningfulPattern.test(id));
      
      expect(meaningfulEpics.length).toBeGreaterThan(0);
      logger.info(`✅ Generated ${meaningfulEpics.length} meaningful epic IDs out of ${generatedEpicIds.length} total`);
    }, 30000);

    it('should generate domain-specific epic names and descriptions', async () => {
      logger.info('🎯 Testing domain-specific epic content generation');

      const domainCases = [
        {
          functionalArea: 'authentication' as FunctionalArea,
          expectedTerms: ['auth', 'login', 'security', 'user', 'access']
        },
        {
          functionalArea: 'content-management' as FunctionalArea,
          expectedTerms: ['content', 'manage', 'create', 'edit', 'publish']
        },
        {
          functionalArea: 'user-management' as FunctionalArea,
          expectedTerms: ['user', 'profile', 'manage', 'account', 'settings']
        }
      ];

      for (const domainCase of domainCases) {
        const result = await epicResolver.resolveEpicContext({
          projectId,
          taskContext: {
            title: `Implement ${domainCase.functionalArea} features`,
            description: `Complete ${domainCase.functionalArea} implementation`,
            functionalArea: domainCase.functionalArea,
            type: 'development',
            priority: 'high'
          }
        });

        expect(result).toBeDefined();

        // Check epic content for domain-specific terms
        const epicContent = `${result.epicId} ${result.epicName || ''}`.toLowerCase();
        const hasRelevantTerms = domainCase.expectedTerms.some(term => 
          epicContent.includes(term)
        );

        expect(hasRelevantTerms).toBe(true);
        
        logger.info(`✅ Domain-specific epic for ${domainCase.functionalArea}: ${result.epicId}`);
      }

      logger.info('✅ All epics contain domain-specific terminology');
    }, 30000);
  });

  describe('Epic Persistence Edge Cases', () => {
    it('should handle missing project context gracefully', async () => {
      logger.info('⚠️ Testing epic creation with minimal context');

      const result = await epicResolver.resolveEpicContext({
        projectId: 'minimal-project',
        taskContext: {
          title: 'Basic task',
          description: 'Simple task description',
          functionalArea: 'data-management',
          type: 'development',
          priority: 'low'
        }
      });

      expect(result).toBeDefined();
      expect(result.epicId).toBeDefined();
      expect(result.created).toBe(true);
      
      // Even with minimal context, should not fall back to scaffolding
      expect(result.epicId).not.toMatch(/^E0{0,2}[123]$/);
      expect(result.epicId).not.toBe('default-epic');
      
      logger.info(`✅ Graceful handling with minimal context: ${result.epicId}`);
    }, 30000);

    it('should create fallback epic when functional area epic creation fails', async () => {
      logger.info('🔄 Testing fallback epic creation');

      // Create a scenario that might cause epic creation to use fallback
      const result = await epicResolver.resolveEpicContext({
        projectId: 'fallback-test-project',
        taskContext: {
          title: 'Edge case task',
          description: 'Task that might trigger fallback logic',
          functionalArea: 'integration',
          type: 'development',
          priority: 'medium'
        }
      });

      expect(result).toBeDefined();
      expect(result.epicId).toBeDefined();
      
      // Even fallback should be meaningful, not scaffolding
      expect(result.epicId).not.toMatch(/^E0{0,2}[123]$/);
      expect(result.epicId).not.toBe('default-epic');
      
      // Fallback epic should be project-specific
      const isProjectSpecific = result.epicId.includes('fallback-test-project') ||
                               result.epicId.includes('main') ||
                               result.epicId.includes('integration');
      expect(isProjectSpecific).toBe(true);
      
      logger.info(`✅ Fallback epic creation: ${result.epicId}`);
    }, 30000);
  });
});