#!/usr/bin/env node
/**
 * Unified Vibe CLI - Combines MCP Server and Natural Language CLI
 * 
 * Usage:
 *   vibe                    - Start MCP server
 *   vibe "request"          - Process natural language request
 *   vibe --help            - Show help
 *   vibe --setup           - Run setup wizard
 */

import { fileURLToPath } from 'url';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import dotenv from 'dotenv';
import { createSetupWizard } from './setup-wizard.js';
import { TransportContext } from './index-with-setup.js';
import logger from './logger.js';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

// Parse command line arguments
const args = process.argv.slice(2);

// Detect mode based on arguments
function detectMode(): 'server' | 'cli' | 'help' | 'setup' | 'interactive' {
  // Check for special flags first
  if (args.includes('--help') || args.includes('-h')) {
    return 'help';
  }
  
  if (args.includes('--setup') || args.includes('--reconfigure')) {
    return 'setup';
  }
  
  // Check for interactive mode
  if (args.includes('--interactive') || args.includes('-i')) {
    return 'interactive';
  }
  
  // If no arguments or only server-related flags, start server
  if (args.length === 0 || 
      args.every(arg => ['--sse', '--port', '--stdio'].includes(arg.split('=')[0]))) {
    return 'server';
  }
  
  // If there's a non-flag argument, it's a CLI request
  if (args.some(arg => !arg.startsWith('-'))) {
    return 'cli';
  }
  
  return 'server';
}

// Display unified help
function displayHelp(): void {
  console.log(boxen(
    chalk.cyan.bold('🤖 Vibe - Unified AI Development Assistant') + '\n\n' +
    chalk.white('Your one-stop command for AI-powered development'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan',
      textAlignment: 'center'
    }
  ));

  console.log(chalk.yellow('\n📋 Usage:\n'));
  
  console.log(chalk.green('  vibe                    ') + chalk.gray('Start MCP server (default)'));
  console.log(chalk.green('  vibe --interactive      ') + chalk.gray('Start interactive CLI mode'));
  console.log(chalk.green('  vibe "your request"     ') + chalk.gray('Process natural language request'));
  console.log(chalk.green('  vibe --setup            ') + chalk.gray('Run setup wizard'));
  console.log(chalk.green('  vibe --help             ') + chalk.gray('Show this help message'));
  
  console.log(chalk.yellow('\n🚀 Server Options:\n'));
  
  console.log(chalk.green('  vibe --sse              ') + chalk.gray('Start with Server-Sent Events transport'));
  console.log(chalk.green('  vibe --port <number>    ') + chalk.gray('Specify port for SSE mode (default: 3000)'));
  
  console.log(chalk.yellow('\n💬 CLI Options:\n'));
  
  console.log(chalk.green('  vibe "request" --verbose') + chalk.gray('Show detailed output'));
  console.log(chalk.green('  vibe "request" --json   ') + chalk.gray('Output in JSON format'));
  console.log(chalk.green('  vibe "request" --yaml   ') + chalk.gray('Output in YAML format'));
  console.log(chalk.green('  vibe "request" --quiet  ') + chalk.gray('Suppress non-error output'));
  
  console.log(chalk.yellow('\n📚 Examples:\n'));
  
  console.log(chalk.cyan('  Start MCP Server:'));
  console.log(chalk.gray('    vibe'));
  console.log(chalk.gray('    vibe --sse'));
  
  console.log(chalk.cyan('\n  Process Requests:'));
  console.log(chalk.gray('    vibe "research React best practices"'));
  console.log(chalk.gray('    vibe "create a PRD for e-commerce platform"'));
  console.log(chalk.gray('    vibe "map the codebase structure" --json'));
  console.log(chalk.gray('    vibe "generate user stories for auth"'));
  
  console.log(chalk.yellow('\n🛠️ Available Tools:\n'));
  
  const tools = [
    '• Research Manager - Technical research',
    '• PRD Generator - Product requirements',
    '• User Stories - Agile stories',
    '• Task List - Development tasks',
    '• Code Map - Codebase analysis',
    '• Context Curator - AI context packages',
    '• Starter Kit - Project templates',
    '• Rules Generator - Coding standards',
    '• Vibe Task Manager - Task management',
    '• Workflow Runner - Multi-step workflows',
    '• Agent Coordination - Multi-agent tasks'
  ];
  
  tools.forEach(tool => console.log(chalk.cyan(tool)));
  
  console.log(chalk.gray('\n📖 Documentation: https://github.com/freshtechbro/Vibe-Coder-MCP\n'));
}

