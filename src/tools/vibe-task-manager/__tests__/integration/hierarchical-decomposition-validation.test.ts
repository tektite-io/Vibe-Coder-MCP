/**
 * Hierarchical Decomposition Integration Test
 * 
 * Tests end-to-end hierarchical decomposition with Educational Gaming Platform example
 * to validate that the system produces meaningful feature epics instead of scaffolding.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RDDEngine } from '../../core/rdd-engine.js';
import { ProjectContext } from '../../types/project-context.js';
import { AtomicTask, FunctionalArea } from '../../types/task.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import logger from '../../../../logger.js';

describe('Hierarchical Decomposition Integration', () => {
  let rddEngine: RDDEngine;
  let projectContext: ProjectContext;
  let educationalGamingTask: AtomicTask;

  beforeEach(async () => {
    // Initialize RDD Engine with test configuration
    const config = await getVibeTaskManagerConfig();
    rddEngine = new RDDEngine(config.taskManager.rddConfig, config.taskManager.openRouterConfig);

    // Create realistic complex project context for decomposition testing
    projectContext = {
      projectId: 'complex-platform',
      projectPath: '/test/projects/complex-platform',
      projectName: 'Complex Application Platform',
      description: 'Multi-feature application platform with adaptive systems and progress tracking',
      languages: ['TypeScript', 'React', 'Node.js'],
      frameworks: ['React', 'Express', 'Socket.io', 'PostgreSQL'],
      buildTools: ['Vite', 'ESLint', 'Prettier'],
      tools: ['Docker', 'Redis', 'AWS'],
      configFiles: ['package.json', 'tsconfig.json', 'vite.config.ts', 'docker-compose.yml'],
      entryPoints: ['src/main.tsx', 'server/index.ts'],
      architecturalPatterns: ['MVC', 'Event-Driven', 'Microservices'],
      existingTasks: [],
      codebaseSize: 'large',
      teamSize: 8,
      complexity: 'high',
      structure: {
        sourceDirectories: ['src', 'server', 'shared'],
        testDirectories: ['__tests__', 'e2e'],
        docDirectories: ['docs'],
        buildDirectories: ['dist', 'build']
      },
      dependencies: {
        production: ['react', 'express', 'socket.io', 'pg', 'redis'],
        development: ['typescript', 'vitest', 'eslint', 'prettier'],
        external: ['aws-sdk', 'stripe', 'sendgrid']
      },
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        version: '1.0.0',
        source: 'manual'
      }
    };

    // Create complex task for platform development
    educationalGamingTask = {
      id: 'task-complex-platform-2025',
      title: 'Build Complex Application Platform with Adaptive Features',
      description: 'Develop a comprehensive application platform that includes user management, adaptive algorithms, real-time features, progress tracking, analytics dashboard, content management, and integration with external systems.',
      status: 'pending',
      priority: 'high',
      type: 'development',
      functionalArea: 'content-management',
      estimatedHours: 400,
      actualHours: 0,
      epicId: 'default-epic',
      projectId: projectContext.projectId,
      dependencies: [],
      dependents: [],
      filePaths: [],
      acceptanceCriteria: [
        'Platform supports multiple user types (students, teachers, admins)',
        'Adaptive learning algorithms adjust difficulty based on performance',
        'Real-time multiplayer gaming functionality',
        'Comprehensive analytics and progress tracking',
        'Content management system for educational materials',
        'Integration with external learning management systems'
      ],
      testingRequirements: {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 90
      },
      performanceCriteria: {
        responseTime: '<200ms API responses',
        memoryUsage: '<500MB per user session',
        throughput: '1000+ concurrent users'
      },
      qualityCriteria: {
        codeQuality: ['TypeScript strict mode', 'ESLint compliance'],
        documentation: ['API documentation', 'User guides'],
        typeScript: true,
        eslint: true
      },
      integrationCriteria: {
        compatibility: ['Modern browsers', 'Mobile devices'],
        patterns: ['REST API', 'WebSocket', 'OAuth 2.0']
      },
      validationMethods: {
        automated: ['Unit tests', 'Integration tests', 'E2E tests'],
        manual: ['User acceptance testing', 'Performance testing']
      },
      assignedAgent: undefined,
      executionContext: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: undefined,
      completedAt: undefined,
      createdBy: 'integration-test',
      tags: ['platform', 'adaptive', 'real-time', 'analytics'],
      metadata: {
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'integration-test',
        tags: ['platform', 'adaptive', 'real-time', 'analytics']
      }
    };
  });

  afterEach(() => {
    // Cleanup any test state
  });

  describe('Epic-First Decomposition Strategy', () => {
    it('should generate meaningful functional area epics instead of scaffolding', async () => {
      logger.info('🎯 Testing epic-first decomposition for complex platform');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      // Validate successful decomposition
      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();
      expect(result.subTasks!.length).toBeGreaterThan(5); // Should generate multiple meaningful tasks

      // Validate functional area diversity (should span multiple functional areas)
      const functionalAreas = new Set(result.subTasks!.map(task => task.functionalArea));
      expect(functionalAreas.size).toBeGreaterThan(3); // Should span at least 4 different functional areas

      // Expected functional areas validation for complex project decomposition

      // Validate that we have tasks in logical functional areas
      const actualAreas = Array.from(functionalAreas);
      const hasAuthenticationTasks = actualAreas.includes('authentication');
      const hasUserManagementTasks = actualAreas.includes('user-management');
      const hasContentManagementTasks = actualAreas.includes('content-management');

      expect(hasAuthenticationTasks || hasUserManagementTasks).toBe(true);
      expect(hasContentManagementTasks).toBe(true);

      // Validate tasks are not generic scaffolding
      const taskTitles = result.subTasks!.map(task => task.title.toLowerCase());
      const isScaffolding = taskTitles.some(title => 
        title.includes('setup project structure') ||
        title.includes('initialize git repository') ||
        title.includes('create package.json') ||
        title.includes('setup basic directories')
      );

      expect(isScaffolding).toBe(false); // Should NOT be scaffolding tasks

      // Validate tasks are feature-focused
      const hasFeatureTasks = taskTitles.some(title =>
        title.includes('user') ||
        title.includes('game') ||
        title.includes('learning') ||
        title.includes('authentication') ||
        title.includes('content') ||
        title.includes('analytics') ||
        title.includes('dashboard')
      );

      expect(hasFeatureTasks).toBe(true); // Should have feature-focused tasks

      logger.info(`✅ Generated ${result.subTasks!.length} tasks across ${functionalAreas.size} functional areas`);
      logger.info(`📋 Functional areas: ${Array.from(functionalAreas).join(', ')}`);
      
      // Log sample tasks for validation
      const sampleTasks = result.subTasks!.slice(0, 3).map(task => ({
        title: task.title,
        functionalArea: task.functionalArea,
        type: task.type,
        estimatedHours: task.estimatedHours
      }));
      logger.info('📝 Sample generated tasks:', sampleTasks);
    }, 30000); // 30 second timeout for complex decomposition

    it('should maintain atomic task constraints within epics', async () => {
      logger.info('⚛️ Testing atomic task constraints in epic decomposition');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Validate all tasks meet atomic constraints
      for (const task of result.subTasks!) {
        // Atomic time constraint (5-10 minutes = 0.08-0.17 hours)
        expect(task.estimatedHours).toBeGreaterThanOrEqual(0.08);
        expect(task.estimatedHours).toBeLessThanOrEqual(0.17);

        // Single acceptance criterion
        expect(task.acceptanceCriteria).toBeDefined();
        expect(task.acceptanceCriteria.length).toBe(1);

        // Required properties
        expect(task.functionalArea).toBeDefined();
        expect(task.title).toBeDefined();
        expect(task.description).toBeDefined();
        expect(task.type).toBeDefined();

        // Validate titles don't contain compound operators
        const hasCompoundOperators = /\b(and|or|then)\b/i.test(task.title);
        expect(hasCompoundOperators).toBe(false);
      }

      logger.info(`✅ All ${result.subTasks!.length} tasks meet atomic constraints`);
    }, 30000);

    it('should generate epic context with meaningful groupings', async () => {
      logger.info('🏛️ Testing epic context generation and grouping');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Group tasks by functional area to validate epic coherence
      const tasksByArea = result.subTasks!.reduce((groups, task) => {
        if (!groups[task.functionalArea]) {
          groups[task.functionalArea] = [];
        }
        groups[task.functionalArea].push(task);
        return groups;
      }, {} as Record<FunctionalArea, AtomicTask[]>);

      // Validate epic groupings make sense
      for (const [functionalArea, tasks] of Object.entries(tasksByArea)) {
        expect(tasks.length).toBeGreaterThan(0);

        // Tasks within the same functional area should be cohesive
        switch (functionalArea as FunctionalArea) {
          case 'authentication': {
            const authTasks = tasks.map(t => t.title.toLowerCase());
            const hasAuthFeatures = authTasks.some(title =>
              title.includes('login') ||
              title.includes('auth') ||
              title.includes('user') ||
              title.includes('security')
            );
            expect(hasAuthFeatures).toBe(true);
            break;
          }

          case 'content-management': {
            const contentTasks = tasks.map(t => t.title.toLowerCase());
            const hasContentFeatures = contentTasks.some(title =>
              title.includes('content') ||
              title.includes('material') ||
              title.includes('curriculum') ||
              title.includes('lesson')
            );
            expect(hasContentFeatures).toBe(true);
            break;
          }

          case 'user-management': {
            const userTasks = tasks.map(t => t.title.toLowerCase());
            const hasUserFeatures = userTasks.some(title =>
              title.includes('user') ||
              title.includes('profile') ||
              title.includes('student') ||
              title.includes('teacher')
            );
            expect(hasUserFeatures).toBe(true);
            break;
          }
        }
      }

      logger.info('📊 Epic groupings by functional area:', 
        Object.entries(tasksByArea).map(([area, tasks]) => `${area}: ${tasks.length} tasks`)
      );
    }, 30000);
  });

  describe('Hierarchical Structure Validation', () => {
    it('should demonstrate clear project → epic → task hierarchy', async () => {
      logger.info('📋 Testing hierarchical project structure');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Validate project-level coherence
      expect(result.originalTask.projectId).toBe(projectContext.projectId);

      // Validate epic-level grouping (functional areas act as epic boundaries)
      const functionalAreas = new Set(result.subTasks!.map(task => task.functionalArea));
      
      // Each functional area represents an epic with cohesive functionality
      for (const area of functionalAreas) {
        const areasTasks = result.subTasks!.filter(task => task.functionalArea === area);
        
        // Epic should have multiple related tasks
        expect(areasTasks.length).toBeGreaterThan(0);
        
        // All tasks in epic should have same project ID
        areasTasks.forEach(task => {
          expect(task.projectId).toBe(projectContext.projectId);
          expect(task.functionalArea).toBe(area);
        });
      }

      // Validate task-level atomicity (already tested above)
      logger.info(`✅ Hierarchical structure validated: 1 project → ${functionalAreas.size} epics → ${result.subTasks!.length} atomic tasks`);
    }, 30000);

    it('should avoid generating default scaffolding epics (E001, E002, E003)', async () => {
      logger.info('🚫 Testing prevention of scaffolding epic assignments');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Validate no scaffolding epic IDs
      const scaffoldingEpicIds = result.subTasks!.filter(task => 
        task.epicId.match(/^E0{0,2}[123]$/) || // E001, E002, E003, E1, E2, E3
        task.epicId.includes('scaffolding') ||
        task.epicId.includes('setup') ||
        task.epicId === 'default-epic'
      );

      expect(scaffoldingEpicIds.length).toBe(0); // Should be zero scaffolding epics

      // Validate epic IDs are functional area based
      const functionalAreaEpics = result.subTasks!.filter(task =>
        task.epicId.includes('authentication') ||
        task.epicId.includes('user-management') ||
        task.epicId.includes('content-management') ||
        task.epicId.includes('data-management') ||
        task.epicId.includes('integration') ||
        task.epicId.includes('admin') ||
        task.epicId.includes('ui-components') ||
        task.epicId.includes('performance')
      );

      expect(functionalAreaEpics.length).toBeGreaterThan(0); // Should have functional area based epics

      logger.info('✅ No scaffolding epics found, all epics are feature-based');
      
      // Log epic distribution
      const epicDistribution = result.subTasks!.reduce((dist, task) => {
        dist[task.epicId] = (dist[task.epicId] || 0) + 1;
        return dist;
      }, {} as Record<string, number>);
      
      logger.info('📊 Epic distribution:', epicDistribution);
    }, 30000);
  });

  describe('Complex Platform Domain Validation', () => {
    it('should generate domain-appropriate epics for complex platforms', async () => {
      logger.info('🎮 Testing domain-specific epic generation for complex platforms');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Collect all task titles and descriptions for analysis
      const allTaskContent = result.subTasks!.map(task => 
        `${task.title} ${task.description}`.toLowerCase()
      ).join(' ');

      // Validate application domain concepts
      const hasApplicationConcepts = [
        'feature', 'system', 'component', 'module', 'service',
        'progress', 'application', 'workflow', 'process', 'data'
      ].some(concept => allTaskContent.includes(concept));

      expect(hasApplicationConcepts).toBe(true);

      // Validate interactive domain concepts
      const hasInteractiveConcepts = [
        'interactive', 'user', 'interface', 'real-time', 'feature', 'adaptive',
        'tracking', 'monitoring', 'notification', 'responsive'
      ].some(concept => allTaskContent.includes(concept));

      expect(hasInteractiveConcepts).toBe(true);

      // Validate platform/technical concepts
      const hasPlatformConcepts = [
        'user', 'authentication', 'dashboard', 'analytics', 'api',
        'database', 'integration', 'admin', 'management'
      ].some(concept => allTaskContent.includes(concept));

      expect(hasPlatformConcepts).toBe(true);

      logger.info('✅ Domain-appropriate concepts found in generated tasks');
    }, 30000);

    it('should generate realistic task complexity for complex platform features', async () => {
      logger.info('⚖️ Testing realistic task complexity distribution');

      const result = await rddEngine.decomposeTaskWithEpics(
        educationalGamingTask,
        projectContext,
        0
      );

      expect(result.success).toBe(true);
      expect(result.subTasks).toBeDefined();

      // Analyze complexity distribution
      const complexityStats = {
        simpleTasksCount: 0,
        moderateTasksCount: 0,
        complexTasksCount: 0,
        totalEstimatedHours: 0
      };

      result.subTasks!.forEach(task => {
        complexityStats.totalEstimatedHours += task.estimatedHours;
        
        if (task.estimatedHours <= 0.1) {
          complexityStats.simpleTasksCount++;
        } else if (task.estimatedHours <= 0.15) {
          complexityStats.moderateTasksCount++;
        } else {
          complexityStats.complexTasksCount++;
        }
      });

      // Validate reasonable complexity distribution
      expect(complexityStats.simpleTasksCount).toBeGreaterThan(0);
      expect(complexityStats.moderateTasksCount + complexityStats.complexTasksCount).toBeGreaterThan(0);

      // Validate total estimated time is reasonable for number of tasks
      const averageTaskTime = complexityStats.totalEstimatedHours / result.subTasks!.length;
      expect(averageTaskTime).toBeGreaterThanOrEqual(0.08); // At least 5 minutes
      expect(averageTaskTime).toBeLessThanOrEqual(0.17); // At most 10 minutes

      logger.info('📊 Task complexity distribution:', {
        simple: complexityStats.simpleTasksCount,
        moderate: complexityStats.moderateTasksCount,
        complex: complexityStats.complexTasksCount,
        averageHours: averageTaskTime,
        totalTasks: result.subTasks!.length
      });
    }, 30000);
  });
});