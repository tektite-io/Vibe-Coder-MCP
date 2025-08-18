/**
 * Batch processor for the Code-Map Generator tool.
 * This file contains functions for processing files in batches.
 */

import logger from '../../logger.js';
import { CodeMapGeneratorConfig } from './types.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { getMemoryStats, clearCaches, getMemoryManager } from './parser.js';
import { grammarManager } from './parser.js';
import path from 'path';
import { getMetricsCollector } from './performanceMetrics.js';

/**
 * Gets the optimal batch size based on configuration.
 * @param config The Code-Map Generator configuration
 * @returns The batch size
 */
export function getBatchSize(config: CodeMapGeneratorConfig): number {
  return config.processing?.batchSize || 25; // Reduced from 100 for better memory management
}

/**
 * Calculates dynamic batch size based on available memory and file count.
 * @param config The Code-Map Generator configuration
 * @param fileCount The number of files to process
 * @param averageFileSize Optional average file size in bytes
 * @returns The dynamically calculated batch size
 */
export function calculateDynamicBatchSize(
  config: CodeMapGeneratorConfig,
  fileCount: number,
  averageFileSize?: number
): number {
  const baseBatchSize = getBatchSize(config);
  
  // Get memory manager for more sophisticated memory analysis
  const memManager = getMemoryManager();
  
  // Get current memory stats - prefer basic stats for consistency
  const memStats = getMemoryStats();
  if (!memStats) {
    logger.debug('Memory stats unavailable, using base batch size');
    return baseBatchSize;
  }
  
  const memoryUsagePercent = memStats.memoryUsagePercentage;
  // Calculate available memory based on heap limits
  const availableMemoryMB = (memStats.heapTotal - memStats.heapUsed) / (1024 * 1024);
  
  // If MemoryManager is available, check for critical memory status
  if (memManager) {
    const managerStats = memManager.getMemoryStats();
    if (managerStats.formatted?.memoryStatus === 'critical') {
      logger.warn('Memory status is critical according to MemoryManager, using minimum batch size');
      return 10;
    }
    // Also check high memory status for additional reduction
    if (managerStats.formatted?.memoryStatus === 'high') {
      logger.debug('Memory status is high according to MemoryManager, reducing base batch size');
      return Math.max(20, Math.floor(baseBatchSize * 0.4));
    }
  }
  
  // Start with base batch size
  let dynamicBatchSize = baseBatchSize;
  
  // Adjust based on memory usage
  if (memoryUsagePercent > 0.7) {
    // High memory usage: reduce batch size significantly
    dynamicBatchSize = Math.max(10, Math.floor(baseBatchSize * 0.25));
    logger.debug(`High memory usage (${(memoryUsagePercent * 100).toFixed(1)}%), reducing batch size to ${dynamicBatchSize}`);
  } else if (memoryUsagePercent > 0.6) {
    // Moderate-high memory usage: reduce batch size moderately
    dynamicBatchSize = Math.max(20, Math.floor(baseBatchSize * 0.5));
    logger.debug(`Moderate-high memory usage (${(memoryUsagePercent * 100).toFixed(1)}%), reducing batch size to ${dynamicBatchSize}`);
  } else if (memoryUsagePercent > 0.5) {
    // Moderate memory usage: slight reduction
    dynamicBatchSize = Math.max(50, Math.floor(baseBatchSize * 0.75));
    logger.debug(`Moderate memory usage (${(memoryUsagePercent * 100).toFixed(1)}%), reducing batch size to ${dynamicBatchSize}`);
  } else if (memoryUsagePercent < 0.3 && availableMemoryMB > 2048) {
    // Low memory usage with plenty available: increase batch size
    dynamicBatchSize = Math.min(500, Math.floor(baseBatchSize * 1.5));
    logger.debug(`Low memory usage (${(memoryUsagePercent * 100).toFixed(1)}%) with ${availableMemoryMB.toFixed(0)}MB available, increasing batch size to ${dynamicBatchSize}`);
  }
  
  // Adjust based on file count
  if (fileCount < 100) {
    // Small codebase: process all at once if memory allows
    if (memoryUsagePercent < 0.5) {
      dynamicBatchSize = Math.min(fileCount, 100);
      logger.debug(`Small codebase (${fileCount} files), setting batch size to ${dynamicBatchSize}`);
    }
  } else if (fileCount > 10000) {
    // Large codebase: be more conservative
    dynamicBatchSize = Math.min(dynamicBatchSize, 200);
    logger.debug(`Large codebase (${fileCount} files), capping batch size at ${dynamicBatchSize}`);
  }
  
  // Consider average file size if provided
  if (averageFileSize && averageFileSize > 100 * 1024) { // Files larger than 100KB
    // Large files: reduce batch size
    const sizeFactor = Math.min(1, 50 * 1024 / averageFileSize); // Normalize to 50KB baseline
    dynamicBatchSize = Math.max(10, Math.floor(dynamicBatchSize * sizeFactor));
    logger.debug(`Large average file size (${(averageFileSize / 1024).toFixed(1)}KB), adjusting batch size to ${dynamicBatchSize}`);
  }
  
  // Ensure batch size is within reasonable bounds
  const MIN_BATCH_SIZE = 10;
  const MAX_BATCH_SIZE = 500;
  dynamicBatchSize = Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, dynamicBatchSize));
  
  if (dynamicBatchSize !== baseBatchSize) {
    logger.info(`Dynamic batch size: ${dynamicBatchSize} (base: ${baseBatchSize}, memory: ${(memoryUsagePercent * 100).toFixed(1)}%, files: ${fileCount})`);
  }
  
  return dynamicBatchSize;
}

