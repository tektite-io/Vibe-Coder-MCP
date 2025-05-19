/**
 * Batch processor for the Code-Map Generator tool.
 * This file contains functions for processing files in batches.
 */

import logger from '../../logger.js';
import { CodeMapGeneratorConfig } from './types.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';

/**
 * Gets the optimal batch size based on configuration.
 * @param config The Code-Map Generator configuration
 * @returns The batch size
 */
export function getBatchSize(config: CodeMapGeneratorConfig): number {
  return config.processing?.batchSize || 100;
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
  
  const batchSize = getBatchSize(config);
  const batches = splitIntoBatches(items, batchSize);
  const totalBatches = batches.length;
  const results: R[] = [];
  
  logger.info(`Processing ${items.length} items in ${totalBatches} batches (batch size: ${batchSize})`);
  
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
    
    // Process items in parallel
    const batchPromises = batch.map(processItem);
    const batchResults = await Promise.all(batchPromises);
    
    // Add batch results to overall results
    results.push(...batchResults);
    
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
  
  const batchSize = getBatchSize(config);
  const batches = splitIntoBatches(items, batchSize);
  const totalBatches = batches.length;
  
  logger.info(`Processing ${items.length} items in ${totalBatches} batches with intermediate storage (batch size: ${batchSize})`);
  
  // Calculate progress ranges
  const processingRange = (endProgress - startProgress) * 0.8; // 80% for processing
  const combiningRange = (endProgress - startProgress) * 0.2; // 20% for combining
  
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
