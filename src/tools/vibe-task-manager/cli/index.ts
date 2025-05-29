#!/usr/bin/env node

/**
 * Vibe Task Manager CLI Entry Point
 * 
 * This file serves as the main entry point for the Vibe Task Manager CLI.
 * It sets up the command structure and handles global error handling.
 */

import { executeVibeTasksCLI } from './commands/index.js';
import logger from '../../../logger.js';

/**
 * Main CLI execution function
 */
async function main(): Promise<void> {
  try {
    // Set up process handlers
    process.on('unhandledRejection', (reason, promise) => {
      logger.error({ reason, promise }, 'Unhandled promise rejection in CLI');
      console.error('An unexpected error occurred. Please check the logs for details.');
      process.exit(1);
    });

    process.on('uncaughtException', (error) => {
      logger.error({ err: error }, 'Uncaught exception in CLI');
      console.error('A critical error occurred. Please check the logs for details.');
      process.exit(1);
    });

    // Handle SIGINT (Ctrl+C) gracefully
    process.on('SIGINT', () => {
      logger.info('CLI interrupted by user');
      console.log('\nOperation cancelled by user.');
      process.exit(0);
    });

    // Execute CLI with command line arguments
    await executeVibeTasksCLI();

  } catch (error) {
    logger.error({ err: error }, 'CLI execution failed');
    
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error('An unexpected error occurred');
    }
    
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    logger.error({ err: error }, 'Failed to start CLI');
    console.error('Failed to start Vibe Task Manager CLI');
    process.exit(1);
  });
}

export { executeVibeTasksCLI } from './commands/index.js';
