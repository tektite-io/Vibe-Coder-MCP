/**
 * Performance metrics collection for code-map-generator
 */

import logger from '../../logger.js';

export interface BatchMetrics {
  batchNumber: number;
  filesProcessed: number;
  processingTimeMs: number;
  memoryUsageMB: number;
  cacheHits?: number;
  cacheMisses?: number;
}

export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  totalFilesProcessed: number;
  totalBatchesProcessed: number;
  batches: BatchMetrics[];
  peakMemoryUsageMB: number;
  averageMemoryUsageMB: number;
  totalCacheHits: number;
  totalCacheMisses: number;
}

/**
 * Collects and reports performance metrics during code-map generation
 */
export class PerformanceMetricsCollector {
  private metrics: PerformanceMetrics;
  private currentBatchStartTime?: number;
  
  constructor() {
    this.metrics = {
      startTime: Date.now(),
      totalFilesProcessed: 0,
      totalBatchesProcessed: 0,
      batches: [],
      peakMemoryUsageMB: 0,
      averageMemoryUsageMB: 0,
      totalCacheHits: 0,
      totalCacheMisses: 0
    };
  }
  
  /**
   * Start tracking a new batch
   */
  startBatch(): void {
    this.currentBatchStartTime = Date.now();
  }
  
  /**
   * Complete the current batch and record metrics
   */
  completeBatch(filesProcessed: number, cacheHits?: number, cacheMisses?: number): void {
    if (!this.currentBatchStartTime) {
      logger.warn('completeBatch called without startBatch');
      return;
    }
    
    const processingTimeMs = Date.now() - this.currentBatchStartTime;
    const memoryUsage = process.memoryUsage();
    const memoryUsageMB = memoryUsage.heapUsed / (1024 * 1024);
    
    const batchMetrics: BatchMetrics = {
      batchNumber: this.metrics.totalBatchesProcessed + 1,
      filesProcessed,
      processingTimeMs,
      memoryUsageMB,
      cacheHits,
      cacheMisses
    };
    
    this.metrics.batches.push(batchMetrics);
    this.metrics.totalBatchesProcessed++;
    this.metrics.totalFilesProcessed += filesProcessed;
    
    // Update peak memory
    if (memoryUsageMB > this.metrics.peakMemoryUsageMB) {
      this.metrics.peakMemoryUsageMB = memoryUsageMB;
    }
    
    // Update cache stats
    if (cacheHits !== undefined) {
      this.metrics.totalCacheHits += cacheHits;
    }
    if (cacheMisses !== undefined) {
      this.metrics.totalCacheMisses += cacheMisses;
    }
    
    // Reset batch timer
    this.currentBatchStartTime = undefined;
    
    // Log batch metrics
    logger.debug({
      batch: batchMetrics.batchNumber,
      filesProcessed,
      processingTimeMs,
      memoryUsageMB: memoryUsageMB.toFixed(2),
      filesPerSecond: (filesProcessed / (processingTimeMs / 1000)).toFixed(2)
    }, 'Batch performance metrics');
  }
  
  /**
   * Finalize metrics collection and generate summary
   */
  finalize(): PerformanceMetrics {
    this.metrics.endTime = Date.now();
    
    // Calculate average memory usage
    if (this.metrics.batches.length > 0) {
      const totalMemory = this.metrics.batches.reduce((sum, batch) => sum + batch.memoryUsageMB, 0);
      this.metrics.averageMemoryUsageMB = totalMemory / this.metrics.batches.length;
    }
    
    return this.metrics;
  }
  
  /**
   * Generate a performance summary report
   */
  generateSummary(): string {
    const metrics = this.finalize();
    const totalTimeMs = (metrics.endTime || Date.now()) - metrics.startTime;
    const totalTimeSec = totalTimeMs / 1000;
    const filesPerSecond = metrics.totalFilesProcessed / totalTimeSec;
    const cacheHitRate = metrics.totalCacheHits > 0 
      ? (metrics.totalCacheHits / (metrics.totalCacheHits + metrics.totalCacheMisses)) * 100
      : 0;
    
    const summary = [
      '=== Performance Metrics Summary ===',
      `Total execution time: ${totalTimeSec.toFixed(2)} seconds`,
      `Total files processed: ${metrics.totalFilesProcessed}`,
      `Total batches processed: ${metrics.totalBatchesProcessed}`,
      `Average files per second: ${filesPerSecond.toFixed(2)}`,
      `Peak memory usage: ${metrics.peakMemoryUsageMB.toFixed(2)} MB`,
      `Average memory usage: ${metrics.averageMemoryUsageMB.toFixed(2)} MB`,
      `Cache hit rate: ${cacheHitRate.toFixed(1)}% (${metrics.totalCacheHits} hits, ${metrics.totalCacheMisses} misses)`,
      '',
      'Batch Performance:',
      ...metrics.batches.slice(-5).map(batch => 
        `  Batch ${batch.batchNumber}: ${batch.filesProcessed} files in ${batch.processingTimeMs}ms (${(batch.filesProcessed / (batch.processingTimeMs / 1000)).toFixed(2)} files/sec)`
      )
    ].join('\n');
    
    logger.info('\n' + summary);
    return summary;
  }
  
  /**
   * Get current metrics without finalizing
   */
  getCurrentMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }
}

// Singleton instance
let metricsCollector: PerformanceMetricsCollector | null = null;

/**
 * Get or create the performance metrics collector
 */
export function getMetricsCollector(): PerformanceMetricsCollector {
  if (!metricsCollector) {
    metricsCollector = new PerformanceMetricsCollector();
  }
  return metricsCollector;
}

/**
 * Reset the metrics collector
 */
export function resetMetricsCollector(): void {
  metricsCollector = null;
}