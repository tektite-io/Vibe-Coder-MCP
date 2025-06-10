/**
 * Codemap cache management utilities for Context Curator
 * Provides intelligent caching of recently generated codemaps to optimize workflow performance
 */

import { promises as fs } from 'fs';
import path from 'path';
import logger from '../../../logger.js';

/**
 * Result of codemap cache lookup
 */
export interface CodemapCacheResult {
  /** Codemap file content */
  content: string;
  /** Full path to the codemap file */
  path: string;
  /** Timestamp when the codemap was generated */
  timestamp: Date;
  /** Whether this result came from cache */
  fromCache: boolean;
}

/**
 * Codemap cache manager for intelligent caching
 */
export class CodemapCacheManager {
  /**
   * Find the most recent codemap within the specified age limit
   * @param maxAgeMinutes Maximum age of cached codemap in minutes
   * @param outputDir Base output directory (defaults to VIBE_CODER_OUTPUT_DIR)
   * @returns CodemapCacheResult if found, null otherwise
   */
  static async findRecentCodemap(
    maxAgeMinutes: number,
    outputDir?: string
  ): Promise<CodemapCacheResult | null> {
    const baseOutputDir = outputDir || 
                         process.env.VIBE_CODER_OUTPUT_DIR || 
                         path.join(process.cwd(), 'VibeCoderOutput');
    
    const codemapDir = path.join(baseOutputDir, 'code-map-generator');
    const maxAgeMs = maxAgeMinutes * 60 * 1000;
    const now = Date.now();

    try {
      // Check if codemap directory exists
      await fs.access(codemapDir);
      
      // Read directory contents
      const files = await fs.readdir(codemapDir);
      
      // Filter and process codemap files
      const codemapFiles = files
        .filter(f => f.endsWith('.md') && f.includes('code-map'))
        .map(f => ({
          name: f,
          path: path.join(codemapDir, f),
          timestamp: this.extractTimestampFromFilename(f)
        }))
        .filter(f => f.timestamp !== null)
        .filter(f => (now - f.timestamp!.getTime()) <= maxAgeMs)
        .sort((a, b) => b.timestamp!.getTime() - a.timestamp!.getTime());

      if (codemapFiles.length > 0) {
        const latestCodemap = codemapFiles[0];
        const ageMs = now - latestCodemap.timestamp!.getTime();
        
        logger.info({
          path: latestCodemap.path,
          ageMinutes: Math.round(ageMs / (60 * 1000)),
          maxAgeMinutes,
          fileCount: codemapFiles.length
        }, 'Found recent codemap in cache');

        // Read the codemap content with retry logic
        const content = await this.readCodemapWithRetry(latestCodemap.path);
        
        return {
          content,
          path: latestCodemap.path,
          timestamp: latestCodemap.timestamp!,
          fromCache: true
        };
      } else {
        logger.debug({
          codemapDir,
          maxAgeMinutes,
          totalFiles: files.length,
          codemapFiles: files.filter(f => f.endsWith('.md') && f.includes('code-map')).length
        }, 'No recent codemap found in cache');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.debug({ codemapDir }, 'Codemap directory does not exist');
      } else {
        logger.warn({ 
          error: error instanceof Error ? error.message : 'Unknown error',
          codemapDir 
        }, 'Failed to check for cached codemap');
      }
    }

    return null;
  }

