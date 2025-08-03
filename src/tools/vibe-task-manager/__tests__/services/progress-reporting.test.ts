import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DecompositionService } from '../../services/decomposition-service.js';
import { WorkflowAwareAgentManager } from '../../services/workflow-aware-agent-manager.js';
import { sseNotifier } from '../../../../services/sse-notifier/index.js';
import { createMockConfig } from '../utils/test-setup.js';

// Mock dependencies
vi.mock('../../../../services/sse-notifier/index.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn()
  }
}));

vi.mock('../../../../services/job-manager/index.js', () => ({
  jobManager: {
    getJob: vi.fn().mockReturnValue({
      id: 'test-job-id',
      toolName: 'vibe-task-manager',
      status: 'running',
      createdAt: new Date(),
      updatedAt: new Date()
    }),
    updateJobStatus: vi.fn()
  },
  JobStatus: {
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed'
  }
}));

// Mock stderr write for stdio progress
const originalStderrWrite = process.stderr.write;
const stderrOutput: string[] = [];

describe('Enhanced Progress Reporting', () => {
  let decompositionService: DecompositionService;
  let workflowManager: WorkflowAwareAgentManager;
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    stderrOutput.length = 0;
    
    // Mock stderr write to capture progress output
    process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
      if (typeof chunk === 'string') {
        stderrOutput.push(chunk);
      }
      return true;
    }) as unknown as typeof process.stderr.write;

    mockConfig = createMockConfig();
    decompositionService = new DecompositionService(mockConfig);
    workflowManager = new WorkflowAwareAgentManager(mockConfig);
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
  });

  describe('Decomposition Progress Events', () => {
    it('should emit granular progress events during decomposition', async () => {
      const progressEvents: Array<{ step: string; progress: number; metadata?: Record<string, unknown> }> = [];

      // Listen for progress events
      decompositionService.on('decomposition_progress', (event) => {
        progressEvents.push({
          step: event.step,
          progress: event.progress,
          metadata: event.metadata
        });
      });

      // Trigger decomposition (mock the internal flow)
      const mockSession = {
        id: 'test-session',
        projectId: 'test-project',
        taskId: 'test-task'
      };
      const mockRequest = {
        task: {
          id: 'test-task',
          title: 'Test Task',
          type: 'development'
        },
        context: {
          projectId: 'test-project',
          languages: ['typescript'],
          frameworks: ['react']
        }
      };

      // Emit test events to simulate decomposition flow
      const serviceWithPrivate = decompositionService as unknown as { 
        emitProgressEvent: (session: unknown, request: unknown, progress: number, step: string, phase: string) => void 
      };
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 10, 'decomposition_started', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 20, 'context_enrichment_completed', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 80, 'decomposition_completed', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 82, 'epic_generation_started', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 85, 'task_persistence_started', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 87, 'task_persisted', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 90, 'dependency_analysis_started', 'DECOMPOSITION');
      serviceWithPrivate.emitProgressEvent(mockSession, mockRequest, 95, 'dependency_analysis_completed', 'DECOMPOSITION');
      
      // Wait a bit for events to be processed
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Verify events were received
      expect(progressEvents).toHaveLength(8);
      expect(progressEvents[0]).toMatchObject({
        step: 'decomposition_started',
        progress: 10
      });
      expect(progressEvents[1]).toMatchObject({
        step: 'context_enrichment_completed',
        progress: 20
      });
      expect(progressEvents[2]).toMatchObject({
        step: 'decomposition_completed',
        progress: 80
      });
      expect(progressEvents[3]).toMatchObject({
        step: 'epic_generation_started',
        progress: 82
      });
      expect(progressEvents[4]).toMatchObject({
        step: 'task_persistence_started',
        progress: 85
      });
      expect(progressEvents[5]).toMatchObject({
        step: 'task_persisted',
        progress: expect.any(Number) // 85-90%
      });
      expect(progressEvents[6]).toMatchObject({
        step: 'dependency_analysis_started',
        progress: 90
      });
      expect(progressEvents[7]).toMatchObject({
        step: 'dependency_analysis_completed',
        progress: 95
      });
    });
  });

  describe('Workflow Manager Progress Handling', () => {
    it('should create detailed progress messages for each subprocess', async () => {
      const testCases = [
        {
          step: 'decomposition_started',
          progress: 10,
          expectedMessage: 'Decomposition started - analyzing task complexity'
        },
        {
          step: 'epic_generation_started',
          progress: 82,
          metadata: { taskCount: 5 },
          expectedMessage: 'Epic identification started - analyzing 5 tasks'
        },
        {
          step: 'task_persisted',
          progress: 87,
          metadata: { message: 'Task 3/5 persisted: User Authentication' },
          expectedMessage: 'Task 3/5 persisted: User Authentication'
        },
        {
          step: 'dependency_analysis_completed',
          progress: 95,
          expectedMessage: 'Dependency analysis completed - task graph generated'
        },
        {
          step: 'decomposition_completed',
          progress: 100,
          metadata: { persistedTasks: 5 },
          expectedMessage: 'Decomposition completed - 5 tasks ready'
        }
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        
        const managerWithPrivate = workflowManager as unknown as {
          handleDecompositionProgress: (data: Record<string, unknown>) => Promise<void>
        };
        await managerWithPrivate.handleDecompositionProgress({
          sessionId: 'test-session',
          agentId: 'test-agent',
          progress: testCase.progress,
          step: testCase.step,
          metadata: testCase.metadata,
          originalSessionId: 'stdio-session',
          jobId: 'test-job-id'
        });

        // Verify SSE notifier was called with the correct message
        expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
          'stdio-session',
          'test-job-id',
          'running',
          testCase.expectedMessage,
          testCase.progress
        );
      }
    });
  });

  describe('Stdio Transport Progress Mapping', () => {
    it('should emit progress to stderr for stdio transport', () => {
      // Clear any previous output
      stderrOutput.length = 0;

      // Trigger progress update for stdio session
      sseNotifier.sendProgress(
        'stdio-session',
        'job-123',
        'running',
        'Epic identification started - analyzing 5 tasks',
        82
      );

      // Verify stderr output
      const stderrJson = stderrOutput.find(line => line.includes('[PROGRESS]'));
      expect(stderrJson).toBeDefined();
      
      if (stderrJson) {
        const match = stderrJson.match(/\[PROGRESS\] (.+)\n/);
        expect(match).toBeDefined();
        
        if (match) {
          const progressData = JSON.parse(match[1]);
          expect(progressData).toMatchObject({
            type: 'progress',
            jobId: 'job-123',
            tool: 'vibe-task-manager',
            status: 'running',
            message: 'Epic identification started - analyzing 5 tasks',
            progress: 82
          });
        }
      }
    });
  });

  describe('Progress Message Details', () => {
    it('should include subprocess details in progress messages', async () => {
      const progressData = {
        sessionId: 'test-session',
        agentId: 'test-agent',
        progress: 87,
        step: 'task_persisted',
        metadata: {
          persistedCount: 3,
          totalTasks: 5,
          currentTask: 'User Authentication Module',
          message: 'Persisted task 3/5: User Authentication Module'
        },
        originalSessionId: 'stdio-session',
        jobId: 'test-job-id'
      };

      const managerWithPrivate = workflowManager as unknown as {
        handleDecompositionProgress: (data: Record<string, unknown>) => Promise<void>
      };
      await managerWithPrivate.handleDecompositionProgress(progressData);

      // Verify the detailed message was used
      expect(sseNotifier.sendProgress).toHaveBeenCalledWith(
        'stdio-session',
        'test-job-id',
        'running',
        'Persisted task 3/5: User Authentication Module',
        87
      );
    });
  });
});