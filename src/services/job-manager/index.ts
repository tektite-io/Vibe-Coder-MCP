// src/services/job-manager/index.ts
import { randomUUID } from 'crypto';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import logger from '../../logger.js';
import { JobDetails } from './jobStatusMessage.js';

/**
 * Represents the possible statuses of a background job.
 */
export enum JobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Defines the structure of a background job tracked by the JobManager.
 */
export interface Job {
  id: string;
  toolName: string;
  params: Record<string, unknown>;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  progressMessage?: string; // Optional message describing the current step
  progressPercentage?: number; // Optional percentage of completion (0-100)
  result?: CallToolResult; // Final result (success or error)
  details?: JobDetails; // Optional detailed information for enhanced debugging
  // Properties for rate limiting
  lastAccessTime?: number; // When the job was last accessed via getJob
  accessCount?: number; // How many times the job has been accessed
}

/**
 * Manages the state of background jobs.
 * Uses a Singleton pattern.
 */
class JobManager {
  private jobs = new Map<string, Job>();

  /**
   * Gets the minimum wait time before the next status check based on the job's access history.
   * Implements an exponential backoff strategy.
   * @param jobId The ID of the job to check.
   * @returns The minimum wait time in milliseconds.
   */
  getMinimumWaitTime(jobId: string): number {
    const job = this.jobs.get(jobId);
    if (!job) {
      return 0; // No wait time for non-existent jobs
    }

    // If the job is completed or failed, no need to wait
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
      return 0;
    }

    // If the job was just created, no need to wait
    if (!job.lastAccessTime) {
      return 0;
    }

    // Calculate time since last access
    const timeSinceLastAccess = Date.now() - job.lastAccessTime;

    // Base wait time is 1 second
    const baseWaitTime = 1000;

    // Implement exponential backoff based on access count
    // Start with 1 second, then 2, 4, 8, etc. up to a maximum of 10 seconds
    const accessCount = job.accessCount || 0;
    const backoffFactor = Math.min(Math.pow(2, Math.floor(accessCount / 3)), 10);
    const recommendedWaitTime = baseWaitTime * backoffFactor;

    // If enough time has passed since last access, no need to wait
    if (timeSinceLastAccess >= recommendedWaitTime) {
      return 0;
    }

    // Return the remaining wait time
    return recommendedWaitTime - timeSinceLastAccess;
  }

  /**
   * Updates the access time and count for a job.
   * @param jobId The ID of the job to update.
   */
  updateJobAccess(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) {
      return;
    }

    // Update last access time
    job.lastAccessTime = Date.now();

    // Increment access count
    job.accessCount = (job.accessCount || 0) + 1;
  }

  /**
   * Gets a job by its ID with rate limiting.
   * @param jobId The ID of the job to retrieve.
   * @param updateAccess Whether to update the access time and count.
   * @returns An object containing the job, wait time, and whether to wait.
   */
  getJobWithRateLimit(jobId: string, updateAccess: boolean = true): {
    job: Job | undefined;
    waitTime: number;
    shouldWait: boolean;
  } {
    const job = this.jobs.get(jobId);

    if (!job) {
      return { job: undefined, waitTime: 0, shouldWait: false };
    }

    // Get minimum wait time
    const waitTime = this.getMinimumWaitTime(jobId);
    const shouldWait = waitTime > 0;

    // Update access time and count if requested and not rate limited
    if (updateAccess && !shouldWait) {
      this.updateJobAccess(jobId);
    }

    return { job, waitTime, shouldWait };
  }

  /**
   * Creates a new job and stores it.
   * @param toolName The name of the tool being executed.
   * @param params The parameters the tool was called with.
   * @returns The ID of the newly created job.
   */
  createJob(toolName: string, params: Record<string, unknown>): string {
    const jobId = randomUUID();
    const now = Date.now();
    const newJob: Job = {
      id: jobId,
      toolName,
      params,
      status: JobStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(jobId, newJob);
    logger.info({ jobId, toolName }, `Created new background job.`);
    // TODO: Notify via SSE later
    // sseNotifier.sendProgress(sessionId, jobId, JobStatus.PENDING, 'Job created');
    return jobId;
  }

  /**
   * Retrieves a job by its ID.
   * @param jobId The ID of the job to retrieve.
   * @param updateAccess Whether to update the access time and count (default: true).
   * @returns The Job object or undefined if not found.
   */
  getJob(jobId: string, updateAccess: boolean = true): Job | undefined {
    const job = this.jobs.get(jobId);

    if (job && updateAccess) {
      // Update access time and count
      this.updateJobAccess(jobId);
    }

    return job;
  }

  /**
   * Updates the status and optional progress message of a job.
   * @param jobId The ID of the job to update.
   * @param status The new status for the job.
   * @param progressMessage An optional message describing the current progress.
   * @param progressPercentage An optional percentage of completion (0-100).
   * @param details Optional detailed information for enhanced debugging.
   * @returns True if the job was found and updated, false otherwise.
   */
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    progressMessage?: string,
    progressPercentage?: number,
    details?: JobDetails
  ): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.warn({ jobId }, `Attempted to update status for non-existent job.`);
      return false;
    }

    // Prevent updating status of already completed/failed jobs? Maybe allow for edge cases.
    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
        logger.warn({ jobId, currentStatus: job.status, newStatus: status }, `Attempted to update status of a finalized job.`);
        // Optionally return false or allow update
    }

    job.status = status;
    job.updatedAt = Date.now();
    if (progressMessage !== undefined) {
      job.progressMessage = progressMessage;
    }
    if (progressPercentage !== undefined) {
      job.progressPercentage = progressPercentage;
    }
    if (details !== undefined) {
      job.details = details;
    }

    logger.info({
      jobId,
      status,
      progressMessage,
      progressPercentage,
      hasDetails: !!details
    }, `Updated job status.`);

    // TODO: Notify via SSE later
    // sseNotifier.sendProgress(sessionId, jobId, status, progressMessage);
    return true;
  }

  /**
   * Sets the final result (success or error) of a job and updates its status.
   * Automatically sets status to COMPLETED or FAILED based on result.isError.
   * @param jobId The ID of the job to set the result for.
   * @param result The final CallToolResult object.
   * @returns True if the job was found and the result was set, false otherwise.
   */
  setJobResult(jobId: string, result: CallToolResult): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      logger.warn({ jobId }, `Attempted to set result for non-existent job.`);
      return false;
    }

    if (job.status === JobStatus.COMPLETED || job.status === JobStatus.FAILED) {
        logger.warn({ jobId, currentStatus: job.status }, `Attempted to set result for an already finalized job.`);
        // Optionally overwrite or return false
        // return false;
    }

    job.result = result;
    job.status = result.isError ? JobStatus.FAILED : JobStatus.COMPLETED;
    job.updatedAt = Date.now();
    job.progressMessage = result.isError ? 'Job failed' : 'Job completed successfully'; // Set final message
    job.progressPercentage = 100; // Set progress to 100% when job is completed

    logger.info({ jobId, finalStatus: job.status }, `Set final job result.`);
    // TODO: Notify via SSE later
    // sseNotifier.sendProgress(sessionId, jobId, job.status, job.progressMessage);
    return true;
  }

  // Optional: Add cleanup logic for old jobs if needed
  // cleanupOldJobs(maxAgeMs: number) { ... }
}

// Export a singleton instance
export const jobManager = new JobManager();