// Main entry point
async function main() {
  try {
    const mode = detectMode();
    
    // Create CLI transport context for context-aware configuration
    const cliTransportContext: TransportContext = {
      sessionId: `cli-${Date.now()}`,
      transportType: 'cli',
      timestamp: Date.now(),
      workingDirectory: process.cwd(), // User's current working directory
      mcpClientConfig: undefined // Will be loaded by context-aware config manager
    };

    // Load environment variables BEFORE checking first run
    // This ensures .env file is loaded so isFirstRun() can properly detect existing config
    dotenv.config({ path: envPath });
    
    // Create context-aware setup wizard instance
    const contextAwareSetupWizard = createSetupWizard(cliTransportContext);
    
    // Always check for first run (except in help mode)
    if (mode !== 'help' && await contextAwareSetupWizard.isFirstRun()) {
      console.log(chalk.cyan.bold('\n🚀 Welcome to Vibe!\n'));
      console.log(chalk.yellow('First-time setup required...\n'));
      
      const success = await contextAwareSetupWizard.run();
      if (!success) {
        console.log(chalk.red('\n❌ Setup cancelled.'));
        console.log(chalk.gray('Run ') + chalk.cyan('vibe --setup') + chalk.gray(' to configure later.'));
        process.exit(1);
      }
      
      // After successful setup, show what to do next
      console.log(boxen(
        chalk.green.bold('✅ Setup Complete!') + '\n\n' +
        chalk.white('Vibe is now configured and ready to use.') + '\n\n' +
        chalk.cyan('Starting in ' + mode + ' mode...'),
        {
          padding: 1,
          margin: 1,
          borderStyle: 'double',
          borderColor: 'green'
        }
      ));
      
      // Reload environment variables after setup to get the new configuration
      dotenv.config({ path: envPath });
      
      // Continue with the originally requested mode
      console.log();
      
      // If no specific mode was requested (just 'vibe'), default to interactive
      if (args.length === 0 && mode === 'server') {
        // Change to interactive mode for better first-time experience
        await runInteractive();
        return;
      }
    }
    
    switch (mode) {
      case 'help':
        displayHelp();
        break;
        
      case 'setup':
        await runSetup();
        break;
        
      case 'server':
        await startServer();
        break;
        
      case 'cli':
        await runCLI();
        break;
      case 'interactive':
        await runInteractive();
        break;
    }
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error:'), error);
    logger.error({ err: error }, 'Unified CLI error');
    process.exit(1);
  }
}

// Run setup wizard
async function runSetup() {
  console.log(chalk.cyan.bold('\n🔧 Vibe Configuration\n'));
  
  // Create CLI transport context for setup reconfiguration
  const cliTransportContext: TransportContext = {
    sessionId: `cli-setup-${Date.now()}`,
    transportType: 'cli',
    timestamp: Date.now(),
    workingDirectory: process.cwd(), // User's current working directory
    mcpClientConfig: undefined // Will be loaded by context-aware config manager
  };
  
  // Create context-aware setup wizard for reconfiguration
  const contextAwareSetupWizard = createSetupWizard(cliTransportContext);
  
  const success = await contextAwareSetupWizard.run();
  if (success) {
    console.log(chalk.green('\n✅ Configuration updated successfully!'));
    console.log(chalk.gray('Run ') + chalk.cyan('vibe') + chalk.gray(' to start the server.'));
  } else {
    console.log(chalk.red('\n❌ Configuration failed.'));
  }
}

// Start MCP server
async function startServer() {
  const spinner = ora({
    text: 'Starting Vibe MCP Server...',
    color: 'cyan'
  }).start();
  
  try {
    // Delegate to compliant server implementation which properly validates via central config
    await import('./index-with-setup.js');
    
    // The server will handle its own initialization and configuration validation
    spinner.stop(); // Stop spinner as server will show its own messages
    
  } catch (error) {
    spinner.fail('Failed to start server');
    throw error;
  }
}

// Run interactive CLI mode
async function runInteractive() {
  try {
    // Start the interactive REPL
    process.argv = [process.argv[0], process.argv[1], '--interactive'];
    await import('./cli/index.js');
  } catch (error) {
    console.error(chalk.red('❌ Interactive CLI Error:'), error);
    logger.error({ err: error }, 'Interactive CLI execution error');
    process.exit(1);
  }
}

// Run CLI for natural language processing
async function runCLI() {
  // Import the CLI module dynamically
  try {
    // Remove any CLI-specific flags to get just the request
    const cliArgs = args.filter(arg => !arg.startsWith('-') || 
      ['--verbose', '--quiet', '--json', '--yaml', '--format', '--no-color', '-v', '-q'].includes(arg));
    
    // Set process.argv for the CLI module
    process.argv = [process.argv[0], process.argv[1], ...cliArgs];
    
    // Delegate to compliant CLI implementation which properly uses central config
    await import('./cli/index.js');
    
  } catch (error) {
    console.error(chalk.red('❌ CLI Error:'), error);
    logger.error({ err: error }, 'CLI execution error');
    process.exit(1);
  }
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

// Run the main function
main().catch((error) => {
  console.error(chalk.red('\n❌ Fatal error:'), error);
  process.exit(1);
});