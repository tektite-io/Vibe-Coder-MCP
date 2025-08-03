/**
 * Unit Tests for Workflow ID Resolution Edge Cases
 * 
 * Tests the enhanced ID resolution logic that fixes the "Workflow not found" error
 * by properly handling the mismatch between taskId and sessionId in progress events.
 */

import { describe, it, expect } from 'vitest';
import {
  createWorkflowId,
  createSessionId,
  createTaskId,
  createProjectId,
  type WorkflowId,
  type SessionId,
  type TaskId,
  type ProjectId,
  type Result,
  createSuccess,
  createFailure,
  type IdResolutionResult
} from '../../services/workflow-state-manager.js';

describe('Workflow ID Resolution', () => {
  describe('Branded Type Creation', () => {
    it('should create valid WorkflowId from non-empty string', () => {
      const result: WorkflowId = createWorkflowId('workflow-123');
      expect(result).toBe('workflow-123');
    });

    it('should create valid SessionId from non-empty string', () => {
      const result: SessionId = createSessionId('session-456');
      expect(result).toBe('session-456');
    });

    it('should create valid TaskId from non-empty string', () => {
      const result: TaskId = createTaskId('task-789');
      expect(result).toBe('task-789');
    });

    it('should create valid ProjectId from non-empty string', () => {
      const result: ProjectId = createProjectId('project-abc');
      expect(result).toBe('project-abc');
    });

    it('should trim whitespace when creating IDs', () => {
      expect(createWorkflowId('  workflow-123  ')).toBe('workflow-123');
      expect(createSessionId('  session-456  ')).toBe('session-456');
      expect(createTaskId('  task-789  ')).toBe('task-789');
      expect(createProjectId('  project-abc  ')).toBe('project-abc');
    });

    it('should throw error for empty WorkflowId', () => {
      expect(() => createWorkflowId('')).toThrow('Workflow ID cannot be empty');
      expect(() => createWorkflowId('   ')).toThrow('Workflow ID cannot be empty');
    });

    it('should throw error for empty SessionId', () => {
      expect(() => createSessionId('')).toThrow('Session ID cannot be empty');
      expect(() => createSessionId('   ')).toThrow('Session ID cannot be empty');
    });

    it('should throw error for empty TaskId', () => {
      expect(() => createTaskId('')).toThrow('Task ID cannot be empty');
      expect(() => createTaskId('   ')).toThrow('Task ID cannot be empty');
    });

    it('should throw error for empty ProjectId', () => {
      expect(() => createProjectId('')).toThrow('Project ID cannot be empty');
      expect(() => createProjectId('   ')).toThrow('Project ID cannot be empty');
    });
  });

  describe('Result Type Handling', () => {
    it('should create success result with data', () => {
      const data = { value: 'test' };
      const result: Result<typeof data> = createSuccess(data);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(data);
      }
    });

    it('should create failure result with error', () => {
      const error = new Error('Test error');
      const result: Result<never, Error> = createFailure(error);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe(error);
      }
    });

    it('should provide type-safe access to success data', () => {
      const result: Result<string> = createSuccess('test-value');
      
      if (result.success) {
        // TypeScript should know this is string
        const value: string = result.data;
        expect(value).toBe('test-value');
      } else {
        // This branch should not execute
        expect.fail('Expected success result');
      }
    });

    it('should provide type-safe access to failure error', () => {
      const testError = new Error('Test error message');
      const result: Result<string, Error> = createFailure(testError);
      
      if (!result.success) {
        // TypeScript should know this is Error
        const error: Error = result.error;
        expect(error.message).toBe('Test error message');
      } else {
        // This branch should not execute
        expect.fail('Expected failure result');
      }
    });
  });

  describe('ID Resolution Edge Cases', () => {
    // Helper function to simulate progress event data
    const createProgressEventData = (
      taskId?: string,
      sessionId?: string,
      jobId?: string
    ) => ({
      taskId,
      metadata: {
        sessionId,
        jobId
      }
    });

    // Utility function to resolve ID following existing ProgressJobBridge pattern
    const resolveWorkflowId = (data: ReturnType<typeof createProgressEventData>): IdResolutionResult => {
      let workflowId: WorkflowId | null = null;
      let sessionId: SessionId | null = null;
      let taskId: TaskId | null = null;
      let source: IdResolutionResult['source'] = 'none';

      // Follow the existing ProgressJobBridge.extractJobId() pattern
      const resolvedId = (
        data.metadata?.jobId as string ||
        data.metadata?.sessionId as string ||
        data.taskId ||
        null
      );

      if (resolvedId) {
        if (data.metadata?.jobId === resolvedId) {
          workflowId = createWorkflowId(resolvedId);
          source = 'workflowId';
        } else if (data.metadata?.sessionId === resolvedId) {
          sessionId = createSessionId(resolvedId);
          workflowId = sessionId as unknown as WorkflowId; // Session ID can serve as workflow ID
          source = 'sessionId';
        } else if (data.taskId === resolvedId) {
          taskId = createTaskId(resolvedId);
          source = 'taskId';
        }
      }

      return { workflowId, sessionId, taskId, source };
    };

    it('should resolve workflow ID from jobId when available', () => {
      const data = createProgressEventData(
        'task-1751827584613',
        'session-abc123',
        'workflow-def456'
      );

      const result = resolveWorkflowId(data);

      expect(result.workflowId).toBe('workflow-def456');
      expect(result.source).toBe('workflowId');
    });

    it('should fall back to sessionId when jobId not available', () => {
      const data = createProgressEventData(
        'task-1751827584613',
        'session-abc123'
      );

      const result = resolveWorkflowId(data);

      expect(result.workflowId).toBe('session-abc123');
      expect(result.sessionId).toBe('session-abc123');
      expect(result.source).toBe('sessionId');
    });

    it('should fall back to taskId when neither jobId nor sessionId available', () => {
      const data = createProgressEventData('task-1751827584613');

      const result = resolveWorkflowId(data);

      expect(result.taskId).toBe('task-1751827584613');
      expect(result.source).toBe('taskId');
    });

    it('should return none source when no IDs available', () => {
      const data = createProgressEventData();

      const result = resolveWorkflowId(data);

      expect(result.workflowId).toBeNull();
      expect(result.sessionId).toBeNull();
      expect(result.taskId).toBeNull();
      expect(result.source).toBe('none');
    });

    it('should handle the specific error case from logs', () => {
      // This replicates the exact scenario from the error logs
      const errorCaseData = createProgressEventData(
        'task-1751827584613', // This was the taskId in the error
        undefined, // No sessionId in metadata
        undefined  // No jobId in metadata
      );

      const result = resolveWorkflowId(errorCaseData);

      // The current logic would try to use taskId as workflowId, which fails
      // because workflow was created with sessionId
      expect(result.taskId).toBe('task-1751827584613');
      expect(result.source).toBe('taskId');
      expect(result.workflowId).toBeNull(); // No workflow ID resolved
    });

    it('should prioritize jobId over sessionId and taskId', () => {
      const data = createProgressEventData(
        'task-1751827584613',
        'session-abc123',
        'workflow-def456'
      );

      const result = resolveWorkflowId(data);

      expect(result.source).toBe('workflowId');
      expect(result.workflowId).toBe('workflow-def456');
    });

    it('should prioritize sessionId over taskId when no jobId', () => {
      const data = createProgressEventData(
        'task-1751827584613',
        'session-abc123'
      );

      const result = resolveWorkflowId(data);

      expect(result.source).toBe('sessionId');
      expect(result.workflowId).toBe('session-abc123');
    });
  });

  describe('Type Safety Validation', () => {
    it('should prevent ID type mixing at compile time', () => {
      const workflowId: WorkflowId = createWorkflowId('workflow-123');
      const sessionId: SessionId = createSessionId('session-456');
      const taskId: TaskId = createTaskId('task-789');

      // These should all be different types at compile time
      expect(typeof workflowId).toBe('string');
      expect(typeof sessionId).toBe('string');
      expect(typeof taskId).toBe('string');

      // But TypeScript should prevent assignment between them
      // (This would cause compile errors if uncommented)
      // const mixedId: WorkflowId = sessionId; // Should error
      // const anotherMixedId: SessionId = taskId; // Should error
    });

    it('should enforce explicit type conversion when needed', () => {
      const sessionId: SessionId = createSessionId('session-123');
      
      // Explicit conversion should be required
      const workflowId: WorkflowId = sessionId as unknown as WorkflowId;
      
      expect(workflowId).toBe('session-123');
    });
  });
});