/**
 * Splits a list of items into batches.
 * @param items The items to split
 * @param batchSize The size of each batch
 * @returns An array of batches
 */
export function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  return batches;
}

/**
 * Processes items in batches.
 * @param items The items to process
 * @param processItem The function to process each item
 * @param config The Code-Map Generator configuration
 * @param jobId The job ID for progress tracking
 * @param sessionId The session ID for progress tracking
 * @param progressLabel The label for progress updates
 * @param startProgress The starting progress percentage
 * @param endProgress The ending progress percentage
 * @returns A promise that resolves to an array of processed items
 */
export async function processBatches<T, R>(
  items: T[],
  processItem: (item: T) => Promise<R>,
  config: CodeMapGeneratorConfig,
  jobId: string,
  sessionId: string,
  progressLabel: string = 'Processing items',
  startProgress: number = 0,
  endProgress: number = 100
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  // Use dynamic batch size calculation
  const batchSize = calculateDynamicBatchSize(config, items.length);
  const batches = splitIntoBatches(items, batchSize);
  const totalBatches = batches.length;
  const results: R[] = [];

  logger.info(`Processing ${items.length} items in ${totalBatches} batches (batch size: ${batchSize})`);
  
  // Get metrics collector
  const metricsCollector = getMetricsCollector();

  for (let i = 0; i < totalBatches; i++) {
    const batch = batches[i];
    const currentBatch = i + 1;

    // Calculate progress percentage
    const progressRange = endProgress - startProgress;
    const progress = Math.round(startProgress + (progressRange * (i / totalBatches)));

    // Update job status
    jobManager.updateJobStatus(
      jobId,
      JobStatus.RUNNING,
      `${progressLabel}: batch ${currentBatch} of ${totalBatches} (${progress}% complete)`
    );

    sseNotifier.sendProgress(
      sessionId,
      jobId,
      JobStatus.RUNNING,
      `${progressLabel}: batch ${currentBatch} of ${totalBatches} (${progress}% complete)`,
      progress
    );

    logger.info(`Processing batch ${currentBatch} of ${totalBatches} (Size: ${batch.length})`);

    // Start tracking batch performance
    metricsCollector.startBatch();

    // Process items in parallel
    const batchPromises = batch.map(processItem);
    const batchResults = await Promise.all(batchPromises);
    
    // Complete batch metrics tracking
    metricsCollector.completeBatch(batch.length);

    // Add batch results to overall results
    results.push(...batchResults);

    // NEW: Always perform lightweight cleanup after each batch
    await performLightweightCleanup(config);

    // NEW: Check memory usage and perform more aggressive cleanup if needed
    const memStats = getMemoryStats();
    if (memStats && memStats.memoryUsagePercentage > 0.7) {
      logger.info(`Memory usage at ${memStats?.memoryUsagePercentage?.toFixed(2)}%, running aggressive cleanup after batch ${currentBatch}/${totalBatches}`);
      await performAggressiveCleanup(config);
    } else if (i % 5 === 0 && i > 0) {
      // Perform moderate cleanup every 5 batches regardless of memory usage
      logger.debug(`Performing routine cleanup after batch ${currentBatch}/${totalBatches}`);
      await clearAllCaches();
    }

    // Log memory usage if enabled
    if (config.processing?.logMemoryUsage) {
      const memoryUsage = process.memoryUsage();
      logger.debug({
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
      }, `Memory usage after batch ${currentBatch}`);
    }
  }

  // Final progress update
  jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `${progressLabel} completed`);
  sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `${progressLabel} completed`, endProgress);

  return results;
}

