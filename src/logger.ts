// src/logger.ts
import { pino } from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const isDevelopment = process.env.NODE_ENV === 'development';
const effectiveLogLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// --- Calculate paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Log file in the project root directory (one level up from src)
const logFilePath = path.resolve(__dirname, '../server.log');

// --- Create streams ---
// Log to file and also to the original console stream
const streams = [
  { level: effectiveLogLevel, stream: pino.destination(logFilePath) },
  // Redirect console output to stderr when not in development to avoid interfering with MCP stdio
  { level: effectiveLogLevel, stream: isDevelopment ? process.stdout : process.stderr }
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
    transport: isDevelopment
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname', // Pretty print options
          },
        }
      : undefined, // Use default JSON transport for console when not in development
  },
  pino.multistream(streams) // Use multistream for output destinations
);


export default configuredLogger;
