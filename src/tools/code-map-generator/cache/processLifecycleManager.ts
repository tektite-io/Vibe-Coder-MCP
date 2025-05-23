/**
 * Process Lifecycle Manager for the Code-Map Generator tool.
 * This file contains the ProcessLifecycleManager class for managing the process lifecycle.
 */

import os from 'os';
import logger from '../../../logger.js';
import { getMemoryStats } from '../parser.js';
import { MemoryLeakDetector } from './memoryLeakDetector.js';
import { ResourceTracker } from './resourceTracker.js';
import { MemoryManager } from './memoryManager.js';

/**
 * Options for the ProcessLifecycleManager.
 */
export interface ProcessLifecycleManagerOptions {
  /**
   * The maximum percentage of system memory to use.
   * Default: 0.7 (70%)
   */
  maxMemoryPercentage?: number;

  /**
   * The interval in milliseconds for checking process health.
   * Default: 30 seconds
   */
  healthCheckInterval?: number;

  /**
   * The threshold percentage of max memory at which to trigger graceful degradation.
   * Default: 0.8 (80%)
   */
  degradationThreshold?: number;

  /**
   * The threshold percentage of max memory at which to trigger emergency measures.
   * Default: 0.9 (90%)
   */
  emergencyThreshold?: number;

  /**
   * Whether to enable automatic process health monitoring.
   * Default: true
   */
  autoMonitor?: boolean;

  /**
   * The interval in milliseconds for running garbage collection.
   * Default: 5 minutes
   */
  gcInterval?: number;
}

/**
 * Process health status.
 */
export type ProcessHealthStatus = 'healthy' | 'degraded' | 'critical' | 'recovering';

/**
 * Process health information.
 */
export interface ProcessHealthInfo {
  /**
   * The process health status.
   */
  status: ProcessHealthStatus;

  /**
   * The memory usage percentage.
   */
  memoryUsagePercentage: number;

  /**
   * The CPU usage percentage.
   */
  cpuUsagePercentage: number;

  /**
   * Whether a memory leak is detected.
   */
  memoryLeakDetected: boolean;

  /**
   * The timestamp when the health check was performed.
   */
  timestamp: number;

  /**
   * The memory usage statistics.
   */
  memoryStats: {
    heapUsed: number;
    heapTotal: number;
    rss: number;
    systemTotal: number;
    memoryUsagePercentage: number;
    formatted: {
      heapUsed: string;
      heapTotal: string;
      rss: string;
      systemTotal: string;
    };
  };

  /**
   * The number of active jobs.
   */
  activeJobs: number;
}

/**
 * Manages the process lifecycle for the Code-Map Generator tool.
 */
export class ProcessLifecycleManager {
  private options: Required<ProcessLifecycleManagerOptions>;
  private memoryLeakDetector: MemoryLeakDetector | null = null;
  private resourceTracker: ResourceTracker | null = null;
  private memoryManager: MemoryManager | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private gcTimer: NodeJS.Timeout | null = null;
  private isInitialized = false;
  private healthStatus: ProcessHealthStatus = 'healthy';
  private cpuUsage: { user: number; system: number } = { user: 0, system: 0 };
  private lastCpuUsage: { user: number; system: number } = { user: 0, system: 0 };
  private lastCpuUsageTime = process.hrtime.bigint();
  private activeJobs = new Set<string>();
  private healthListeners: Array<(health: ProcessHealthInfo) => void> = [];

  /**
   * Default options for the ProcessLifecycleManager.
   */
  private static readonly DEFAULT_OPTIONS: Required<ProcessLifecycleManagerOptions> = {
    maxMemoryPercentage: 0.7,
    healthCheckInterval: 30 * 1000, // 30 seconds
    degradationThreshold: 0.8,
    emergencyThreshold: 0.9,
    autoMonitor: true,
    gcInterval: 5 * 60 * 1000 // 5 minutes
  };

  /**
   * Creates a new ProcessLifecycleManager instance.
   * @param options The manager options
   */
  constructor(options: ProcessLifecycleManagerOptions = {}) {
    // Apply default options
    this.options = {
      ...ProcessLifecycleManager.DEFAULT_OPTIONS,
      ...options
    };
  }

  /**
   * Initializes the process lifecycle manager.
   * @param memoryManager Optional memory manager instance
   * @param resourceTracker Optional resource tracker instance
   * @returns A promise that resolves when initialization is complete
   */
  public async init(
    memoryManager?: MemoryManager,
    resourceTracker?: ResourceTracker
  ): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Initialize memory leak detector
    this.memoryLeakDetector = new MemoryLeakDetector({
      autoDetect: true,
      checkInterval: this.options.healthCheckInterval
    });
    await this.memoryLeakDetector.init();