/**
 * Processes items in batches with intermediate file storage.
 * @param items The items to process
 * @param processItem The function to process each item
 * @param saveIntermediateResult The function to save intermediate results
 * @param loadIntermediateResults The function to load all intermediate results
 * @param config The Code-Map Generator configuration
 * @param jobId The job ID for progress tracking
 * @param sessionId The session ID for progress tracking
 * @param progressLabel The label for progress updates
 * @param startProgress The starting progress percentage
 * @param endProgress The ending progress percentage
 * @returns A promise that resolves to the final result
 */
export async function processBatchesWithIntermediateStorage<T, I, R>(
  items: T[],
  processItem: (item: T) => Promise<I>,
  saveIntermediateResult: (result: I, batchIndex: number) => Promise<void>,
  loadIntermediateResults: () => Promise<I[]>,
  combineResults: (intermediateResults: I[]) => Promise<R>,
  config: CodeMapGeneratorConfig,
  jobId: string,
  sessionId: string,
  progressLabel: string = 'Processing items',
  startProgress: number = 0,
  endProgress: number = 100
): Promise<R> {
  if (items.length === 0) {
    return combineResults([]);
  }

  // Use dynamic batch size calculation
  const batchSize = calculateDynamicBatchSize(config, items.length);
  const batches = splitIntoBatches(items, batchSize);
  const totalBatches = batches.length;

  logger.info(`Processing ${items.length} items in ${totalBatches} batches with intermediate storage (batch size: ${batchSize})`);

  // Calculate progress ranges
  const processingRange = (endProgress - startProgress) * 0.8; // 80% for processing

  for (let i = 0; i < totalBatches; i++) {
    const batch = batches[i];
    const currentBatch = i + 1;

    // Calculate progress percentage for processing
    const progress = Math.round(startProgress + (processingRange * (i / totalBatches)));

    // Update job status
    jobManager.updateJobStatus(
      jobId,
      JobStatus.RUNNING,
      `${progressLabel}: batch ${currentBatch} of ${totalBatches} (${progress}% complete)`
    );

    sseNotifier.sendProgress(
      sessionId,
      jobId,
      JobStatus.RUNNING,
      `${progressLabel}: batch ${currentBatch} of ${totalBatches} (${progress}% complete)`,
      progress
    );

    logger.info(`Processing batch ${currentBatch} of ${totalBatches} (Size: ${batch.length})`);

    // Process items in parallel
    const batchPromises = batch.map(processItem);
    const batchResults = await Promise.all(batchPromises);

    // Save intermediate results
    await Promise.all(batchResults.map((result, index) =>
      saveIntermediateResult(result, (i * batchSize) + index)
    ));

    // NEW: Always perform lightweight cleanup after each batch
    await performLightweightCleanup(config);

    // NEW: Check memory usage and perform more aggressive cleanup if needed
    const memStats = getMemoryStats();
    if (memStats && memStats.memoryUsagePercentage > 0.7) {
      logger.info(`Memory usage at ${memStats?.memoryUsagePercentage?.toFixed(2)}%, running aggressive cleanup after batch ${currentBatch}/${totalBatches}`);
      await performAggressiveCleanup(config);
    } else if (i % 5 === 0 && i > 0) {
      // Perform moderate cleanup every 5 batches regardless of memory usage
      logger.debug(`Performing routine cleanup after batch ${currentBatch}/${totalBatches}`);
      await clearAllCaches();
    }

    // Log memory usage if enabled
    if (config.processing?.logMemoryUsage) {
      const memoryUsage = process.memoryUsage();
      logger.debug({
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
      }, `Memory usage after batch ${currentBatch}`);
    }
  }

  // Update job status for combining results
  const combiningProgress = Math.round(startProgress + processingRange);
  jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Combining results...`);
  sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Combining results...`, combiningProgress);

  // Load all intermediate results
  const intermediateResults = await loadIntermediateResults();

  // Combine results
  const finalResult = await combineResults(intermediateResults);

  // Final progress update
  jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `${progressLabel} completed`);
  sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `${progressLabel} completed`, endProgress);

  return finalResult;
}

