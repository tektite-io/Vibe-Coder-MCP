/**
 * Progress-Job Manager Bridge Service
 * 
 * Bridges ProgressTracker events with JobManagerIntegrationService
 * for seamless real-time status broadcasting across the system.
 * 
 * Follows existing patterns: singleton, event-driven, ESM modules
 */

import { EventEmitter } from 'events';
import { ProgressTracker, ProgressEventData } from '../services/progress-tracker.js';
import { JobManagerIntegrationService } from './job-manager-integration.js';
import { mapSubtaskToParentWorkflowId } from '../services/workflow-state-manager.js';
import logger from '../../../logger.js';

/**
 * Bridge configuration for connecting progress events to job updates
 */
export interface ProgressJobBridgeConfig {
  enableProgressMapping: boolean;
  enableResourceTracking: boolean;
  progressUpdateThreshold: number; // Minimum progress change to trigger update
  debounceMs: number; // Debounce rapid updates
}

/**
 * Progress-Job Manager Bridge Service
 * Connects ProgressTracker events to JobManagerIntegrationService updates
 */
export class ProgressJobBridge extends EventEmitter {
  private static instance: ProgressJobBridge;
  private progressTracker: ProgressTracker;
  private jobManagerIntegration: JobManagerIntegrationService;
  private config: ProgressJobBridgeConfig;
  private lastProgressUpdate = new Map<string, number>(); // Track last progress per job
  private updateTimers = new Map<string, NodeJS.Timeout>(); // Debounce timers

  private constructor(config?: Partial<ProgressJobBridgeConfig>) {
    super();
    
    this.config = {
      enableProgressMapping: true,
      enableResourceTracking: true,
      progressUpdateThreshold: 5, // Update every 5% progress change
      debounceMs: 500, // 500ms debounce
      ...config
    };

    this.progressTracker = ProgressTracker.getInstance();
    this.jobManagerIntegration = JobManagerIntegrationService.getInstance();

    this.initializeEventBridges();
    
    logger.info({ config: this.config }, 'ProgressJobBridge initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ProgressJobBridgeConfig>): ProgressJobBridge {
    if (!ProgressJobBridge.instance) {
      ProgressJobBridge.instance = new ProgressJobBridge(config);
    }
    return ProgressJobBridge.instance;
  }

  /**
   * Initialize event bridges between ProgressTracker and JobManagerIntegration
   */
  private initializeEventBridges(): void {
    if (!this.config.enableProgressMapping) {
      logger.debug('Progress mapping disabled in config');
      return;
    }

    // Bridge decomposition progress events
    this.progressTracker.addEventListener('decomposition_progress', (data) => {
      this.handleDecompositionProgress(data);
    });

    // Bridge decomposition completion events
    this.progressTracker.addEventListener('decomposition_completed', (data) => {
      this.handleDecompositionCompleted(data);
    });

    // Bridge task progress events
    this.progressTracker.addEventListener('task_progress_updated', (data) => {
      this.handleTaskProgressUpdated(data);
    });

    // Bridge task completion events
    this.progressTracker.addEventListener('task_completed', (data) => {
      this.handleTaskCompleted(data);
    });

    // Bridge task failure events
    this.progressTracker.addEventListener('task_failed', (data) => {
      this.handleTaskFailed(data);
    });

    logger.debug('Progress-Job event bridges initialized');
  }

  /**
   * Handle decomposition progress events
   */
  private handleDecompositionProgress(data: ProgressEventData): void {
    const jobId = this.extractJobId(data);
    if (!jobId || !data.progressPercentage) {
      return;
    }

    // Check if progress change meets threshold
    const lastProgress = this.lastProgressUpdate.get(jobId) || 0;
    const progressDelta = Math.abs(data.progressPercentage - lastProgress);
    
    if (progressDelta < this.config.progressUpdateThreshold) {
      return; // Skip update if change is too small
    }

    this.debounceJobUpdate(jobId, () => {
      this.updateJobProgress(
        jobId,
        data.progressPercentage!,
        data.message || `Decomposition: ${data.progressPercentage}%`,
        this.extractResourceUsage(data)
      );
      
      this.lastProgressUpdate.set(jobId, data.progressPercentage!);
    });
  }

  /**
   * Handle decomposition completion events
   */
  private handleDecompositionCompleted(data: ProgressEventData): void {
    const jobId = this.extractJobId(data);
    if (!jobId) {
      return;
    }

    // Clear any pending updates
    const timer = this.updateTimers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.updateTimers.delete(jobId);
    }

    // Complete the job
    this.jobManagerIntegration.completeJob(
      jobId,
      {
        success: true,
        decompositionResults: data.metadata,
        completedAt: data.timestamp
      },
      {
        performanceScore: 100, // Successful completion
        resourceUsage: {
          peakMemoryMB: process.memoryUsage().heapUsed / 1024 / 1024,
          averageCpuUsage: 0
        }
      }
    ).catch(error => {
      logger.debug({ err: error, jobId }, 'Failed to complete job via bridge');
    });

    // Clean up tracking
    this.lastProgressUpdate.delete(jobId);
    
    logger.debug({ jobId, data }, 'Decomposition job completed via bridge');
  }

