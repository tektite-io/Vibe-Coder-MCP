#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import logger, { registerShutdownCallback, detectTransportType } from "./logger.js";
import { initializeToolEmbeddings } from './services/routing/embeddingStore.js';
import { OpenRouterConfigManager } from './utils/openrouter-config-manager.js';
import { ToolRegistry } from './services/routing/toolRegistry.js';
// import { sseNotifier } from './services/sse-notifier/index.js';
import { transportManager } from './services/transport-manager/index.js';
import { PortAllocator } from './utils/port-allocator.js';
import { setupWizard } from './setup-wizard.js';
import { UnifiedSecurityConfigManager } from './tools/vibe-task-manager/security/unified-security-config.js';
import { OpenRouterConfig } from './types/workflow.js';

// Define interfaces
export interface TransportContext {
  sessionId: string;
  transportType: 'cli' | 'stdio' | 'sse' | 'http' | 'websocket';
  timestamp: number;
  workingDirectory?: string;
  mcpClientConfig?: OpenRouterConfig;
}

interface TransportWithMessageHandling {
  handlePostMessage(req: express.Request, res: express.Response, context: TransportContext): Promise<void>;
}

const isMessageHandlingTransport = (t: object | null): t is TransportWithMessageHandling =>
  t !== null && typeof t === 'object' && 'handlePostMessage' in t && typeof (t as TransportWithMessageHandling).handlePostMessage === 'function';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');

// Parse command line arguments
const args = process.argv.slice(2);
const useSSE = args.includes('--sse');
const showHelp = args.includes('--help') || args.includes('-h');
const runSetup = args.includes('--setup') || args.includes('--reconfigure');

// Display help if requested
if (showHelp) {
  console.log(chalk.cyan.bold('\n🤖 Vibe Coder MCP Server\n'));
  console.log(chalk.white('Usage: vibe-coder-mcp [options]\n'));
  console.log(chalk.yellow('Options:'));
  console.log(chalk.green('  --help, -h        ') + chalk.gray('Show this help message'));
  console.log(chalk.green('  --setup           ') + chalk.gray('Run the setup wizard'));
  console.log(chalk.green('  --reconfigure     ') + chalk.gray('Reconfigure settings'));
  console.log(chalk.green('  --sse             ') + chalk.gray('Use Server-Sent Events transport'));
  console.log(chalk.green('  --port <number>   ') + chalk.gray('Specify port for SSE mode (default: 3000)'));
  console.log('\n' + chalk.gray('For more information: https://github.com/freshtechbro/Vibe-Coder-MCP'));
  process.exit(0);
}

// Main initialization function
async function initialize() {
  // Check if setup is needed or requested
  if (runSetup || await setupWizard.isFirstRun()) {
    console.log(chalk.cyan.bold('\n🚀 Vibe Coder MCP Setup\n'));
    
    const success = await setupWizard.run();
    if (!success) {
      console.log(chalk.red('\n❌ Setup failed. Exiting...'));
      process.exit(1);
    }
    
    console.log(chalk.green('\n✅ Setup complete! Starting server...\n'));
  }

  // Load environment variables
  const dotenvResult = dotenv.config({ path: envPath });
  if (dotenvResult.error) {
    logger.warn({ err: dotenvResult.error, path: envPath }, `Could not load .env file from explicit path.`);
  } else {
    logger.info({ path: envPath, loaded: dotenvResult.parsed ? Object.keys(dotenvResult.parsed) : [] }, `Loaded environment variables from .env file.`);
  }

  // Display startup message
  const spinner = ora({
    text: 'Starting Vibe Coder MCP Server...',
    color: 'cyan'
  }).start();

  try {
    // Continue with normal server initialization
    await startServer(spinner);
  } catch (error) {
    spinner.fail('Failed to start server');
    logger.error({ err: error }, 'Server startup failed');
    console.log(chalk.red('\n❌ Server startup failed. Check logs for details.'));
    process.exit(1);
  }
}

