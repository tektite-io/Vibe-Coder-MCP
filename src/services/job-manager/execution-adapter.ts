/**
 * Job-to-Execution Adapter
 * 
 * Bridges the Job Manager with the ExecutionCoordinator by converting
 * Job format to ScheduledTask format and managing the execution lifecycle.
 */

import { Job, JobStatus } from './index.js';
import { ScheduledTask, SchedulingAlgorithm } from '../../tools/vibe-task-manager/services/task-scheduler.js';
import { ExecutionCoordinator, TaskExecution, ExecutionStatus } from '../../tools/vibe-task-manager/services/execution-coordinator.js';
import { AtomicTask, TaskPriority, TaskType, TaskStatus } from '../../tools/vibe-task-manager/types/task.js';
import logger from '../../logger.js';

/**
 * Adapter to convert Job Manager jobs to ExecutionCoordinator tasks
 */
export class JobExecutionAdapter {
  private executionCoordinator: ExecutionCoordinator;
  private jobToExecutionMap = new Map<string, string>(); // jobId -> executionId
  private executionToJobMap = new Map<string, string>(); // executionId -> jobId

  constructor(executionCoordinator: ExecutionCoordinator) {
    this.executionCoordinator = executionCoordinator;
  }

  /**
   * Convert a Job to a ScheduledTask format
   */
  convertJobToScheduledTask(job: Job): ScheduledTask {
    // Extract task parameters
    const { toolName, params } = job;
    
    // Create an atomic task that represents the job
    const atomicTask: AtomicTask = {
      id: job.id,
      title: `${toolName} execution`,
      description: params.description as string || `Executing ${toolName} tool`,
      status: 'pending' as TaskStatus,
      priority: (params.priority as TaskPriority) || 'medium',
      type: 'development' as TaskType, // Default type for tool executions
      functionalArea: 'backend', // Default functional area
      estimatedHours: params.estimatedHours as number || 1,
      actualHours: undefined,
      epicId: params.epicId as string || 'default-epic',
      projectId: params.projectId as string || 'default-project',
      dependencies: [],
      dependents: [],
      filePaths: [],
      acceptanceCriteria: params.acceptanceCriteria as string[] || [`${toolName} execution completed successfully`],
      testingRequirements: {
        unitTests: [],
        integrationTests: [],
        performanceTests: [],
        coverageTarget: 0
      },
      performanceCriteria: {},
      qualityCriteria: {
        codeQuality: [],
        documentation: [],
        typeScript: false,
        eslint: false
      },
      integrationCriteria: {
        compatibility: [],
        patterns: []
      },
      validationMethods: {
        automated: [],
        manual: []
      },
      createdAt: new Date(job.createdAt),
      updatedAt: new Date(job.updatedAt),
      createdBy: 'job-manager',
      tags: params.tags as string[] || [toolName],
      metadata: {
        createdAt: new Date(job.createdAt),
        updatedAt: new Date(job.updatedAt),
        createdBy: 'job-manager',
        tags: params.tags as string[] || [toolName]
      }
    };
    
    // Create a scheduled task that represents the job
    const scheduledTask: ScheduledTask = {
      task: atomicTask,
      scheduledStart: new Date(), // Schedule to start immediately
      scheduledEnd: new Date(Date.now() + (params.estimatedHours as number || 1) * 60 * 60 * 1000), // Based on estimated hours
      assignedResources: {
        memoryMB: params.estimatedMemoryMB as number || 256,
        cpuWeight: params.estimatedCPUWeight as number || 1.0,
        agentId: params.agentId as string
      },
      batchId: 0, // Default batch ID for individual jobs
      prerequisiteTasks: [],
      dependentTasks: [],
      metadata: {
        algorithm: 'priority_first' as SchedulingAlgorithm, // Default scheduling algorithm
        priorityScore: 0,
        resourceScore: 0,
        deadlineScore: 0,
        dependencyScore: 0,
        durationScore: 0,
        systemLoadScore: 0,
        complexityScore: 0,
        businessImpactScore: 0,
        agentAvailabilityScore: 0,
        totalScore: 0,
        scheduledAt: new Date(),
        lastOptimized: new Date()
      }
    };

    return scheduledTask;
  }

