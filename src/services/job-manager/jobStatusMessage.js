// src/services/job-manager/jobStatusMessage.ts
import { JobStatus } from './index.js';
/**
 * Creates a standardized job status message.
 * @param jobId The ID of the job.
 * @param toolName The name of the tool that created the job.
 * @param status The current status of the job.
 * @param message An optional progress message.
 * @param progress An optional progress percentage (0-100).
 * @param createdAt The timestamp when the job was created.
 * @param updatedAt The timestamp when the job was last updated.
 * @param details Optional detailed information for enhanced debugging.
 * @returns A standardized job status message.
 */
export function createJobStatusMessage(jobId, toolName, status, message, progress, createdAt, updatedAt, details) {
    const now = Date.now();
    // Calculate recommended polling interval based on status
    let pollingInterval;
    if (status === JobStatus.PENDING) {
        pollingInterval = 5000; // 5 seconds for pending jobs
    }
    else if (status === JobStatus.RUNNING) {
        pollingInterval = 2000; // 2 seconds for running jobs
    }
    return {
        jobId,
        toolName,
        status,
        message,
        progress,
        timestamp: now,
        createdAt: createdAt || now,
        updatedAt: updatedAt || now,
        ...(pollingInterval ? {
            pollingRecommendation: {
                interval: pollingInterval,
                nextCheckTime: now + pollingInterval
            }
        } : {}),
        ...(details ? { details } : {})
    };
}
