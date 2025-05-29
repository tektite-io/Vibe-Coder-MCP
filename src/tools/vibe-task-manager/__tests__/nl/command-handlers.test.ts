/**
 * Tests for Command Handlers
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CommandHandlers,
  CreateProjectHandler,
  CreateTaskHandler,
  ListProjectsHandler,
  ListTasksHandler,
  RunTaskHandler,
  CheckStatusHandler,
  CommandExecutionContext
} from '../../nl/command-handlers.js';
import { RecognizedIntent } from '../../types/nl.js';

describe('CommandHandlers', () => {
  let commandHandlers: CommandHandlers;
  let mockContext: CommandExecutionContext;

  beforeEach(() => {
    commandHandlers = CommandHandlers.getInstance();
    mockContext = {
      sessionId: 'test-session',
      userId: 'test-user',
      currentProject: 'Test Project',
      config: {
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'test-key',
        geminiModel: 'google/gemini-2.5-flash-preview',
        perplexityModel: 'perplexity/llama-3.1-sonar-small-128k-online',
        llm_mapping: {}
      },
      taskManagerConfig: {
        dataDir: './test-data',
        maxConcurrentTasks: 5,
        taskTimeout: 300000,
        enableLogging: true,
        logLevel: 'info',
        cacheEnabled: true,
        cacheTTL: 3600,
        llm: {
          provider: 'openrouter',
          model: 'google/gemini-2.5-flash-preview',
          temperature: 0.7,
          maxTokens: 4000,
          llm_mapping: {}
        }
      }
    };
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = CommandHandlers.getInstance();
      const instance2 = CommandHandlers.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('Handler Registration', () => {
    it('should have all required handlers registered', () => {
      const availableIntents = commandHandlers.getAvailableIntents();

      expect(availableIntents).toContain('create_project');
      expect(availableIntents).toContain('create_task');
      expect(availableIntents).toContain('list_projects');
      expect(availableIntents).toContain('list_tasks');
      expect(availableIntents).toContain('run_task');
      expect(availableIntents).toContain('check_status');
    });
  });

  describe('CreateProjectHandler', () => {
    let handler: CreateProjectHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new CreateProjectHandler();
      mockIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project called Web App',
        processedInput: 'create a project called web app',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle create project command successfully', async () => {
      const toolParams = {
        command: 'create',
        projectName: 'Web App',
        description: 'A web application project',
        options: {
          priority: 'high',
          type: 'development'
        }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Project "Web App" created successfully');
      expect(result.updatedContext?.currentProject).toBe('Web App');
      expect(result.followUpSuggestions).toContain('Add a task to Web App');
    });

    it('should include project details in response', async () => {
      const toolParams = {
        projectName: 'API Service',
        description: 'REST API service',
        options: { priority: 'medium', type: 'backend' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('API Service');
      expect(result.result.content[0].text).toContain('REST API service');
      expect(result.result.content[0].text).toContain('medium');
    });
  });

  describe('CreateTaskHandler', () => {
    let handler: CreateTaskHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new CreateTaskHandler();
      mockIntent = {
        intent: 'create_task',
        confidence: 0.85,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'Create a task for implementing authentication',
        processedInput: 'create a task for implementing authentication',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle create task command successfully', async () => {
      const toolParams = {
        command: 'create',
        projectName: 'Web App',
        description: 'Implement user authentication',
        options: {
          priority: 'high',
          type: 'development',
          assignee: 'developer'
        }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Task created successfully');
      expect(result.result.content[0].text).toContain('Implement user authentication');
      expect(result.result.content[0].text).toContain('Web App');
      expect(result.updatedContext?.currentProject).toBe('Web App');
      expect(result.followUpSuggestions?.some(s => s.includes('Run task'))).toBe(true);
    });

    it('should generate task ID', async () => {
      const toolParams = {
        projectName: 'Test Project',
        description: 'Test task'
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toMatch(/Task ID: task-\d+/);
      expect(result.updatedContext?.currentTask).toMatch(/task-\d+/);
    });
  });

  describe('ListProjectsHandler', () => {
    let handler: ListProjectsHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ListProjectsHandler();
      mockIntent = {
        intent: 'list_projects',
        confidence: 0.95,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Show me all projects',
        processedInput: 'show me all projects',
        alternatives: [],
        metadata: {
          processingTime: 30,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should list all projects', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'projects' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Projects:');
      expect(result.result.content[0].text).toContain('Web App');
      expect(result.result.content[0].text).toContain('Mobile App');
      expect(result.result.content[0].text).toContain('API Service');
    });

    it('should filter projects by status', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'projects', status: 'in_progress' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('Projects (in_progress)');
    });
  });

  describe('ListTasksHandler', () => {
    let handler: ListTasksHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new ListTasksHandler();
      mockIntent = {
        intent: 'list_tasks',
        confidence: 0.88,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'Show me all tasks',
        processedInput: 'show me all tasks',
        alternatives: [],
        metadata: {
          processingTime: 35,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should list all tasks', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'tasks' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Tasks:');
      expect(result.result.content[0].text).toContain('task-1');
      expect(result.result.content[0].text).toContain('Implement authentication');
    });

    it('should filter tasks by status', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'tasks', status: 'pending' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('Tasks (pending)');
    });

    it('should filter tasks by project', async () => {
      const toolParams = {
        command: 'list',
        options: { type: 'tasks', project: 'Web App' }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('Web App');
    });
  });

  describe('RunTaskHandler', () => {
    let handler: RunTaskHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new RunTaskHandler();
      mockIntent = {
        intent: 'run_task',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Run task 123',
        processedInput: 'run task 123',
        alternatives: [],
        metadata: {
          processingTime: 40,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should handle run task command successfully', async () => {
      const toolParams = {
        command: 'run',
        taskId: 'task-123',
        options: { force: false }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Task execution initiated');
      expect(result.result.content[0].text).toContain('task-123');
      expect(result.updatedContext?.currentTask).toBe('task-123');
      expect(result.followUpSuggestions).toContain('Check status of task task-123');
    });

    it('should handle force execution option', async () => {
      const toolParams = {
        command: 'run',
        taskId: 'task-456',
        options: { force: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('Force execution: Yes');
    });
  });

  describe('CheckStatusHandler', () => {
    let handler: CheckStatusHandler;
    let mockIntent: RecognizedIntent;

    beforeEach(() => {
      handler = new CheckStatusHandler();
      mockIntent = {
        intent: 'check_status',
        confidence: 0.82,
        confidenceLevel: 'high',
        entities: {},
        originalInput: 'What is the status?',
        processedInput: 'what is the status?',
        alternatives: [],
        metadata: {
          processingTime: 45,
          method: 'pattern',
          timestamp: new Date()
        }
      };
    });

    it('should show task status when task ID provided', async () => {
      const toolParams = {
        command: 'status',
        taskId: 'task-123',
        options: { detailed: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Task Status: task-123');
      expect(result.result.content[0].text).toContain('Progress: 65%');
      expect(result.followUpSuggestions).toContain('Run task task-123');
    });

    it('should show project status when project name provided', async () => {
      const toolParams = {
        command: 'status',
        projectName: 'Web App',
        options: { detailed: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('Project Status: Web App');
      expect(result.result.content[0].text).toContain('Total tasks: 8');
      expect(result.followUpSuggestions).toContain('List tasks in Web App');
    });

    it('should show general status when no specific target', async () => {
      const toolParams = {
        command: 'status',
        options: { detailed: true }
      };

      const result = await handler.handle(mockIntent, toolParams, mockContext);

      expect(result.result.content[0].text).toContain('General Status');
      expect(result.result.content[0].text).toContain('Active projects: 3');
      expect(result.followUpSuggestions).toContain('Check specific project status');
    });
  });

  describe('Command Execution', () => {
    it('should execute commands through the main handler', async () => {
      const mockIntent: RecognizedIntent = {
        intent: 'create_project',
        confidence: 0.9,
        confidenceLevel: 'very_high',
        entities: {},
        originalInput: 'Create a project',
        processedInput: 'create a project',
        alternatives: [],
        metadata: {
          processingTime: 50,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const toolParams = {
        projectName: 'Test Project',
        description: 'Test description'
      };

      const result = await commandHandlers.executeCommand(mockIntent, toolParams, mockContext);

      expect(result.success).toBe(true);
      expect(result.result.content[0].text).toContain('Project "Test Project" created successfully');
    });

    it('should handle unknown intents gracefully', async () => {
      const mockIntent: RecognizedIntent = {
        intent: 'unknown',
        confidence: 0.1,
        confidenceLevel: 'very_low',
        entities: {},
        originalInput: 'Unknown command',
        processedInput: 'unknown command',
        alternatives: [],
        metadata: {
          processingTime: 20,
          method: 'pattern',
          timestamp: new Date()
        }
      };

      const result = await commandHandlers.executeCommand(mockIntent, {}, mockContext);

      expect(result.success).toBe(false);
      expect(result.result.content[0].text).toContain('No handler available for intent: unknown');
    });
  });
});
