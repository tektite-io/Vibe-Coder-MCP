/**
 * Natural Language Command Gateway
 * Processes natural language commands and routes them to appropriate handlers
 */

import { RecognizedIntent, CommandProcessingResult, Entity } from '../types/nl.js';
import { IntentRecognitionEngine } from './intent-recognizer.js';
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
  private sessionMetrics = new Map<string, { commands: Array<{ processingTime: number }> }>();
  private intentSuccessMetrics = new Map<string, {
    total: number;
    successful: number;
    failed: number;
    lastUpdated: Date;
    recentFailures: Array<{ input: string; error: string; timestamp: Date }>;
  }>();

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
        entities: this.convertEntitiesToArray(recognitionResult.entities as Record<string, unknown>),
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

      // Debug logging for entity extraction
      logger.info({
        intent: recognizedIntent.intent,
        confidence: recognizedIntent.confidence,
        strategy: recognitionResult.strategy,
        rawEntities: recognitionResult.entities,
        convertedEntities: recognizedIntent.entities,
        originalInput: input
      }, 'Intent recognition and entity extraction debug');

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

      // Debug logging for parameter extraction
      logger.info({
        intent: recognizedIntent.intent,
        entities: recognizedIntent.entities,
        normalizedParams: validation.normalizedParams,
        toolParams,
        originalInput: input
      }, 'CommandGateway parameter extraction debug');

      const processingTime = Date.now() - startTime;

      // Track successful intent recognition and command mapping
      this.trackIntentSuccess(recognizedIntent.intent, true, input);

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

      // Track failed intent recognition or command mapping
      this.trackIntentSuccess('unknown', false, input, error instanceof Error ? error.message : 'Unknown error');

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
  private buildRecognitionContext(context: CommandContext): Record<string, unknown> {
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

    // Convert entities array to Record format for validation
    const normalizedParams: Record<string, unknown> = {};
    for (const entity of intent.entities) {
      // Map entity types to parameter names
      const paramName = this.mapEntityTypeToParamName(entity.type);
      normalizedParams[paramName] = entity.value;
    }

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

      case 'decompose_task':
        return this.validateDecomposeTask(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'decompose_epic':
        return this.validateDecomposeEpic(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'decompose_project':
        return this.validateDecomposeProject(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'search_files':
        return this.validateSearchFiles(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'search_content':
        return this.validateSearchContent(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'parse_prd':
      case 'parse_tasks':
      case 'import_artifact':
        return this.validateArtifactOperation(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'update_project':
        return this.validateUpdateProject(intent, context, normalizedParams, errors, warnings, suggestions);

      case 'assign_task':
        return this.validateAssignTask(intent, context, normalizedParams, errors, warnings, suggestions);

      default:
        errors.push(`Unsupported intent: ${intent.intent}`);
        suggestions.push('Try using a supported command like create, list, run, status, or decompose');
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
   * Validate decompose task command
   */
  private validateDecomposeTask(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Check for task ID in various forms
    const hasTaskId = params.taskId || params.taskTitle;

    if (!hasTaskId) {
      errors.push('Task ID or task title is required for decomposition');
      suggestions.push('Try: "Decompose task T001" or "Break down the authentication task"');
    } else {
      // Normalize task identifier
      if (params.taskTitle && !params.taskId) {
        warnings.push('Task title provided, will attempt to resolve to task ID');
      }
    }

    // Validate decomposition scope if provided
    if (params.decompositionScope) {
      const validScopes = ['development tasks', 'implementation steps', 'technical tasks', 'all aspects'];
      const scope = String(params.decompositionScope).toLowerCase();
      if (!validScopes.some(validScope => scope.includes(validScope))) {
        warnings.push('Decomposition scope may be too broad or unclear');
        suggestions.push('Consider specifying: development tasks, implementation steps, or technical tasks');
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
   * Validate decompose epic command
   */
  private validateDecomposeEpic(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Check for epic ID in various forms
    const hasEpicId = params.epicId || params.epicTitle;

    if (!hasEpicId) {
      errors.push('Epic ID or epic title is required for decomposition');
      suggestions.push('Try: "Decompose epic E001" or "Break down the authentication epic"');
    } else {
      // Normalize epic identifier
      if (params.epicTitle && !params.epicId) {
        warnings.push('Epic title provided, will attempt to resolve to epic ID');
      }
    }

    // Validate decomposition scope if provided
    if (params.decompositionScope) {
      const validScopes = ['development tasks', 'implementation steps', 'technical tasks', 'all aspects'];
      const scope = String(params.decompositionScope).toLowerCase();
      if (!validScopes.some(validScope => scope.includes(validScope))) {
        warnings.push('Decomposition scope may be too broad or unclear');
        suggestions.push('Consider specifying: development tasks, implementation steps, or technical tasks');
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
   * Validate decompose project command
   */
  private validateDecomposeProject(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Project name is required
    if (!params.projectName) {
      errors.push('Project name or ID is required for decomposition');
      suggestions.push('Try: "Decompose project MyApp" or "Break down project PID-001"');
    } else {
      // Normalize project name
      params.projectName = String(params.projectName).trim();
    }

    // Validate decomposition scope if provided
    if (params.decompositionScope) {
      const validScopes = ['development tasks', 'implementation phases', 'technical components', 'all aspects'];
      const scope = String(params.decompositionScope).toLowerCase();
      if (!validScopes.some(validScope => scope.includes(validScope))) {
        warnings.push('Decomposition scope may be too broad or unclear');
        suggestions.push('Consider specifying: development tasks, implementation phases, or technical components');
      }
    }

    // Validate decomposition details if provided
    if (params.decompositionDetails) {
      const details = String(params.decompositionDetails);
      if (details.length > 1000) {
        warnings.push('Decomposition details are very long, may affect processing performance');
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
   * Validate search files command
   */
  private validateSearchFiles(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Search pattern is required
    if (!params.searchPattern && !params.fileName) {
      errors.push('Search pattern or file name is required');
      suggestions.push('Try: "Search for *.js files" or "Find config files"');
    } else {
      // Normalize search pattern
      if (params.searchPattern) {
        params.searchPattern = String(params.searchPattern).trim();
        
        // Validate search pattern format
        if (String(params.searchPattern).length < 2) {
          warnings.push('Search pattern is very short, may return too many results');
        }
      }
      
      if (params.fileName) {
        params.fileName = String(params.fileName).trim();
      }
    }

    // Validate file extensions if provided
    if (params.fileExtensions) {
      const extensions = Array.isArray(params.fileExtensions) 
        ? params.fileExtensions 
        : [params.fileExtensions];
      
      params.fileExtensions = extensions.map(ext => 
        String(ext).startsWith('.') ? String(ext) : `.${ext}`
      );
    }

    // Set default search directory if not provided
    if (!params.searchDirectory) {
      params.searchDirectory = context.currentProject || '.';
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
   * Validate search content command
   */
  private validateSearchContent(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Search query is required
    if (!params.searchQuery) {
      errors.push('Search query is required');
      suggestions.push('Try: "Search content for authentication" or "Find code containing API"');
    } else {
      // Normalize search query
      params.searchQuery = String(params.searchQuery).trim();
      
      // Validate search query length
      if (String(params.searchQuery).length < 3) {
        warnings.push('Search query is very short, may return too many results');
        suggestions.push('Consider using a more specific search term');
      }
    }

    // Validate regex pattern if provided
    if (params.useRegex && params.regexPattern) {
      try {
        new RegExp(String(params.regexPattern));
        params.regexPattern = String(params.regexPattern);
      } catch {
        errors.push('Invalid regular expression pattern');
        suggestions.push('Check your regex syntax or use simple text search');
      }
    }

    // Validate case sensitivity option
    if (params.caseSensitive !== undefined) {
      params.caseSensitive = Boolean(params.caseSensitive);
    } else {
      params.caseSensitive = false; // Default to case insensitive
    }

    // Set default search directory if not provided
    if (!params.searchDirectory) {
      params.searchDirectory = context.currentProject || '.';
    }

    // Validate file extensions if provided
    if (params.fileExtensions) {
      const extensions = Array.isArray(params.fileExtensions) 
        ? params.fileExtensions 
        : [params.fileExtensions];
      
      params.fileExtensions = extensions.map(ext => 
        String(ext).startsWith('.') ? String(ext) : `.${ext}`
      );
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
   * Validate artifact processing commands (parse_prd, parse_tasks, import_artifact)
   */
  private validateArtifactOperation(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Project name is required for all artifact operations
    if (!params.projectName) {
      errors.push('Project name is required for artifact operations');
      suggestions.push('Try: "Parse PRD for project MyApp" or "Import tasks for PID-001"');
    } else {
      params.projectName = String(params.projectName).trim();
    }

    // File path or artifact content is required
    if (!params.filePath && !params.artifactContent && !params.artifactData) {
      if (intent.intent === 'parse_prd') {
        errors.push('PRD file path or content is required');
        suggestions.push('Try: "Parse PRD from requirements.md" or provide PRD content');
      } else if (intent.intent === 'parse_tasks') {
        errors.push('Task list file path or content is required');
        suggestions.push('Try: "Parse tasks from todo.md" or provide task list content');
      } else if (intent.intent === 'import_artifact') {
        errors.push('Artifact file path or content is required');
        suggestions.push('Try: "Import artifact from data.json" or provide artifact content');
      }
    } else {
      // Validate file path if provided
      if (params.filePath) {
        params.filePath = String(params.filePath).trim();
        
        // Basic file path validation
        if (!String(params.filePath).includes('.')) {
          warnings.push('File path may be missing extension');
        }
        
        // Validate file extension for specific artifact types
        const filePath = String(params.filePath).toLowerCase();
        if (intent.intent === 'parse_prd') {
          if (!filePath.endsWith('.md') && !filePath.endsWith('.txt') && !filePath.endsWith('.doc')) {
            warnings.push('PRD files are typically .md, .txt, or .doc files');
          }
        } else if (intent.intent === 'parse_tasks') {
          if (!filePath.endsWith('.md') && !filePath.endsWith('.txt') && !filePath.endsWith('.json')) {
            warnings.push('Task list files are typically .md, .txt, or .json files');
          }
        }
      }
      
      // Normalize artifact content if provided
      if (params.artifactContent) {
        params.artifactContent = String(params.artifactContent).trim();
        if (String(params.artifactContent).length < 10) {
          warnings.push('Artifact content seems very short');
        }
      }
    }

    // Validate artifact type if specified
    if (params.artifactType) {
      const validTypes = ['prd', 'requirements', 'tasks', 'todo', 'specifications', 'documentation'];
      const artifactType = String(params.artifactType).toLowerCase();
      if (!validTypes.includes(artifactType)) {
        warnings.push(`Artifact type '${artifactType}' may not be recognized`);
        suggestions.push(`Consider using: ${validTypes.join(', ')}`);
      }
      params.artifactType = artifactType;
    } else {
      // Set default artifact type based on intent
      if (intent.intent === 'parse_prd') {
        params.artifactType = 'prd';
      } else if (intent.intent === 'parse_tasks') {
        params.artifactType = 'tasks';
      }
    }

    // Validate parsing options
    if (params.parseOptions) {
      const options = params.parseOptions as Record<string, unknown>;
      
      // Validate extract tasks option
      if (options.extractTasks !== undefined) {
        options.extractTasks = Boolean(options.extractTasks);
      }
      
      // Validate extract requirements option
      if (options.extractRequirements !== undefined) {
        options.extractRequirements = Boolean(options.extractRequirements);
      }
      
      // Validate preserve structure option
      if (options.preserveStructure !== undefined) {
        options.preserveStructure = Boolean(options.preserveStructure);
      }
      
      params.parseOptions = options;
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
   * Validate update project command
   */
  private validateUpdateProject(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Project name is required
    if (!params.projectName) {
      errors.push('Project name is required for update operation');
      suggestions.push('Try: "Update project MyApp status to completed"');
    } else {
      params.projectName = String(params.projectName).trim();
    }

    // At least one update parameter should be provided
    const updateableFields = ['status', 'priority', 'description', 'assignee', 'deadline'];
    const hasUpdates = updateableFields.some(field => params[field] !== undefined);
    
    if (!hasUpdates) {
      warnings.push('No specific updates provided, will prompt for changes');
      suggestions.push('Try specifying what to update: status, priority, description, assignee, or deadline');
    }

    // Validate status if provided
    if (params.status) {
      const validStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled'];
      const status = String(params.status).toLowerCase().replace(/\s+/g, '_');
      if (!validStatuses.includes(status)) {
        errors.push(`Invalid status: ${params.status}`);
        suggestions.push(`Valid statuses: ${validStatuses.join(', ')}`);
      } else {
        params.status = status;
      }
    }

    // Validate priority if provided
    if (params.priority) {
      const validPriorities = ['low', 'medium', 'high', 'critical'];
      const priority = String(params.priority).toLowerCase();
      if (!validPriorities.includes(priority)) {
        warnings.push(`Priority '${params.priority}' may not be recognized`);
        suggestions.push(`Valid priorities: ${validPriorities.join(', ')}`);
      } else {
        params.priority = priority;
      }
    }

    // Validate assignee if provided
    if (params.assignee) {
      params.assignee = String(params.assignee).trim();
      if (String(params.assignee).length < 2) {
        warnings.push('Assignee name seems very short');
      }
    }

    // Normalize description if provided
    if (params.description) {
      params.description = String(params.description).trim();
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
   * Validate assign task command
   */
  private validateAssignTask(
    intent: RecognizedIntent,
    context: CommandContext,
    params: Record<string, unknown>,
    errors: string[],
    warnings: string[],
    suggestions: string[]
  ): ValidationResult {
    // Task identifier is required
    if (!params.taskId && !params.taskTitle) {
      errors.push('Task ID or title is required for assignment');
      suggestions.push('Try: "Assign task T-001 to John" or "Assign authentication task to Sarah"');
    } else {
      if (params.taskId) {
        params.taskId = String(params.taskId).trim();
      }
      if (params.taskTitle) {
        params.taskTitle = String(params.taskTitle).trim();
        warnings.push('Task title provided, will attempt to resolve to task ID');
      }
    }

    // Assignee is required
    if (!params.assignee) {
      errors.push('Assignee is required for task assignment');
      suggestions.push('Try: "Assign task to John" or "Assign to team-frontend"');
    } else {
      params.assignee = String(params.assignee).trim();
      
      // Validate assignee format
      if (String(params.assignee).length < 2) {
        errors.push('Assignee name is too short');
      }
      
      // Check for common assignee patterns
      const assignee = String(params.assignee).toLowerCase();
      if (assignee.includes('team-') || assignee.includes('group-')) {
        warnings.push('Assigning to a team/group - ensure the team exists');
      }
    }

    // Validate assignment options
    if (params.force !== undefined) {
      params.force = Boolean(params.force);
    } else {
      params.force = false;
    }

    // Validate reassignment scenario
    if (context.currentTask && params.taskId === context.currentTask) {
      warnings.push('Task may already be assigned, use force option if needed');
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

      case 'decompose_task':
        toolParams.command = 'decompose';
        toolParams.taskId = normalizedParams.taskId || normalizedParams.taskTitle;
        toolParams.description = normalizedParams.description;
        toolParams.options = {
          scope: normalizedParams.decompositionScope,
          details: normalizedParams.decompositionDetails,
          force: normalizedParams.force || false
        };
        break;

      case 'decompose_epic':
        toolParams.command = 'decompose';
        toolParams.epicId = normalizedParams.epicId || normalizedParams.epicTitle;
        toolParams.description = normalizedParams.description;
        toolParams.options = {
          scope: normalizedParams.decompositionScope,
          details: normalizedParams.decompositionDetails,
          force: normalizedParams.force || false
        };
        break;

      case 'decompose_project':
        toolParams.command = 'decompose';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.description = normalizedParams.description;
        toolParams.options = {
          scope: normalizedParams.decompositionScope,
          details: normalizedParams.decompositionDetails,
          force: normalizedParams.force || false
        };
        break;

      case 'open_project':
        toolParams.command = 'open';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.options = {};
        break;

      case 'update_project':
        toolParams.command = 'update';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.updates = normalizedParams.updates || {};
        toolParams.options = {};
        break;

      case 'search_files':
        toolParams.command = 'search';
        toolParams.searchType = 'files';
        toolParams.searchPattern = normalizedParams.searchPattern || normalizedParams.fileName;
        toolParams.options = {
          directory: normalizedParams.searchDirectory,
          extensions: normalizedParams.fileExtensions,
          recursive: true
        };
        break;

      case 'search_content':
        toolParams.command = 'search';
        toolParams.searchType = 'content';
        toolParams.searchQuery = normalizedParams.searchQuery;
        toolParams.options = {
          directory: normalizedParams.searchDirectory,
          extensions: normalizedParams.fileExtensions,
          useRegex: normalizedParams.useRegex || false,
          caseSensitive: normalizedParams.caseSensitive || false,
          regexPattern: normalizedParams.regexPattern
        };
        break;

      case 'parse_prd':
        toolParams.command = 'parse';
        toolParams.artifactType = 'prd';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.filePath = normalizedParams.filePath;
        toolParams.artifactContent = normalizedParams.artifactContent;
        toolParams.options = normalizedParams.parseOptions || {};
        break;

      case 'parse_tasks':
        toolParams.command = 'parse';
        toolParams.artifactType = 'tasks';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.filePath = normalizedParams.filePath;
        toolParams.artifactContent = normalizedParams.artifactContent;
        toolParams.options = normalizedParams.parseOptions || {};
        break;

      case 'import_artifact':
        toolParams.command = 'import';
        toolParams.artifactType = normalizedParams.artifactType || 'generic';
        toolParams.projectName = normalizedParams.projectName;
        toolParams.filePath = normalizedParams.filePath;
        toolParams.artifactContent = normalizedParams.artifactContent;
        toolParams.options = normalizedParams.parseOptions || {};
        break;

      case 'assign_task':
        toolParams.command = 'assign';
        toolParams.taskId = normalizedParams.taskId || normalizedParams.taskTitle;
        toolParams.assignee = normalizedParams.assignee;
        toolParams.options = {
          force: normalizedParams.force || false
        };
        break;

      case 'refine_task':
        toolParams.command = 'refine';
        toolParams.taskId = normalizedParams.taskId || normalizedParams.taskTitle;
        toolParams.refinements = normalizedParams.description || normalizedParams.refinements;
        toolParams.options = {
          scope: normalizedParams.refinementScope
        };
        break;

      case 'get_help':
        toolParams.command = 'help';
        toolParams.topic = normalizedParams.helpTopic || normalizedParams.topic;
        toolParams.options = {
          detailed: true
        };
        break;

      case 'unrecognized_intent':
      case 'clarification_needed':
      case 'unknown':
        toolParams.command = 'fallback';
        toolParams.originalInput = normalizedParams.originalInput;
        toolParams.suggestions = normalizedParams.suggestions || [];
        toolParams.options = {
          intent: intent.intent,
          confidence: intent.confidence
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
        entities: [],
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
   * Map entity type to parameter name
   */
  private mapEntityTypeToParamName(entityType: string): string {
    const mapping: Record<string, string> = {
      'project_name': 'projectName',
      'task_name': 'taskName',
      'task_title': 'taskTitle',
      'task_id': 'taskId',
      'description': 'description',
      'priority': 'priority',
      'type': 'type',
      'status': 'status',
      'assignee': 'assignee',
      'timeframe': 'timeframe',
      'features': 'features',
      'decomposition_scope': 'decompositionScope',
      'decomposition_details': 'decompositionDetails'
    };

    return mapping[entityType] || entityType;
  }

  /**
   * Convert entities from Record format to Entity array format
   */
  private convertEntitiesToArray(entities: Record<string, unknown> | Entity[]): Entity[] {
    // If already an array of entities, return as-is
    if (Array.isArray(entities)) {
      return entities.map(entity => ({
        type: entity.type || 'unknown',
        value: String(entity.value || ''),
        confidence: entity.confidence || 1.0
      }));
    }

    // Convert from Record format
    const entityArray: Entity[] = [];

    for (const [type, value] of Object.entries(entities)) {
      if (value !== undefined && value !== null) {
        entityArray.push({
          type,
          value: String(value),
          confidence: 1.0 // Default confidence for extracted entities
        });
      }
    }

    return entityArray;
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
      averageProcessingTime: this.calculateAverageProcessingTime(), // Real tracking implementation
      successRate: totalCommands > 0 ? successfulCommands / totalCommands : 0
    };
  }

  /**
   * Calculate average processing time from session metrics
   */
  private calculateAverageProcessingTime(): number {
    const allSessions = Array.from(this.sessionMetrics.values());

    if (allSessions.length === 0) {
      return 0;
    }

    const totalProcessingTime = allSessions.reduce((sum: number, session: { commands: Array<{ processingTime: number }> }) => {
      return sum + session.commands.reduce((cmdSum: number, cmd: { processingTime: number }) => cmdSum + cmd.processingTime, 0);
    }, 0);

    const totalCommands = allSessions.reduce((sum: number, session: { commands: Array<{ processingTime: number }> }) => sum + session.commands.length, 0);

    return totalCommands > 0 ? totalProcessingTime / totalCommands : 0;
  }

  /**
   * Track intent recognition success/failure for monitoring
   */
  private trackIntentSuccess(intent: string, success: boolean, input: string, error?: string): void {
    const metrics = this.intentSuccessMetrics.get(intent) || {
      total: 0,
      successful: 0,
      failed: 0,
      lastUpdated: new Date(),
      recentFailures: []
    };

    metrics.total++;
    metrics.lastUpdated = new Date();

    if (success) {
      metrics.successful++;
    } else {
      metrics.failed++;

      // Track recent failures for debugging
      metrics.recentFailures.push({
        input: input.substring(0, 100), // Limit input length for storage
        error: error || 'Unknown error',
        timestamp: new Date()
      });

      // Keep only last 10 failures per intent
      if (metrics.recentFailures.length > 10) {
        metrics.recentFailures = metrics.recentFailures.slice(-10);
      }
    }

    this.intentSuccessMetrics.set(intent, metrics);

    // Log significant failure rates for monitoring
    const failureRate = metrics.failed / metrics.total;
    if (metrics.total >= 5 && failureRate > 0.5) {
      logger.warn({
        intent,
        total: metrics.total,
        successful: metrics.successful,
        failed: metrics.failed,
        failureRate: Math.round(failureRate * 100),
        recentFailures: metrics.recentFailures.slice(-3)
      }, 'High intent recognition failure rate detected');
    }
  }

  /**
   * Get intent recognition success rate statistics
   */
  getIntentSuccessRates(): Record<string, {
    intent: string;
    total: number;
    successRate: number;
    failureRate: number;
    lastUpdated: Date;
    recentFailures?: Array<{ input: string; error: string; timestamp: Date }>;
  }> {
    const stats: Record<string, {
      intent: string;
      total: number;
      successRate: number;
      failureRate: number;
      lastUpdated: Date;
      recentFailures?: Array<{ input: string; error: string; timestamp: Date }>;
    }> = {};

    for (const [intent, metrics] of this.intentSuccessMetrics.entries()) {
      const successRate = metrics.total > 0 ? metrics.successful / metrics.total : 0;
      const failureRate = metrics.total > 0 ? metrics.failed / metrics.total : 0;

      stats[intent] = {
        intent,
        total: metrics.total,
        successRate: Math.round(successRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
        lastUpdated: metrics.lastUpdated
      };

      // Include recent failures for intents with high failure rates
      if (failureRate > 0.3 && metrics.recentFailures.length > 0) {
        stats[intent].recentFailures = metrics.recentFailures.slice(-5);
      }
    }

    return stats;
  }

  /**
   * Get overall system health metrics
   */
  getSystemHealthMetrics(): {
    totalCommands: number;
    overallSuccessRate: number;
    intentCoverage: number;
    problematicIntents: string[];
    lastUpdated: Date;
  } {
    let totalCommands = 0;
    let totalSuccessful = 0;
    const problematicIntents: string[] = [];
    let lastUpdated = new Date(0);

    for (const [intent, metrics] of this.intentSuccessMetrics.entries()) {
      totalCommands += metrics.total;
      totalSuccessful += metrics.successful;

      if (metrics.lastUpdated > lastUpdated) {
        lastUpdated = metrics.lastUpdated;
      }

      // Mark intents with >30% failure rate as problematic
      const failureRate = metrics.total > 0 ? metrics.failed / metrics.total : 0;
      if (metrics.total >= 3 && failureRate > 0.3) {
        problematicIntents.push(intent);
      }
    }

    const overallSuccessRate = totalCommands > 0 ? totalSuccessful / totalCommands : 0;
    const intentCoverage = this.intentSuccessMetrics.size;

    return {
      totalCommands,
      overallSuccessRate: Math.round(overallSuccessRate * 100) / 100,
      intentCoverage,
      problematicIntents,
      lastUpdated
    };
  }
}