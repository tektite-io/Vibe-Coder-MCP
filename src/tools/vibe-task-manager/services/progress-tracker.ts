/**
 * Progress Tracking System
 *
 * Implements real-time progress tracking and reporting for projects,
 * epics, and individual tasks with completion time estimation.
 */

import { AtomicTask } from '../types/task.js';
import { AppError } from '../../../utils/errors.js';
import logger from '../../../logger.js';

/**
 * Simple Epic interface for progress tracking
 */
export interface Epic {
  id: string;
  title: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Simple Project interface for progress tracking
 */
export interface Project {
  id: string;
  name: string;
  createdAt: Date;
  completedAt?: Date;
}

/**
 * Progress calculation methods
 */
export type ProgressMethod = 'task_count' | 'estimated_hours' | 'weighted' | 'complexity';

/**
 * Task progress information
 */
export interface TaskProgress {
  taskId: string;
  status: string;
  progressPercentage: number;
  startedAt?: Date;
  completedAt?: Date;
  estimatedHours?: number;
  actualHours?: number;
  blockers: string[];
  lastUpdated: Date;
}

/**
 * Epic progress information
 */
export interface EpicProgress {
  epicId: string;
  title: string;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  progressPercentage: number;
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  estimatedCompletionDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  tasks: TaskProgress[];
  lastUpdated: Date;
}

/**
 * Project progress information
 */
export interface ProjectProgress {
  projectId: string;
  projectName: string;
  totalEpics: number;
  completedEpics: number;
  inProgressEpics: number;
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  progressPercentage: number;
  estimatedHours: number;
  actualHours: number;
  remainingHours: number;
  estimatedCompletionDate?: Date;
  startedAt?: Date;
  completedAt?: Date;
  epics: EpicProgress[];
  lastUpdated: Date;
}

/**
 * Progress tracking configuration
 */
export interface ProgressConfig {
  method: ProgressMethod;
  updateIntervalMinutes: number;
  enableRealTimeUpdates: boolean;
  enableCompletionEstimation: boolean;
  complexityWeights: Record<string, number>;
  statusWeights: Record<string, number>;
}

/**
 * Progress event types
 */
export type ProgressEvent =
  | 'task_started'
  | 'task_progress_updated'
  | 'task_completed'
  | 'task_blocked'
  | 'epic_progress_updated'
  | 'epic_completed'
  | 'project_progress_updated'
  | 'project_completed'
  | 'milestone_reached';

/**
 * Progress event data
 */
export interface ProgressEventData {
  event: ProgressEvent;
  projectId?: string;
  epicId?: string;
  taskId?: string;
  progressPercentage?: number;
  estimatedCompletion?: Date;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Progress Tracking System
 */
export class ProgressTracker {
  private static instance: ProgressTracker | null = null;

  private config: ProgressConfig;
  private progressCache = new Map<string, ProjectProgress>();
  private updateTimer?: NodeJS.Timeout;
  private eventListeners = new Map<ProgressEvent, Array<(data: ProgressEventData) => void>>();