  /**
   * Execute a job using the ExecutionCoordinator
   */
  async executeJob(job: Job): Promise<string> {
    try {
      // Convert job to scheduled task
      const scheduledTask = this.convertJobToScheduledTask(job);
      
      // Execute the task
      const execution = await this.executionCoordinator.executeTask(scheduledTask);
      
      // Map execution ID to job ID
      this.jobToExecutionMap.set(job.id, execution.metadata.executionId);
      this.executionToJobMap.set(execution.metadata.executionId, job.id);
      
      logger.info({
        jobId: job.id,
        executionId: execution.metadata.executionId,
        toolName: job.toolName
      }, 'Job execution started via ExecutionCoordinator');
      
      return execution.metadata.executionId;
    } catch (error) {
      logger.error({
        jobId: job.id,
        toolName: job.toolName,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to execute job via ExecutionCoordinator');
      throw error;
    }
  }

  /**
   * Cancel a job execution
   */
  async cancelJobExecution(jobId: string): Promise<boolean> {
    const executionId = this.jobToExecutionMap.get(jobId);
    if (!executionId) {
      logger.warn({ jobId }, 'No execution found for job');
      return false;
    }

    try {
      const cancelled = await this.executionCoordinator.cancelExecution(executionId);
      
      if (cancelled) {
        logger.info({ jobId, executionId }, 'Job execution cancelled');
        // Clean up mappings
        this.jobToExecutionMap.delete(jobId);
        this.executionToJobMap.delete(executionId);
      }
      
      return cancelled;
    } catch (error) {
      logger.error({
        jobId,
        executionId,
        error: error instanceof Error ? error.message : String(error)
      }, 'Failed to cancel job execution');
      return false;
    }
  }

  /**
   * Get execution status for a job
   */
  async getJobExecutionStatus(jobId: string): Promise<ExecutionStatus | null> {
    const executionId = this.jobToExecutionMap.get(jobId);
    if (!executionId) {
      return null;
    }

    // ExecutionCoordinator doesn't have a direct getExecutionStatus method
    // We need to use getTaskExecutionStatus with the task ID (which is the job ID)
    const statusInfo = await this.executionCoordinator.getTaskExecutionStatus(jobId);
    return statusInfo ? statusInfo.status : null;
  }

  /**
   * Convert ExecutionStatus to JobStatus
   */
  convertExecutionStatusToJobStatus(executionStatus: ExecutionStatus): JobStatus {
    switch (executionStatus) {
      case 'queued':
        return JobStatus.PENDING;
      case 'running':
        return JobStatus.RUNNING;
      case 'completed':
        return JobStatus.COMPLETED;
      case 'failed':
      case 'cancelled':
      case 'timeout':
        return JobStatus.FAILED;
      default:
        return JobStatus.PENDING;
    }
  }

  /**
   * Get execution result for a job
   */
  async getJobExecutionResult(jobId: string): Promise<TaskExecution | null> {
    const executionId = this.jobToExecutionMap.get(jobId);
    if (!executionId) {
      return null;
    }

    const metrics = this.executionCoordinator.getExecutionMetrics();
    // Note: ExecutionCoordinator doesn't expose a direct method to get execution by ID
    // This would need to be added or we work with the available metrics
    
    logger.debug({
      jobId,
      executionId,
      totalExecuted: metrics.totalTasksExecuted,
      running: metrics.runningTasks
    }, 'Retrieved execution metrics for job');
    
    return null; // Would need ExecutionCoordinator enhancement
  }

  /**
   * Register lifecycle hooks for job status updates
   */
  registerJobLifecycleHooks(jobStatusUpdater: (jobId: string, status: JobStatus, message?: string) => void): void {
    // Register state change callback with ExecutionCoordinator
    this.executionCoordinator.onExecutionStateChange((event) => {
      const jobId = this.executionToJobMap.get(event.executionId);
      if (jobId) {
        const jobStatus = this.convertExecutionStatusToJobStatus(event.newStatus);
        const message = `Execution ${event.newStatus}: ${event.metadata?.reason || ''}`;
        
        jobStatusUpdater(jobId, jobStatus, message.trim());
        
        // Clean up mappings for terminal states
        if (event.newStatus === 'completed' || event.newStatus === 'failed' || 
            event.newStatus === 'cancelled' || event.newStatus === 'timeout') {
          this.jobToExecutionMap.delete(jobId);
          this.executionToJobMap.delete(event.executionId);
        }
      }
    });
  }

  /**
   * Get job ID from execution ID
   */
  getJobIdFromExecutionId(executionId: string): string | undefined {
    return this.executionToJobMap.get(executionId);
  }

  /**
   * Get execution ID from job ID
   */
  getExecutionIdFromJobId(jobId: string): string | undefined {
    return this.jobToExecutionMap.get(jobId);
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.jobToExecutionMap.clear();
    this.executionToJobMap.clear();
  }
}

/**
 * Singleton instance getter
 */
let adapterInstance: JobExecutionAdapter | null = null;

export function getJobExecutionAdapter(executionCoordinator?: ExecutionCoordinator): JobExecutionAdapter {
  if (!adapterInstance && executionCoordinator) {
    adapterInstance = new JobExecutionAdapter(executionCoordinator);
  }
  
  if (!adapterInstance) {
    throw new Error('JobExecutionAdapter not initialized. Provide ExecutionCoordinator on first call.');
  }
  
  return adapterInstance;
}