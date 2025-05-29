/**
 * Natural Language Command Gateway
 * Processes natural language commands and routes them to appropriate handlers
 */

import { Intent, RecognizedIntent, CommandProcessingResult, NLResponse } from '../types/nl.js';
import { IntentRecognitionEngine } from './intent-recognizer.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConfigLoader, VibeTaskManagerConfig } from '../utils/config-loader.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import logger from '../../../logger.js';

/**
 * Command context for processing
 */
export interface CommandContext {
  sessionId: string;
  userId?: string;
  currentProject?: string;
  currentTask?: string;
  conversationHistory: RecognizedIntent[];
  userPreferences: Record<string, unknown>;
}

/**
 * Command processing configuration
 */
export interface CommandGatewayConfig {
  /** Maximum processing time for commands (ms) */
  maxProcessingTime: number;
  /** Whether to track command history */
  trackHistory: boolean;
  /** Maximum history entries to keep */
  maxHistoryEntries: number;
  /** Whether to enable context-aware processing */
  enableContextAware: boolean;
  /** Confidence threshold for auto-execution */
  autoExecuteThreshold: number;
}

/**
 * Command validation result
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
  normalizedParams: Record<string, unknown>;
}

/**
 * Natural Language Command Gateway
 * Main entry point for processing natural language commands
 */
export class CommandGateway {
  private static instance: CommandGateway;
  private intentRecognizer: IntentRecognitionEngine;
  private config: CommandGatewayConfig;
  private commandHistory = new Map<string, RecognizedIntent[]>();
  private contextCache = new Map<string, CommandContext>();

