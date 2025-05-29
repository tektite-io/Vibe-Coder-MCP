/**
 * Natural Language Command Handlers
 * Implements handlers for each recognized intent
 */

import { Intent, RecognizedIntent, CommandProcessingResult, NLResponse } from '../types/nl.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../../types/workflow.js';
import { ConfigLoader, VibeTaskManagerConfig } from '../utils/config-loader.js';
import logger from '../../../logger.js';

/**
 * Command execution context
 */
export interface CommandExecutionContext {
  sessionId: string;
  userId?: string;
  currentProject?: string;
  currentTask?: string;
  config: OpenRouterConfig;
  taskManagerConfig: VibeTaskManagerConfig;
}

/**
 * Command execution result
 */
export interface CommandExecutionResult {
  success: boolean;
  result: CallToolResult;
  updatedContext?: Partial<CommandExecutionContext>;
  followUpSuggestions?: string[];
}

/**
 * Base command handler interface
 */
export interface CommandHandler {
  intent: Intent;
  handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult>;
}

/**
 * Natural Language Command Handlers
 * Routes commands to appropriate handlers based on intent
 */
export class CommandHandlers {
  private static instance: CommandHandlers;
  private handlers = new Map<Intent, CommandHandler>();

  private constructor() {
    this.initializeHandlers();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): CommandHandlers {
    if (!CommandHandlers.instance) {
      CommandHandlers.instance = new CommandHandlers();
    }
    return CommandHandlers.instance;
  }

  /**
   * Initialize command handlers
   */
  private initializeHandlers(): void {
    // Register handlers for each intent
    this.registerHandler(new CreateProjectHandler());
    this.registerHandler(new CreateTaskHandler());
    this.registerHandler(new ListProjectsHandler());
    this.registerHandler(new ListTasksHandler());
    this.registerHandler(new RunTaskHandler());
    this.registerHandler(new CheckStatusHandler());

    logger.info({ handlerCount: this.handlers.size }, 'Command handlers initialized');
  }

  /**
   * Register a command handler
   */
  registerHandler(handler: CommandHandler): void {
    this.handlers.set(handler.intent, handler);
    logger.debug({ intent: handler.intent }, 'Command handler registered');
  }

