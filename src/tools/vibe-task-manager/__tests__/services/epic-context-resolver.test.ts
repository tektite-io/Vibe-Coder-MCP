import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EpicContextResolver, EpicCreationParams } from '../../services/epic-context-resolver.js';
import { TaskPriority } from '../../types/task.js';
import { 
  createMockStorageManager, 
  createMockProjectOperations, 
  createMockEpicService, 
  createMockIdGenerator,
  createMockOpenRouterConfig
} from '../utils/mock-factories.js';
import type { StorageManager } from '../../core/storage/storage-manager.js';
import type { ProjectOperations } from '../../core/operations/project-operations.js';
import type { EpicService } from '../../services/epic-service.js';
import type { IdGenerator } from '../../utils/id-generator.js';

// Mock dependencies
vi.mock('../../core/storage/storage-manager.js');
vi.mock('../../core/operations/project-operations.js');
vi.mock('../../services/epic-service.js');
vi.mock('../../utils/id-generator.js');
vi.mock('../../../logger.js');

describe('EpicContextResolver', () => {
  let resolver: EpicContextResolver;
  let mockStorageManager: StorageManager;
  let mockProjectOperations: ProjectOperations;
  let mockEpicService: EpicService;
  let mockIdGenerator: IdGenerator;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Create mocks using the factory functions
    mockStorageManager = createMockStorageManager();
    mockProjectOperations = createMockProjectOperations();
    mockEpicService = createMockEpicService();
    mockIdGenerator = createMockIdGenerator();

    // Setup the mocked modules to return our mock objects
    const { getStorageManager } = await import('../../core/storage/storage-manager.js');
    const { getProjectOperations } = await import('../../core/operations/project-operations.js');
    const { getEpicService } = await import('../../services/epic-service.js');
    const { getIdGenerator } = await import('../../utils/id-generator.js');

    vi.mocked(getStorageManager).mockResolvedValue(mockStorageManager);
    vi.mocked(getProjectOperations).mockReturnValue(mockProjectOperations);
    vi.mocked(getEpicService).mockReturnValue(mockEpicService);
    vi.mocked(getIdGenerator).mockReturnValue(mockIdGenerator);

    // Get fresh instance
    resolver = EpicContextResolver.getInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = EpicContextResolver.getInstance();
      const instance2 = EpicContextResolver.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('extractFunctionalArea', () => {
    it('should extract functional area from task tags', async () => {
      const taskContext = {
        title: 'Create login form',
        description: 'Build user authentication form',
        type: 'development' as const,
        tags: ['auth', 'frontend']
      };

      const result = await resolver.extractFunctionalArea(taskContext);
      expect(result).toBe('authentication');
    });

    it('should extract functional area from task title', async () => {
      const taskContext = {
        title: 'Implement video streaming player',
        description: 'Create video player component',
        type: 'development' as const,
        tags: []
      };

      const result = await resolver.extractFunctionalArea(taskContext);
      expect(result).toBe('ui-components');
    });

    it('should extract functional area from task description', async () => {
      const taskContext = {
        title: 'Create component',
        description: 'Build API endpoint for user management',
        type: 'development' as const,
        tags: []
      };

      const result = await resolver.extractFunctionalArea(taskContext);
      // 'ui-components' is detected because 'component' appears in the title
      expect(result).toBe('ui-components');
    });

    it('should return null when no functional area detected', async () => {
      const taskContext = {
        title: 'Random task',
        description: 'Some random work',
        type: 'development' as const,
        tags: []
      };

      const result = await resolver.extractFunctionalArea(taskContext);
      expect(result).toBeNull();
    });

    it('should return null when no task context provided', async () => {
      const result = await resolver.extractFunctionalArea(undefined);
      expect(result).toBeNull();
    });

    it('should prioritize tags over text content', async () => {
      const taskContext = {
        title: 'Create video player with authentication',
        description: 'Build video streaming with auth',
        type: 'development' as const,
        tags: ['content'] // content tag should take priority over auth/video in text
      };

      const result = await resolver.extractFunctionalArea(taskContext);
      expect(result).toBe('content-management');
    });
  });

  describe('resolveEpicContext', () => {
    const mockParams: EpicCreationParams = {
      projectId: 'test-project',
      functionalArea: 'auth',
      taskContext: {
        title: 'User authentication',
        description: 'Implement user login',
        type: 'development',
        tags: ['auth']
      },
      priority: 'high' as TaskPriority,
      estimatedHours: 8
    };

    it('should return existing epic when found', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: ['test-project-auth-epic'],
        name: 'Test Project'
      };

      const mockExistingEpic = {
        id: 'test-project-auth-epic',
        title: 'Auth Epic',
        metadata: { tags: ['auth'] }
      };

      vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
        success: true,
        data: mockExistingEpic
      });

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'test-project-auth-epic',
        epicName: 'Auth Epic',
        source: 'existing',
        confidence: 0.9,
        created: false
      });
    });

    it('should create functional area epic when none exists', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: [],
        name: 'Test Project'
      };

      vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      const mockCreatedEpic = {
        id: 'E002',
        title: 'Auth Epic',
        description: 'Epic for auth related tasks and features'
      };

      vi.mocked(mockEpicService.createEpic).mockResolvedValue({
        success: true,
        data: mockCreatedEpic
      });

      // Mock storage manager for updateProjectEpicAssociation
      vi.mocked(mockStorageManager.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      vi.mocked(mockStorageManager.updateProject).mockResolvedValue({
        success: true
      });

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'E002',
        epicName: 'Auth Epic',
        source: 'created',
        confidence: 0.8,
        created: true
      });

      expect(mockEpicService.createEpic).toHaveBeenCalledWith({
        title: 'Auth Epic',
        description: 'Epic for auth related tasks and features',
        projectId: 'test-project',
        priority: 'high',
        estimatedHours: 8,
        tags: ['auth', 'auto-created']
      }, 'epic-context-resolver');
    });

    it('should create main epic as fallback', async () => {
      const paramsWithoutFunctionalArea = {
        ...mockParams,
        functionalArea: undefined,
        taskContext: {
          title: 'Random task',
          description: 'Some work',
          type: 'development' as const,
          tags: []
        }
      };

      const mockProject = {
        id: 'test-project',
        epicIds: [],
        name: 'Test Project'
      };

      vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      const mockCreatedEpic = {
        id: 'E002',
        title: 'Main Epic',
        description: 'Main epic for project tasks and features'
      };

      vi.mocked(mockEpicService.createEpic).mockResolvedValue({
        success: true,
        data: mockCreatedEpic
      });

      // Mock storage manager for updateProjectEpicAssociation
      vi.mocked(mockStorageManager.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      vi.mocked(mockStorageManager.updateProject).mockResolvedValue({
        success: true
      });

      const result = await resolver.resolveEpicContext(paramsWithoutFunctionalArea);

      expect(result).toEqual({
        epicId: 'E002',
        epicName: 'Main Epic',
        source: 'created',
        confidence: 0.6,
        created: true
      });
    });

    it('should return fallback epic on error', async () => {
      // Make all operations fail to force fallback
      vi.mocked(mockProjectOperations.getProject).mockRejectedValue(new Error('Database error'));
      vi.mocked(mockEpicService.createEpic).mockRejectedValue(new Error('Epic service error'));

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'test-project-main-epic',
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.1,
        created: false
      });
    });

    it('should handle epic creation failure gracefully', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: [],
        name: 'Test Project'
      };

      vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      // Mock storage manager for the fallback epic creation attempt
      vi.mocked(mockStorageManager.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      vi.mocked(mockEpicService.createEpic).mockResolvedValue({
        success: false,
        error: 'Epic creation failed'
      });

      const result = await resolver.resolveEpicContext(mockParams);

      expect(result).toEqual({
        epicId: 'test-project-main-epic',
        epicName: 'Main Epic',
        source: 'fallback',
        confidence: 0.1,
        created: false
      });
    });

    it('should update project epic association when creating epic', async () => {
      const mockProject = {
        id: 'test-project',
        epicIds: ['existing-epic'],
        name: 'Test Project',
        metadata: { updatedAt: new Date() }
      };

      vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
        success: true,
        data: mockProject
      });

      // Mock storage manager to return no match for existing epic
      vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
        success: true,
        data: {
          id: 'existing-epic',
          title: 'Existing Epic',
          metadata: { tags: ['other'] } // Different tag so it won't match 'auth'
        }
      });

      // Mock storage manager for project operations in updateProjectEpicAssociation
      vi.mocked(mockStorageManager.getProject).mockResolvedValue({
        success: true,
        data: {
          ...mockProject,
          epicIds: ['existing-epic'], // Will be modified by the method
          metadata: { updatedAt: new Date() }
        }
      });

      vi.mocked(mockStorageManager.updateProject).mockResolvedValue({
        success: true
      });

      const mockCreatedEpic = {
        id: 'E003',
        title: 'Auth Epic'
      };

      vi.mocked(mockEpicService.createEpic).mockResolvedValue({
        success: true,
        data: mockCreatedEpic
      });

      await resolver.resolveEpicContext(mockParams);

      // Check that storage manager was called to update the project
      expect(mockStorageManager.updateProject).toHaveBeenCalled();
    });
  });

  describe('functional area detection patterns', () => {
    const testCases = [
      { input: 'auth login register', expected: 'authentication' },
      { input: 'video stream media player', expected: 'content-management' },
      { input: 'api endpoint route controller', expected: 'backend' },
      { input: 'documentation readme guide', expected: 'content-management' },
      { input: 'ui component frontend interface', expected: 'ui-components' },
      { input: 'database db model schema', expected: 'database' },
      { input: 'test testing spec unit', expected: null },
      { input: 'config configuration setup', expected: 'admin' },
      { input: 'security permission access', expected: 'user-management' },
      { input: 'multilingual language locale', expected: null },
      { input: 'a11y wcag screen reader', expected: null },
      { input: 'interactive feature engagement', expected: null }
    ];

    testCases.forEach(({ input, expected }) => {
      it(`should detect ${expected} functional area from "${input}"`, async () => {
        const taskContext = {
          title: input,
          description: '',
          type: 'development' as const,
          tags: []
        };

        const result = await resolver.extractFunctionalArea(taskContext);
        expect(result).toBe(expected);
      });
    });
  });

  describe('bidirectional relationship management', () => {
    let mockTask: Record<string, unknown>;
    let mockEpic: Record<string, unknown>;
    let mockToEpic: Record<string, unknown>;

    beforeEach(() => {
      mockTask = {
        id: 'task-001',
        title: 'Test Task',
        epicId: 'epic-001',
        status: 'pending',
        metadata: { updatedAt: new Date() }
      };

      mockEpic = {
        id: 'epic-001',
        title: 'Source Epic',
        taskIds: ['task-001'],
        metadata: { updatedAt: new Date() }
      };

      mockToEpic = {
        id: 'epic-002',
        title: 'Destination Epic',
        taskIds: [],
        metadata: { updatedAt: new Date() }
      };
    });

    describe('addTaskToEpic', () => {
      it('should successfully add task to epic with bidirectional relationships', async () => {
        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: true,
          data: mockTask
        });

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: mockEpic
        });

        vi.mocked(mockStorageManager.updateTask).mockResolvedValue({
          success: true,
          data: { ...mockTask, epicId: 'epic-001' }
        });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true,
          data: { ...mockEpic, taskIds: ['task-001'] }
        });

        const result = await resolver.addTaskToEpic('task-001', 'epic-001', 'test-project');

        expect(result.success).toBe(true);
        expect(result.epicId).toBe('epic-001');
        expect(result.taskId).toBe('task-001');
        expect(result.relationshipType).toBe('added');
        expect(result.metadata.epicProgress).toBeDefined();
        expect(result.metadata.taskCount).toBeDefined();
        expect(result.metadata.completedTaskCount).toBeDefined();

        // Verify task was updated
        expect(mockStorageManager.updateTask).toHaveBeenCalledWith('task-001', expect.objectContaining({
          epicId: 'epic-001'
        }));

        // Verify epic was updated
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          taskIds: expect.arrayContaining(['task-001'])
        }));
      });

      it('should handle task or epic not found', async () => {
        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: false,
          error: 'Task not found'
        });

        const result = await resolver.addTaskToEpic('invalid-task', 'epic-001', 'test-project');

        expect(result.success).toBe(false);
        expect(result.epicId).toBe('epic-001');
        expect(result.taskId).toBe('invalid-task');
        expect(result.relationshipType).toBe('added');
      });

      it('should prevent duplicate task additions', async () => {
        const epicWithTask = {
          ...mockEpic,
          taskIds: ['task-001'] // Task already exists
        };

        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: true,
          data: mockTask
        });

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithTask
        });

        vi.mocked(mockStorageManager.updateTask).mockResolvedValue({
          success: true,
          data: mockTask
        });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true,
          data: epicWithTask
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.addTaskToEpic('task-001', 'epic-001', 'test-project');

        expect(result.success).toBe(true);
        // Should not duplicate the task in taskIds
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          taskIds: ['task-001'] // Should still be just one instance
        }));
      });
    });

    describe('moveTaskBetweenEpics', () => {
      it('should successfully move task between epics', async () => {
        const fromEpic = {
          ...mockEpic,
          taskIds: ['task-001']
        };

        const toEpic = {
          ...mockToEpic,
          taskIds: []
        };

        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: true,
          data: mockTask
        });

        vi.mocked(mockStorageManager.getEpic)
          .mockResolvedValueOnce({ success: true, data: fromEpic })
          .mockResolvedValueOnce({ success: true, data: toEpic });

        vi.mocked(mockStorageManager.updateTask).mockResolvedValue({
          success: true,
          data: { ...mockTask, epicId: 'epic-002' }
        });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.moveTaskBetweenEpics('task-001', 'epic-001', 'epic-002', 'test-project');

        expect(result.success).toBe(true);
        expect(result.epicId).toBe('epic-002');
        expect(result.taskId).toBe('task-001');
        expect(result.relationshipType).toBe('moved');
        expect(result.previousEpicId).toBe('epic-001');

        // Verify task epic was updated
        expect(mockStorageManager.updateTask).toHaveBeenCalledWith('task-001', expect.objectContaining({
          epicId: 'epic-002'
        }));

        // Verify both epics were updated
        expect(mockStorageManager.updateEpic).toHaveBeenCalledTimes(2);
      });

      it('should handle missing task gracefully', async () => {
        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: false,
          error: 'Task not found'
        });

        const result = await resolver.moveTaskBetweenEpics('invalid-task', 'epic-001', 'epic-002', 'test-project');

        expect(result.success).toBe(false);
        expect(result.epicId).toBe('epic-002');
        expect(result.taskId).toBe('invalid-task');
        expect(result.relationshipType).toBe('moved');
        expect(result.previousEpicId).toBe('epic-001');
      });

      it('should handle missing source epic gracefully', async () => {
        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: true,
          data: mockTask
        });

        vi.mocked(mockStorageManager.getEpic)
          .mockResolvedValueOnce({ success: false, error: 'Epic not found' })
          .mockResolvedValueOnce({ success: true, data: mockToEpic });

        vi.mocked(mockStorageManager.updateTask).mockResolvedValue({
          success: true,
          data: { ...mockTask, epicId: 'epic-002' }
        });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.moveTaskBetweenEpics('task-001', 'epic-001', 'epic-002', 'test-project');

        expect(result.success).toBe(true);
        // Should still work even if source epic doesn't exist
        expect(result.epicId).toBe('epic-002');
      });
    });

    describe('calculateEpicProgress', () => {
      it('should calculate comprehensive epic progress metrics', async () => {
        const epicWithTasks = {
          ...mockEpic,
          taskIds: ['task-001', 'task-002', 'task-003']
        };

        const mockTasks = [
          { id: 'task-001', status: 'completed', estimatedHours: 8, filePaths: ['file1.ts'] },
          { id: 'task-002', status: 'in_progress', estimatedHours: 6, filePaths: ['file2.ts'] },
          { id: 'task-003', status: 'blocked', estimatedHours: 4, filePaths: ['file1.ts'] }
        ];

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithTasks
        });

        vi.mocked(mockStorageManager.getTask)
          .mockResolvedValueOnce({ success: true, data: mockTasks[0] })
          .mockResolvedValueOnce({ success: true, data: mockTasks[1] })
          .mockResolvedValueOnce({ success: true, data: mockTasks[2] });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.epicId).toBe('epic-001');
        expect(result.totalTasks).toBe(3);
        expect(result.completedTasks).toBe(1);
        expect(result.inProgressTasks).toBe(1);
        expect(result.blockedTasks).toBe(1);
        expect(result.progressPercentage).toBe(33); // 1 of 3 completed

        // Check resource utilization metrics
        expect(result.resourceUtilization).toBeDefined();
        expect(result.resourceUtilization.filePathConflicts).toBe(1); // file1.ts used by 2 tasks
        expect(result.resourceUtilization.dependencyComplexity).toBeDefined();
        expect(result.resourceUtilization.parallelizableTaskGroups).toBeDefined();
      });

      it('should handle epic with no tasks', async () => {
        const emptyEpic = {
          ...mockEpic,
          taskIds: []
        };

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: emptyEpic
        });

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.epicId).toBe('epic-001');
        expect(result.totalTasks).toBe(0);
        expect(result.completedTasks).toBe(0);
        expect(result.progressPercentage).toBe(0);
      });

      it('should handle epic not found', async () => {
        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: false,
          error: 'Epic not found'
        });

        const result = await resolver.calculateEpicProgress('invalid-epic');

        expect(result.epicId).toBe('invalid-epic');
        expect(result.totalTasks).toBe(0);
        expect(result.completedTasks).toBe(0);
        expect(result.progressPercentage).toBe(0);
      });
    });

    describe('updateEpicStatusFromTasks', () => {
      it('should update epic status to completed when all tasks completed', async () => {
        const epicWithCompletedTasks = {
          ...mockEpic,
          status: 'in_progress',
          taskIds: ['task-001', 'task-002']
        };

        const completedTasks = [
          { id: 'task-001', status: 'completed' },
          { id: 'task-002', status: 'completed' }
        ];

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithCompletedTasks
        });

        vi.mocked(mockStorageManager.getTask)
          .mockResolvedValueOnce({ success: true, data: completedTasks[0] })
          .mockResolvedValueOnce({ success: true, data: completedTasks[1] });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(true);
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          status: 'completed'
        }));
      });

      it('should update epic status to in_progress when some tasks started', async () => {
        const epicWithMixedTasks = {
          ...mockEpic,
          status: 'todo',
          taskIds: ['task-001', 'task-002']
        };

        const mixedTasks = [
          { id: 'task-001', status: 'completed' },
          { id: 'task-002', status: 'pending' }
        ];

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithMixedTasks
        });

        vi.mocked(mockStorageManager.getTask)
          .mockResolvedValueOnce({ success: true, data: mixedTasks[0] })
          .mockResolvedValueOnce({ success: true, data: mixedTasks[1] });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(true);
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          status: 'in_progress'
        }));
      });

      it('should update epic status to blocked when all tasks blocked', async () => {
        const epicWithBlockedTasks = {
          ...mockEpic,
          status: 'in_progress',
          taskIds: ['task-001', 'task-002']
        };

        const blockedTasks = [
          { id: 'task-001', status: 'blocked' },
          { id: 'task-002', status: 'blocked' }
        ];

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithBlockedTasks
        });

        vi.mocked(mockStorageManager.getTask)
          .mockResolvedValueOnce({ success: true, data: blockedTasks[0] })
          .mockResolvedValueOnce({ success: true, data: blockedTasks[1] });

        vi.mocked(mockStorageManager.updateEpic).mockResolvedValue({
          success: true
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(true);
        expect(mockStorageManager.updateEpic).toHaveBeenCalledWith('epic-001', expect.objectContaining({
          status: 'blocked'
        }));
      });

      it('should return false when epic not found', async () => {
        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: false,
          error: 'Epic not found'
        });

        const result = await resolver.updateEpicStatusFromTasks('invalid-epic');

        expect(result).toBe(false);
        expect(mockStorageManager.updateEpic).not.toHaveBeenCalled();
      });

      it('should not update status if no change needed', async () => {
        const epicWithCorrectStatus = {
          ...mockEpic,
          status: 'completed',
          taskIds: ['task-001']
        };

        const completedTask = { id: 'task-001', status: 'completed' };

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithCorrectStatus
        });

        vi.mocked(mockStorageManager.getTask).mockResolvedValue({
          success: true,
          data: completedTask
        });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.updateEpicStatusFromTasks('epic-001');

        expect(result).toBe(false); // No change needed
        expect(mockStorageManager.updateEpic).not.toHaveBeenCalled();
      });
    });

    describe('resource conflict detection', () => {
      it('should detect file path conflicts between tasks', async () => {
        const epicWithConflicts = {
          ...mockEpic,
          taskIds: ['task-001', 'task-002', 'task-003']
        };

        const conflictingTasks = [
          { id: 'task-001', status: 'pending', filePaths: ['shared.ts', 'file1.ts'] },
          { id: 'task-002', status: 'pending', filePaths: ['shared.ts', 'file2.ts'] },
          { id: 'task-003', status: 'pending', filePaths: ['file3.ts'] }
        ];

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithConflicts
        });

        vi.mocked(mockStorageManager.getTask)
          .mockResolvedValueOnce({ success: true, data: conflictingTasks[0] })
          .mockResolvedValueOnce({ success: true, data: conflictingTasks[1] })
          .mockResolvedValueOnce({ success: true, data: conflictingTasks[2] });

        vi.mocked(mockStorageManager.getDependenciesForTask).mockResolvedValue([]);

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.resourceUtilization.filePathConflicts).toBe(1); // 'shared.ts' used by 2 tasks
      });

      it('should calculate dependency complexity', async () => {
        const epicWithDependencies = {
          ...mockEpic,
          taskIds: ['task-001', 'task-002']
        };

        const tasksWithDeps = [
          { id: 'task-001', status: 'pending' },
          { id: 'task-002', status: 'pending' }
        ];

        vi.mocked(mockStorageManager.getEpic).mockResolvedValue({
          success: true,
          data: epicWithDependencies
        });

        vi.mocked(mockStorageManager.getTask)
          .mockResolvedValueOnce({ success: true, data: tasksWithDeps[0] })
          .mockResolvedValueOnce({ success: true, data: tasksWithDeps[1] });

        // Mock dependencies
        vi.mocked(mockStorageManager.getDependenciesForTask)
          .mockResolvedValueOnce([{ id: 'dep1' }, { id: 'dep2' }]) // task-001 has 2 deps
          .mockResolvedValueOnce([{ id: 'dep3' }]); // task-002 has 1 dep

        const result = await resolver.calculateEpicProgress('epic-001');

        expect(result.resourceUtilization.dependencyComplexity).toBeGreaterThan(0);
      });
    });
  });

  describe('LLM-Powered Epic Generation', () => {
    let mockPerformFormatAwareLlmCall: ReturnType<typeof vi.fn>;
    let mockPRDIntegrationService: Record<string, unknown>;

    beforeEach(async () => {
      // Mock the LLM helper function
      mockPerformFormatAwareLlmCall = vi.fn();
      vi.doMock('../../../../utils/llmHelper.js', () => ({
        performFormatAwareLlmCall: mockPerformFormatAwareLlmCall
      }));

      // Mock PRD Integration Service
      mockPRDIntegrationService = {
        detectExistingPRD: vi.fn(),
        parsePRD: vi.fn()
      };

      // Setup PRD Integration Service mock
      vi.doMock('../../integrations/prd-integration.js', () => ({
        PRDIntegrationService: {
          getInstance: () => mockPRDIntegrationService
        }
      }));

      // Get fresh instance after mocking
      const { EpicContextResolver: FreshResolver } = await import('../../services/epic-context-resolver.js');
      resolver = FreshResolver.getInstance();
    });

    describe('extractFunctionalAreaFromPRD', () => {
      const testConfig = createMockOpenRouterConfig();
      const projectId = 'test-project';

      it('should extract functional areas from PRD using LLM analysis', async () => {
        // Mock PRD detection and parsing
        vi.mocked(mockPRDIntegrationService.detectExistingPRD).mockResolvedValue({
          filePath: '/path/to/prd.md',
          projectName: 'Test Project'
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        vi.mocked(mockPRDIntegrationService.parsePRD).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        (mockPRDIntegrationService.parsePRD as vi.Mock).mockResolvedValue({
          success: true,
          prdData: {
            features: [
              { title: 'User Authentication', description: 'Login and signup system' },
              { title: 'API Gateway', description: 'Backend API management' },
              { title: 'Dashboard UI', description: 'User interface components' }
            ],
            technical: { techStack: ['React', 'Node.js', 'PostgreSQL'] },
            overview: { businessGoals: ['Improve user experience'], productGoals: ['Scale platform'] }
          }
        });

        // Mock LLM response
        mockPerformFormatAwareLlmCall.mockResolvedValue(
          JSON.stringify(['authentication', 'integration', 'ui-components', 'database'])
        );

        const result = await resolver.extractFunctionalAreaFromPRD(projectId, testConfig);

        expect(result).toEqual(['authentication', 'integration', 'ui-components', 'database']);
        expect(mockPRDIntegrationService.detectExistingPRD).toHaveBeenCalledWith(projectId);
        expect(mockPRDIntegrationService.parsePRD).toHaveBeenCalled();
        expect(mockPerformFormatAwareLlmCall).toHaveBeenCalledWith(
          expect.stringContaining('Analyze the following PRD content'),
          expect.stringContaining('expert software architect'),
          testConfig,
          'prd_integration',
          'json'
        );
      });

      it('should return empty array when no PRD found', async () => {
        vi.mocked(mockPRDIntegrationService.detectExistingPRD) = vi.fn().mockResolvedValue(null);

        const result = await resolver.extractFunctionalAreaFromPRD(projectId, testConfig);

        expect(result).toEqual([]);
        expect(mockPRDIntegrationService.detectExistingPRD).toHaveBeenCalledWith(projectId);
        expect(mockPRDIntegrationService.parsePRD).not.toHaveBeenCalled();
      });

      it('should return empty array when PRD parsing fails', async () => {
        vi.mocked(mockPRDIntegrationService.detectExistingPRD) = vi.fn().mockResolvedValue({
          filePath: '/path/to/prd.md'
        });

        vi.mocked(mockPRDIntegrationService.parsePRD) = vi.fn().mockResolvedValue({
          success: false,
          error: 'Failed to parse PRD'
        });

        const result = await resolver.extractFunctionalAreaFromPRD(projectId, testConfig);

        expect(result).toEqual([]);
        expect(mockPRDIntegrationService.parsePRD).toHaveBeenCalled();
      });

      it('should handle LLM call failure gracefully', async () => {
        vi.mocked(mockPRDIntegrationService.detectExistingPRD) = vi.fn().mockResolvedValue({
          filePath: '/path/to/prd.md'
        });

        vi.mocked(mockPRDIntegrationService.parsePRD) = vi.fn().mockResolvedValue({
          success: true,
          prdData: { features: [], technical: {}, overview: {} }
        });

        mockPerformFormatAwareLlmCall.mockRejectedValue(new Error('LLM call failed'));

        const result = await resolver.extractFunctionalAreaFromPRD(projectId, testConfig);

        expect(result).toEqual([]);
      });
    });

    describe('extractFunctionalArea', () => {
      const taskContext = {
        title: 'User Authentication System',
        description: 'Implement login and signup functionality',
        type: 'development',
        tags: ['security', 'backend']
      };

      it('should extract functional area from task context', async () => {
        const result = await resolver.extractFunctionalArea(taskContext);

        expect(result).toBe('authentication');
      });

      it('should return null for invalid task context', async () => {
        const result = await resolver.extractFunctionalArea(undefined);

        expect(result).toBeNull();
      });

      it('should extract functional area based on keywords', async () => {
        const result = await resolver.extractFunctionalArea(taskContext);

        expect(result).toBe('authentication');
      });

      it('should handle various functional areas', async () => {
        const uiContext = {
          title: 'Create React Components',
          description: 'Build reusable UI components',
          type: 'development',
          tags: ['frontend', 'react']
        };

        const result = await resolver.extractFunctionalArea(uiContext);

        expect(result).toBe('frontend');
      });

      it('should return null when no matching functional area found', async () => {
        const unknownContext = {
          title: 'Random Task',
          description: 'Some random description',
          type: 'development',
          tags: []
        };

        const result = await resolver.extractFunctionalArea(unknownContext);

        expect(result).toBeNull();
      });
    });

    // Tests for private methods removed - testing through public API instead

    // Tests for private parseEpicGenerationResult method removed - testing through public API instead

    describe('Integration with existing epic resolution', () => {
      it('should use LLM-powered functional area extraction in resolveEpicContext', async () => {
        const paramsWithConfig = {
          projectId: 'test-project',
          taskContext: {
            title: 'Authentication feature',
            description: 'Implement user login',
            type: 'development',
            tags: []
          },
          config: createMockOpenRouterConfig()
        };

        // Mock LLM-powered extraction
        vi.mocked(mockPRDIntegrationService.detectExistingPRD) = vi.fn().mockResolvedValue({
          filePath: '/path/to/prd.md'
        });

        vi.mocked(mockPRDIntegrationService.parsePRD) = vi.fn().mockResolvedValue({
          success: true,
          prdData: {
            features: [{ title: 'Auth', description: 'Authentication' }],
            technical: {},
            overview: {}
          }
        });

        mockPerformFormatAwareLlmCall.mockResolvedValue(JSON.stringify(['auth']));

        // Mock no existing project/epic
        vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
          success: true,
          data: { id: 'test-project', epicIds: [] }
        });

        // Mock epic creation with LLM-enhanced context
        vi.mocked(mockEpicService.createEpic).mockResolvedValue({
          success: true,
          data: { id: 'epic-001', title: 'Auth Epic' }
        });

        // Mock storage manager for updateProjectEpicAssociation
        vi.mocked(mockStorageManager.getProject).mockResolvedValue({
          success: true,
          data: { id: 'test-project', epicIds: [] }
        });

        vi.mocked(mockStorageManager.updateProject).mockResolvedValue({
          success: true
        });

        const result = await resolver.resolveEpicContext(paramsWithConfig);

        expect(result.source).toBe('created');
        expect(result.epicId).toBe('epic-001');
        
        // Should have called PRD extraction
        expect(mockPRDIntegrationService.detectExistingPRD).toHaveBeenCalledWith('test-project');
      });

      it('should fall back to keyword extraction when LLM fails', async () => {
        const paramsWithoutConfig = {
          projectId: 'test-project',
          taskContext: {
            title: 'User authentication system',
            description: 'Login functionality',
            type: 'development',
            tags: ['auth']
          }
        };

        // Mock no existing project/epic
        vi.mocked(mockProjectOperations.getProject).mockResolvedValue({
          success: true,
          data: { id: 'test-project', epicIds: [] }
        });

        vi.mocked(mockEpicService.createEpic).mockResolvedValue({
          success: true,
          data: { id: 'epic-001', title: 'Auth Epic' }
        });

        const result = await resolver.resolveEpicContext(paramsWithoutConfig);

        expect(result.source).toBe('created');
        expect(result.epicId).toBe('epic-001');
        
        // Should not have called LLM functions due to missing config
        expect(mockPRDIntegrationService.detectExistingPRD).not.toHaveBeenCalled();
      });
    });
  });
});