  private constructor(config?: Partial<ProgressConfig>) {
    this.config = {
      method: 'weighted',
      updateIntervalMinutes: 5,
      enableRealTimeUpdates: true,
      enableCompletionEstimation: true,
      complexityWeights: {
        'simple': 1,
        'medium': 2,
        'complex': 3,
        'critical': 4
      },
      statusWeights: {
        'pending': 0,
        'in_progress': 0.5,
        'completed': 1,
        'blocked': 0,
        'failed': 0
      },
      ...config
    };

    if (this.config.enableRealTimeUpdates) {
      this.startProgressUpdates();
    }

    logger.info({ config: this.config }, 'Progress tracker initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<ProgressConfig>): ProgressTracker {
    if (!ProgressTracker.instance) {
      ProgressTracker.instance = new ProgressTracker(config);
    }
    return ProgressTracker.instance;
  }

  /**
   * Calculate project progress
   */
  async calculateProjectProgress(projectId: string): Promise<ProjectProgress> {
    try {
      // Placeholder implementation - in real implementation, this would fetch from storage
      const project: Project = {
        id: projectId,
        name: `Project ${projectId}`,
        createdAt: new Date()
      };

      const epics: Epic[] = []; // Placeholder - would fetch from storage
      const epicProgresses: EpicProgress[] = [];

      let totalTasks = 0;
      let completedTasks = 0;
      let inProgressTasks = 0;
      let blockedTasks = 0;
      let totalEstimatedHours = 0;
      let totalActualHours = 0;

      // Calculate progress for each epic
      for (const epic of epics) {
        const epicProgress = await this.calculateEpicProgress(epic.id);
        epicProgresses.push(epicProgress);

        totalTasks += epicProgress.totalTasks;
        completedTasks += epicProgress.completedTasks;
        inProgressTasks += epicProgress.inProgressTasks;
        blockedTasks += epicProgress.blockedTasks;
        totalEstimatedHours += epicProgress.estimatedHours;
        totalActualHours += epicProgress.actualHours;
      }

      // Calculate overall progress percentage
      const progressPercentage = this.calculateProgressPercentage(
        epicProgresses.map(ep => ({
          completed: ep.completedTasks,
          total: ep.totalTasks,
          estimatedHours: ep.estimatedHours,
          actualHours: ep.actualHours
        }))
      );

      // Calculate completion estimates
      const remainingHours = Math.max(0, totalEstimatedHours - totalActualHours);
      const estimatedCompletionDate = this.config.enableCompletionEstimation
        ? this.estimateCompletionDate(remainingHours, inProgressTasks)
        : undefined;

      const projectProgress: ProjectProgress = {
        projectId,
        projectName: project.name,
        totalEpics: epics.length,
        completedEpics: epicProgresses.filter(ep => ep.progressPercentage >= 100).length,
        inProgressEpics: epicProgresses.filter(ep => ep.progressPercentage > 0 && ep.progressPercentage < 100).length,
        totalTasks,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        progressPercentage,
        estimatedHours: totalEstimatedHours,
        actualHours: totalActualHours,
        remainingHours,
        estimatedCompletionDate,
        startedAt: project.createdAt,
        completedAt: progressPercentage >= 100 ? new Date() : undefined,
        epics: epicProgresses,
        lastUpdated: new Date()
      };

      // Cache the result
      this.progressCache.set(projectId, projectProgress);

      // Emit progress event
      this.emitProgressEvent('project_progress_updated', {
        projectId,
        progressPercentage,
        estimatedCompletion: estimatedCompletionDate
      });

      // Check for project completion
      if (progressPercentage >= 100 && !project.completedAt) {
        this.emitProgressEvent('project_completed', { projectId });
      }

      logger.debug({
        projectId,
        progressPercentage,
        totalTasks,
        completedTasks
      }, 'Project progress calculated');

      return projectProgress;

    } catch (error) {
      logger.error({ err: error, projectId }, 'Failed to calculate project progress');
      throw new AppError('Project progress calculation failed', { cause: error });
    }
  }

  /**
   * Calculate epic progress
   */
  async calculateEpicProgress(epicId: string): Promise<EpicProgress> {
    try {
      // Placeholder implementation - in real implementation, this would fetch from storage
      const epic: Epic = {
        id: epicId,
        title: `Epic ${epicId}`,
        createdAt: new Date()
      };

      const tasks: AtomicTask[] = []; // Placeholder - would fetch from storage
      const taskProgresses: TaskProgress[] = [];

      let completedTasks = 0;
      let inProgressTasks = 0;
      let blockedTasks = 0;
      let totalEstimatedHours = 0;
      let totalActualHours = 0;

      // Calculate progress for each task
      for (const task of tasks) {
        const taskProgress = this.calculateTaskProgress(task);
        taskProgresses.push(taskProgress);

        if (taskProgress.status === 'completed') {
          completedTasks++;
        } else if (taskProgress.status === 'in_progress') {
          inProgressTasks++;
        } else if (taskProgress.blockers.length > 0) {
          blockedTasks++;
        }

        totalEstimatedHours += taskProgress.estimatedHours || 0;
        totalActualHours += taskProgress.actualHours || 0;
      }

      // Calculate overall progress percentage
      const progressPercentage = this.calculateProgressPercentage(
        taskProgresses.map(tp => ({
          completed: tp.status === 'completed' ? 1 : 0,
          total: 1,
          estimatedHours: tp.estimatedHours || 0,
          actualHours: tp.actualHours || 0
        }))
      );

      // Calculate completion estimates
      const remainingHours = Math.max(0, totalEstimatedHours - totalActualHours);
      const estimatedCompletionDate = this.config.enableCompletionEstimation
        ? this.estimateCompletionDate(remainingHours, inProgressTasks)
        : undefined;

      const epicProgress: EpicProgress = {
        epicId,
        title: epic.title,
        totalTasks: tasks.length,
        completedTasks,
        inProgressTasks,
        blockedTasks,
        progressPercentage,
        estimatedHours: totalEstimatedHours,
        actualHours: totalActualHours,
        remainingHours,
        estimatedCompletionDate,
        startedAt: epic.createdAt,
        completedAt: progressPercentage >= 100 ? new Date() : undefined,
        tasks: taskProgresses,
        lastUpdated: new Date()
      };

      // Emit progress event
      this.emitProgressEvent('epic_progress_updated', {
        epicId,
        progressPercentage,
        estimatedCompletion: estimatedCompletionDate
      });

      // Check for epic completion
      if (progressPercentage >= 100 && !epic.completedAt) {
        this.emitProgressEvent('epic_completed', { epicId });
      }

      return epicProgress;

    } catch (error) {
      logger.error({ err: error, epicId }, 'Failed to calculate epic progress');
      throw new AppError('Epic progress calculation failed', { cause: error });
    }
  }

  /**
   * Calculate task progress
   */
  calculateTaskProgress(task: AtomicTask): TaskProgress {
    const now = new Date();

    // Determine progress percentage based on status
    let progressPercentage = 0;
    if (task.status === 'completed') {
      progressPercentage = 100;
    } else if (task.status === 'in_progress') {
      progressPercentage = 50; // Could be enhanced with more granular tracking
    }

    // Check for blockers
    const blockers = task.dependencies?.filter(dep =>
      // In a real implementation, check if dependencies are blocking
      false // Placeholder
    ) || [];

    const taskProgress: TaskProgress = {
      taskId: task.id,
      status: task.status,
      progressPercentage,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
      estimatedHours: task.estimatedHours,
      actualHours: task.actualHours,
      blockers,
      lastUpdated: now
    };

    return taskProgress;
  }

  /**
   * Update task progress
   */
  async updateTaskProgress(
    taskId: string,
    progressPercentage: number,
    actualHours?: number
  ): Promise<void> {
    try {
      // Placeholder implementation - in real implementation, this would update storage
      logger.debug({ taskId, progressPercentage, actualHours }, 'Task progress update requested');

      // Emit progress event
      this.emitProgressEvent('task_progress_updated', {
        taskId,
        progressPercentage
      });

      // Invalidate cached progress for affected project
      // In real implementation, would fetch task to get projectId
      // For now, just clear all cache
      this.progressCache.clear();

      logger.debug({ taskId, progressPercentage, actualHours }, 'Task progress updated');

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to update task progress');
      throw new AppError('Task progress update failed', { cause: error });
    }
  }

  /**
   * Get cached project progress
   */
  getCachedProjectProgress(projectId: string): ProjectProgress | null {
    return this.progressCache.get(projectId) || null;
  }

  /**
   * Clear progress cache
   */
  clearCache(projectId?: string): void {
    if (projectId) {
      this.progressCache.delete(projectId);
    } else {
      this.progressCache.clear();
    }

    logger.debug({ projectId }, 'Progress cache cleared');
  }

  /**
   * Add progress event listener
   */
  addEventListener(event: ProgressEvent, listener: (data: ProgressEventData) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(listener);
  }

  /**
   * Remove progress event listener
   */
  removeEventListener(event: ProgressEvent, listener: (data: ProgressEventData) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Calculate progress percentage using configured method
   */
  private calculateProgressPercentage(
    items: Array<{
      completed: number;
      total: number;
      estimatedHours?: number;
      actualHours?: number;
    }>
  ): number {
    if (items.length === 0) return 0;

    switch (this.config.method) {
      case 'task_count':
        const totalTasks = items.reduce((sum, item) => sum + item.total, 0);
        const completedTasks = items.reduce((sum, item) => sum + item.completed, 0);
        return totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;

      case 'estimated_hours':
        const totalHours = items.reduce((sum, item) => sum + (item.estimatedHours || 0), 0);
        const actualHours = items.reduce((sum, item) => sum + (item.actualHours || 0), 0);
        return totalHours > 0 ? Math.min((actualHours / totalHours) * 100, 100) : 0;

      case 'weighted':
        // Combine task count and hours with weights
        const taskProgress = this.calculateProgressPercentage(items.map(item => ({
          completed: item.completed,
          total: item.total
        })));
        const hourProgress = this.calculateProgressPercentage(items.map(item => ({
          completed: item.actualHours || 0,
          total: item.estimatedHours || 0
        })));
        return (taskProgress * 0.6) + (hourProgress * 0.4);

      default:
        return this.calculateProgressPercentage(items.map(item => ({
          completed: item.completed,
          total: item.total
        })));
    }
  }

  /**
   * Estimate completion date
   */
  private estimateCompletionDate(remainingHours: number, activeTasks: number): Date | undefined {
    if (remainingHours <= 0) return new Date();

    // Simple estimation: assume 8 hours per day per active task
    const hoursPerDay = Math.max(activeTasks * 8, 8);
    const daysRemaining = Math.ceil(remainingHours / hoursPerDay);

    const completionDate = new Date();
    completionDate.setDate(completionDate.getDate() + daysRemaining);

    return completionDate;
  }

  /**
   * Start automatic progress updates
   */
  private startProgressUpdates(): void {
    this.updateTimer = setInterval(() => {
      this.updateAllCachedProgress().catch(error => {
        logger.error({ err: error }, 'Error in automatic progress update');
      });
    }, this.config.updateIntervalMinutes * 60000);

    logger.debug({ intervalMinutes: this.config.updateIntervalMinutes }, 'Automatic progress updates started');
  }

  /**
   * Update all cached progress
   */
  private async updateAllCachedProgress(): Promise<void> {
    const projectIds = Array.from(this.progressCache.keys());

    for (const projectId of projectIds) {
      try {
        await this.calculateProjectProgress(projectId);
      } catch (error) {
        logger.error({ err: error, projectId }, 'Failed to update cached progress');
      }
    }
  }

  /**
   * Emit progress event
   */
  private emitProgressEvent(event: ProgressEvent, data: Partial<ProgressEventData>): void {
    const eventData: ProgressEventData = {
      event,
      timestamp: new Date(),
      ...data
    };

    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(eventData);
        } catch (error) {
          logger.error({ err: error, event }, 'Error in progress event listener');
        }
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }

    this.progressCache.clear();
    this.eventListeners.clear();

    ProgressTracker.instance = null;
    logger.info('Progress tracker destroyed');
  }
}