  /**
   * Execute command using appropriate handler
   */
  async executeCommand(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const handler = this.handlers.get(recognizedIntent.intent);

    if (!handler) {
      logger.error({ intent: recognizedIntent.intent }, 'No handler found for intent');
      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `No handler available for intent: ${recognizedIntent.intent}`
          }],
          isError: true
        }
      };
    }

    try {
      logger.info({
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Executing command with handler');

      return await handler.handle(recognizedIntent, toolParams, context);
    } catch (error) {
      logger.error({
        err: error,
        intent: recognizedIntent.intent,
        sessionId: context.sessionId
      }, 'Command execution failed');

      return {
        success: false,
        result: {
          content: [{
            type: "text",
            text: `Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }],
          isError: true
        }
      };
    }
  }

  /**
   * Get available handlers
   */
  getAvailableIntents(): Intent[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Create Project Handler
 */
export class CreateProjectHandler implements CommandHandler {
  intent: Intent = 'create_project';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const projectName = toolParams.projectName as string;
    const description = toolParams.description as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      projectName,
      sessionId: context.sessionId
    }, 'Creating new project via natural language');

    // TODO: Implement actual project creation logic
    // This will integrate with the project management system when implemented

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: `✅ Project "${projectName}" created successfully!\n\n` +
              `Description: ${description}\n` +
              `Priority: ${options.priority || 'medium'}\n` +
              `Type: ${options.type || 'development'}\n\n` +
              `You can now add tasks to this project or check its status.`
      }]
    };

    return {
      success: true,
      result,
      updatedContext: {
        currentProject: projectName
      },
      followUpSuggestions: [
        `Add a task to ${projectName}`,
        `Check the status of ${projectName}`,
        `List all projects`
      ]
    };
  }
}

/**
 * Create Task Handler
 */
export class CreateTaskHandler implements CommandHandler {
  intent: Intent = 'create_task';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const projectName = toolParams.projectName as string;
    const taskTitle = toolParams.description as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      projectName,
      taskTitle,
      sessionId: context.sessionId
    }, 'Creating new task via natural language');

    // TODO: Implement actual task creation logic
    // This will integrate with the task management system when implemented

    const taskId = `task-${Date.now()}`; // Temporary ID generation

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: `✅ Task created successfully!\n\n` +
              `Task ID: ${taskId}\n` +
              `Title: ${taskTitle}\n` +
              `Project: ${projectName}\n` +
              `Priority: ${options.priority || 'medium'}\n` +
              `Type: ${options.type || 'development'}\n` +
              `Assignee: ${options.assignee || 'unassigned'}\n\n` +
              `The task is ready to be executed or refined.`
      }]
    };

    return {
      success: true,
      result,
      updatedContext: {
        currentProject: projectName,
        currentTask: taskId
      },
      followUpSuggestions: [
        `Run task ${taskId}`,
        `Refine task ${taskId}`,
        `Check status of ${projectName}`
      ]
    };
  }
}

/**
 * List Projects Handler
 */
export class ListProjectsHandler implements CommandHandler {
  intent: Intent = 'list_projects';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      options,
      sessionId: context.sessionId
    }, 'Listing projects via natural language');

    // TODO: Implement actual project listing logic
    // This will integrate with the project management system when implemented

    const mockProjects = [
      { name: 'Web App', status: 'in_progress', tasks: 5 },
      { name: 'Mobile App', status: 'pending', tasks: 3 },
      { name: 'API Service', status: 'completed', tasks: 8 }
    ];

    let filteredProjects = mockProjects;

    // Apply status filter if provided
    if (options.status) {
      filteredProjects = mockProjects.filter(p => p.status === options.status);
    }

    const projectList = filteredProjects
      .map(p => `• ${p.name} (${p.status}) - ${p.tasks} tasks`)
      .join('\n');

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: `📋 Projects${options.status ? ` (${options.status})` : ''}:\n\n${projectList}\n\n` +
              `Total: ${filteredProjects.length} project${filteredProjects.length !== 1 ? 's' : ''}`
      }]
    };

    return {
      success: true,
      result,
      followUpSuggestions: [
        'Create a new project',
        'Check status of a specific project',
        'List tasks for a project'
      ]
    };
  }
}

/**
 * List Tasks Handler
 */
export class ListTasksHandler implements CommandHandler {
  intent: Intent = 'list_tasks';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      options,
      sessionId: context.sessionId
    }, 'Listing tasks via natural language');

    // TODO: Implement actual task listing logic
    // This will integrate with the task management system when implemented

    const mockTasks = [
      { id: 'task-1', title: 'Implement authentication', project: 'Web App', status: 'in_progress', priority: 'high' },
      { id: 'task-2', title: 'Design user interface', project: 'Web App', status: 'pending', priority: 'medium' },
      { id: 'task-3', title: 'Setup database', project: 'API Service', status: 'completed', priority: 'high' },
      { id: 'task-4', title: 'Write tests', project: 'Mobile App', status: 'pending', priority: 'low' }
    ];

    let filteredTasks = mockTasks;

    // Apply filters
    if (options.status) {
      filteredTasks = filteredTasks.filter(t => t.status === options.status);
    }
    if (options.project) {
      filteredTasks = filteredTasks.filter(t => t.project.toLowerCase().includes(String(options.project).toLowerCase()));
    }
    if (options.assignee) {
      // TODO: Filter by assignee when implemented
    }

    const taskList = filteredTasks
      .map(t => `• ${t.id}: ${t.title} (${t.project}) - ${t.status} [${t.priority}]`)
      .join('\n');

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: `📝 Tasks${options.status ? ` (${options.status})` : ''}:\n\n${taskList}\n\n` +
              `Total: ${filteredTasks.length} task${filteredTasks.length !== 1 ? 's' : ''}`
      }]
    };

    return {
      success: true,
      result,
      followUpSuggestions: [
        'Create a new task',
        'Run a specific task',
        'Check task status'
      ]
    };
  }
}

/**
 * Run Task Handler
 */
export class RunTaskHandler implements CommandHandler {
  intent: Intent = 'run_task';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const taskId = toolParams.taskId as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      taskId,
      sessionId: context.sessionId
    }, 'Running task via natural language');

    // TODO: Implement actual task execution logic
    // This will integrate with the agent orchestration system when implemented

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: `🚀 Task execution initiated!\n\n` +
              `Task ID: ${taskId}\n` +
              `Status: Starting execution...\n` +
              `Force execution: ${options.force ? 'Yes' : 'No'}\n\n` +
              `The task has been queued for execution. You'll receive updates as it progresses.`
      }]
    };

    return {
      success: true,
      result,
      updatedContext: {
        currentTask: taskId
      },
      followUpSuggestions: [
        `Check status of task ${taskId}`,
        'List all running tasks',
        'View task execution logs'
      ]
    };
  }
}

/**
 * Check Status Handler
 */
export class CheckStatusHandler implements CommandHandler {
  intent: Intent = 'check_status';

  async handle(
    recognizedIntent: RecognizedIntent,
    toolParams: Record<string, unknown>,
    context: CommandExecutionContext
  ): Promise<CommandExecutionResult> {
    const projectName = toolParams.projectName as string;
    const taskId = toolParams.taskId as string;
    const options = toolParams.options as Record<string, unknown> || {};

    logger.info({
      projectName,
      taskId,
      sessionId: context.sessionId
    }, 'Checking status via natural language');

    // TODO: Implement actual status checking logic
    // This will integrate with the project and task management systems when implemented

    let statusText = '';

    if (taskId) {
      // Task-specific status
      statusText = `📊 Task Status: ${taskId}\n\n` +
                  `Title: Implement authentication\n` +
                  `Project: Web App\n` +
                  `Status: In Progress\n` +
                  `Priority: High\n` +
                  `Progress: 65%\n` +
                  `Assignee: AI Agent\n` +
                  `Started: 2 hours ago\n` +
                  `Estimated completion: 1 hour\n\n` +
                  `Recent activity:\n` +
                  `• Setup authentication middleware\n` +
                  `• Configured JWT tokens\n` +
                  `• Working on password validation`;
    } else if (projectName) {
      // Project-specific status
      statusText = `📊 Project Status: ${projectName}\n\n` +
                  `Status: In Progress\n` +
                  `Total tasks: 8\n` +
                  `Completed: 3 (37.5%)\n` +
                  `In progress: 2 (25%)\n` +
                  `Pending: 3 (37.5%)\n` +
                  `Blocked: 0\n\n` +
                  `Active tasks:\n` +
                  `• task-1: Implement authentication (65%)\n` +
                  `• task-2: Design user interface (30%)\n\n` +
                  `Next up:\n` +
                  `• Setup database connection\n` +
                  `• Create user registration`;
    } else {
      // General status
      statusText = `📊 General Status\n\n` +
                  `Active projects: 3\n` +
                  `Total tasks: 16\n` +
                  `Completed today: 2\n` +
                  `In progress: 4\n` +
                  `Agents active: 2\n\n` +
                  `Recent completions:\n` +
                  `• Setup database (API Service)\n` +
                  `• Configure CI/CD (Web App)\n\n` +
                  `Current focus:\n` +
                  `• Authentication implementation\n` +
                  `• UI design improvements`;
    }

    const result: CallToolResult = {
      content: [{
        type: "text",
        text: statusText
      }]
    };

    const suggestions = [];
    if (taskId) {
      suggestions.push(`Run task ${taskId}`, 'View task details', 'List related tasks');
    } else if (projectName) {
      suggestions.push(`List tasks in ${projectName}`, `Create task for ${projectName}`, 'View project details');
    } else {
      suggestions.push('Check specific project status', 'List all projects', 'Create new project');
    }

    return {
      success: true,
      result,
      followUpSuggestions: suggestions
    };
  }
}

/**
 * Convenience function to get command handlers instance
 */
export function getCommandHandlers(): CommandHandlers {
  return CommandHandlers.getInstance();
}
