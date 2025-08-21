// src/logger.ts
import { pino, Logger } from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const isDevelopment = process.env.NODE_ENV === 'development';
const isStdioTransport = process.env.MCP_TRANSPORT === 'stdio' || process.argv.includes('--stdio');
const isInteractiveMode = process.argv.includes('--interactive');
const effectiveLogLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

/**
 * Enhanced transport detection function
 * Enhances existing transport detection logic to support all transport types
 * Following DRY principle by extending existing detection patterns
 */
export function detectTransportType(): 'cli' | 'stdio' | 'sse' | 'http' | 'websocket' {
  // CLI detection: Check if running via unified-cli or vibe command
  const isCli = process.argv[1]?.includes('unified-cli') || 
                process.argv[1]?.includes('cli/index') ||
                process.argv[1]?.includes('vibe') ||
                process.env.VIBE_CLI_MODE === 'true';
  
  if (isCli) {
    return 'cli';
  }
  
  // Enhanced STDIO detection (using existing logic)
  if (isStdioTransport) {
    return 'stdio';
  }
  
  // SSE/HTTP/WebSocket detection based on environment or args
  const args = getProcessArgs();
  const isSSE = args.includes('--sse') || process.env.MCP_TRANSPORT === 'sse';
  if (isSSE) {
    return 'sse';
  }
  
  const isWebSocket = process.env.MCP_TRANSPORT === 'websocket';
  if (isWebSocket) {
    return 'websocket';
  }
  
  const isHTTP = process.env.MCP_TRANSPORT === 'http';
  if (isHTTP) {
    return 'http';
  }
  
  // Default fallback (preserving existing behavior)
  return 'sse';
}

// Helper function to parse command line arguments (avoiding global scope pollution)
function getProcessArgs(): string[] {
  return process.argv.slice(2);
}

// --- Calculate paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Transport-aware log file path
// For CLI: use current working directory with session log name
// For other transports: use package directory with server log name
const transportType = detectTransportType();
const logFilePath = transportType === 'cli' 
  ? path.join(process.cwd(), 'vibe-session.log')
  : path.resolve(__dirname, '../server.log');

// --- Create streams with graceful shutdown support ---
// Store references to destinations for cleanup
// For CLI: overwrite log file each session (append: false)
// For other transports: append to existing log file (default behavior)
const fileDestination = pino.destination({
  dest: logFilePath,
  append: transportType !== 'cli'  // CLI overwrites, others append
});
const consoleStream = (isDevelopment && !isStdioTransport) ? process.stdout : process.stderr;

// Log to file and also to the original console stream
// In interactive mode, keep file logging at info level but suppress console output
const streams = [
  { level: effectiveLogLevel, stream: fileDestination },
  // Always use stderr when stdio transport is detected to avoid interfering with MCP JSON-RPC protocol
  // In development, only use stdout if NOT using stdio transport
  // In interactive mode, suppress most console output by setting level to 'error'
  { level: isInteractiveMode ? 'error' : effectiveLogLevel, stream: consoleStream }
];


// Configure the logger
const configuredLogger = pino(
  {
    level: effectiveLogLevel, // Set level here for filtering before transport/multistream
    // --- Add Redaction ---
    redact: {
      paths: [
        'apiKey', // Redact any top-level apiKey
        '*.apiKey', // Redact apiKey in any nested object
        'receivedConfig.apiKey', // Specifically target the observed log structure
        'config.apiKey', // Common config pattern
        'openRouterConfig.apiKey', // Specific object name from index.ts
        'env.OPENROUTER_API_KEY', // If env vars are logged directly
        'env.PERPLEXITY_API_KEY' // Handle other potential keys
        // Add other sensitive keys if necessary, e.g., 'headers.Authorization'
      ],
      censor: '[REDACTED]', // Replace sensitive value with this string
    },
    // --- End Redaction ---
    // Transport is applied *after* multistream, only affects console output here
    // Only use pretty printing in development AND when not using stdio transport
    transport: (isDevelopment && !isStdioTransport)
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname', // Pretty print options
          },
        }
      : undefined, // Use default JSON transport for console when not in development or using stdio
  },
  pino.multistream(streams) // Use multistream for output destinations
);

// --- Graceful shutdown handling ---
let shutdownInProgress = false;
let loggerDestroyed = false;

/**
 * Create a resilient logger wrapper that handles post-shutdown logging gracefully
 */