  /**
   * Handle task progress events
   */
  private handleTaskProgressUpdated(data: ProgressEventData): void {
    const jobId = this.extractJobId(data);
    if (!jobId || !data.progressPercentage) {
      return;
    }

    this.debounceJobUpdate(jobId, () => {
      this.updateJobProgress(
        jobId,
        data.progressPercentage!,
        data.message || `Task progress: ${data.progressPercentage}%`,
        this.extractResourceUsage(data)
      );
    });
  }

  /**
   * Handle task completion events
   */
  private handleTaskCompleted(data: ProgressEventData): void {
    const jobId = this.extractJobId(data);
    if (!jobId) {
      return;
    }

    this.jobManagerIntegration.completeJob(
      jobId,
      {
        success: true,
        taskResults: data.metadata,
        completedAt: data.timestamp
      }
    ).catch(error => {
      logger.debug({ err: error, jobId }, 'Failed to complete task job via bridge');
    });
  }

  /**
   * Handle task failure events
   */
  private handleTaskFailed(data: ProgressEventData): void {
    const jobId = this.extractJobId(data);
    if (!jobId) {
      return;
    }

    this.jobManagerIntegration.failJob(
      jobId,
      new Error(data.message || 'Task failed'),
      true // Allow retry
    ).catch(error => {
      logger.debug({ err: error, jobId }, 'Failed to mark job as failed via bridge');
    });
  }

  /**
   * Debounce job updates to prevent overwhelming the job manager
   */
  private debounceJobUpdate(jobId: string, updateFn: () => void): void {
    // Clear existing timer
    const existingTimer = this.updateTimers.get(jobId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      updateFn();
      this.updateTimers.delete(jobId);
    }, this.config.debounceMs);

    this.updateTimers.set(jobId, timer);
  }

  /**
   * Update job progress with error handling
   */
  private updateJobProgress(
    jobId: string,
    progress: number,
    message?: string,
    resourceUsage?: { peakMemoryMB?: number; averageCpuUsage?: number }
  ): void {
    this.jobManagerIntegration.updateJobProgress(
      jobId,
      progress,
      message,
      resourceUsage
    ).catch(error => {
      logger.debug({ err: error, jobId, progress }, 'Failed to update job progress via bridge');
    });
  }

  /**
   * Extract job ID from progress event data with subtask-to-parent mapping
   */
  private extractJobId(data: ProgressEventData): string | null {
    // Try different possible jobId sources
    const rawJobId = (
      data.metadata?.jobId as string ||
      data.metadata?.sessionId as string ||
      data.taskId ||
      null
    );

    if (!rawJobId) {
      return null;
    }

    // Apply subtask-to-parent mapping for RDD engine subtasks
    // e.g., task-123-atomic-01 -> task-123
    const mappedJobId = mapSubtaskToParentWorkflowId(rawJobId);
    
    if (mappedJobId !== rawJobId) {
      logger.debug({
        originalJobId: rawJobId,
        mappedJobId,
        eventType: data.event
      }, 'Mapped subtask ID to parent workflow ID for job resolution');
    }

    return mappedJobId;
  }

  /**
   * Extract resource usage from progress event data
   */
  private extractResourceUsage(data: ProgressEventData): { peakMemoryMB?: number; averageCpuUsage?: number } | undefined {
    if (!this.config.enableResourceTracking) {
      return undefined;
    }

    const metadata = data.metadata as Record<string, unknown> | undefined;
    return {
      peakMemoryMB: (metadata?.resourceUsage as { peakMemoryMB?: number })?.peakMemoryMB || process.memoryUsage().heapUsed / 1024 / 1024,
      averageCpuUsage: (metadata?.resourceUsage as { averageCpuUsage?: number })?.averageCpuUsage || 0
    };
  }

  /**
   * Get bridge statistics
   */
  getBridgeStats(): {
    activeJobs: number;
    pendingUpdates: number;
    totalProgressUpdates: number;
    config: ProgressJobBridgeConfig;
  } {
    return {
      activeJobs: this.lastProgressUpdate.size,
      pendingUpdates: this.updateTimers.size,
      totalProgressUpdates: this.lastProgressUpdate.size,
      config: this.config
    };
  }

  /**
   * Dispose of the bridge service
   */
  dispose(): void {
    // Clear all timers
    for (const timer of this.updateTimers.values()) {
      clearTimeout(timer);
    }
    this.updateTimers.clear();
    this.lastProgressUpdate.clear();
    this.removeAllListeners();
    
    logger.info('ProgressJobBridge disposed');
  }
}

/**
 * Export singleton instance
 */
export const progressJobBridge = ProgressJobBridge.getInstance();

/**
 * Convenience function to get bridge instance
 */
export function getProgressJobBridge(config?: Partial<ProgressJobBridgeConfig>): ProgressJobBridge {
  return ProgressJobBridge.getInstance(config);
}