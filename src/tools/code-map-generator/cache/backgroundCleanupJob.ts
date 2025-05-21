/**
 * Background Cleanup Job for the Code-Map Generator tool.
 * This file contains the BackgroundCleanupJob class for running cleanup tasks in the background.
 */

import logger from '../../../logger.js';
import { OutputCleaner, CleanupResult } from './outputCleaner.js';
import { CodeMapGeneratorConfig } from '../types.js';

/**
 * Interface for background cleanup job options.
 */
export interface BackgroundCleanupJobOptions {
  /**
   * The interval in milliseconds between cleanup runs.
   * Default: 1 hour
   */
  cleanupInterval?: number;

  /**
   * Whether to run cleanup on startup.
   * Default: true
   */
  cleanupOnStartup?: boolean;

  /**
   * Whether to run cleanup on shutdown.
   * Default: true
   */
  cleanupOnShutdown?: boolean;
}

/**
 * Runs cleanup tasks in the background.
 */
export class BackgroundCleanupJob {
  private options: Required<BackgroundCleanupJobOptions>;
  private outputCleaner: OutputCleaner;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private lastRunTime: number = 0;
  private lastResult: CleanupResult | null = null;

  /**
   * Default options for background cleanup job.
   */
  private static readonly DEFAULT_OPTIONS: Required<BackgroundCleanupJobOptions> = {
    cleanupInterval: 60 * 60 * 1000, // 1 hour
    cleanupOnStartup: true,
    cleanupOnShutdown: true
  };

  /**
   * Creates a new BackgroundCleanupJob instance.
   * @param config The code map generator configuration
   * @param options The background cleanup job options
   */
  constructor(config: CodeMapGeneratorConfig, options: BackgroundCleanupJobOptions = {}) {
    this.options = {
      ...BackgroundCleanupJob.DEFAULT_OPTIONS,
      ...options
    };

    this.outputCleaner = new OutputCleaner(config);

    logger.debug(`BackgroundCleanupJob created with options: ${JSON.stringify(this.options)}`);
  }

  /**
   * Starts the background cleanup job.
   */
  public start(): void {
    if (this.timer) {
      // Already started
      return;
    }

    logger.info('Starting background cleanup job');

    // Run cleanup on startup if enabled
    if (this.options.cleanupOnStartup) {
      this.runCleanup();
    }

    // Start the timer
    this.timer = setInterval(() => {
      this.runCleanup();
    }, this.options.cleanupInterval);

    // Make sure the timer doesn't prevent the process from exiting
    this.timer.unref();
  }

  /**
   * Stops the background cleanup job.
   */
  public stop(): void {
    if (!this.timer) {
      // Already stopped
      return;
    }

    logger.info('Stopping background cleanup job');

    // Clear the timer
    clearInterval(this.timer);
    this.timer = null;

    // Run cleanup on shutdown if enabled
    if (this.options.cleanupOnShutdown) {
      this.runCleanup();
    }
  }

  /**
   * Runs the cleanup task.
   * @returns A promise that resolves when the cleanup is complete
   */
  public async runCleanup(): Promise<CleanupResult> {
    // Skip if already running
    if (this.isRunning) {
      logger.debug('Cleanup already running, skipping');
      return this.lastResult || {
        directoriesRemoved: 0,
        filesRemoved: 0,
        totalSizeRemoved: 0,
        removedPaths: [],
        errors: []
      };
    }

    try {
      // Set running flag
      this.isRunning = true;

      // Run cleanup
      logger.debug('Running cleanup task');
      const result = await this.outputCleaner.cleanup();

      // Update last run time and result
      this.lastRunTime = Date.now();
      this.lastResult = result;

      return result;
    } catch (error) {
      logger.error({ err: error }, 'Error running cleanup task');
      return {
        directoriesRemoved: 0,
        filesRemoved: 0,
        totalSizeRemoved: 0,
        removedPaths: [],
        errors: [error instanceof Error ? error : new Error(String(error))]
      };
    } finally {
      // Clear running flag
      this.isRunning = false;
    }
  }

  /**
   * Gets the last run time.
   * @returns The last run time in milliseconds since the epoch, or 0 if never run
   */
  public getLastRunTime(): number {
    return this.lastRunTime;
  }

  /**
   * Gets the last cleanup result.
   * @returns The last cleanup result, or null if never run
   */
  public getLastResult(): CleanupResult | null {
    return this.lastResult;
  }

  /**
   * Checks if the cleanup job is running.
   * @returns True if the cleanup job is running, false otherwise
   */
  public isCleanupRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Checks if the background cleanup job is started.
   * @returns True if the background cleanup job is started, false otherwise
   */
  public isStarted(): boolean {
    return this.timer !== null;
  }
}
