/**
 * Integration test for job cancellation functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';
import type { ExecutionCoordinator } from '../../../tools/vibe-task-manager/services/execution-coordinator.js';

// Import jobManager after mocking to ensure proper initialization
const { jobManager, JobStatus } = await import('../index.js');

// Mock the SSE notifier
vi.mock('../../sse-notifier/index.js', () => ({
  sseNotifier: {
    sendProgress: vi.fn(),
  }
}));

// Mock the logger
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }
}));

// Mock ExecutionCoordinator
vi.mock('../../../tools/vibe-task-manager/services/execution-coordinator.js', () => ({
  ExecutionCoordinator: vi.fn().mockImplementation(() => ({
    executeTask: vi.fn(),
    cancelExecution: vi.fn(),
    getTaskExecutionStatus: vi.fn(),
    getExecutionMetrics: vi.fn(),
    onExecutionStateChange: vi.fn(),
  }))
}));

describe('Job Cancellation Integration', () => {
  let mockExecutionCoordinator: {
    executeTask: Mock;
    cancelExecution: Mock;
    getTaskExecutionStatus: Mock;
    getExecutionMetrics: Mock;
    onExecutionStateChange: Mock;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Clean up any existing jobs from JobManager singleton
    // @ts-expect-error - accessing internal method for testing
    jobManager.clearAllJobs(); // Clear all jobs
    
    // Create mock execution coordinator
    mockExecutionCoordinator = {
      executeTask: vi.fn(),
      cancelExecution: vi.fn(),
      getTaskExecutionStatus: vi.fn(),
      getExecutionMetrics: vi.fn(),
      onExecutionStateChange: vi.fn(),
    };
  });

  afterEach(() => {
    // Clean up jobs after each test
    // @ts-expect-error - accessing internal method for testing
    jobManager.clearAllJobs(); // Clear all jobs
    
    vi.clearAllMocks();
  });

  it('should cancel a running job via abort controller', async () => {
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    
    // Start the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Get abort signal
    const abortSignal = jobManager.getJobAbortSignal(jobId);
    expect(abortSignal).toBeDefined();
    expect(abortSignal?.aborted).toBe(false);
    
    // Set up abort listener
    let abortReason = '';
    abortSignal?.addEventListener('abort', () => {
      abortReason = (abortSignal as AbortSignal & { reason?: string }).reason || 'Aborted';
    });
    
    // Cancel the job
    const cancelled = await jobManager.cancelJob(jobId, 'User requested cancellation');
    expect(cancelled).toBe(true);
    
    // Check abort signal was triggered
    expect(abortSignal?.aborted).toBe(true);
    expect(abortReason).toContain('User requested cancellation');
    
    // Check job status
    const job = jobManager.getJob(jobId);
    expect(job?.status).toBe(JobStatus.FAILED);
    expect(job?.result?.isError).toBe(true);
    expect(job?.result?.content[0].text).toContain('Job cancelled: User requested cancellation');
  });

  it('should not cancel a job that is not running', async () => {
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    
    // Job is still pending
    const job = jobManager.getJob(jobId);
    expect(job?.status).toBe(JobStatus.PENDING);
    
    // Try to cancel
    const cancelled = await jobManager.cancelJob(jobId, 'Test cancellation');
    expect(cancelled).toBe(false);
    
    // Job should still be pending
    expect(jobManager.getJob(jobId)?.status).toBe(JobStatus.PENDING);
  });

  it('should handle cancellation of non-existent job', async () => {
    const cancelled = await jobManager.cancelJob('non-existent-job-id', 'Test');
    expect(cancelled).toBe(false);
  });

  it('should cancel job through ExecutionCoordinator when initialized', async () => {
    // Initialize execution adapter
    jobManager.initializeExecutionAdapter(mockExecutionCoordinator as ExecutionCoordinator);
    
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Create mock execution adapter with proper job mapping
    const adapter = jobManager.getExecutionAdapter();
    if (adapter) {
      // Mock the adapter to return success
      mockExecutionCoordinator.cancelExecution.mockResolvedValue(true);
      vi.spyOn(adapter, 'cancelJobExecution').mockResolvedValue(true);
    }
    
    // Cancel should go through ExecutionCoordinator
    const cancelled = await jobManager.cancelJob(jobId, 'Cancel via coordinator');
    expect(cancelled).toBe(true);
    
    // Verify adapter method was called
    if (adapter) {
      expect(adapter.cancelJobExecution).toHaveBeenCalledWith(jobId);
    }
  });

  it('should fall back to direct cancellation if ExecutionCoordinator fails', async () => {
    // Initialize execution adapter
    jobManager.initializeExecutionAdapter(mockExecutionCoordinator as ExecutionCoordinator);
    
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Get the adapter and make it fail
    const adapter = jobManager.getExecutionAdapter();
    if (adapter) {
      vi.spyOn(adapter, 'cancelJobExecution').mockRejectedValue(new Error('Coordinator error'));
    }
    
    // Cancel should fall back to direct cancellation
    const cancelled = await jobManager.cancelJob(jobId, 'Cancel with fallback');
    expect(cancelled).toBe(true);
    
    // Job should be cancelled
    const job = jobManager.getJob(jobId);
    expect(job?.status).toBe(JobStatus.FAILED);
    expect(job?.result?.content[0].text).toContain('Job cancelled: Cancel with fallback');
  });

  it('should handle multiple concurrent cancellations', async () => {
    const jobIds = [];
    
    // Create and start multiple jobs
    for (let i = 0; i < 5; i++) {
      const jobId = jobManager.createJob('test-tool', { index: i });
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Job ${i} started`);
      jobIds.push(jobId);
    }
    
    // Cancel all jobs concurrently
    const cancellations = jobIds.map(id => 
      jobManager.cancelJob(id, `Batch cancellation`)
    );
    
    const results = await Promise.all(cancellations);
    
    // All should be cancelled
    expect(results.every(r => r === true)).toBe(true);
    
    // Verify all jobs are failed
    for (const jobId of jobIds) {
      const job = jobManager.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
    }
  });

  it('should not cancel already completed jobs', async () => {
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    
    // Start and complete the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    jobManager.setJobResult(jobId, {
      isError: false,
      content: [{ type: 'text', text: 'Job completed successfully' }]
    });
    
    // Try to cancel completed job
    const cancelled = await jobManager.cancelJob(jobId, 'Too late');
    expect(cancelled).toBe(false);
    
    // Job should still be completed
    const job = jobManager.getJob(jobId);
    expect(job?.status).toBe(JobStatus.COMPLETED);
    expect(job?.result?.isError).toBe(false);
  });

  it('should handle job lifecycle with ExecutionCoordinator hooks', () => {
    // Initialize execution adapter
    jobManager.initializeExecutionAdapter(mockExecutionCoordinator as ExecutionCoordinator);
    
    // Get the registered callback
    const onStateChange = mockExecutionCoordinator.onExecutionStateChange.mock.calls[0]?.[0];
    expect(onStateChange).toBeDefined();
    
    // Create a job
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    
    // Get the adapter and manually set up the execution mapping
    const adapter = jobManager.getExecutionAdapter();
    if (adapter) {
      // Manually add the execution mapping that would normally be created during executeJob
      const executionId = 'exec-123';
      // @ts-expect-error - accessing internal property for testing
      adapter.executionToJobMap.set(executionId, jobId);
      // @ts-expect-error - accessing internal property for testing
      adapter.jobToExecutionMap.set(jobId, executionId);
      
      // Simulate state change event
      onStateChange({
        executionId: executionId,
        taskId: jobId,
        agentId: 'agent-1',
        previousStatus: 'queued',
        newStatus: 'running',
        timestamp: new Date(),
      });
      
      // Job should be updated to running
      let job = jobManager.getJob(jobId);
      expect(job?.status).toBe(JobStatus.RUNNING);
      
      // Simulate cancellation
      onStateChange({
        executionId: executionId,
        taskId: jobId,
        agentId: 'agent-1',
        previousStatus: 'running',
        newStatus: 'cancelled',
        timestamp: new Date(),
        metadata: { reason: 'Cancelled by coordinator' },
      });
      
      // Job should be failed
      job = jobManager.getJob(jobId);
      expect(job?.status).toBe(JobStatus.FAILED);
    }
  });

  it('should properly initialize abort controller on job start', () => {
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    
    // No abort controller before running
    let signal = jobManager.getJobAbortSignal(jobId);
    expect(signal).toBeUndefined();
    
    // Start the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting');
    
    // Should have abort controller now
    signal = jobManager.getJobAbortSignal(jobId);
    expect(signal).toBeDefined();
    expect(signal).toBeInstanceOf(AbortSignal);
    
    // Should track start time
    const job = jobManager.getJob(jobId);
    expect(job?.startedAt).toBeDefined();
    expect(job?.startedAt).toBeGreaterThan(0);
  });

  it('should support cancellation reason in abort signal', async () => {
    const jobId = jobManager.createJob('test-tool', { param1: 'value1' });
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Running');
    
    const signal = jobManager.getJobAbortSignal(jobId);
    expect(signal).toBeDefined();
    
    // Set up listener for abort
    const abortPromise = new Promise<string>((resolve) => {
      signal?.addEventListener('abort', () => {
        resolve((signal as AbortSignal & { reason?: string }).reason || 'No reason');
      });
    });
    
    // Cancel with specific reason
    await jobManager.cancelJob(jobId, 'Timeout exceeded');
    
    // Check abort reason
    const reason = await abortPromise;
    expect(reason).toBe('Timeout exceeded');
  });
});