function createResilientLogger(baseLogger: Logger) {
  return new Proxy(baseLogger, {
    get(target, prop) {
      // If logger is destroyed and this is a logging method, use console instead
      if (loggerDestroyed && typeof prop === 'string' && ['debug', 'info', 'warn', 'error', 'fatal', 'trace'].includes(prop)) {
        return function(obj: unknown, msg?: string) {
          try {
            // Format the log message for console output
            if (typeof obj === 'string') {
              console.log(`[${prop.toUpperCase()}] ${obj}`);
            } else if (msg) {
              console.log(`[${prop.toUpperCase()}] ${msg}`, obj);
            } else {
              console.log(`[${prop.toUpperCase()}]`, obj);
            }
          } catch {
            // Silently ignore console errors
          }
        };
      }

      // For non-logging methods or when logger is not destroyed, use original
      return (target as unknown as Record<string | symbol, unknown>)[prop];
    }
  });
}

/**
 * Gracefully shutdown logger streams to prevent sonic-boom crashes
 */
export function shutdownLogger(): Promise<void> {
  if (shutdownInProgress) {
    return Promise.resolve();
  }

  shutdownInProgress = true;

  return new Promise((resolve) => {
    try {
      // Log shutdown initiation
      configuredLogger.info('Initiating logger shutdown');

      // Handle SonicBoom destination gracefully
      if (fileDestination) {
        // Check if the destination is ready before attempting operations
        const isReady = (fileDestination as { ready?: boolean }).ready !== false;

        if (isReady) {
          // Try to flush synchronously only if ready
          try {
            if (typeof fileDestination.flushSync === 'function') {
              fileDestination.flushSync();
            }
          } catch (flushError) {
            // Ignore flush errors during shutdown - the stream might not be ready
            console.warn('Warning: Could not flush logger during shutdown:', (flushError as Error).message);
          }
        }

        // Always try to end the stream gracefully
        try {
          if (typeof fileDestination.end === 'function') {
            fileDestination.end();
          }
        } catch (endError) {
          console.warn('Warning: Could not end logger stream during shutdown:', (endError as Error).message);
        }
      }

      // Mark logger as destroyed to enable fallback behavior
      loggerDestroyed = true;

      // Give a small delay to ensure all writes are flushed
      setTimeout(() => {
        resolve();
      }, 150); // Slightly longer delay to ensure cleanup

    } catch (error) {
      // Don't use logger here as it might be in a bad state
      console.error('Error during logger shutdown:', error);
      loggerDestroyed = true;
      resolve();
    }
  });
}

// Track registered shutdown callbacks
const shutdownCallbacks: Array<() => Promise<void> | void> = [];

/**
 * Register a callback to be called during graceful shutdown
 */
export function registerShutdownCallback(callback: () => Promise<void> | void): void {
  shutdownCallbacks.push(callback);
}

/**
 * Execute all registered shutdown callbacks
 */
async function executeShutdownCallbacks(): Promise<void> {
  for (const callback of shutdownCallbacks) {
    try {
      await callback();
    } catch (error) {
      console.error('Error in shutdown callback:', error);
    }
  }
}

/**
 * Reset logger state for testing purposes
 * WARNING: This should only be used in test environments
 */
export function resetLoggerForTesting(): void {
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    console.warn('resetLoggerForTesting() should only be used in test environments');
    return;
  }

  shutdownInProgress = false;
  loggerDestroyed = false;
}

/**
 * Setup process exit handlers for graceful logger shutdown
 */
function setupShutdownHandlers(): void {
  let shutdownInitiated = false;

  const handleShutdown = async (signal: string) => {
    if (shutdownInitiated) {
      console.log(`\nForced shutdown on second ${signal}`);
      process.exit(1);
    }

    shutdownInitiated = true;

    try {
      console.log(`\nReceived ${signal}, shutting down gracefully...`);

      // Execute registered shutdown callbacks first (e.g., server cleanup)
      await executeShutdownCallbacks();

      // Then shutdown logger
      await shutdownLogger();

      console.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  // Handle various termination signals
  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGQUIT', () => handleShutdown('SIGQUIT'));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);

    try {
      // Try to execute shutdown callbacks and logger shutdown
      await executeShutdownCallbacks();
      await shutdownLogger();
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError);
    }

    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);

    try {
      // Try to execute shutdown callbacks and logger shutdown
      await executeShutdownCallbacks();
      await shutdownLogger();
    } catch (shutdownError) {
      console.error('Error during emergency shutdown:', shutdownError);
    }

    process.exit(1);
  });
}

// Setup shutdown handlers when this module is imported
setupShutdownHandlers();

// Export the resilient logger wrapper
const resilientLogger = createResilientLogger(configuredLogger);
export default resilientLogger;
