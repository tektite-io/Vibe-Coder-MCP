/**
 * Vibe Interactive REPL Module
 * Provides interactive command-line interface for chat sessions
 */

import readline from 'readline';
import chalk from 'chalk';
import { OpenRouterConfig } from '../../types/workflow.js';
import { executeTool } from '../../services/routing/toolRegistry.js';
import { ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { getBanner, getSessionStartMessage, getPrompt } from './ui/banner.js';
import { progress } from './ui/progress.js';
import { ResponseFormatter } from './ui/formatter.js';
import { CommandHistory } from './history.js';
import { AutoCompleter } from './completion.js';
import { SessionPersistence, SessionData } from './persistence.js';
import { GracefulShutdown, createAutoSaveHandler } from './shutdown.js';
import { MultilineInput } from './multiline.js';
import { MarkdownRenderer } from './ui/markdown.js';
import { configManager } from './config.js';
import { themeManager } from './themes.js';
import logger from '../../logger.js';

export class VibeInteractiveREPL {
  private rl: readline.Interface | null = null;
  private sessionId: string;
  private conversationHistory: Array<{role: string, content: string}> = [];
  private openRouterConfig: OpenRouterConfig | null = null;
  private isRunning = false;
  private history: CommandHistory;
  private completer: AutoCompleter;
  private persistence: SessionPersistence;
  private shutdown: GracefulShutdown;
  private autoSaveHandler: ReturnType<typeof createAutoSaveHandler> | null = null;
  private startTime: Date;
  private multiline: MultilineInput;
  private enableMarkdown = true;
  private requestConcurrency = 0;
  // Track active background jobs for polling
  private activeJobs = new Map<string, NodeJS.Timeout>();
  
  // Add pending confirmation state for tool execution
  private pendingConfirmation: {
    toolName: string;
    parameters: Record<string, unknown>;
    originalRequest: string;
  } | null = null;
  
  // Add confirmation state management for non-TTY mode
  private waitingForConfirmation = false;
  private pendingConfirmationResolver: ((value: boolean) => void) | null = null;
  private inputQueue: string[] = [];
  private isProcessingInput = false;
  
  constructor() {
    this.sessionId = `interactive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.history = new CommandHistory();
    this.completer = new AutoCompleter();
    this.persistence = new SessionPersistence();
    this.shutdown = new GracefulShutdown();
    this.startTime = new Date();
    this.multiline = new MultilineInput();
  }
  
  /**
   * Start the interactive REPL
   */
  async start(config: OpenRouterConfig, resumeSessionId?: string): Promise<void> {
    this.openRouterConfig = config;
    this.isRunning = true;
    
    // Configure logging for interactive mode
    // Override stderr.write to filter out JSON log entries while preserving normal output
    // This ensures clean interactive experience while maintaining full file logging
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = function(chunk: any, ...args: any[]): boolean {
      const str = chunk?.toString() || '';
      // Filter out JSON log entries (they start with {" and contain "level":)
      if (str.startsWith('{"level":') && str.includes('"pid":') && str.includes('"hostname":')) {
        // Silently drop JSON log entries
        return true;
      }
      // Allow all other output (prompts, responses, etc.)
      return originalStderrWrite(chunk, ...args);
    } as any;
    // Note: File logging continues at info level to capture all activity in vibe-session.log
    
    // Initialize configuration manager
    await configManager.initialize();
    
    // Apply configuration settings
    this.enableMarkdown = configManager.get('display', 'enableMarkdown');
    const historySize = configManager.get('history', 'maxSize');
    this.history = new CommandHistory(historySize);
    
    // Apply theme from configuration
    const themeName = configManager.get('display', 'theme');
    themeManager.setTheme(themeName);
    
    // Try to resume session if provided
    if (resumeSessionId) {
      const session = await this.persistence.loadSession(resumeSessionId);
      if (session) {
        this.sessionId = session.sessionId;
        this.conversationHistory = session.conversationHistory;
        this.startTime = session.startTime;
        console.log(chalk.green(`✅ Resumed session: ${resumeSessionId}`));
        console.log(chalk.gray(`Started: ${session.startTime.toLocaleString()}`));
        console.log();
      }
    }
    
    // Setup auto-save with configured interval
    const autoSaveInterval = configManager.get('session', 'autoSaveInterval');
    this.autoSaveHandler = createAutoSaveHandler(
      this.sessionId,
      () => this.getSessionData(),
      autoSaveInterval * 60000 // Convert minutes to ms
    );
    if (configManager.get('session', 'autoSave')) {
      this.autoSaveHandler.start();
    }
    
    // Setup graceful shutdown
    this.shutdown.register(async () => {
      if (this.autoSaveHandler) {
        await this.autoSaveHandler.stop();
      }
      await this.history.saveHistory();
    });
    this.shutdown.setupSignalHandlers();
    
    // Display welcome banner
    this.displayBanner();
    
    // Set up completer with available tools
    try {
      const { getAllTools } = await import('../../services/routing/toolRegistry.js');
      const tools = await getAllTools();
      this.completer.setTools(tools.map(t => t.name));
    } catch {
      // Ignore if tools can't be loaded
    }
    
    // Create readline interface with completion
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: getPrompt(),
      completer: (line: string) => this.completer.complete(line),
      historySize: 0,  // We manage history ourselves
      terminal: true   // Ensure terminal mode is enabled
    });
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Add debug listener to see ALL line events
    this.rl.on('line', (input: string) => {
      logger.info({ input, listener: 'DEBUG' }, 'DEBUG: Line event fired');
    });
    
    // Show initial prompt with a small delay to ensure everything is ready
    setTimeout(() => {
      if (this.rl && this.isRunning) {
        this.rl.prompt();
      }
    }, 100);
  }
  
  /**
   * Display welcome banner
   */
  private displayBanner(): void {
    console.clear();
    console.log(getBanner());
    console.log();
    console.log(getSessionStartMessage());
    console.log();
  }
  
  /**
   * Setup readline event handlers
   */
  private setupEventHandlers(): void {
    if (!this.rl) return;
    
    // Create a custom line handler that manages confirmation state
    const lineHandler = (input: string): void => {
      logger.info({ input, waitingForConfirmation: this.waitingForConfirmation }, 'Line handler received input');
      // If waiting for confirmation, handle it immediately
      if (this.waitingForConfirmation && this.pendingConfirmationResolver) {
        logger.info('Processing confirmation response');
        const result = this.evaluateConfirmationResponse(input);
        const resolver = this.pendingConfirmationResolver;
        this.waitingForConfirmation = false;
        this.pendingConfirmationResolver = null;
        
        // Restore the normal prompt before resolving
        if (this.rl && this.isRunning) {
          this.rl.setPrompt(getPrompt());
        }
        
        resolver(result);
        logger.info({ result }, 'Confirmation resolved');
        return;
      }
      
      // Otherwise add to queue for processing
      this.inputQueue.push(input);
      this.processInputQueue().catch(error => {
        logger.error({ err: error }, 'Error processing input queue');
      });
    };
    
    // Attach the line handler
    this.rl.on('line', lineHandler);
    
    // Handle up/down arrow keys for history
    if (process.stdin.isTTY && process.stdin.setRawMode) {
      readline.emitKeypressEvents(process.stdin, this.rl);
      process.stdin.setRawMode(true);
      
      process.stdin.on('keypress', (str, key) => {
        if (!this.rl || !key) return;
        
        if (key.name === 'up') {
          const prev = this.history.getPrevious(this.rl.line);
          if (prev !== undefined) {
            this.rl.write(null, { ctrl: true, name: 'u' }); // Clear line
            this.rl.write(prev);
          }
        } else if (key.name === 'down') {
          const next = this.history.getNext();
          if (next !== undefined) {
            this.rl.write(null, { ctrl: true, name: 'u' }); // Clear line
            this.rl.write(next);
          }
        }
      });
    }
    
    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      this.handleExit();
    });
    
    // Handle close event
    this.rl.on('close', () => {
      if (this.isRunning) {
        this.handleExit();
      }
    });
  }
  
  /**
   * Handle user message input
   */
  private async handleUserMessage(message: string): Promise<void> {
    // Check concurrent request limit
    const maxConcurrent = configManager.get('performance', 'maxConcurrentRequests');
    if (this.requestConcurrency >= maxConcurrent) {
      ResponseFormatter.formatWarning('Maximum concurrent requests reached. Please wait for current requests to complete.');
      return;
    }
    
    this.requestConcurrency++;
    
    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: message });
    
    // Start progress indicator
    progress.start('Processing your request...');
    
    try {
      // Import hybridMatch to check if we need confirmation
      const { hybridMatch } = await import('../../services/hybrid-matcher/index.js');
      
      // First, determine what tool and parameters to use
      const matchResult = await hybridMatch(message, this.openRouterConfig!);
      
      // Check if confirmation is required
      if (matchResult.requiresConfirmation) {
        // Stop progress
        progress.success('Analysis complete');
        
        // Ask for confirmation using the new dual-mode confirmation method
        const confirmMessage = 
          `\nI plan to use the '${matchResult.toolName}' tool for your request.\n` +
          `Confidence: ${Math.round(matchResult.confidence * 100)}%\n\n` +
          `Do you want to proceed? (yes/no) `;
        
        const confirmed = await this.getConfirmation(confirmMessage);
        logger.info({ confirmed, toolName: matchResult.toolName }, 'Confirmation result received');
        
        if (confirmed) {
          // User confirmed - execute the tool
          logger.info('User confirmed, starting tool execution');
          progress.start(`Executing ${matchResult.toolName}...`);
          
          const context: ToolExecutionContext = {
            sessionId: this.sessionId,
            transportType: 'interactive',
            metadata: {
              conversationHistory: this.conversationHistory,
              interactiveMode: true
            }
          };
          
          logger.info({ context, toolName: matchResult.toolName }, 'About to call executeTool');
          const result = await executeTool(
            matchResult.toolName,
            matchResult.parameters,
            this.openRouterConfig!,
            context
          );
          progress.success('Tool execution complete');
          
          // Extract and display response
          const responseText = result.content[0]?.text;
          const response = typeof responseText === 'string' ? responseText : 'Tool executed successfully';
          
          // Check for job ID in response (same as direct execution path)
          const jobId = this.extractJobId(response);
          
          if (jobId) {
            // Background job started - begin polling
            console.log();
            ResponseFormatter.formatInfo(`Job ${jobId} started for ${matchResult.toolName}`);
            console.log();
            
            // Start automatic polling
            await this.startJobPolling(jobId, matchResult.toolName);
            
            // Add to history
            this.conversationHistory.push({ 
              role: 'assistant', 
              content: `Started background job ${jobId} for ${matchResult.toolName}` 
            });
            
            // Don't show the raw response or prompt yet (polling will handle it)
            return;
          }
          
          // Normal response (non-job) - display as before
          console.log();
          if (this.enableMarkdown) {
            const rendered = MarkdownRenderer.renderWrapped(response);
            ResponseFormatter.formatResponse(rendered);
          } else {
            ResponseFormatter.formatResponse(response);
          }
          console.log();
          
          // Add to history
          this.conversationHistory.push({ role: 'assistant', content: response });
        } else {
          // User cancelled
          console.log();
          ResponseFormatter.formatInfo('Tool execution cancelled.');
          console.log();
          
          // Add to history
          this.conversationHistory.push({ 
            role: 'assistant', 
            content: 'Tool execution cancelled by user'
          });
        }
        
      } else {
        // High confidence - execute directly
        const context: ToolExecutionContext = {
          sessionId: this.sessionId,
          transportType: 'interactive',
          metadata: {
            conversationHistory: this.conversationHistory,
            interactiveMode: true
          }
        };
        
        // Update progress
        progress.update(`Executing ${matchResult.toolName}...`);
        
        // Execute the tool directly
        const result = await executeTool(
          matchResult.toolName,
          matchResult.parameters,
          this.openRouterConfig!,
          context
        );
        
        // Stop progress with success
        progress.success('Response ready');

        // Extract and display response
        const responseText = result.content[0]?.text;
        const response = typeof responseText === 'string' ? responseText : 'No response';

        // Check for job ID in response
        const jobId = this.extractJobId(response);

        if (jobId) {
          // Background job started - begin polling
          console.log();
          ResponseFormatter.formatInfo(`Job ${jobId} started for ${matchResult.toolName}`);
          console.log();
          
          // Start automatic polling
          await this.startJobPolling(jobId, matchResult.toolName);
          
          // Add to history
          this.conversationHistory.push({ 
            role: 'assistant', 
            content: `Started background job ${jobId} for ${matchResult.toolName}` 
          });
          
          // Don't show the raw response or prompt yet (polling will handle it)
          return;
        }

        // Normal response (non-job) - display as before
        console.log();
        if (this.enableMarkdown) {
          const rendered = MarkdownRenderer.renderWrapped(response);
          ResponseFormatter.formatResponse(rendered);
        } else {
          ResponseFormatter.formatResponse(response);
        }
        console.log();

        // Add to history
        this.conversationHistory.push({ role: 'assistant', content: response });
      }
      
    } catch (error) {
      // Stop progress with error
      progress.fail('Request failed');
      
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log();
      ResponseFormatter.formatError(errorMessage);
      console.log();
      
      logger.error({ err: error }, 'Error processing message in REPL');
    } finally {
      this.requestConcurrency--;
    }
  }
  
  /**
   * Handle slash commands
   */
  private async handleSlashCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.split(' ');
    
    switch (cmd) {
      case '/help':
        this.showHelp();
        break;
        
      case '/quit':
      case '/exit':
        this.handleExit();
        break;
        
      case '/clear':
        this.clearHistory();
        break;
        
      case '/history':
        this.showHistory();
        break;
        
      case '/tools':
        await this.listTools();
        break;
        
      case '/status':
        this.showStatus();
        break;
        
      case '/save':
        await this.saveSession();
        break;
        
      case '/sessions':
        await this.listSessions();
        break;
        
      case '/export':
        await this.exportSession(args.join(' '));
        break;
        
      case '/markdown':
        this.toggleMarkdown();
        break;
        
      case '/config':
        await this.handleConfigCommand(args);
        break;
        
      case '/theme':
        await this.handleThemeCommand(args);
        break;
        
      case '/poll':
        if (args[0]) {
          const result = await this.checkJobStatus(args[0]);
          if (result) {
            console.log();
            ResponseFormatter.formatResponse(result);
            console.log();
          } else {
            ResponseFormatter.formatError(`Job ${args[0]} not found or unable to retrieve status`);
          }
        } else {
          ResponseFormatter.formatError('Usage: /poll <jobId>');
        }
        break;
        
      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
        console.log(chalk.gray('Type /help for available commands'));
        break;
    }
  }
  
  /**
   * Show help information
   */
  private showHelp(): void {
    console.log();
    const commands = [
      { cmd: '/help', desc: 'Show this help message' },
      { cmd: '/quit', desc: 'Exit interactive mode' },
      { cmd: '/clear', desc: 'Clear conversation history' },
      { cmd: '/history', desc: 'Show conversation history' },
      { cmd: '/tools', desc: 'List available MCP tools' },
      { cmd: '/status', desc: 'Show session status' },
      { cmd: '/save', desc: 'Save current session' },
      { cmd: '/sessions', desc: 'List saved sessions' },
      { cmd: '/export [file]', desc: 'Export session to markdown' },
      { cmd: '/markdown', desc: 'Toggle markdown rendering' },
      { cmd: '/config', desc: 'Manage configuration settings' },
      { cmd: '/theme', desc: 'Change color theme' },
      { cmd: '/poll <jobId>', desc: 'Manually check job status' }
    ];
    
    ResponseFormatter.formatTable(
      ['Command', 'Description'],
      commands.map(c => [chalk.green(c.cmd), c.desc])
    );
    console.log();
  }
  
  /**
   * Clear conversation history
   */
  private clearHistory(): void {
    this.conversationHistory = [];
    ResponseFormatter.formatSuccess('Conversation history cleared');
  }
  
  /**
   * Show conversation history
   */
  private showHistory(): void {
    if (this.conversationHistory.length === 0) {
      console.log(chalk.gray('No conversation history'));
      return;
    }
    
    console.log();
    console.log(chalk.yellow('Conversation History:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    this.conversationHistory.forEach((entry, index) => {
      const prefix = entry.role === 'user' ? chalk.cyan('You: ') : chalk.green('Vibe: ');
      console.log(`${prefix}${entry.content}`);
      if (index < this.conversationHistory.length - 1) {
        console.log();
      }
    });
    
    console.log(chalk.gray('─'.repeat(50)));
    console.log();
  }
  
  /**
   * List available tools
   */
  private async listTools(): Promise<void> {
    try {
      const { getAllTools } = await import('../../services/routing/toolRegistry.js');
      const tools = await getAllTools();
      
      console.log();
      console.log(chalk.yellow('Available Tools:'));
      
      tools.forEach(tool => {
        console.log(chalk.cyan(`  • ${tool.name}`) + ' - ' + chalk.gray(tool.description || 'No description'));
      });
      
      console.log();
    } catch (error) {
      console.log(chalk.red('Failed to retrieve tools'));
      logger.error({ err: error }, 'Failed to list tools in REPL');
    }
  }
  
  /**
   * Show session status
   */
  private showStatus(): void {
    const duration = Date.now() - parseInt(this.sessionId.split('-')[1]);
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    console.log();
    ResponseFormatter.formatKeyValue({
      'Session ID': this.sessionId,
      'Duration': `${minutes}m ${seconds}s`,
      'Messages sent': this.conversationHistory.filter(h => h.role === 'user').length,
      'Total exchanges': this.conversationHistory.length,
      'Memory used': `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    }, 'Session Status');
    console.log();
  }
  
  /**
   * Get session data for persistence
   */
  private getSessionData(): SessionData {
    return {
      sessionId: this.sessionId,
      startTime: this.startTime,
      lastUpdated: new Date(),
      conversationHistory: this.conversationHistory,
      metadata: {
        totalMessages: this.conversationHistory.filter(h => h.role === 'user').length
      }
    };
  }
  
  /**
   * Save current session
   */
  private async saveSession(): Promise<void> {
    try {
      await this.persistence.saveSession(this.sessionId, this.getSessionData());
      ResponseFormatter.formatSuccess(`Session saved: ${this.sessionId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      ResponseFormatter.formatError(`Failed to save session: ${message}`);
    }
  }
  
  /**
   * List available sessions
   */
  private async listSessions(): Promise<void> {
    try {
      const sessions = await this.persistence.listSessions();
      
      if (sessions.length === 0) {
        ResponseFormatter.formatInfo('No saved sessions found');
        return;
      }
      
      console.log();
      ResponseFormatter.formatTable(
        ['Session ID', 'Started', 'Last Updated'],
        sessions.slice(0, 10).map(s => [
          s.id === this.sessionId ? chalk.green(s.id + ' (current)') : s.id,
          s.startTime.toLocaleString(),
          s.lastUpdated.toLocaleString()
        ])
      );
      
      if (sessions.length > 10) {
        console.log(chalk.gray(`\n... and ${sessions.length - 10} more sessions`));
      }
      
      console.log();
      ResponseFormatter.formatInfo('Use "vibe --resume <session-id>" to resume a session');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      ResponseFormatter.formatError(`Failed to list sessions: ${message}`);
    }
  }
  
  /**
   * Export session to file
   */
  private async exportSession(filename?: string): Promise<void> {
    try {
      const outputPath = await this.persistence.exportSession(this.sessionId, filename);
      ResponseFormatter.formatSuccess(`Session exported to: ${outputPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      ResponseFormatter.formatError(`Failed to export session: ${message}`);
    }
  }
  
  /**
   * Toggle markdown rendering
   */
  private toggleMarkdown(): void {
    this.enableMarkdown = !this.enableMarkdown;
    configManager.set('display', 'enableMarkdown', this.enableMarkdown);
    const status = this.enableMarkdown ? 'enabled' : 'disabled';
    ResponseFormatter.formatInfo(`Markdown rendering ${status}`);
    
    // Auto-save config if enabled
    configManager.autoSave().catch(err => {
      logger.error({ err }, 'Failed to auto-save config');
    });
  }
  
  /**
   * Handle config command
   */
  private async handleConfigCommand(args: string[]): Promise<void> {
    const subcommand = args[0];
    
    switch (subcommand) {
      case 'show':
        console.log(configManager.printConfig());
        break;
        
      case 'reset':
        await configManager.reset();
        ResponseFormatter.formatSuccess('Configuration reset to defaults');
        break;
        
      case 'save':
        await configManager.saveConfig();
        ResponseFormatter.formatSuccess('Configuration saved');
        break;
        
      case 'reload':
        await configManager.initialize();
        this.enableMarkdown = configManager.get('display', 'enableMarkdown');
        ResponseFormatter.formatSuccess('Configuration reloaded');
        break;
        
      case 'export': {
        const exportPath = args[1] || `vibe-config-${Date.now()}.json`;
        await configManager.exportTo(exportPath);
        ResponseFormatter.formatSuccess(`Configuration exported to: ${exportPath}`);
        break;
      }
        
      case 'import':
        if (!args[1]) {
          ResponseFormatter.formatError('Please provide a configuration file path');
          return;
        }
        await configManager.loadFrom(args[1]);
        ResponseFormatter.formatSuccess('Configuration imported');
        break;
        
      case 'validate': {
        const { valid, errors } = configManager.validate();
        if (valid) {
          ResponseFormatter.formatSuccess('Configuration is valid');
        } else {
          ResponseFormatter.formatError('Configuration validation failed:');
          errors.forEach(err => console.log(chalk.red(`  • ${err}`)));
        }
        break;
      }
        
      default:
        console.log(chalk.yellow('Config commands:'));
        console.log(chalk.gray('  /config show     - Show current configuration'));
        console.log(chalk.gray('  /config reset    - Reset to defaults'));
        console.log(chalk.gray('  /config save     - Save current configuration'));
        console.log(chalk.gray('  /config reload   - Reload configuration from file'));
        console.log(chalk.gray('  /config export   - Export configuration'));
        console.log(chalk.gray('  /config import   - Import configuration'));
        console.log(chalk.gray('  /config validate - Validate configuration'));
        break;
    }
  }
  
  /**
   * Handle theme command
   */
  private async handleThemeCommand(args: string[]): Promise<void> {
    const subcommand = args[0];
    
    if (!subcommand) {
      // Show current theme and available themes
      const currentTheme = themeManager.getCurrentThemeName();
      const availableThemes = themeManager.getAvailableThemes();
      
      console.log();
      console.log(chalk.yellow('Theme Settings:'));
      console.log(chalk.green(`  Current theme: ${currentTheme}`));
      console.log();
      console.log(chalk.yellow('Available themes:'));
      
      availableThemes.forEach(theme => {
        const description = themeManager.getThemeDescription(theme);
        const indicator = theme === currentTheme ? chalk.green(' (current)') : '';
        console.log(chalk.cyan(`  • ${theme}`) + indicator + chalk.gray(` - ${description}`));
      });
      
      console.log();
      console.log(chalk.gray('Use "/theme <name>" to change theme'));
      console.log(chalk.gray('Use "/theme preview <name>" to preview a theme'));
      return;
    }
    
    if (subcommand === 'preview') {
      const themeName = args[1];
      if (!themeName) {
        ResponseFormatter.formatError('Please specify a theme name to preview');
        return;
      }
      
      const originalTheme = themeManager.getCurrentThemeName();
      if (themeManager.setTheme(themeName)) {
        // Show preview
        console.log();
        console.log(chalk.yellow(`Preview of '${themeName}' theme:`));
        console.log();
        
        // Show sample output with the theme
        const colors = themeManager.getColors();
        console.log(colors.primary('Primary Color'));
        console.log(colors.secondary('Secondary Color'));
        console.log(colors.accent('Accent Color'));
        console.log(colors.success('✅ Success Message'));
        console.log(colors.error('❌ Error Message'));
        console.log(colors.warning('⚠️  Warning Message'));
        console.log(colors.info('ℹ️  Info Message'));
        console.log(colors.code('const example = "code";'));
        console.log(colors.link('https://example.com'));
        
        // Restore original theme
        themeManager.setTheme(originalTheme);
        
        console.log();
        console.log(chalk.gray('Theme preview complete. Original theme restored.'));
      } else {
        ResponseFormatter.formatError(`Theme '${themeName}' not found`);
      }
      return;
    }
    
    // Set theme
    const themeName = subcommand;
    if (themeManager.setTheme(themeName)) {
      // Save to configuration
      configManager.set('display', 'theme', themeName);
      await configManager.autoSave();
      
      // Clear screen and redisplay banner with new theme
      console.clear();
      this.displayBanner();
      
      ResponseFormatter.formatSuccess(`Theme changed to '${themeName}'`);
    } else {
      ResponseFormatter.formatError(`Theme '${themeName}' not found`);
      console.log(chalk.gray('Use "/theme" to see available themes'));
    }
  }
  
  /**
   * Handle exit
   */
  private handleExit(): void {
    this.isRunning = false;
    
    // Stop all active job polling
    this.activeJobs.forEach((interval) => {
      clearInterval(interval);
    });
    this.activeJobs.clear();
    
    // Trigger graceful shutdown
    this.shutdown.execute().catch(error => {
      console.error(chalk.red('Shutdown error:'), error);
      process.exit(1);
    });
  }
  
  /**
   * Wait for REPL to exit
   */
  async waitForExit(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (!this.isRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
  
  /**
   * Stop the REPL
   */
  stop(): void {
    this.isRunning = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    if (this.autoSaveHandler) {
      this.autoSaveHandler.stop();
    }
  }
  
  /**
   * Process input queue
   */
  private async processInputQueue(): Promise<void> {
    if (this.isProcessingInput) {
      return;
    }
    
    if (this.inputQueue.length === 0) {
      return;
    }
    
    this.isProcessingInput = true;
    
    while (this.inputQueue.length > 0) {
      // Check if we're waiting for confirmation
      if (this.waitingForConfirmation && this.pendingConfirmationResolver) {
        const input = this.inputQueue.shift()!;
        const result = this.evaluateConfirmationResponse(input);
        const resolver = this.pendingConfirmationResolver;
        this.waitingForConfirmation = false;
        this.pendingConfirmationResolver = null;
        resolver(result);
        continue;
      }
      
      const input = this.inputQueue.shift()!;
      
      try {
        await this.processInput(input);
      } catch (error) {
        logger.error({ err: error }, 'Error processing queued input');
        console.error(chalk.red(`[ERROR] Failed to process input: ${error instanceof Error ? error.message : error}`));
      }
    }
    
    this.isProcessingInput = false;
    
    if (this.isRunning && this.rl) {
      this.rl.prompt();
    }
  }
  
  /**
   * Process single input
   */
  private async processInput(input: string): Promise<void> {
    // Handle multi-line input
    if (this.multiline.isActive() || this.multiline.isStarting(input)) {
      const isComplete = this.multiline.addLine(input);
      
      if (!isComplete) {
        // Still collecting multi-line input
        if (this.rl) {
          this.rl.setPrompt(this.multiline.getPrompt());
          this.rl.prompt();
        }
        return;
      }
      
      // Multi-line input complete
      const fullInput = this.multiline.getContent();
      this.multiline.reset();
      
      // Process the complete input
      if (fullInput.trim()) {
        this.history.add(fullInput);
        
        if (fullInput.trim().startsWith('/')) {
          await this.handleSlashCommand(fullInput.trim());
        } else {
          await this.handleUserMessage(fullInput);
        }
      }
      
      // Reset prompt
      if (this.rl) {
        this.rl.setPrompt(getPrompt());
      }
      return;
    }
    
    // Single-line input
    const trimmed = input.trim();
    
    // Skip empty input
    if (!trimmed) {
      return;
    }
    
    // Add to history
    this.history.add(trimmed);
    
    // Check for aliases if enabled
    let processedInput = trimmed;
    if (configManager.get('commands', 'aliasEnabled')) {
      const aliases = configManager.get('commands', 'aliases');
      if (aliases[trimmed]) {
        processedInput = aliases[trimmed];
      }
    }
    
    // Check for slash commands
    if (processedInput.startsWith('/')) {
      await this.handleSlashCommand(processedInput);
    } else {
      await this.handleUserMessage(processedInput);
    }
  }
  
  /**
   * Evaluate confirmation response
   */
  private evaluateConfirmationResponse(answer: string): boolean {
    const normalizedAnswer = answer.toLowerCase().trim();
    
    const confirmationPatterns = [
      'yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay',
      'proceed', 'go ahead', 'do it', 'confirm', 'continue',
      'please proceed', 'go for it', 'lets do it', "let's do it"
    ];
    
    const cancellationPatterns = [
      'no', 'n', 'nope', 'cancel', 'stop', 'abort', 'nevermind',
      'never mind', "don't", 'dont', 'skip', 'forget it'
    ];
    
    const isConfirmation = confirmationPatterns.some(pattern => 
      normalizedAnswer === pattern ||
      normalizedAnswer.startsWith(pattern + ' ') ||
      normalizedAnswer.includes(' ' + pattern + ' ') ||
      normalizedAnswer.endsWith(' ' + pattern)
    );
    
    const isCancellation = cancellationPatterns.some(pattern =>
      normalizedAnswer === pattern ||
      normalizedAnswer.startsWith(pattern + ' ') ||
      normalizedAnswer.includes(' ' + pattern + ' ') ||
      normalizedAnswer.endsWith(' ' + pattern)
    );
    
    return isConfirmation && !isCancellation;
  }
  
  /**
   * Get confirmation from user (dual-mode: TTY and non-TTY)
   */
  private async getConfirmation(message: string): Promise<boolean> {
    logger.info('getConfirmation called');
    return new Promise<boolean>((resolve) => {
      if (!this.rl) {
        logger.info('No readline interface available');
        resolve(false);
        return;
      }
      
      // Write the confirmation message
      console.log(); // Add newline before prompt
      console.log(message); // Use console.log to ensure proper line ending
      
      // Use the existing confirmation state mechanism
      this.waitingForConfirmation = true;
      this.pendingConfirmationResolver = resolve;
      logger.info('Waiting for confirmation via existing handler');
      
      // CRITICAL: Resume the stream to ensure readline continues listening
      if ((this.rl as any).input && typeof (this.rl as any).input.resume === 'function') {
        (this.rl as any).input.resume();
      }
      
      // Show prompt to keep readline active
      this.rl.prompt(true); // true preserves the current line
    });
  }

  /**
   * Extract job ID from tool response
   */
  private extractJobId(response: string): string | null {
    // Look for JOB_ID: marker in response
    const match = response.match(/JOB_ID:([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  }

  /**
   * Ensure the REPL is ready to accept new input after job completion
   */
  private ensureReadyForInput(): void {
    // Reset any blocking flags
    this.isProcessingInput = false;
    this.waitingForConfirmation = false;
    this.pendingConfirmationResolver = null;
    
    // Ensure readline is active and listening
    if (this.rl && this.isRunning) {
      // Resume the input stream if it was paused
      if ((this.rl as any).input && typeof (this.rl as any).input.resume === 'function') {
        (this.rl as any).input.resume();
      }
      
      // Clear the line and show a fresh prompt
      this.rl.write(null, { ctrl: true, name: 'u' }); // Clear current line
      this.rl.prompt(true); // Force prompt display
      
      logger.info('REPL ready for new input after job completion');
    }
  }

  /**
   * Check job status using job-result-retriever
   */
  private async checkJobStatus(jobId: string): Promise<string | null> {
    try {
      // Create context for the job status check
      const context: ToolExecutionContext = {
        sessionId: this.sessionId,
        transportType: 'interactive',
        metadata: {
          isStatusCheck: true
        }
      };
      
      // Execute job-result-retriever tool
      const result = await executeTool(
        'get-job-result',
        { jobId, includeDetails: true },
        this.openRouterConfig!,
        context
      );
      
      // Extract response text - check ALL content items for status
      // The job-result-retriever adds completion status at the end of content array
      let responseText = '';
      if (result.content && Array.isArray(result.content)) {
        for (const item of result.content) {
          if (item.type === 'text' && typeof item.text === 'string') {
            responseText += item.text + '\n';
          }
        }
      }
      
      // Also check for jobStatus field if present
      if ((result as any).jobStatus) {
        responseText += `\nJob Status: ${(result as any).jobStatus.status}`;
      }
      
      return responseText.trim() || null;
      
    } catch (error) {
      logger.error({ err: error, jobId }, 'Failed to check job status');
      return null;
    }
  }

  /**
   * Parse job status from response
   */
  private parseJobStatusResponse(response: string): {
    status: string;
    progress?: number;
    message?: string;
    isComplete: boolean;
    isFailed: boolean;
    result?: string;
  } {
    // Try to parse different response formats
    const lines = response.split('\n');
    
    // Look for status indicators
    let status = 'unknown';
    let progress: number | undefined;
    let message: string | undefined;
    let isComplete = false;
    let isFailed = false;
    
    for (const line of lines) {
      // Check for completion - look for specific status indicators
      // The job-result-retriever adds "Job Status: COMPLETED" at the end
      if (line.includes('Job Status: COMPLETED') || 
          line.includes('completed successfully') || 
          line.includes('COMPLETED')) {
        status = 'completed';
        isComplete = true;
        logger.debug('Job marked as completed based on status line', { line });
      }
      // Check for failure
      else if (line.includes('Job Status: FAILED') || 
               line.includes('failed') || 
               line.includes('FAILED')) {
        status = 'failed';
        isFailed = true;
        isComplete = true;
        logger.debug('Job marked as failed based on status line', { line });
      }
      // Check for running
      else if (line.includes('is running') || 
               line.includes('RUNNING')) {
        status = 'running';
      }
      // Check for pending
      else if (line.includes('is pending') || 
               line.includes('PENDING')) {
        status = 'pending';
      }
      
      // Extract progress percentage
      const progressMatch = line.match(/(\d+)%/);
      if (progressMatch) {
        progress = parseInt(progressMatch[1]);
      }
      
      // Extract status message
      if (line.includes('Status:') || line.includes('Message:')) {
        message = line.split(':').slice(1).join(':').trim();
      }
    }
    
    // Log parsing result for debugging
    logger.debug('Parsed job status response', { 
      status, 
      isComplete, 
      isFailed, 
      responseLength: response.length,
      linesChecked: lines.length 
    });
    
    return {
      status,
      progress,
      message,
      isComplete,
      isFailed,
      result: isComplete && !isFailed ? response : undefined
    };
  }

  /**
   * Start polling for job status updates
   */
  private async startJobPolling(jobId: string, toolName: string): Promise<void> {
    // Use existing progress indicator
    progress.start(`Monitoring ${toolName} job...`);
    
    let pollCount = 0;
    const maxPolls = 180; // 15 minutes with 5-second intervals
    
    const pollJobStatus = async () => {
      pollCount++;
      
      try {
        // Check job status
        const result = await this.checkJobStatus(jobId);
        
        if (!result) {
          // Unable to get status, stop polling
          progress.fail('Unable to retrieve job status');
          const interval = this.activeJobs.get(jobId);
          if (interval) {
            clearInterval(interval);
          }
          this.activeJobs.delete(jobId);
          
          // Ensure the REPL is ready to accept new input
          this.ensureReadyForInput();
          return;
        }
        
        // Parse the response to get job status
        const statusInfo = this.parseJobStatusResponse(result);
        
        // Update progress display
        if (statusInfo.progress !== undefined) {
          progress.update(`${toolName}: ${statusInfo.message || 'Processing...'} (${statusInfo.progress}%)`);
        } else {
          progress.update(`${toolName}: ${statusInfo.message || statusInfo.status}`);
        }
        
        // Check if job is complete
        if (statusInfo.isComplete) {
          const interval = this.activeJobs.get(jobId);
          if (interval) {
            clearInterval(interval);
          }
          this.activeJobs.delete(jobId);
          
          if (statusInfo.isFailed) {
            progress.fail(`${toolName} job failed`);
            console.log();
            ResponseFormatter.formatError(statusInfo.message || 'Job failed without details');
          } else {
            progress.success(`${toolName} job completed`);
            
            // Display the result
            if (statusInfo.result) {
              console.log();
              if (this.enableMarkdown) {
                const rendered = MarkdownRenderer.renderWrapped(statusInfo.result);
                ResponseFormatter.formatResponse(rendered);
              } else {
                ResponseFormatter.formatResponse(statusInfo.result);
              }
              
              // Add to conversation history
              this.conversationHistory.push({ 
                role: 'assistant', 
                content: statusInfo.result 
              });
            }
          }
          
          console.log();
          
          // Ensure the REPL is ready to accept new input
          this.ensureReadyForInput();
          return;
        }
        
        // Check if we've exceeded max polls
        if (pollCount >= maxPolls) {
          progress.fail('Job polling timeout (15 minutes)');
          const interval = this.activeJobs.get(jobId);
          if (interval) {
            clearInterval(interval);
          }
          this.activeJobs.delete(jobId);
          console.log();
          ResponseFormatter.formatWarning(`Job ${jobId} is still running. Use /poll ${jobId} to check manually.`);
          console.log();
          
          // Ensure the REPL is ready to accept new input
          this.ensureReadyForInput();
        }
        
      } catch (error) {
        progress.fail('Error polling job status');
        const interval = this.activeJobs.get(jobId);
        if (interval) {
          clearInterval(interval);
        }
        this.activeJobs.delete(jobId);
        
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log();
        ResponseFormatter.formatError(`Polling error: ${errorMessage}`);
        console.log();
        
        // Ensure the REPL is ready to accept new input
        this.ensureReadyForInput();
      }
    };
    
    // Start polling with 5-second intervals
    const interval = setInterval(pollJobStatus, 5000);
    this.activeJobs.set(jobId, interval);
    
    // Also do an immediate first poll
    setTimeout(pollJobStatus, 1000);
  }
}