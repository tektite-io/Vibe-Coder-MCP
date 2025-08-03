/**
 * Unified Task Execution Engine Tests
 * 
 * Validates the consolidated task execution functionality that replaces
 * 5 separate execution services with comprehensive scheduling, streaming,
 * coordination, monitoring, and lifecycle management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  UnifiedTaskExecutionEngine,
  createDefaultConfig,
  createTaskId,
  createAgentId,
  createExecutionId,
  Agent,
  TaskExecution,
  UnifiedTaskExecutionEngineConfig
} from '../unified-task-execution-engine.js';
import { AtomicTask, TaskPriority } from '../../types/task.js';

// Helper function to create valid test tasks
function createTestTask(id: string, priority: TaskPriority = 'medium'): AtomicTask {
  return {
    id,
    title: `Test Task ${id}`,
    description: `A test task with ID ${id}`,
    status: 'pending',
    priority,
    type: 'development',
    functionalArea: 'backend',
    estimatedHours: 2,
    epicId: 'E001',
    projectId: 'P001',
    dependencies: [],
    dependents: [],
    filePaths: [],
    acceptanceCriteria: [],
    testingRequirements: {
      unitTests: [],
      integrationTests: [],
      performanceTests: [],
      coverageTarget: 80
    },
    performanceCriteria: {
      responseTime: '< 200ms',
      memoryUsage: '< 100MB'
    },
    qualityCriteria: {
      codeQuality: ['clean', 'maintainable'],
      documentation: ['inline', 'readme'],
      typeScript: true,
      eslint: true
    },
    integrationCriteria: {
      compatibility: ['existing-api'],
      patterns: ['singleton', 'factory']
    },
    validationMethods: {
      automated: ['unit-tests', 'integration-tests'],
      manual: ['code-review']
    },
    createdBy: 'test-user',
    tags: ['test'],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: ['test']
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

describe('UnifiedTaskExecutionEngine', () => {
  let engine: UnifiedTaskExecutionEngine;
  let config: UnifiedTaskExecutionEngineConfig;

  beforeEach(() => {
    config = createDefaultConfig();
    // Reduce intervals for faster testing
    config.scheduling.schedulingInterval = 100;
    config.watchdog.healthCheckInterval = 0.1; // 6 seconds
    engine = UnifiedTaskExecutionEngine.getInstance(config);
  });

  afterEach(() => {
    engine.dispose();
    UnifiedTaskExecutionEngine.resetInstance();
  });

  describe('Branded Type Factories', () => {
    it('should create valid task ID', () => {
      const taskId = createTaskId('T001');
      expect(taskId).toBe('T001');
    });

    it('should create valid agent ID', () => {
      const agentId = createAgentId('agent-001');
      expect(agentId).toBe('agent-001');
    });

    it('should create valid execution ID', () => {
      const executionId = createExecutionId('exec-001');
      expect(executionId).toBe('exec-001');
    });

    it('should throw error for empty IDs', () => {
      expect(() => createTaskId('')).toThrow('Task ID cannot be empty');
      expect(() => createAgentId('')).toThrow('Agent ID cannot be empty');
      expect(() => createExecutionId('')).toThrow('Execution ID cannot be empty');
    });
  });

  describe('Agent Management', () => {
    it('should register an agent', async () => {
      const agent: Agent = {
        id: createAgentId('test-agent'),
        name: 'Test Agent',
        status: 'idle',
        capacity: {
          maxMemoryMB: 1024,
          maxCpuWeight: 4,
          maxConcurrentTasks: 5
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      };

      const result = await engine.registerAgent(agent);
      expect(result.success).toBe(true);
    });

    it('should unregister an agent', async () => {
      const agent: Agent = {
        id: createAgentId('test-agent'),
        name: 'Test Agent',
        status: 'idle',
        capacity: {
          maxMemoryMB: 1024,
          maxCpuWeight: 4,
          maxConcurrentTasks: 5
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      };

      await engine.registerAgent(agent);
      const result = await engine.unregisterAgent(agent.id);
      expect(result.success).toBe(true);
    });

    it('should update agent status', async () => {
      const agent: Agent = {
        id: createAgentId('test-agent'),
        name: 'Test Agent',
        status: 'idle',
        capacity: {
          maxMemoryMB: 1024,
          maxCpuWeight: 4,
          maxConcurrentTasks: 5
        },
        currentUsage: {
          memoryMB: 0,
          cpuWeight: 0,
          activeTasks: 0
        },
        metadata: {
          lastHeartbeat: new Date(),
          totalTasksExecuted: 0,
          averageExecutionTime: 0,
          successRate: 1.0
        }
      };

      await engine.registerAgent(agent);
      const result = await engine.updateAgentStatus(agent.id, 'busy', { activeTasks: 1 });
      expect(result.success).toBe(true);
    });

    it('should handle agent not found errors', async () => {
      const agentId = createAgentId('non-existent');
      const result = await engine.unregisterAgent(agentId);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Agent not found');
      }
    });
  });

  describe('Task Execution Management', () => {
    it('should submit a task for execution', async () => {
      const task = createTestTask('T001', 'medium');

      const result = await engine.submitTask(task);
      expect(result.success).toBe(true);
      
      if (result.success) {
        const execution = engine.getExecution(result.data);
        expect(execution).toBeTruthy();
        expect(execution?.status).toBe('queued');
      }
    });

    it('should cancel a task execution', async () => {
      const task: AtomicTask = {
        id: 'T002',
        title: 'Test Task 2',
        description: 'Another test task',
        status: 'pending',
        priority: 'high' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 1,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const submitResult = await engine.submitTask(task);
      expect(submitResult.success).toBe(true);
      
      if (submitResult.success) {
        const cancelResult = await engine.cancelExecution(submitResult.data);
        expect(cancelResult.success).toBe(true);
        
        const execution = engine.getExecution(submitResult.data);
        expect(execution?.status).toBe('cancelled');
      }
    });

    it('should get executions by status', async () => {
      const task: AtomicTask = {
        id: 'T003',
        title: 'Test Task 3',
        description: 'Yet another test task',
        status: 'pending',
        priority: 'low' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 3,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await engine.submitTask(task);
      const queuedExecutions = engine.getExecutionsByStatus('queued');
      expect(queuedExecutions.length).toBeGreaterThan(0);
    });

    it('should handle execution not found errors', async () => {
      const executionId = createExecutionId('non-existent');
      const result = await engine.cancelExecution(executionId);
      expect(result.success).toBe(false);
      expect(result.error.message).toContain('Execution not found');
    });
  });

  describe('Task Completion', () => {
    it('should complete task execution successfully', async () => {
      const task: AtomicTask = {
        id: 'T004',
        title: 'Completion Test Task',
        description: 'A task to test completion',
        status: 'pending',
        priority: 'medium' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 1,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const submitResult = await engine.submitTask(task);
      expect(submitResult.success).toBe(true);
      
      if (submitResult.success) {
        const result = await engine.completeExecution(submitResult.data, {
          success: true,
          output: 'Task completed successfully',
          metadata: { completedBy: 'test' }
        });
        
        expect(result.success).toBe(true);
        
        const execution = engine.getExecution(submitResult.data);
        expect(execution?.status).toBe('completed');
        expect(execution?.result?.success).toBe(true);
      }
    });

    it('should complete task execution with failure', async () => {
      const task: AtomicTask = {
        id: 'T005',
        title: 'Failure Test Task',
        description: 'A task to test failure completion',
        status: 'pending',
        priority: 'medium' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 1,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const submitResult = await engine.submitTask(task);
      expect(submitResult.success).toBe(true);
      
      if (submitResult.success) {
        const result = await engine.completeExecution(submitResult.data, {
          success: false,
          error: 'Task failed due to error',
          metadata: { failureReason: 'test failure' }
        });
        
        expect(result.success).toBe(true);
        
        const execution = engine.getExecution(submitResult.data);
        expect(execution?.status).toBe('completed');
        expect(execution?.result?.success).toBe(false);
      }
    });
  });

  describe('Event Emission', () => {
    it('should emit task submission events', async () => {
      let taskSubmittedEvent: TaskExecution | null = null;

      engine.on('taskSubmitted', (execution: TaskExecution) => {
        taskSubmittedEvent = execution;
      });

      const task: AtomicTask = {
        id: 'T006',
        title: 'Event Test Task',
        description: 'A task to test events',
        status: 'pending',
        priority: 'medium' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 1,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await engine.submitTask(task);
      expect(taskSubmittedEvent).not.toBeNull();
      expect(taskSubmittedEvent!.taskId).toBe(createTaskId(task.id));
    });

    it('should emit execution completion events', async () => {
      let executionCompletedEvent: TaskExecution | null = null;

      engine.on('executionCompleted', (execution: TaskExecution) => {
        executionCompletedEvent = execution;
      });

      const task: AtomicTask = {
        id: 'T007',
        title: 'Completion Event Test Task',
        description: 'A task to test completion events',
        status: 'pending',
        priority: 'medium' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 1,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const submitResult = await engine.submitTask(task);
      if (submitResult.success) {
        await engine.completeExecution(submitResult.data, {
          success: true,
          output: 'Task completed'
        });
        
        expect(executionCompletedEvent).not.toBeNull();
        expect(executionCompletedEvent!.status).toBe('completed');
      }
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = UnifiedTaskExecutionEngine.getInstance(config);
      const instance2 = UnifiedTaskExecutionEngine.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = UnifiedTaskExecutionEngine.getInstance(config);
      UnifiedTaskExecutionEngine.resetInstance();
      const instance2 = UnifiedTaskExecutionEngine.getInstance(config);
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const customConfig = createDefaultConfig();
      customConfig.scheduling.algorithm = 'priority_first';
      customConfig.execution.maxConcurrentExecutions = 50;
      
      const customEngine = UnifiedTaskExecutionEngine.getInstance(customConfig);
      expect(customEngine).toBeTruthy();
      
      customEngine.dispose();
    });

    it('should create default configuration', () => {
      const defaultConfig = createDefaultConfig();
      
      expect(defaultConfig.scheduling.algorithm).toBe('hybrid_optimal');
      expect(defaultConfig.streaming.enableRealTimeStreaming).toBe(true);
      expect(defaultConfig.watchdog.enabled).toBe(true);
      expect(defaultConfig.lifecycle.enableAutomation).toBe(true);
    });
  });

  describe('Statistics and Monitoring', () => {
    it('should provide execution statistics', async () => {
      // Submit a few tasks
      const tasks: AtomicTask[] = [
        {
          id: 'T008',
          title: 'Stats Test Task 1',
          description: 'First stats test task',
          status: 'pending',
          priority: 'high' as TaskPriority,
          type: 'implementation',
          functionalArea: 'core',
          estimatedHours: 1,
          epicId: 'E001',
          projectId: 'P001',
          dependencies: [],
          filePaths: [],
          acceptanceCriteria: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'T009',
          title: 'Stats Test Task 2',
          description: 'Second stats test task',
          status: 'pending',
          priority: 'medium' as TaskPriority,
          type: 'implementation',
          functionalArea: 'core',
          estimatedHours: 2,
          epicId: 'E001',
          projectId: 'P001',
          dependencies: [],
          filePaths: [],
          acceptanceCriteria: [],
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ];

      for (const task of tasks) {
        await engine.submitTask(task);
      }

      const stats = engine.getExecutionStatistics();
      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.byStatus.queued).toBeGreaterThanOrEqual(2);
      expect(stats.successRate).toBeGreaterThanOrEqual(0);
      expect(stats.averageExecutionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should dispose properly', () => {
      const testEngine = UnifiedTaskExecutionEngine.getInstance(config);
      
      // Should not throw
      expect(() => testEngine.dispose()).not.toThrow();
    });

    it('should cancel running executions on disposal', async () => {
      const task: AtomicTask = {
        id: 'T010',
        title: 'Disposal Test Task',
        description: 'A task to test disposal',
        status: 'pending',
        priority: 'medium' as TaskPriority,
        type: 'implementation',
        functionalArea: 'core',
        estimatedHours: 1,
        epicId: 'E001',
        projectId: 'P001',
        dependencies: [],
        filePaths: [],
        acceptanceCriteria: [],
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const submitResult = await engine.submitTask(task);
      expect(submitResult.success).toBe(true);
      
      // Dispose should cancel the queued task
      engine.dispose();
      
      if (submitResult.success) {
        const execution = engine.getExecution(submitResult.data);
        // After disposal, execution should be cancelled or not accessible
        expect(execution?.status === 'cancelled' || execution === null).toBe(true);
      }
    });
  });
});