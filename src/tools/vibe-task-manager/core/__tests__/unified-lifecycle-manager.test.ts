/**
 * Unified Lifecycle Manager Tests
 * 
 * Validates the consolidated lifecycle management functionality
 * that replaces 4 separate lifecycle services.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  UnifiedLifecycleManager,
  WorkflowState,
  TaskExecution,
  createWorkflowId,
  createSessionId,
  createTaskId,
  createProjectId
} from '../unified-lifecycle-manager.js';

describe('UnifiedLifecycleManager', () => {
  let manager: UnifiedLifecycleManager;

  beforeEach(() => {
    // Reset singleton and create fresh instance
    UnifiedLifecycleManager.resetInstance();
    manager = UnifiedLifecycleManager.getInstance();
  });

  afterEach(() => {
    // Clean up
    if (manager) {
      manager.dispose();
    }
    UnifiedLifecycleManager.resetInstance();
  });

  describe('Branded Type Factories', () => {
    it('should create valid workflow ID', () => {
      const id = createWorkflowId('test-workflow-123');
      expect(id).toBe('test-workflow-123');
    });

    it('should create valid session ID', () => {
      const id = createSessionId('session-456');
      expect(id).toBe('session-456');
    });

    it('should create valid task ID', () => {
      const id = createTaskId('task-789');
      expect(id).toBe('task-789');
    });

    it('should create valid project ID', () => {
      const id = createProjectId('project-abc');
      expect(id).toBe('project-abc');
    });

    it('should throw error for empty IDs', () => {
      expect(() => createWorkflowId('')).toThrow('Workflow ID cannot be empty');
      expect(() => createSessionId('  ')).toThrow('Session ID cannot be empty');
      expect(() => createTaskId('')).toThrow('Task ID cannot be empty');
      expect(() => createProjectId('')).toThrow('Project ID cannot be empty');
    });
  });

  describe('Service Lifecycle Management', () => {
    it('should register a service', () => {
      const mockService = { start: () => Promise.resolve(), stop: () => Promise.resolve() };
      
      manager.registerService({
        name: 'TestService',
        instance: mockService,
        startMethod: 'start',
        stopMethod: 'stop'
      });

      // Service should be registered (we can't directly access private services map)
      // but we can test through the start process
      expect(() => manager.registerService({
        name: 'TestService2',
        instance: mockService
      })).not.toThrow();
    });

    it('should register service dependencies', () => {
      manager.registerServiceDependency('ServiceA', ['ServiceB', 'ServiceC']);
      
      // Should not throw - dependency registration is internal
      expect(() => manager.registerServiceDependency('ServiceB', [])).not.toThrow();
    });

    it('should start services in dependency order', async () => {
      const startOrder: string[] = [];
      
      const serviceA = {
        start: () => { startOrder.push('A'); return Promise.resolve(); }
      };
      const serviceB = {
        start: () => { startOrder.push('B'); return Promise.resolve(); }
      };
      const serviceC = {
        start: () => { startOrder.push('C'); return Promise.resolve(); }
      };

      // Register services
      manager.registerService({ name: 'ServiceA', instance: serviceA, startMethod: 'start' });
      manager.registerService({ name: 'ServiceB', instance: serviceB, startMethod: 'start' });
      manager.registerService({ name: 'ServiceC', instance: serviceC, startMethod: 'start' });

      // Register dependencies: A depends on B, B depends on C
      manager.registerServiceDependency('ServiceA', ['ServiceB']);
      manager.registerServiceDependency('ServiceB', ['ServiceC']);

      const result = await manager.startAllServices();
      
      expect(result.success).toBe(true);
      expect(startOrder).toEqual(['C', 'B', 'A']);
    });

    it('should handle service startup failure', async () => {
      const failingService = {
        start: () => Promise.reject(new Error('Service failed to start'))
      };

      manager.registerService({ 
        name: 'FailingService', 
        instance: failingService, 
        startMethod: 'start' 
      });

      const result = await manager.startAllServices();
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Failed to start service FailingService');
      }
    });
  });

  describe('Workflow State Management', () => {
    it('should create a new workflow', async () => {
      const workflowId = createWorkflowId('test-workflow');
      const sessionId = createSessionId('test-session');
      
      const result = await manager.createWorkflow(workflowId, sessionId, { 
        description: 'Test workflow' 
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.workflowId).toBe(workflowId);
        expect(result.data.sessionId).toBe(sessionId);
        expect(result.data.status).toBe('initializing');
        expect(result.data.phase).toBe('decomposition');
        expect(result.data.metadata.description).toBe('Test workflow');
      }
    });

    it('should prevent duplicate workflow creation', async () => {
      const workflowId = createWorkflowId('duplicate-workflow');
      const sessionId = createSessionId('test-session');
      
      // Create first workflow
      const result1 = await manager.createWorkflow(workflowId, sessionId);
      expect(result1.success).toBe(true);

      // Try to create duplicate
      const result2 = await manager.createWorkflow(workflowId, sessionId);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain('Workflow already exists');
      }
    });

    it('should update workflow state', async () => {
      const workflowId = createWorkflowId('update-workflow');
      const sessionId = createSessionId('test-session');
      
      // Create workflow
      await manager.createWorkflow(workflowId, sessionId);

      // Update workflow
      const result = await manager.updateWorkflowState(workflowId, {
        status: 'running',
        phase: 'execution',
        metadata: { updated: true }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('running');
        expect(result.data.phase).toBe('execution');
        expect(result.data.metadata.updated).toBe(true);
      }
    });

    it('should get workflow state', async () => {
      const workflowId = createWorkflowId('get-workflow');
      const sessionId = createSessionId('test-session');
      
      // Create workflow
      await manager.createWorkflow(workflowId, sessionId);

      // Get workflow state
      const workflow = manager.getWorkflowState(workflowId);
      
      expect(workflow).not.toBeNull();
      expect(workflow?.workflowId).toBe(workflowId);
      expect(workflow?.sessionId).toBe(sessionId);
    });

    it('should return null for non-existent workflow', () => {
      const workflowId = createWorkflowId('non-existent');
      const workflow = manager.getWorkflowState(workflowId);
      
      expect(workflow).toBeNull();
    });
  });

  describe('Task Execution Management', () => {
    it('should queue task for execution', async () => {
      const taskId = createTaskId('test-task');
      const workflowId = createWorkflowId('test-workflow');
      const sessionId = createSessionId('test-session');

      // Create workflow first
      await manager.createWorkflow(workflowId, sessionId);

      // Queue task execution
      const result = await manager.queueTaskExecution(taskId, workflowId);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.taskId).toBe(taskId);
        expect(result.data.workflowId).toBe(workflowId);
        expect(result.data.status).toBe('queued');
        expect(result.data.metadata.retryCount).toBe(0);
        expect(result.data.metadata.executionId).toMatch(/^exec-\d+-[a-z0-9]+$/);
      }
    });

    it('should prevent duplicate task execution', async () => {
      const taskId = createTaskId('duplicate-task');
      const workflowId = createWorkflowId('test-workflow');
      const sessionId = createSessionId('test-session');

      // Create workflow first
      await manager.createWorkflow(workflowId, sessionId);

      // Queue first execution
      const result1 = await manager.queueTaskExecution(taskId, workflowId);
      expect(result1.success).toBe(true);

      // Try to queue duplicate
      const result2 = await manager.queueTaskExecution(taskId, workflowId);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain('Task execution already exists');
      }
    });
  });

  describe('Event Emission', () => {
    it('should emit workflow events', async () => {
      const workflowId = createWorkflowId('event-workflow');
      const sessionId = createSessionId('test-session');
      
      let workflowCreatedEvent: WorkflowState | null = null;
      let workflowUpdatedEvent: WorkflowState | null = null;

      manager.on('workflowCreated', (workflow: WorkflowState) => {
        workflowCreatedEvent = workflow;
      });

      manager.on('workflowUpdated', (workflow: WorkflowState) => {
        workflowUpdatedEvent = workflow;
      });

      // Create workflow
      await manager.createWorkflow(workflowId, sessionId);
      expect(workflowCreatedEvent).not.toBeNull();
      expect(workflowCreatedEvent!.workflowId).toBe(workflowId);

      // Update workflow
      await manager.updateWorkflowState(workflowId, { status: 'running' });
      expect(workflowUpdatedEvent).not.toBeNull();
      expect(workflowUpdatedEvent!.status).toBe('running');
    });

    it('should emit task execution events', async () => {
      const taskId = createTaskId('event-task');
      const workflowId = createWorkflowId('test-workflow');
      const sessionId = createSessionId('test-session');

      let taskQueuedEvent: TaskExecution | null = null;

      manager.on('taskQueued', (execution: TaskExecution) => {
        taskQueuedEvent = execution;
      });

      // Create workflow first
      await manager.createWorkflow(workflowId, sessionId);

      // Queue task
      await manager.queueTaskExecution(taskId, workflowId);
      expect(taskQueuedEvent).not.toBeNull();
      expect(taskQueuedEvent!.taskId).toBe(taskId);
    });
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const instance1 = UnifiedLifecycleManager.getInstance();
      const instance2 = UnifiedLifecycleManager.getInstance();
      
      expect(instance1).toBe(instance2);
    });

    it('should reset instance', () => {
      const instance1 = UnifiedLifecycleManager.getInstance();
      UnifiedLifecycleManager.resetInstance();
      const instance2 = UnifiedLifecycleManager.getInstance();
      
      expect(instance1).not.toBe(instance2);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      UnifiedLifecycleManager.resetInstance();
      
      const customConfig = {
        maxConcurrentExecutions: 5,
        executionTimeout: 60000,
        enableWorkflowPersistence: false
      };

      const customManager = UnifiedLifecycleManager.getInstance(customConfig);
      
      // Configuration is private, but we can test behavior
      expect(customManager).toBeInstanceOf(UnifiedLifecycleManager);
      
      customManager.dispose();
    });
  });

  describe('Cleanup', () => {
    it('should dispose properly', () => {
      const testManager = UnifiedLifecycleManager.getInstance();
      
      // Should not throw
      expect(() => testManager.dispose()).not.toThrow();
    });
  });
});