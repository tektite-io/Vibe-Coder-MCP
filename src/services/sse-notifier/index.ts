// src/services/sse-notifier/index.ts
import { Response } from 'express'; // Assuming Express is used for the SSE endpoint
import logger from '../../logger.js';
import { JobStatus, jobManager } from '../job-manager/index.js'; // Import JobStatus and jobManager
import { createJobStatusMessage } from '../job-manager/jobStatusMessage.js'; // Import standard message format

/**
 * Manages Server-Sent Events (SSE) connections and broadcasts job progress.
 * Uses a Singleton pattern.
 */
class SseNotifier {
  // Store active connections, mapping sessionId to the Express Response object
  private connections = new Map<string, Response>();

  /**
   * Registers a new SSE connection for a given session ID.
   * Sets up necessary headers and keeps the connection open.
   * @param sessionId The unique identifier for the client session.
   * @param res The Express Response object for the SSE connection.
   */
  registerConnection(sessionId: string, res: Response): void {
    if (this.connections.has(sessionId)) {
      logger.warn({ sessionId }, `SSE connection already registered for this session. Overwriting.`);
      // Close the previous connection cleanly if possible
      const oldRes = this.connections.get(sessionId);
      try {
        oldRes?.end();
      } catch (e) {
        logger.error({ err: e, sessionId }, `Error closing previous SSE connection.`);
      }
    }

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      // Consider CORS headers if the client is on a different origin
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders(); // Send headers immediately

    this.connections.set(sessionId, res);
    logger.info({ sessionId }, `Registered new SSE connection.`);

    // Send a confirmation message
    this.sendMessage(sessionId, 'connected', { message: 'SSE connection established.' });

    // Handle client disconnect
    res.on('close', () => {
      this.unregisterConnection(sessionId);
      logger.info({ sessionId }, `SSE connection closed by client.`);
    });

    // Keep connection alive periodically (optional, depends on proxy/server timeouts)
    const keepAliveInterval = setInterval(() => {
      if (!this.connections.has(sessionId)) {
        clearInterval(keepAliveInterval);
        return;
      }
      // Send a comment line to keep the connection open
      // res.write(': keep-alive\n\n'); // Old line
      const currentRes = this.connections.get(sessionId); // Get current res, might have changed
      if (currentRes && !currentRes.writableEnded) {
        try {
          currentRes.write(': keep-alive\n\n');
        } catch (e) {
          logger.warn({ err: e, sessionId }, 'Error writing keep-alive. Clearing interval and unregistering.');
          clearInterval(keepAliveInterval);
          this.unregisterConnection(sessionId); // Attempt to clean up
        }
      } else {
        // Connection no longer valid or writable
        clearInterval(keepAliveInterval);
        if (this.connections.has(sessionId)) { // Check again before unregistering
            this.unregisterConnection(sessionId);
        }
      }
    }, 20000); // e.g., every 20 seconds
  }

  /**
   * Unregisters an SSE connection for a given session ID.
   * @param sessionId The unique identifier for the client session.
   */
  unregisterConnection(sessionId: string): void {
    const res = this.connections.get(sessionId);
    if (res) {
      try {
        // Check if writable before ending
        if (!res.writableEnded) {
          res.end();
        }
      } catch (e) {
         logger.error({ err: e, sessionId }, `Error ending SSE connection during unregister.`);
      }
      this.connections.delete(sessionId); // Ensure this is called if res was found
      logger.info({ sessionId }, `Unregistered SSE connection.`);
    } else {
      logger.warn({ sessionId }, `Attempted to unregister non-existent SSE connection.`);
    }
  }