/**
 * Processes items in batches with memory checks.
 * @param items The items to process
 * @param processor The function to process each item
 * @param batchSize The size of each batch
 * @param memoryThreshold The memory threshold percentage (0-1) to trigger cleanup
 * @param cleanupFn The function to call for cleanup when memory threshold is exceeded
 * @returns A promise that resolves to an array of processed items
 */
/**
 * Performs lightweight cleanup after batch processing.
 * This is called after every batch to prevent memory accumulation.
 * @param config The Code-Map Generator configuration
 */
async function performLightweightCleanup(config?: CodeMapGeneratorConfig): Promise<void> {
  // Clear any temporary caches
  clearTemporaryCaches();

  // Reset any batch-specific state
  resetBatchState();

  // Log memory usage if enabled
  if (config?.processing?.logMemoryUsage) {
    const memoryUsage = process.memoryUsage();
    logger.debug({
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
    }, `Memory usage after lightweight cleanup`);
  }
}

/**
 * Performs more aggressive cleanup when memory usage is high.
 * This includes clearing caches and suggesting garbage collection.
 * @param config The Code-Map Generator configuration
 */
async function performAggressiveCleanup(config?: CodeMapGeneratorConfig): Promise<void> {
  // Clear all non-essential caches
  await clearAllCaches();

  // Reset all temporary state
  resetAllState();

  // Suggest garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Log memory usage if enabled
  if (config?.processing?.logMemoryUsage) {
    const memoryUsage = process.memoryUsage();
    logger.debug({
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
    }, `Memory usage after aggressive cleanup`);
  }
}

/**
 * Clears temporary caches used during batch processing.
 * This is a lightweight operation that should be fast.
 */
function clearTemporaryCaches(): void {
  // No direct pruning of memory caches - they will be pruned automatically when needed
}

/**
 * Resets any state that's specific to the current batch.
 */
function resetBatchState(): void {
  // Reset any state that's specific to the current batch
  // This is implementation-specific and may be a no-op
}

/**
 * Clears all non-essential caches.
 * This is more aggressive than clearTemporaryCaches.
 */
async function clearAllCaches(): Promise<void> {
  // Clear all non-essential caches
  // Call existing cache clearing functions if available
  try {
    // Call the parser's clearCaches function
    await clearCaches();

    // Unload unused grammars if grammar manager is available
    if (grammarManager) {
      // await grammarManager.unloadUnusedGrammars(); // COMMENTED - Keep grammars loaded between batches
    }
  } catch (error) {
    logger.warn({ err: error }, 'Error clearing caches during aggressive cleanup');
  }
}

/**
 * Resets all temporary state.
 * This is more aggressive than resetBatchState.
 */
function resetAllState(): void {
  // Reset all temporary state
  // This is implementation-specific and may include resetting counters, etc.
}

/**
 * Groups files by language/extension.
 * @param files The files to group
 * @returns A map of language to files
 */
export function groupFilesByExtension<T extends { path: string }>(
  files: T[]
): Map<string, T[]> {
  const filesByExtension = new Map<string, T[]>();

  for (const file of files) {
    const ext = path.extname(file.path).toLowerCase();
    if (!filesByExtension.has(ext)) {
      filesByExtension.set(ext, []);
    }
    filesByExtension.get(ext)!.push(file);
  }

  return filesByExtension;
}

/**
 * Creates optimized batches that group files by language.
 * @param files The files to process
 * @param batchSize The maximum size of each batch
 * @returns An array of batches
 */
