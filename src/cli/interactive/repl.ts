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
  
  // Add pending confirmation state for tool execution
  private pendingConfirmation: {
    toolName: string;
    parameters: Record<string, unknown>;
    originalRequest: string;
  } | null = null;
  
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
      historySize: 0  // We manage history ourselves
    });
    
    // Setup event handlers
    this.setupEventHandlers();
    
    // Show initial prompt
    this.rl.prompt();
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
    
    // Handle line input
    this.rl.on('line', async (input: string) => {
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
          this.rl.prompt();
        }
        return;
      }
      
      // Single-line input
      const trimmed = input.trim();
      
      // Skip empty input
      if (!trimmed) {
        this.rl!.prompt();
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
      
      // Show prompt again
      if (this.isRunning && this.rl) {
        this.rl.prompt();
      }
    });
    
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
    // Check if we're waiting for confirmation
    if (this.pendingConfirmation) {
      const normalizedMessage = message.toLowerCase().trim();
      
      // Check for confirmation responses - be flexible with natural language
      const confirmationPatterns = [
        'yes', 'y', 'yeah', 'yep', 'sure', 'ok', 'okay',
        'proceed', 'go ahead', 'do it', 'confirm', 'continue',
        'please proceed', 'go for it', 'lets do it', "let's do it"
      ];
      
      const cancellationPatterns = [
        'no', 'n', 'nope', 'cancel', 'stop', 'abort', 'nevermind',
        'never mind', "don't", 'dont', 'skip', 'forget it'
      ];
      
      // Check if message contains any confirmation pattern
      const isConfirmation = confirmationPatterns.some(pattern => 
        normalizedMessage === pattern || 
        normalizedMessage.startsWith(pattern + ' ') ||
        normalizedMessage.includes(' ' + pattern + ' ') ||
        normalizedMessage.endsWith(' ' + pattern)
      );
      
      // Check if message contains any cancellation pattern
      const isCancellation = cancellationPatterns.some(pattern =>
        normalizedMessage === pattern ||
        normalizedMessage.startsWith(pattern + ' ') ||
        normalizedMessage.includes(' ' + pattern + ' ') ||
        normalizedMessage.endsWith(' ' + pattern)
      );
      
      if (isConfirmation && !isCancellation) {
        // User confirmed - execute the pending tool directly
        const { toolName, parameters } = this.pendingConfirmation;
        this.pendingConfirmation = null; // Clear pending state
        
        // Start progress indicator
        progress.start(`Executing ${toolName}...`);
        
        try {
          // Create execution context
          const context: ToolExecutionContext = {
            sessionId: this.sessionId,
            transportType: 'interactive',
            metadata: {
              conversationHistory: this.conversationHistory,
              interactiveMode: true
            }
          };
          
          // Execute the tool directly (bypassing process-request since we already know what to do)
          const result = await executeTool(
            toolName,
            parameters,
            this.openRouterConfig!,
            context
          );
          
          // Stop progress
          progress.success('Tool execution complete');
          
          // Extract and display response
          const responseText = result.content[0]?.text;
          const response = typeof responseText === 'string' ? responseText : 'Tool executed successfully';
          
          // Format and display response
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
          
        } catch (error) {
          progress.fail('Tool execution failed');
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.log();
          ResponseFormatter.formatError(errorMessage);
          console.log();
          logger.error({ err: error }, `Error executing confirmed tool ${toolName}`);
        }
        
        return; // Exit early - we've handled the confirmation
      } else if (isCancellation) {
        // User cancelled
        this.pendingConfirmation = null;
        console.log();
        ResponseFormatter.formatInfo('Tool execution cancelled.');
        console.log();
        return;
      } else if (!isConfirmation && !isCancellation) {
        // Ambiguous response - ask for clarification
        console.log();
        ResponseFormatter.formatWarning(
          'Please respond with "yes" to proceed or "no" to cancel.\n' +
          `Tool waiting: ${this.pendingConfirmation.toolName}`
        );
        console.log();
        return; // Keep pending state, wait for clear response
      }
    }
    
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
        // Store pending confirmation details
        this.pendingConfirmation = {
          toolName: matchResult.toolName,
          parameters: matchResult.parameters,
          originalRequest: message
        };
        
        // Stop progress
        progress.success('Analysis complete');
        
        // Display confirmation message
        console.log();
        ResponseFormatter.formatInfo(
          `I plan to use the '${matchResult.toolName}' tool for your request.\n` +
          `Confidence: ${Math.round(matchResult.confidence * 100)}%\n\n` +
          `Do you want to proceed? (yes/no)`
        );
        console.log();
        
        // Add to history
        this.conversationHistory.push({ 
          role: 'assistant', 
          content: `Requesting confirmation to use ${matchResult.toolName} tool (confidence: ${Math.round(matchResult.confidence * 100)}%)`
        });
        
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
        
        // Stop progress
        progress.success('Response ready');
        
        // Extract and display response
        const responseText = result.content[0]?.text;
        const response = typeof responseText === 'string' ? responseText : 'No response';
        
        // Format and display response
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
      { cmd: '/theme', desc: 'Change color theme' }
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
    
    // Trigger graceful shutdown
    this.shutdown.execute().catch(error => {
      console.error(chalk.red('Shutdown error:'), error);
      process.exit(1);
    });
  }
}