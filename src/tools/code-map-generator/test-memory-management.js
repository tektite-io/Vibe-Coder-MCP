#!/usr/bin/env node

/**
 * Test script for the memory management system in the Code-Map Generator tool.
 * This script tests the memory management system by running the code-map-generator
 * on a sample codebase and monitoring memory usage.
 * 
 * Usage:
 *   node test-memory-management.js [directory]
 * 
 * If no directory is specified, the current directory is used.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { executeCodeMapGeneration } from './index.js';
import logger from '../../logger.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const targetDir = args[0] || process.cwd();

// Configure the test
const config = {
  allowedMappingDirectory: targetDir,
  output: {
    outputDir: path.join(process.cwd(), 'vibecoderoutput')
  },
  cache: {
    enabled: true,
    maxEntries: 1000,
    maxAge: 60 * 60 * 1000 // 1 hour
  },
  ignorePatterns: [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/vibecoderoutput/**'
  ]
};

// Mock job manager and SSE notifier
const mockJobManager = {
  updateJobStatus: (jobId, status, message) => {
    logger.info(`Job ${jobId}: ${status} - ${message}`);
  },
  setJobResult: (jobId, result) => {
    logger.info(`Job ${jobId}: Result set`);
  }
};

const mockSseNotifier = {
  sendProgress: (sessionId, jobId, status, message, percentage) => {
    logger.info(`Session ${sessionId}, Job ${jobId}: ${status} - ${message} (${percentage || 0}%)`);
  }
};

// Generate a random job ID and session ID
const jobId = `test-${Date.now()}`;
const sessionId = `session-${Date.now()}`;

// Log memory usage
function logMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  logger.info({
    rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
    heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
    external: `${Math.round(memoryUsage.external / 1024 / 1024)} MB`
  }, 'Memory usage');
}

// Run the test
async function runTest() {
  logger.info(`Testing memory management on directory: ${targetDir}`);
  logger.info(`Job ID: ${jobId}, Session ID: ${sessionId}`);
  
  // Log initial memory usage
  logger.info('Initial memory usage:');
  logMemoryUsage();
  
  try {
    // Run the code map generator
    const result = await executeCodeMapGeneration(
      { directory: targetDir },
      config,
      jobId,
      sessionId,
      mockJobManager,
      mockSseNotifier
    );
    
    // Log final memory usage
    logger.info('Final memory usage:');
    logMemoryUsage();
    
    // Log success
    logger.info('Test completed successfully');
    logger.info(`Output saved to: ${config.output.outputDir}`);
    
    // Exit with success
    process.exit(0);
  } catch (error) {
    // Log error
    logger.error({ err: error }, 'Test failed');
    
    // Log final memory usage
    logger.info('Memory usage at error:');
    logMemoryUsage();
    
    // Exit with error
    process.exit(1);
  }
}

// Run the test
runTest();