// Server startup function
async function startServer(spinner: Ora) {
  // Initialize OpenRouter configuration
  const configManager = OpenRouterConfigManager.getInstance();
  await configManager.initialize();
  const openRouterConfig = await configManager.getOpenRouterConfig();

  // Initialize ToolRegistry with the configuration
  ToolRegistry.getInstance(openRouterConfig);

  // Create transport context using enhanced detection
  const transportType = detectTransportType();
  const transportContext: TransportContext = {
    sessionId: 'server-session',
    transportType,
    timestamp: Date.now(),
    workingDirectory: process.cwd(), // May not be user project for server
    mcpClientConfig: openRouterConfig
  };

  // Initialize Unified Security Configuration with transport context
  const securityManager = UnifiedSecurityConfigManager.getInstance();
  securityManager.initializeFromMCPConfig(openRouterConfig, transportContext);
  logger.info({ transportType }, 'Unified Security Configuration initialized with transport context');

  // Initialize tool embeddings
  try {
    await initializeToolEmbeddings();
    logger.info('Tool embeddings initialized');
  } catch (error) {
    logger.error({ err: error }, 'Failed to initialize tool embeddings');
  }

  // Dynamically import createServer after ToolRegistry is initialized
  const { createServer } = await import("./server.js");
  const mcpServer = createServer(openRouterConfig);

  // Define main function for transport setup
  async function main(mcpServer: import("@modelcontextprotocol/sdk/server/mcp.js").McpServer) {
    try {
      if (useSSE) {
        // SSE mode setup
        const app = express();
        app.use(cors());
        app.use(express.json());

        const allocatedSsePort = transportManager.getServicePort('sse');
        const port = allocatedSsePort ||
                     (process.env.SSE_PORT ? parseInt(process.env.SSE_PORT) : undefined) ||
                     (process.env.PORT ? parseInt(process.env.PORT) : 3000);

        app.get('/health', (req: express.Request, res: express.Response) => {
          res.status(200).json({ status: 'ok' });
        });

        app.get('/sse', (req: express.Request, res: express.Response) => {
          const sessionId = req.query.sessionId as string || `sse-${Math.random().toString(36).substring(2)}`;
          const transport = new SSEServerTransport('/messages', res);
          (req as express.Request & { sessionId?: string }).sessionId = sessionId;
          logger.info({ sessionId, transportSessionId: transport.sessionId }, 'Established SSE connection');
          mcpServer.connect(transport).catch((error: Error) => {
            logger.error({ err: error }, 'Failed to connect transport');
          });
        });

        app.post('/messages', async (req: express.Request, res: express.Response) => {
          if (!req.body) {
            return res.status(400).json({ error: 'Invalid request body' });
          }

          try {
            // Extract session ID from query parameters or body
            const sessionId = req.query.sessionId as string || req.body.session_id;

            if (!sessionId) {
              return res.status(400).json({ error: 'Missing session ID. Establish an SSE connection first.' });
            }

            // Find the active transport for this session
            const transport = mcpServer.server.transport;

            if (!transport) {
              return res.status(400).json({ error: 'No active SSE connection' });
            }

            if (isMessageHandlingTransport(transport)) {
              // Pass the session ID and transport type in the context
              const context: TransportContext = {
                sessionId,
                transportType: sessionId === 'stdio-session' ? 'stdio' : 'sse',
                timestamp: Date.now()
              };
              await transport.handlePostMessage(req, res, context);
            } else {
              logger.error('Active transport does not support handlePostMessage or is not defined.');
              if (!res.headersSent) {
                res.status(500).json({ error: 'Transport does not support POST messages' });
              }
            }
          } catch (error) {
            logger.error({ err: error }, 'Error handling POST message');
            if (!res.headersSent) {
              res.status(500).json({ error: 'Internal server error' });
            }
          }
        });

        const server = app.listen(port, () => {
          spinner.succeed(`Vibe Coder MCP Server running on port ${port} (SSE mode)`);
          console.log(chalk.green(`\n✅ Server ready at: `) + chalk.cyan(`http://localhost:${port}`));
          console.log(chalk.gray('Health check: ') + chalk.cyan(`http://localhost:${port}/health`));
          console.log(chalk.gray('SSE endpoint: ') + chalk.cyan(`http://localhost:${port}/sse\n`));
        });

        registerShutdownCallback(async () => {
          server.close();
          await PortAllocator.cleanupOrphanedPorts();
        });

      } else {
        // Standard stdio mode
        const transport = new StdioServerTransport();
        await mcpServer.connect(transport);
        spinner.succeed('Vibe Coder MCP Server running (stdio mode)');
        console.log(chalk.green('\n✅ Server ready!'));
        console.log(chalk.gray('Connected via stdio transport'));
        console.log(chalk.gray('Ready to receive requests from MCP client\n'));
      }

    } catch (error) {
      spinner.fail('Server startup failed');
      logger.error({ err: error }, 'Failed to start MCP server');
      throw error;
    }
  }

  // Run the main function
  await main(mcpServer);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
  console.error(chalk.red('\n❌ Uncaught exception:'), error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise }, 'Unhandled rejection');
  console.error(chalk.red('\n❌ Unhandled rejection:'), reason);
  process.exit(1);
});

// Start the server
initialize().catch((error) => {
  logger.error({ err: error }, 'Failed to initialize');
  console.error(chalk.red('\n❌ Initialization failed:'), error);
  process.exit(1);
});