    // Set memory manager
    this.memoryManager = memoryManager || null;

    // Set resource tracker
    this.resourceTracker = resourceTracker || new ResourceTracker();

    // Start health monitoring if enabled
    if (this.options.autoMonitor) {
      this.startHealthMonitoring();
      this.startPeriodicGC();
    }

    this.isInitialized = true;
    logger.info('ProcessLifecycleManager initialized');
  }

  /**
   * Starts health monitoring.
   */
  public startHealthMonitoring(): void {
    // Clear existing timer if any
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Take initial CPU usage measurement
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuUsageTime = process.hrtime.bigint();

    // Start new timer
    this.healthCheckTimer = setInterval(() => {
      this.checkProcessHealth();
    }, this.options.healthCheckInterval);

    logger.debug(`Process health monitoring started with interval: ${this.options.healthCheckInterval}ms`);
  }

  /**
   * Stops health monitoring.
   */
  public stopHealthMonitoring(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    logger.debug('Process health monitoring stopped');
  }

  /**
   * Starts periodic garbage collection.
   */
  public startPeriodicGC(): void {
    // Clear existing timer if any
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
    }

    // Start new timer
    this.gcTimer = setInterval(() => {
      this.runGarbageCollection();
    }, this.options.gcInterval);

    logger.debug(`Periodic garbage collection started with interval: ${this.options.gcInterval}ms`);
  }

  /**
   * Stops periodic garbage collection.
   */
  public stopPeriodicGC(): void {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    logger.debug('Periodic garbage collection stopped');
  }

  /**
   * Checks process health.
   * @returns The process health information
   */
  public checkProcessHealth(): ProcessHealthInfo {
    // Get memory stats
    const memoryStats = getMemoryStats();
    const memoryUsagePercentage = memoryStats.memoryUsagePercentage;

    // Calculate CPU usage
    const currentCpuUsage = process.cpuUsage();
    const currentTime = process.hrtime.bigint();
    const elapsedTime = Number(currentTime - this.lastCpuUsageTime) / 1e9; // Convert to seconds

    const userUsage = (currentCpuUsage.user - this.lastCpuUsage.user) / 1000 / elapsedTime; // Convert to ms
    const systemUsage = (currentCpuUsage.system - this.lastCpuUsage.system) / 1000 / elapsedTime; // Convert to ms
    const cpuUsagePercentage = (userUsage + systemUsage) / (os.cpus().length * 100); // Normalize by CPU count

    // Update for next calculation
    this.lastCpuUsage = currentCpuUsage;
    this.lastCpuUsageTime = currentTime;

    // Check for memory leaks
    const memoryLeakResult = this.memoryLeakDetector?.analyzeMemoryTrend();
    const memoryLeakDetected = memoryLeakResult?.leakDetected || false;

    // Determine health status
    let newStatus: ProcessHealthStatus = 'healthy';

    if (memoryUsagePercentage > this.options.emergencyThreshold) {
      newStatus = 'critical';
      this.handleCriticalMemory();
    } else if (memoryUsagePercentage > this.options.degradationThreshold || memoryLeakDetected) {
      newStatus = 'degraded';
      this.handleDegradedMemory();
    } else if (this.healthStatus === 'critical' || this.healthStatus === 'degraded') {
      newStatus = 'recovering';
    }

    // Update health status
    const previousStatus = this.healthStatus;
    this.healthStatus = newStatus;

    // Log status changes
    if (previousStatus !== newStatus) {
      logger.info(`Process health status changed from ${previousStatus} to ${newStatus}`);
    }

    // Create health info
    const healthInfo: ProcessHealthInfo = {
      status: newStatus,
      memoryUsagePercentage,
      cpuUsagePercentage,
      memoryLeakDetected,
      timestamp: Date.now(),
      memoryStats,
      activeJobs: this.activeJobs.size
    };

    // Notify listeners
    this.notifyHealthListeners(healthInfo);

    return healthInfo;
  }

  /**
   * Handles degraded memory conditions.
   */
  private handleDegradedMemory(): void {
    logger.warn('Memory usage is degraded, applying graceful degradation measures');

    // Run garbage collection
    this.runGarbageCollection();

    // Unload unused grammars if memory manager is available
    if (this.memoryManager) {
      this.memoryManager.pruneCaches();
    }
  }

  /**
   * Handles critical memory conditions.
   */
  private handleCriticalMemory(): void {
    logger.error('Memory usage is critical, applying emergency measures');

    // Run garbage collection
    this.runGarbageCollection();

    // Clear all caches if memory manager is available
    if (this.memoryManager) {
      // Clear all caches
      this.memoryManager.pruneCaches();
    }

    // Take a heap snapshot for later analysis
    if (this.memoryLeakDetector) {
      this.memoryLeakDetector.takeHeapSnapshot()
        .then(snapshotPath => {
          logger.info(`Took emergency heap snapshot: ${snapshotPath}`);
        })
        .catch(error => {
          logger.error(`Failed to take emergency heap snapshot: ${error}`);
        });
    }
  }

  /**
   * Runs garbage collection.
   */
  public runGarbageCollection(): void {
    logger.info('Running garbage collection');

    // Run memory manager GC if available
    if (this.memoryManager) {
      this.memoryManager.runGarbageCollection();
    } else {
      // Suggest to V8 that now might be a good time for GC
      if (typeof global !== 'undefined' && (global as unknown as { gc?: () => void }).gc) {
        try {
          logger.debug('Calling global.gc() to suggest garbage collection');
          (global as unknown as { gc: () => void }).gc();
        } catch (error) {
          logger.warn(`Failed to suggest garbage collection: ${error}`);
        }
      } else {
        logger.debug('global.gc not available. Run Node.js with --expose-gc to enable manual GC suggestions');
      }
    }
  }

  /**
   * Registers a job with the process lifecycle manager.
   * @param jobId The job ID
   */
  public registerJob(jobId: string): void {
    this.activeJobs.add(jobId);

    // Register with resource tracker if available
    if (this.resourceTracker) {
      this.resourceTracker.trackJob(jobId);
    }

    logger.debug(`Registered job: ${jobId}`);
  }

  /**
   * Unregisters a job from the process lifecycle manager.
   * @param jobId The job ID
   * @returns A promise that resolves when cleanup is complete
   */
  public async unregisterJob(jobId: string): Promise<void> {
    this.activeJobs.delete(jobId);

    // Clean up resources if resource tracker is available
    if (this.resourceTracker) {
      await this.resourceTracker.cleanupJob(jobId);
    }

    logger.debug(`Unregistered job: ${jobId}`);
  }

  /**
   * Gets the number of active jobs.
   * @returns The number of active jobs
   */
  public getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  /**
   * Gets the IDs of all active jobs.
   * @returns An array of job IDs
   */
  public getActiveJobIds(): string[] {
    return Array.from(this.activeJobs);
  }

  /**
   * Adds a health listener.
   * @param listener The listener function
   */
  public addHealthListener(listener: (health: ProcessHealthInfo) => void): void {
    this.healthListeners.push(listener);
  }

  /**
   * Removes a health listener.
   * @param listener The listener function to remove
   */
  public removeHealthListener(listener: (health: ProcessHealthInfo) => void): void {
    const index = this.healthListeners.indexOf(listener);
    if (index !== -1) {
      this.healthListeners.splice(index, 1);
    }
  }

  /**
   * Notifies all health listeners.
   * @param health The process health information
   */
  private notifyHealthListeners(health: ProcessHealthInfo): void {
    for (const listener of this.healthListeners) {
      try {
        listener(health);
      } catch (error) {
        logger.warn(`Error in health listener: ${error}`);
      }
    }
  }

  /**
   * Gets the current process health status.
   * @returns The process health status
   */
  public getHealthStatus(): ProcessHealthStatus {
    return this.healthStatus;
  }

  /**
   * Gets the memory leak detector.
   * @returns The memory leak detector
   */
  public getMemoryLeakDetector(): MemoryLeakDetector | null {
    return this.memoryLeakDetector;
  }

  /**
   * Gets the resource tracker.
   * @returns The resource tracker
   */
  public getResourceTracker(): ResourceTracker | null {
    return this.resourceTracker;
  }

  /**
   * Cleans up resources used by the process lifecycle manager.
   */
  public cleanup(): void {
    // Stop health monitoring
    this.stopHealthMonitoring();

    // Stop periodic GC
    this.stopPeriodicGC();

    // Clean up memory leak detector
    if (this.memoryLeakDetector) {
      this.memoryLeakDetector.cleanup();
    }

    // Clear listeners
    this.healthListeners = [];

    logger.info('Process lifecycle manager cleaned up');
  }
}
