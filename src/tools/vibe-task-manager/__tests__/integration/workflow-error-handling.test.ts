/**
 * Integration Tests for Workflow Error Handling
 * 
 * Tests the complete error handling flow that fixes the "Workflow not found" error
 * by verifying the integration between DecompositionService, WorkflowStateManager,
 * and ProgressTracker using the new centralized ID resolution and Result types.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WorkflowStateManager, WorkflowPhase, WorkflowState, createWorkflowId, createSessionId, resolveWorkflowId } from '../../services/workflow-state-manager.js';

describe('Workflow Error Handling Integration', () => {
  let workflowStateManager: WorkflowStateManager;

  beforeEach(async () => {
    // Get singleton instance to test real integration
    workflowStateManager = WorkflowStateManager.getInstance();
  });


  describe('ID Resolution Integration', () => {
    it('should resolve workflow ID from jobId in metadata', () => {
      const progressData = {
        taskId: 'task-1751827584613',
        metadata: {
          sessionId: 'session-abc123',
          jobId: 'workflow-def456'
        },
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'DecompositionService'
      };

      const result = resolveWorkflowId(progressData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('workflow-def456');
      }
    });

    it('should fall back to sessionId when jobId not available', () => {
      const progressData = {
        taskId: 'task-1751827584613',
        metadata: {
          sessionId: 'session-abc123'
        },
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'DecompositionService'
      };

      const result = resolveWorkflowId(progressData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('session-abc123');
      }
    });

    it('should fall back to taskId when neither jobId nor sessionId available', () => {
      const progressData = {
        taskId: 'task-1751827584613',
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'DecompositionService'
      };

      const result = resolveWorkflowId(progressData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('task-1751827584613');
      }
    });

    it('should fail gracefully when no valid ID is available', () => {
      const progressData = {
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'DecompositionService'
      };

      const result = resolveWorkflowId(progressData);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('No valid ID found');
      }
    });

    it('should handle the specific error case from server logs', () => {
      // This replicates the exact scenario from the error logs
      const errorCaseData = {
        taskId: 'task-1751827584613', // This was the taskId in the error
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'RDDEngine',
        message: 'Decomposing into sub-tasks via LLM'
      };

      const result = resolveWorkflowId(errorCaseData);

      // Should succeed in resolving the ID
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('task-1751827584613');
      }
    });
  });

  describe('WorkflowStateManager Error Handling', () => {
    it('should handle workflow not found gracefully using Result types', async () => {
      const nonExistentWorkflowId = 'workflow-does-not-exist';
      
      const result = await workflowStateManager.updateSubPhaseProgress(
        nonExistentWorkflowId,
        WorkflowPhase.DECOMPOSITION,
        'decomposition',
        50
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Workflow workflow-does-not-exist not found');
      }
    });

    it('should handle invalid phase gracefully using Result types', async () => {
      // First create a valid workflow
      const workflowId = createWorkflowId('test-workflow-123');
      const sessionId = createSessionId('test-session-123');
      
      await workflowStateManager.initializeWorkflow(
        workflowId,
        sessionId,
        'test-project-123'
      );

      // Try to update a phase that doesn't exist in the workflow
      const result = await workflowStateManager.updateSubPhaseProgress(
        workflowId,
        WorkflowPhase.EXECUTION, // This phase hasn't been initialized
        'task_execution',
        50
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Phase execution not found');
      }
    });

    it('should successfully update sub-phase progress for valid workflow', async () => {
      const workflowId = createWorkflowId('test-workflow-456');
      const sessionId = createSessionId('test-session-456');
      
      // Initialize workflow
      await workflowStateManager.initializeWorkflow(
        workflowId,
        sessionId,
        'test-project-456'
      );

      // Transition through initialization first, then to decomposition
      await workflowStateManager.transitionWorkflow(
        workflowId,
        WorkflowPhase.INITIALIZATION,
        WorkflowState.IN_PROGRESS
      );
      
      await workflowStateManager.transitionWorkflow(
        workflowId,
        WorkflowPhase.DECOMPOSITION,
        WorkflowState.PENDING
      );
      
      await workflowStateManager.transitionWorkflow(
        workflowId,
        WorkflowPhase.DECOMPOSITION,
        WorkflowState.IN_PROGRESS
      );

      // Update sub-phase progress
      const result = await workflowStateManager.updateSubPhaseProgress(
        workflowId,
        WorkflowPhase.DECOMPOSITION,
        'decomposition',
        75,
        WorkflowState.IN_PROGRESS,
        { test: 'metadata' }
      );

      expect(result.success).toBe(true);
      
      // Verify the update was applied
      const workflow = workflowStateManager.getWorkflow(workflowId);
      expect(workflow).toBeDefined();
      if (workflow) {
        const subPhaseStatus = workflowStateManager.getSubPhaseStatus(workflowId, WorkflowPhase.DECOMPOSITION);
        expect(subPhaseStatus).toBeDefined();
        if (subPhaseStatus) {
          const decompositionSubPhase = subPhaseStatus.get('decomposition');
          expect(decompositionSubPhase?.progress).toBe(75);
          expect(decompositionSubPhase?.state).toBe(WorkflowState.IN_PROGRESS);
          expect(decompositionSubPhase?.metadata.test).toBe('metadata');
        }
      }
    });
  });

  describe('End-to-End Error Handling Flow', () => {
    it('should handle the complete workflow not found scenario gracefully', async () => {
      // Simulate the exact error scenario from the logs
      const sessionId = createSessionId('session-real-workflow');
      const workflowId = createWorkflowId(sessionId);

      // Create a workflow with sessionId as workflowId (realistic scenario)
      await workflowStateManager.initializeWorkflow(
        workflowId,
        sessionId,
        'test-project-789'
      );

      // Transition through initialization first, then to decomposition
      await workflowStateManager.transitionWorkflow(
        workflowId,
        WorkflowPhase.INITIALIZATION,
        WorkflowState.IN_PROGRESS
      );
      
      await workflowStateManager.transitionWorkflow(
        workflowId,
        WorkflowPhase.DECOMPOSITION,
        WorkflowState.PENDING
      );
      
      await workflowStateManager.transitionWorkflow(
        workflowId,
        WorkflowPhase.DECOMPOSITION,
        WorkflowState.IN_PROGRESS
      );

      // Simulate progress event with different taskId (the error case)
      const progressEventData = {
        taskId: 'task-1751827584613', // Different from sessionId
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'RDDEngine',
        message: 'Decomposing into sub-tasks via LLM'
        // Note: No sessionId in metadata - this was the problem
      };

      // Test ID resolution - this should resolve to taskId since no sessionId in metadata
      const idResult = resolveWorkflowId(progressEventData);
      expect(idResult.success).toBe(true);
      
      if (idResult.success) {
        // This would be 'task-1751827584613', not the actual workflow ID
        expect(idResult.data).toBe('task-1751827584613');

        // Test updateSubPhaseProgress with the resolved (wrong) ID
        const updateResult = await workflowStateManager.updateSubPhaseProgress(
          idResult.data, // This is 'task-1751827584613', not the real workflow ID
          WorkflowPhase.DECOMPOSITION,
          'decomposition',
          50
        );

        // Should fail gracefully with Result type, not throw error
        expect(updateResult.success).toBe(false);
        if (!updateResult.success) {
          expect(updateResult.error).toContain('Workflow task-1751827584613 not found');
        }
      }

      // Now test the correct scenario where sessionId is available in metadata
      const correctProgressEventData = {
        taskId: 'task-1751827584613',
        metadata: {
          sessionId: sessionId // This makes ID resolution work correctly
        },
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'RDDEngine',
        message: 'Decomposing into sub-tasks via LLM'
      };

      const correctIdResult = resolveWorkflowId(correctProgressEventData);
      expect(correctIdResult.success).toBe(true);
      
      if (correctIdResult.success) {
        expect(correctIdResult.data).toBe(sessionId);

        const correctUpdateResult = await workflowStateManager.updateSubPhaseProgress(
          correctIdResult.data,
          WorkflowPhase.DECOMPOSITION,
          'decomposition',
          50
        );

        expect(correctUpdateResult.success).toBe(true);
      }
    });

    it('should demonstrate the fix prevents the original error', async () => {
      // This test demonstrates that our fix prevents the original error scenario
      
      // Step 1: Create workflow (as DecompositionService does)
      const sessionId = createSessionId('session-original-error');
      const workflowId = createWorkflowId(sessionId); // Workflow created with sessionId

      await workflowStateManager.initializeWorkflow(workflowId, sessionId, 'test-project');
      await workflowStateManager.transitionWorkflow(workflowId, WorkflowPhase.INITIALIZATION, WorkflowState.IN_PROGRESS);
      await workflowStateManager.transitionWorkflow(workflowId, WorkflowPhase.DECOMPOSITION, WorkflowState.PENDING);
      await workflowStateManager.transitionWorkflow(workflowId, WorkflowPhase.DECOMPOSITION, WorkflowState.IN_PROGRESS);

      // Step 2: Simulate problematic progress event (original error scenario)
      const problematicEvent = {
        taskId: 'task-1751827584613', // Progress event with taskId
        progressPercentage: 50,
        timestamp: new Date(),
        componentName: 'RDDEngine'
        // Missing sessionId in metadata - this was the original problem
      };

      // Step 3: Test old behavior (would fail with "Workflow not found")
      const oldIdResolution = problematicEvent.taskId; // Old logic: use taskId directly
      const oldResult = await workflowStateManager.updateSubPhaseProgress(
        oldIdResolution, // 'task-1751827584613' - doesn't exist as workflow
        WorkflowPhase.DECOMPOSITION,
        'decomposition',
        50
      );

      expect(oldResult.success).toBe(false); // This would have thrown before our fix
      if (!oldResult.success) {
        expect(oldResult.error).toContain('not found'); // Graceful failure instead of thrown error
      }

      // Step 4: Test new behavior (succeeds with proper metadata)
      const fixedEvent = {
        ...problematicEvent,
        metadata: {
          sessionId: sessionId // Fix: include sessionId in metadata
        }
      };

      const newIdResult = resolveWorkflowId(fixedEvent);
      expect(newIdResult.success).toBe(true);
      
      if (newIdResult.success) {
        const newResult = await workflowStateManager.updateSubPhaseProgress(
          newIdResult.data, // Correctly resolved sessionId
          WorkflowPhase.DECOMPOSITION,
          'decomposition',
          50
        );

        expect(newResult.success).toBe(true); // Success with the fix!
      }
    });
  });

  describe('Error Resilience', () => {
    it('should continue processing after failed progress updates', async () => {
      const originalError = console.error;
      console.error = () => { /* Mock console.error */ }; // Suppress error logs

      try {
        // Process multiple progress events, some valid, some invalid
        const events = [
          { taskId: 'invalid-1', progressPercentage: 25 }, // Should fail
          { taskId: 'invalid-2', progressPercentage: 50 }, // Should fail  
          { taskId: 'invalid-3', progressPercentage: 75 }  // Should fail
        ];

        for (const event of events) {
          const idResult = resolveWorkflowId(event);
          if (idResult.success) {
            const updateResult = await workflowStateManager.updateSubPhaseProgress(
              idResult.data,
              WorkflowPhase.DECOMPOSITION,
              'decomposition',
              event.progressPercentage
            );
            
            // All should fail gracefully, not throw
            expect(updateResult.success).toBe(false);
          }
        }

        // System should remain functional after errors
        const workflowId = createWorkflowId('resilience-test');
        const sessionId = createSessionId('resilience-session');
        
        const initResult = await workflowStateManager.initializeWorkflow(workflowId, sessionId, 'test-project');
        expect(initResult).toBeDefined(); // System still works

      } finally {
        console.error = originalError; // Restore original console.error
      }
    });
  });
});