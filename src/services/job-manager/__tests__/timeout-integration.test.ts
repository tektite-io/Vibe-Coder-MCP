/**
 * Integration test for job timeout enforcement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TimeoutManager } from '../../../tools/vibe-task-manager/utils/timeout-manager.js';
import { JobTimeoutConfigManager } from '../../../utils/job-timeout-config-manager.js';

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

// Mock job timeout config
const mockTimeoutConfig = {
  'test-tool-fast': {
    timeoutOperation: 'llmRequest',
    customTimeoutMs: 100, // 100ms timeout for fast testing
  },
  'test-tool-slow': {
    timeoutOperation: 'taskExecution',
    customTimeoutMs: 5000, // 5 second timeout
  }
};

describe('Job Timeout Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    
    // Clean up any existing jobs from JobManager singleton
    // @ts-expect-error - accessing internal method for testing
    jobManager.clearAllJobs(); // Clear all jobs
    
    // Mock the timeout config manager
    const configManager = JobTimeoutConfigManager.getInstance();
    vi.spyOn(configManager, 'getTimeoutOperation').mockImplementation((toolName) => {
      const config = mockTimeoutConfig[toolName as keyof typeof mockTimeoutConfig];
      return config?.timeoutOperation || 'taskExecution';
    });
    
    vi.spyOn(configManager, 'getCustomTimeoutMs').mockImplementation((toolName) => {
      const config = mockTimeoutConfig[toolName as keyof typeof mockTimeoutConfig];
      return config?.customTimeoutMs;
    });
  });

  afterEach(() => {
    // Clean up jobs after each test
    // @ts-expect-error - accessing internal method for testing
    jobManager.clearAllJobs(); // Clear all jobs
    
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should have access to jobManager methods', () => {
    // Debug test to check available methods
    expect(jobManager).toBeDefined();
    
    // Log available methods
    console.log('jobManager type:', typeof jobManager);
    console.log('jobManager constructor:', jobManager.constructor.name);
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(jobManager))
      .filter(name => typeof jobManager[name as keyof typeof jobManager] === 'function')
      .sort();
    console.log('Available methods:', methods);
    
    expect(typeof jobManager.createJob).toBe('function');
    expect(typeof jobManager.isJobTimedOut).toBe('function');
    expect(typeof jobManager.getJobAbortSignal).toBe('function');
    expect(typeof jobManager.setJobTimeout).toBe('function');
    expect(typeof jobManager.cancelJob).toBe('function');
  });

  it('should assign timeout configuration when creating a job', () => {
    const jobId = jobManager.createJob('test-tool-fast', { param1: 'value1' });
    const job = jobManager.getJob(jobId);

    expect(job).toBeDefined();
    expect(job?.timeoutOperation).toBe('llmRequest');
    expect(job?.timeoutMs).toBe(100);
  });

  it('should detect timeout for running jobs', async () => {
    const jobId = jobManager.createJob('test-tool-fast', { param1: 'value1' });
    
    // Start the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Initially should not be timed out
    expect(jobManager.isJobTimedOut(jobId)).toBe(false);
    
    // Advance time past the timeout
    vi.advanceTimersByTime(150); // 150ms > 100ms timeout
    
    // Now should be timed out
    expect(jobManager.isJobTimedOut(jobId)).toBe(true);
  });

  it('should not timeout jobs that complete within time limit', () => {
    const jobId = jobManager.createJob('test-tool-slow', { param1: 'value1' });
    
    // Start the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Advance time but not past timeout
    vi.advanceTimersByTime(2000); // 2s < 5s timeout
    
    // Should not be timed out
    expect(jobManager.isJobTimedOut(jobId)).toBe(false);
    
    // Complete the job
    jobManager.setJobResult(jobId, {
      isError: false,
      content: [{ type: 'text', text: 'Job completed successfully' }]
    });
    
    // Completed jobs should never be considered timed out
    expect(jobManager.isJobTimedOut(jobId)).toBe(false);
  });

  it('should handle jobs without timeout configuration', () => {
    const jobId = jobManager.createJob('unknown-tool', { param1: 'value1' });
    const job = jobManager.getJob(jobId);
    
    expect(job).toBeDefined();
    expect(job?.timeoutOperation).toBe('taskExecution'); // Default
    expect(job?.timeoutMs).toBeUndefined(); // No custom timeout
  });

  it('should provide abort signal for cancellation', () => {
    const jobId = jobManager.createJob('test-tool-fast', { param1: 'value1' });
    
    // Initially no abort signal (job is pending)
    let abortSignal = jobManager.getJobAbortSignal(jobId);
    expect(abortSignal).toBeUndefined();
    
    // Start the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Now should have abort signal
    abortSignal = jobManager.getJobAbortSignal(jobId);
    expect(abortSignal).toBeDefined();
    expect(abortSignal?.aborted).toBe(false);
  });

  it('should track timeout with custom timeout value', () => {
    const jobId = jobManager.createJob('test-tool-fast', { param1: 'value1' });
    
    // Override with custom timeout
    jobManager.setJobTimeout(jobId, 'llmRequest', 500); // 500ms custom timeout
    
    const job = jobManager.getJob(jobId);
    expect(job?.timeoutMs).toBe(500);
    
    // Start the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Should not timeout before custom timeout
    vi.advanceTimersByTime(400);
    expect(jobManager.isJobTimedOut(jobId)).toBe(false);
    
    // Should timeout after custom timeout
    vi.advanceTimersByTime(200); // Total 600ms > 500ms
    expect(jobManager.isJobTimedOut(jobId)).toBe(true);
  });

  it('should use TimeoutManager for timeout calculation', () => {
    const timeoutManager = TimeoutManager.getInstance();
    const getTimeoutSpy = vi.spyOn(timeoutManager, 'getTimeout');
    
    const jobId = jobManager.createJob('test-tool-no-custom', { param1: 'value1' });
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    
    // Set job timeout without custom ms
    jobManager.setJobTimeout(jobId, 'taskDecomposition');
    
    // Check if job is timed out (this should use TimeoutManager)
    jobManager.isJobTimedOut(jobId);
    
    // Verify TimeoutManager was called
    expect(getTimeoutSpy).toHaveBeenCalledWith('taskDecomposition');
  });

  it('should handle concurrent jobs with different timeouts', () => {
    // Create two jobs with different timeouts
    const fastJobId = jobManager.createJob('test-tool-fast', { job: 'fast' });
    const slowJobId = jobManager.createJob('test-tool-slow', { job: 'slow' });
    
    // Start both jobs
    jobManager.updateJobStatus(fastJobId, JobStatus.RUNNING, 'Fast job started');
    jobManager.updateJobStatus(slowJobId, JobStatus.RUNNING, 'Slow job started');
    
    // Advance time past fast timeout but not slow
    vi.advanceTimersByTime(150);
    
    // Fast job should be timed out, slow job should not
    expect(jobManager.isJobTimedOut(fastJobId)).toBe(true);
    expect(jobManager.isJobTimedOut(slowJobId)).toBe(false);
  });

  it('should not timeout pending jobs', () => {
    const jobId = jobManager.createJob('test-tool-fast', { param1: 'value1' });
    
    // Don't start the job, leave it pending
    const job = jobManager.getJob(jobId);
    expect(job?.status).toBe(JobStatus.PENDING);
    
    // Advance time
    vi.advanceTimersByTime(1000);
    
    // Pending jobs should not timeout
    expect(jobManager.isJobTimedOut(jobId)).toBe(false);
  });

  it('should clean up timeout tracking for completed jobs', () => {
    const jobId = jobManager.createJob('test-tool-fast', { param1: 'value1' });
    
    // Start and complete the job
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job started');
    jobManager.setJobResult(jobId, {
      isError: false,
      content: [{ type: 'text', text: 'Success' }]
    });
    
    const job = jobManager.getJob(jobId);
    expect(job?.status).toBe(JobStatus.COMPLETED);
    
    // Advance time way past timeout
    vi.advanceTimersByTime(10000);
    
    // Completed jobs should never timeout
    expect(jobManager.isJobTimedOut(jobId)).toBe(false);
  });
});