  /**
   * Sends a generic message to a specific SSE client.
   * @param sessionId The ID of the session/client to send the message to.
   * @param event The name of the event (e.g., 'progress', 'error', 'connected').
   * @param data The data payload for the event.
   */
  private sendMessage(sessionId: string, event: string, data: Record<string, unknown>): void {
    const res = this.connections.get(sessionId);
    if (res && !res.writableEnded) {
      try {
        res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
        logger.debug({ sessionId, event, data }, `Sent SSE message.`);
      } catch (e) {
        logger.error({ err: e, sessionId, event }, `Failed to send SSE message.`);
        // Consider unregistering the connection if writing fails
        this.unregisterConnection(sessionId);
      }
    } else if (!res) {
      logger.warn({ sessionId, event }, `Attempted to send SSE message to non-existent or closed connection.`);
    }
  }

  /**
   * Sends a job progress update to a client.
   * For SSE clients, sends the update via SSE.
   * For stdio clients, updates the job status in the job manager.
   * @param sessionId The ID of the session/client associated with the job.
   * @param jobId The ID of the job being updated.
   * @param status The current status of the job.
   * @param message An optional progress message.
   * @param progress An optional progress percentage (0-100).
   */
  sendProgress(sessionId: string, jobId: string, status: JobStatus, message?: string, progress?: number): void {
    if (!sessionId) {
      logger.warn({ jobId, status, message }, "Cannot send progress update: Missing sessionId.");
      return;
    }

    // Get the job to include tool name and timestamps
    const job = jobManager.getJob(jobId, false); // Don't update access time

    if (!job) {
      logger.warn({ jobId, status, message }, "Cannot send progress update: Job not found.");
      return;
    }

    // Create a standardized job status message
    const statusMessage = createJobStatusMessage(
      jobId,
      job.toolName,
      status,
      message,
      progress,
      job.createdAt,
      job.updatedAt
    );

    // For stdio transport, just update the job status
    if (sessionId === 'stdio-session' || sessionId === 'placeholder-session-id' || sessionId === 'unknown-session') {
      // Just update the job status in the job manager
      jobManager.updateJobStatus(jobId, status, message);
      logger.debug({ jobId, status, message, sessionId }, "Updated job status for stdio session");
      return;
    }

    // For SSE transport, send the update via SSE
    if (this.connections.has(sessionId)) {
      this.sendMessage(sessionId, 'jobProgress', statusMessage as unknown as Record<string, unknown>);
    } else {
      logger.warn({ jobId, status, message, sessionId }, "Cannot send SSE progress: No active connection for session.");
    }
  }

  /**
   * Sends a job result to a client.
   * For SSE clients, sends the result via SSE.
   * @param sessionId The ID of the session/client associated with the job.
   * @param jobId The ID of the job.
   * @param result The result of the job.
   */
  sendJobResult(sessionId: string, jobId: string, result: Record<string, unknown>): void {
    if (!sessionId) {
      logger.warn({ jobId }, "Cannot send job result: Missing sessionId.");
      return;
    }

    // For stdio transport, do nothing (client will poll for result)
    if (sessionId === 'stdio-session' || sessionId === 'placeholder-session-id' || sessionId === 'unknown-session') {
      logger.debug({ jobId, sessionId }, "Skipping SSE job result for stdio session");
      return;
    }

    // For SSE transport, send the result via SSE
    if (this.connections.has(sessionId)) {
      this.sendMessage(sessionId, 'result', { jobId, result });
    } else {
      logger.warn({ jobId, sessionId }, "Cannot send SSE job result: No active connection for session.");
    }
  }

  /**
   * Closes all active SSE connections. Useful on server shutdown.
   */
  closeAllConnections(): void {
    logger.info(`Closing all ${this.connections.size} active SSE connections...`);
    this.connections.forEach((res, sessionId) => {
      this.unregisterConnection(sessionId); // unregister handles logging and ending
    });
    this.connections.clear(); // Ensure map is cleared
    logger.info(`All SSE connections closed.`);
  }
}

// Export a singleton instance
export const sseNotifier = new SseNotifier();

// Graceful shutdown handler
process.on('SIGINT', () => {
  sseNotifier.closeAllConnections();
  process.exit(0);
});
process.on('SIGTERM', () => {
  sseNotifier.closeAllConnections();
  process.exit(0);
});