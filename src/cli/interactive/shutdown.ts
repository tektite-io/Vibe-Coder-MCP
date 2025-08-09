/**
 * Graceful shutdown handler for interactive CLI
 */

import chalk from 'chalk';
import { SessionPersistence, SessionData } from './persistence.js';
import logger from '../../logger.js';

export class GracefulShutdown {
  private handlers: Array<() => Promise<void>> = [];
  private isShuttingDown = false;
  
  /**
   * Register shutdown handler
   */
  register(handler: () => Promise<void>): void {
    this.handlers.push(handler);
  }
  
  /**
   * Execute shutdown
   */
  async execute(): Promise<void> {
    if (this.isShuttingDown) {
      return; // Already shutting down
    }
    
    this.isShuttingDown = true;
    
    console.log();
    console.log(chalk.yellow('Shutting down...'));
    
    // Execute all handlers in parallel with timeout
    const timeout = 5000; // 5 seconds timeout
    const handlerPromises = this.handlers.map(handler => 
      Promise.race([
        handler(),
        new Promise<void>((_, reject) => 
          setTimeout(() => reject(new Error('Shutdown timeout')), timeout)
        )
      ]).catch(error => {
        logger.error({ err: error }, 'Shutdown handler error');
      })
    );
    
    await Promise.all(handlerPromises);
    
    console.log(chalk.green('Goodbye! 👋'));
    process.exit(0);
  }
  
  /**
   * Setup signal handlers
   */
  setupSignalHandlers(): void {
    // Handle Ctrl+C
    process.on('SIGINT', async () => {
      await this.execute();
    });
    
    // Handle termination
    process.on('SIGTERM', async () => {
      await this.execute();
    });
    
    // Handle uncaught exceptions
    process.on('uncaughtException', async (error) => {
      console.error(chalk.red('Uncaught exception:'), error);
      logger.error({ err: error }, 'Uncaught exception in interactive mode');
      await this.execute();
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', async (reason, promise) => {
      console.error(chalk.red('Unhandled rejection:'), reason);
      logger.error({ reason, promise }, 'Unhandled rejection in interactive mode');
      await this.execute();
    });
  }
}

/**
 * Create auto-save handler for session
 */
export function createAutoSaveHandler(
  sessionId: string,
  getSessionData: () => SessionData,
  interval: number = 60000 // Auto-save every minute
): { start: () => void; stop: () => Promise<void> } {
  const persistence = new SessionPersistence();
  let intervalId: NodeJS.Timeout | null = null;
  
  const save = async () => {
    try {
      await persistence.saveSession(sessionId, getSessionData());
      logger.debug({ sessionId }, 'Session auto-saved');
    } catch (error) {
      logger.error({ err: error, sessionId }, 'Failed to auto-save session');
    }
  };
  
  return {
    start: () => {
      // Save immediately
      save();
      // Then save periodically
      intervalId = setInterval(save, interval);
    },
    
    stop: async () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Final save
      await save();
    }
  };
}