export function createLanguageBasedBatches<T extends { path: string }>(
  files: T[],
  batchSize: number = 50
): T[][] {
  // Group files by extension
  const filesByExtension = groupFilesByExtension(files);

  // Sort extensions by frequency (most common first)
  const sortedExtensions = Array.from(filesByExtension.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([ext]) => ext);

  // Create batches
  const batches: T[][] = [];
  let currentBatch: T[] = [];

  // First, add files from the most common extensions
  for (const ext of sortedExtensions) {
    const filesForExt = filesByExtension.get(ext)!;

    for (const file of filesForExt) {
      if (currentBatch.length >= batchSize) {
        batches.push(currentBatch);
        currentBatch = [];
      }

      currentBatch.push(file);
    }

    // If we've accumulated a partial batch for this extension,
    // add it before moving to the next extension
    if (currentBatch.length > 0 && currentBatch.length < batchSize) {
      batches.push(currentBatch);
      currentBatch = [];
    }
  }

  // Add any remaining files
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Performs cleanup when changing languages.
 * This helps release grammar resources.
 */
async function performLanguageChangeCleanup(): Promise<void> {
  // Unload unused grammars
  if (grammarManager) {
    try {
      // await grammarManager.unloadUnusedGrammars(); // COMMENTED - Keep grammars loaded during processing
      logger.debug('Skipping grammar unload during language change to improve performance');
    } catch (error) {
      logger.warn({ err: error }, 'Error unloading unused grammars during language change');
    }
  }

  // Suggest garbage collection if available
  if (global.gc) {
    global.gc();
    logger.debug('Suggested garbage collection during language change');
  }
}

/**
 * Processes files in batches grouped by language.
 * @param files The files to process
 * @param processor The function to process each file
 * @param config The Code-Map Generator configuration
 * @param jobId The job ID for progress tracking
 * @param sessionId The session ID for progress tracking
 * @param progressLabel The label for progress updates
 * @param startProgress The starting progress percentage
 * @param endProgress The ending progress percentage
 * @returns A promise that resolves to an array of processed results
 */
export async function processLanguageBasedBatches<T extends { path: string }, R>(
  files: T[],
  processor: (file: T) => Promise<R>,
  config: CodeMapGeneratorConfig,
  jobId: string,
  sessionId: string,
  progressLabel: string = 'Processing files',
  startProgress: number = 0,
  endProgress: number = 100
): Promise<R[]> {
  if (files.length === 0) {
    return [];
  }

  // Use dynamic batch size calculation
  const batchSize = calculateDynamicBatchSize(config, files.length);
  const batches = createLanguageBasedBatches(files, batchSize);
  const totalBatches = batches.length;
  const results: R[] = [];

  logger.info(`Processing ${files.length} files in ${totalBatches} language-based batches (batch size: ${batchSize})`);

  // Calculate progress increment per batch
  const progressIncrement = (endProgress - startProgress) / totalBatches;

  // Track the current language being processed
  let currentLanguage = '';
  let languageChangeCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const currentBatch = i + 1;
    const batch = batches[i];

    // Calculate current progress
    const currentProgress = Math.round(startProgress + (i * progressIncrement));

    // Determine the predominant language in this batch
    const languageCounts = new Map<string, number>();
    for (const file of batch) {
      const ext = path.extname(file.path).toLowerCase();
      languageCounts.set(ext, (languageCounts.get(ext) || 0) + 1);
    }

    const predominantLanguage = Array.from(languageCounts.entries())
      .sort((a, b) => b[1] - a[1])[0][0];

    // Check if the language has changed
    if (predominantLanguage !== currentLanguage) {
      languageChangeCount++;
      currentLanguage = predominantLanguage;

      // Log language change
      logger.info(`Switching to processing ${currentLanguage} files (language change #${languageChangeCount})`);

      // If we're changing languages, perform cleanup to release grammar resources
      if (languageChangeCount > 1) {
        await performLanguageChangeCleanup();
      }
    }

    // Update job status
    jobManager.updateJobStatus(
      jobId,
      JobStatus.RUNNING,
      `${progressLabel}: batch ${currentBatch} of ${totalBatches} (${currentLanguage} files)`,
      currentProgress
    );

    // Send progress update
    sseNotifier.sendProgress(
      sessionId,
      jobId,
      JobStatus.RUNNING,
      `${progressLabel}: batch ${currentBatch} of ${totalBatches} (${currentLanguage} files)`,
      currentProgress
    );

    logger.info(`Processing batch ${currentBatch} of ${totalBatches} (Size: ${batch.length}, Language: ${currentLanguage})`);

    // Memory-aware grammar preloading
    if (grammarManager) {
      // Check memory status before preloading grammars
      const memStats = getMemoryStats();
      const memManager = getMemoryManager();
      
      // Determine if we should preload grammars based on memory
      let shouldPreloadGrammars = true;
      
      if (memStats && memStats.memoryUsagePercentage > 0.6) {
        logger.debug(`Memory usage at ${(memStats.memoryUsagePercentage * 100).toFixed(1)}%, skipping grammar preloading for batch ${currentBatch}`);
        shouldPreloadGrammars = false;
      }
      
      // Also check MemoryManager's assessment if available
      if (memManager && shouldPreloadGrammars) {
        const managerStats = memManager.getMemoryStats();
        if (managerStats.formatted?.memoryStatus === 'high' || 
            managerStats.formatted?.memoryStatus === 'critical') {
          logger.debug(`MemoryManager indicates ${managerStats.formatted.memoryStatus} memory status, skipping grammar preloading`);
          shouldPreloadGrammars = false;
        }
      }
      
      if (shouldPreloadGrammars) {
        try {
          // Extract file extensions from the batch
          const fileExtensions = batch.map(file => path.extname(file.path));

          // Prepare grammars for the batch
          await grammarManager.prepareGrammarsForBatch(fileExtensions);
          logger.debug(`Preloaded grammars for ${fileExtensions.length} files in batch ${currentBatch}`);
        } catch (error) {
          logger.warn({ err: error }, 'Error preparing grammars for batch');
        }
      } else {
        // Only unload grammars in critical memory situations
        if (memStats && memStats.memoryUsagePercentage > 0.85) { // Raised from 0.6 to 0.85
          try {
            await grammarManager.unloadUnusedGrammars(); // Only when critical
            logger.warn('Critical memory pressure, unloading unused grammars');
          } catch {
            logger.debug('Could not unload unused grammars');
          }
        } else {
          logger.debug('Memory usage moderate, keeping grammars loaded for performance');
        }
      }
    }

    // Process items in parallel
    const batchPromises = batch.map(processor);
    const batchResults = await Promise.all(batchPromises);

    // Add batch results to overall results
    results.push(...batchResults);

    // Always perform lightweight cleanup after each batch
    await performLightweightCleanup(config);

    // Check memory usage and perform more aggressive cleanup if needed
    const memStats = getMemoryStats();
    if (memStats && memStats.memoryUsagePercentage > 0.7) {
      logger.info(`Memory usage at ${memStats?.memoryUsagePercentage?.toFixed(2)}%, running aggressive cleanup after batch ${currentBatch}/${totalBatches}`);
      await performAggressiveCleanup(config);
    } else if (i % 5 === 0 && i > 0) {
      // Perform moderate cleanup every 5 batches regardless of memory usage
      logger.debug(`Performing routine cleanup after batch ${currentBatch}/${totalBatches}`);
      await clearAllCaches();
    }

    // Log memory usage if enabled
    if (config.processing?.logMemoryUsage) {
      const memoryUsage = process.memoryUsage();
      logger.debug({
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`,
      }, `Memory usage after batch ${currentBatch}`);
    }
  }

  return results;
}

export async function processBatchesWithMemoryCheck<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 50,
  memoryThreshold: number = 0.7, // 70% memory usage
  cleanupFn?: () => Promise<void>
): Promise<R[]> {
  const results: R[] = [];
  const batches = splitIntoBatches(items, batchSize);

  for (const [index, batch] of batches.entries()) {
    // Process batch
    const batchResults = await Promise.all(
      batch.map(item => processor(item))
    );
    results.push(...batchResults);

    // Always perform lightweight cleanup after each batch
    await performLightweightCleanup();

    // Check memory usage after each batch
    const memStats = getMemoryStats();
    if (memStats && memStats.memoryUsagePercentage > memoryThreshold) {
      logger.info(`Memory usage at ${memStats?.memoryUsagePercentage?.toFixed(2)}%, running aggressive cleanup after batch ${index + 1}/${batches.length}`);

      // Use provided cleanup function if available, otherwise use our aggressive cleanup
      if (cleanupFn) {
        await cleanupFn();
      } else {
        await performAggressiveCleanup();
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
    }
  }

  // Final cleanup - only unload grammars when completely done
  if (grammarManager) {
    logger.info('All batch processing complete, performing final grammar cleanup');
    await grammarManager.unloadUnusedGrammars();
  }

  return results;
}