  /**
   * Extract timestamp from codemap filename
   * Expected format: YYYY-MM-DDTHH-mm-ss-sssZ-code-map.md
   * @param filename The codemap filename
   * @returns Date object if parsing successful, null otherwise
   */
  static extractTimestampFromFilename(filename: string): Date | null {
    try {
      // Match ISO timestamp pattern in filename
      const match = filename.match(/^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)/);
      
      if (match) {
        // Convert filename format back to ISO string
        // From: 2025-06-08T20-16-46-608Z
        // To:   2025-06-08T20:16:46.608Z
        const timestampStr = match[1];
        // Parse the timestamp components manually for better control
        const parts = timestampStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
        if (!parts) {
          logger.warn({ filename, timestampStr }, 'Invalid timestamp format in filename');
          return null;
        }

        const [, year, month, day, hour, minute, second, millisecond] = parts;

        // Create ISO string manually
        const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}Z`;
        
        const date = new Date(isoString);
        
        // Validate the parsed date
        if (isNaN(date.getTime())) {
          logger.warn({ filename, timestampStr, isoString }, 'Invalid timestamp in filename');
          return null;
        }
        
        return date;
      } else {
        logger.debug({ filename }, 'No timestamp pattern found in filename');
        return null;
      }
    } catch (error) {
      logger.warn({ 
        filename, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }, 'Failed to extract timestamp from filename');
      return null;
    }
  }

  /**
   * Read codemap file with retry logic for concurrent access handling
   * @param filePath Path to the codemap file
   * @param maxRetries Maximum number of retry attempts
   * @returns File content as string
   */
  private static async readCodemapWithRetry(
    filePath: string, 
    maxRetries: number = 3
  ): Promise<string> {
    const retryDelayMs = 100;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Check file accessibility first
        await fs.access(filePath, fs.constants.R_OK);
        
        // Read file content
        const content = await fs.readFile(filePath, 'utf-8');
        
        // Basic validation - ensure file is not empty and contains expected content
        if (content.length > 0 && content.includes('# Code Map')) {
          logger.debug({ 
            filePath, 
            attempt,
            contentLength: content.length 
          }, 'Successfully read cached codemap');
          
          return content;
        } else {
          throw new Error('File appears to be incomplete or corrupted');
        }
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        logger.warn({ 
          filePath, 
          attempt,
          maxRetries,
          error: errorMessage 
        }, 'Failed to read cached codemap file');
        
        if (attempt === maxRetries) {
          throw new Error(`Failed to read codemap after ${maxRetries} attempts: ${errorMessage}`);
        }
        
        // Wait before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, retryDelayMs * attempt));
      }
    }
    
    throw new Error('Unexpected end of retry loop');
  }

  /**
   * Get cache statistics for debugging and monitoring
   * @param outputDir Base output directory (defaults to VIBE_CODER_OUTPUT_DIR)
   * @returns Cache statistics object
   */
  static async getCacheStats(outputDir?: string): Promise<{
    totalCodemaps: number;
    oldestTimestamp: Date | null;
    newestTimestamp: Date | null;
    totalSizeBytes: number;
    averageAgeMinutes: number;
  }> {
    const baseOutputDir = outputDir || 
                         process.env.VIBE_CODER_OUTPUT_DIR || 
                         path.join(process.cwd(), 'VibeCoderOutput');
    
    const codemapDir = path.join(baseOutputDir, 'code-map-generator');
    
    try {
      const files = await fs.readdir(codemapDir);
      const codemapFiles = files.filter(f => f.endsWith('.md') && f.includes('code-map'));
      
      if (codemapFiles.length === 0) {
        return {
          totalCodemaps: 0,
          oldestTimestamp: null,
          newestTimestamp: null,
          totalSizeBytes: 0,
          averageAgeMinutes: 0
        };
      }
      
      const now = Date.now();
      let totalSizeBytes = 0;
      let totalAgeMs = 0;
      let oldestTimestamp: Date | null = null;
      let newestTimestamp: Date | null = null;
      
      for (const file of codemapFiles) {
        const filePath = path.join(codemapDir, file);
        const stats = await fs.stat(filePath);
        const timestamp = this.extractTimestampFromFilename(file);
        
        totalSizeBytes += stats.size;
        
        if (timestamp) {
          const ageMs = now - timestamp.getTime();
          totalAgeMs += ageMs;
          
          if (!oldestTimestamp || timestamp < oldestTimestamp) {
            oldestTimestamp = timestamp;
          }
          if (!newestTimestamp || timestamp > newestTimestamp) {
            newestTimestamp = timestamp;
          }
        }
      }
      
      return {
        totalCodemaps: codemapFiles.length,
        oldestTimestamp,
        newestTimestamp,
        totalSizeBytes,
        averageAgeMinutes: Math.round(totalAgeMs / (codemapFiles.length * 60 * 1000))
      };
      
    } catch (error) {
      logger.warn({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        codemapDir 
      }, 'Failed to get cache statistics');
      
      return {
        totalCodemaps: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
        totalSizeBytes: 0,
        averageAgeMinutes: 0
      };
    }
  }
}