  private constructor() {
    this.intentRecognizer = IntentRecognitionEngine.getInstance();
    this.config = {
      maxProcessingTime: 10000,
      trackHistory: true,
      maxHistoryEntries: 50,
      enableContextAware: true,
      autoExecuteThreshold: 0.8
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CommandGateway {
    if (!CommandGateway.instance) {
      CommandGateway.instance = new CommandGateway();
    }
    return CommandGateway.instance;
  }

  /**
   * Process natural language command
   */
  async processCommand(
    input: string,
    context: Partial<CommandContext> = {}
  ): Promise<CommandProcessingResult> {
    const startTime = Date.now();
    const sessionId = context.sessionId || 'default';

    try {
      logger.info({ sessionId, input: input.substring(0, 100) }, 'Processing natural language command');

      // Get or create command context
      const commandContext = this.getOrCreateContext(sessionId, context);

      // Recognize intent from natural language input
      const recognitionResult = await this.intentRecognizer.recognizeIntent(
        input,
        this.buildRecognitionContext(commandContext)
      );

      if (!recognitionResult) {
        return this.createFailureResult(
          input,
          'Unable to understand the command. Please try rephrasing or use a more specific request.',
          ['Try: "Create a project called MyApp"', 'Try: "List all tasks"', 'Try: "Run task 123"'],
          startTime
        );
      }

      // Convert RecognitionResult to RecognizedIntent
      const recognizedIntent: RecognizedIntent = {
        intent: recognitionResult.intent,
        confidence: recognitionResult.confidence,
        confidenceLevel: recognitionResult.confidenceLevel,
        entities: recognitionResult.entities,
        originalInput: input,
        processedInput: input.toLowerCase().trim(),
        alternatives: recognitionResult.alternatives.map(alt => ({
          intent: alt.intent,
          confidence: alt.confidence
        })),
        metadata: {
          processingTime: recognitionResult.processingTime,
          method: recognitionResult.strategy === 'pattern' ? 'pattern' :
                  recognitionResult.strategy === 'llm' ? 'llm' : 'hybrid',
          timestamp: recognitionResult.metadata.timestamp
        }
      };

      // Update command history
      if (this.config.trackHistory) {
        this.updateCommandHistory(sessionId, recognizedIntent);
      }

      // Validate and normalize parameters
      const validation = await this.validateCommand(recognizedIntent, commandContext);

      if (!validation.isValid) {
        return this.createValidationErrorResult(
          recognizedIntent,
          validation,
          startTime
        );
      }

      // Check if command requires confirmation
      const requiresConfirmation = this.shouldRequireConfirmation(recognizedIntent, validation);

      // Map intent to tool parameters
      const toolParams = await this.mapIntentToToolParams(recognizedIntent, validation.normalizedParams);

      const processingTime = Date.now() - startTime;

      return {
        success: true,
        intent: recognizedIntent,
        toolParams,
        validationErrors: [],
        suggestions: validation.suggestions,
        metadata: {
          processingTime,
          confidence: recognizedIntent.confidence,
          requiresConfirmation,
          ambiguousInput: recognizedIntent.confidence < 0.7
        }
      };

    } catch (error) {
      logger.error({ err: error, sessionId, input }, 'Command processing failed');

      return this.createFailureResult(
        input,
        `Command processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        ['Please try again with a simpler command', 'Check your input for typos'],
        startTime
      );
    }
  }

  /**
   * Get or create command context for session
   */
  private getOrCreateContext(sessionId: string, partialContext: Partial<CommandContext>): CommandContext {
    let context = this.contextCache.get(sessionId);

    if (!context) {
      context = {
        sessionId,
        userId: partialContext.userId,
        currentProject: partialContext.currentProject,
        currentTask: partialContext.currentTask,
        conversationHistory: [],
        userPreferences: {}
      };
      this.contextCache.set(sessionId, context);
    }

    // Update context with new information
    if (partialContext.currentProject) {
      context.currentProject = partialContext.currentProject;
    }
    if (partialContext.currentTask) {
      context.currentTask = partialContext.currentTask;
    }
    if (partialContext.userPreferences) {
      Object.assign(context.userPreferences, partialContext.userPreferences);
    }

    return context;
  }

  /**
   * Build recognition context from command context
   */
  private buildRecognitionContext(context: CommandContext): Record<string, any> {
    return {
      currentProject: context.currentProject,
      currentTask: context.currentTask,
      recentIntents: context.conversationHistory.slice(-5).map(h => h.intent),
      userPreferences: context.userPreferences,
      sessionId: context.sessionId
    };
  }

  /**
   * Update command history for session
   */
  private updateCommandHistory(sessionId: string, intent: RecognizedIntent): void {
    let history = this.commandHistory.get(sessionId) || [];

    history.push(intent);

    // Limit history size
    if (history.length > this.config.maxHistoryEntries) {
      history = history.slice(-this.config.maxHistoryEntries);
    }

    this.commandHistory.set(sessionId, history);

    // Update context conversation history
    const context = this.contextCache.get(sessionId);
    if (context) {
      context.conversationHistory = history;
    }
  }

  /**
   * Validate command and normalize parameters
   */
  private async validateCommand(
    intent: RecognizedIntent,
    context: CommandContext
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];
    const normalizedParams: Record<string, unknown> = { ...intent.entities };

    // Intent-specific validation
    switch (intent.intent) {
      case 'create_project':
        return this.validateCreateProject(intent, normalizedParams, errors, warnings, suggestions);

      case 'create_task':
        return this.validateCreateTask(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'list_projects':
      case 'list_tasks':
        return this.validateListCommand(intent, normalizedParams, errors, warnings, suggestions);

      case 'run_task':
        return this.validateRunTask(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'check_status':
        return this.validateStatusCheck(intent, context, normalizedParams, errors, warnings, suggestions);

      default:
        errors.push(`Unsupported intent: ${intent.intent}`);
        suggestions.push('Try using a supported command like create, list, run, or status');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      normalizedParams
    };
  }

  /**
   * Validate create project command
   */
  private validateCreateProject(
    intent: RecognizedIntent,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Project name is required
    if (!params.projectName) {
      errors.push('Project name is required');
      suggestions.push('Try: "Create a project called MyApp"');
    } else {
      // Normalize project name
      params.projectName = String(params.projectName).trim();

      // Validate project name format
      if (!/^[a-zA-Z0-9\-_\s]+$/.test(String(params.projectName))) {
        warnings.push('Project name contains special characters that may cause issues');
        suggestions.push('Consider using only letters, numbers, hyphens, and underscores');
      }
    }

    // Set default description if not provided
    if (!params.description) {
      params.description = `Project: ${params.projectName}`;
      warnings.push('No description provided, using default');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      normalizedParams: params
    };
  }

  /**
   * Validate create task command
   */
  private validateCreateTask(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Check for task title in various forms
    const hasTaskTitle = params.taskTitle || params.taskName ||
                        (params.words && Array.isArray(params.words) && params.words.length > 0);

    if (!hasTaskTitle) {
      errors.push('Task title is required');
      suggestions.push('Try: "Create a task for implementing authentication"');
    } else {
      // Extract task title from words if present
      if (params.words && Array.isArray(params.words) && params.words.length > 0) {
        params.taskTitle = params.words.join(' ');
        warnings.push('Task title extracted from input');
      }
    }

    // Use current project if no project specified
    if (!params.projectName && context.currentProject) {
      params.projectName = context.currentProject;
      warnings.push(`Using current project: ${context.currentProject}`);
    } else if (!params.projectName) {
      errors.push('Project name is required when no current project is set');
      suggestions.push('Specify a project or set a current project first');
    }

    // Validate priority
    if (params.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      if (!validPriorities.includes(String(params.priority).toLowerCase())) {
        warnings.push('Invalid priority, using medium as default');
        params.priority = 'medium';
      } else {
        params.priority = String(params.priority).toLowerCase();
      }
    } else {
      params.priority = 'medium';
    }

    // Validate task type
    if (params.type) {
      const validTypes = ['development', 'testing', 'documentation', 'research', 'bug', 'feature'];
      if (!validTypes.includes(String(params.type).toLowerCase())) {
        warnings.push('Invalid task type, using development as default');
        params.type = 'development';
      } else {
        params.type = String(params.type).toLowerCase();
      }
    } else {
      params.type = 'development';
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      normalizedParams: params
    };
  }

  /**
   * Validate list command
   */
  private validateListCommand(
    intent: RecognizedIntent,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Validate status filter
    if (params.status) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
      if (!validStatuses.includes(String(params.status).toLowerCase())) {
        warnings.push('Invalid status filter, showing all items');
        delete params.status;
      } else {
        params.status = String(params.status).toLowerCase();
      }
    }

    // Validate timeframe filter
    if (params.timeframe) {
      const validTimeframes = ['today', 'tomorrow', 'this week', 'next week', 'this month'];
      const timeframeStr = String(params.timeframe).toLowerCase();
      if (!validTimeframes.includes(timeframeStr) && !/^\d{4}-\d{2}-\d{2}$/.test(timeframeStr)) {
        warnings.push('Invalid timeframe filter, showing all items');
        delete params.timeframe;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      normalizedParams: params
    };
  }

  /**
   * Validate run task command
   */
  private validateRunTask(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Check for task ID in various forms
    const hasTaskId = params.taskId || params.taskTitle ||
                     (params.numbers && Array.isArray(params.numbers) && params.numbers.length > 0);

    if (!hasTaskId) {
      errors.push('Task ID or task title is required');
      suggestions.push('Try: "Run task 123" or "Run the authentication task"');
    } else {
      // Normalize task ID from numbers array if present
      if (params.numbers && Array.isArray(params.numbers) && params.numbers.length > 0) {
        params.taskId = `task-${params.numbers[0]}`;
        warnings.push('Task ID extracted from number');
      }

      // If task title is provided, we'll need to resolve it to an ID
      if (params.taskTitle && !params.taskId) {
        warnings.push('Task title provided, will attempt to resolve to task ID');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      normalizedParams: params
    };
  }

  /**
   * Validate status check command
   */
  private validateStatusCheck(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Use current project if no specific target
    if (!params.projectName && !params.taskId && context.currentProject) {
      params.projectName = context.currentProject;
      warnings.push(`Checking status of current project: ${context.currentProject}`);
    }

    // If no target specified, show general status
    if (!params.projectName && !params.taskId) {
      warnings.push('No specific target, showing general status');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      normalizedParams: params
    };
  }

  /**
   * Check if command should require confirmation
   */
  private shouldRequireConfirmation(intent: RecognizedIntent, validation: ValidationResult): boolean {
    // Require confirmation for low confidence commands
    if (intent.confidence < this.config.autoExecuteThreshold) {
      return true;
    }

    // Require confirmation for commands with validation warnings
    if (validation.warnings.length > 0) {
      return true;
    }

    // Require confirmation for destructive operations (future)
    const destructiveIntents = ['delete_project', 'delete_task', 'archive_project'];
    if (destructiveIntents.includes(intent.intent)) {
      return true;
    }

    return false;
  }

  /**
   * Map recognized intent to tool parameters
   */
  private async mapIntentToToolParams(
    intent: RecognizedIntent,
    normalizedParams: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const toolParams: Record<string, unknown> = {};

    switch (intent.intent) {
      case 'create_project':
        toolParams.command = 'create';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.description = normalizedParams.description;
        toolParams.options = {
          priority: normalizedParams.priority || 'medium',
          type: normalizedParams.type || 'development'
        };
        break;

      case 'create_task':
        toolParams.command = 'create';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.description = normalizedParams.taskTitle;
        toolParams.options = {
          priority: normalizedParams.priority || 'medium',
          type: normalizedParams.type || 'development',
          assignee: normalizedParams.assignee
        };
        break;

      case 'list_projects':
        toolParams.command = 'list';
        toolParams.options = {
          type: 'projects',
          status: normalizedParams.status,
          timeframe: normalizedParams.timeframe
        };
        break;

      case 'list_tasks':
        toolParams.command = 'list';
        toolParams.options = {
          type: 'tasks',
          status: normalizedParams.status,
          timeframe: normalizedParams.timeframe,
          assignee: normalizedParams.assignee,
          project: normalizedParams.projectName
        };
        break;

      case 'run_task':
        toolParams.command = 'run';
        toolParams.taskId = normalizedParams.taskId || normalizedParams.taskTitle;
        toolParams.options = {
          force: normalizedParams.force || false
        };
        break;

      case 'check_status':
        toolParams.command = 'status';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.taskId = normalizedParams.taskId;
        toolParams.options = {
          detailed: true
        };
        break;

      default:
        throw new Error(`Unsupported intent for tool mapping: ${intent.intent}`);
    }

    return toolParams;
  }

  /**
   * Create failure result
   */
  private createFailureResult(
    input: string,
    message: string,
    suggestions: string[],
    startTime: number
  ): CommandProcessingResult {
    return {
      success: false,
      intent: {
        intent: 'unknown',
        confidence: 0,
        confidenceLevel: 'very_low',
        entities: {},
        originalInput: input,
        processedInput: input.toLowerCase().trim(),
        alternatives: [],
        metadata: {
          processingTime: Date.now() - startTime,
          method: 'pattern',
          timestamp: new Date()
        }
      },
      toolParams: {},
      validationErrors: [message],
      suggestions,
      metadata: {
        processingTime: Date.now() - startTime,
        confidence: 0,
        requiresConfirmation: false,
        ambiguousInput: true
      }
    };
  }

  /**
   * Create validation error result
   */
  private createValidationErrorResult(
    intent: RecognizedIntent,
    validation: ValidationResult,
    startTime: number
  ): CommandProcessingResult {
    return {
      success: false,
      intent,
      toolParams: {},
      validationErrors: validation.errors,
      suggestions: validation.suggestions,
      metadata: {
        processingTime: Date.now() - startTime,
        confidence: intent.confidence,
        requiresConfirmation: false,
        ambiguousInput: intent.confidence < 0.7
      }
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CommandGatewayConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info({ config: this.config }, 'Command Gateway configuration updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): CommandGatewayConfig {
    return { ...this.config };
  }

  /**
   * Clear command history for session
   */
  clearHistory(sessionId: string): void {
    this.commandHistory.delete(sessionId);
    this.contextCache.delete(sessionId);
    logger.info({ sessionId }, 'Command history cleared');
  }

  /**
   * Get command history for session
   */
  getHistory(sessionId: string): RecognizedIntent[] {
    return this.commandHistory.get(sessionId) || [];
  }

  /**
   * Get processing statistics
   */
  getStatistics(): {
    totalSessions: number;
    totalCommands: number;
    averageProcessingTime: number;
    successRate: number;
  } {
    const totalSessions = this.commandHistory.size;
    let totalCommands = 0;
    let successfulCommands = 0;

    for (const history of this.commandHistory.values()) {
      totalCommands += history.length;
      successfulCommands += history.filter(h => h.confidence >= 0.7).length;
    }

    return {
      totalSessions,
      totalCommands,
      averageProcessingTime: 0, // TODO: Implement tracking
      successRate: totalCommands > 0 ? successfulCommands / totalCommands : 0
    };
  }
}