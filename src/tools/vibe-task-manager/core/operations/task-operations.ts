import { AtomicTask, Epic, TaskStatus, TaskPriority, TaskType } from '../../types/task.js';
import { getStorageManager } from '../storage/storage-manager.js';
import { getVibeTaskManagerConfig } from '../../utils/config-loader.js';
import { getIdGenerator } from '../../utils/id-generator.js';
import { FileOperationResult } from '../../utils/file-utils.js';
import logger from '../../../../logger.js';

/**
 * Task creation parameters
 */
export interface CreateTaskParams {
  title: string;
  description: string;
  projectId: string;
  epicId: string;
  priority?: TaskPriority;
  type?: TaskType;
  estimatedHours?: number;
  filePaths?: string[];
  acceptanceCriteria?: string[];
  tags?: string[];
  assignedAgent?: string;
}

/**
 * Task update parameters
 */
export interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  estimatedHours?: number;
  actualHours?: number;
  filePaths?: string[];
  acceptanceCriteria?: string[];
  tags?: string[];
  assignedAgent?: string;
}

/**
 * Task query parameters
 */
export interface TaskQueryParams {
  projectId?: string;
  epicId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  type?: TaskType;
  assignedAgent?: string;
  tags?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Epic creation parameters
 */
export interface CreateEpicParams {
  title: string;
  description: string;
  projectId: string;
  priority?: TaskPriority;
  estimatedHours?: number;
  tags?: string[];
}

/**
 * Task operations service
 */
export class TaskOperations {
  private static instance: TaskOperations;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TaskOperations {
    if (!TaskOperations.instance) {
      TaskOperations.instance = new TaskOperations();
    }
    return TaskOperations.instance;
  }

  /**
   * Create a new atomic task
   */
  async createTask(params: CreateTaskParams, createdBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskTitle: params.title, projectId: params.projectId, createdBy }, 'Creating new task');

      // Validate input parameters
      const validationResult = this.validateCreateTaskParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Task creation validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Verify project and epic exist
      const storageManager = await getStorageManager();

      const projectExists = await storageManager.projectExists(params.projectId);
      if (!projectExists) {
        return {
          success: false,
          error: `Project ${params.projectId} not found`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      const epicExists = await storageManager.epicExists(params.epicId);
      if (!epicExists) {
        return {
          success: false,
          error: `Epic ${params.epicId} not found`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Generate unique task ID
      const idGenerator = getIdGenerator();
      const idResult = await idGenerator.generateTaskId(params.projectId, params.epicId);

      if (!idResult.success) {
        return {
          success: false,
          error: `Failed to generate task ID: ${idResult.error}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      const taskId = idResult.id!;

      // Load configuration for defaults
      const config = await getVibeTaskManagerConfig();
      if (!config) {
        return {
          success: false,
          error: 'Failed to load task manager configuration',
          metadata: {
            filePath: 'task-operations',
            operation: 'create_task',
            timestamp: new Date()
          }
        };
      }

      // Create task object with defaults
      const task: AtomicTask = {
        id: taskId,
        title: params.title,
        description: params.description,
        status: 'pending',
        priority: params.priority || 'medium',
        type: params.type || 'development',
        estimatedHours: params.estimatedHours || 4,
        epicId: params.epicId,
        projectId: params.projectId,
        dependencies: [],
        dependents: [],
        filePaths: params.filePaths || [],
        acceptanceCriteria: params.acceptanceCriteria || [],
        testingRequirements: {
          unitTests: [],
          integrationTests: [],
          performanceTests: [],
          coverageTarget: config.taskManager.performanceTargets.minTestCoverage
        },
        performanceCriteria: {
          responseTime: `<${config.taskManager.performanceTargets.maxResponseTime}ms`,
          memoryUsage: `<${config.taskManager.performanceTargets.maxMemoryUsage}MB`
        },
        qualityCriteria: {
          codeQuality: ['TypeScript strict mode', 'ESLint compliance'],
          documentation: ['JSDoc comments'],
          typeScript: true,
          eslint: true
        },
        integrationCriteria: {
          compatibility: ['Existing MCP patterns'],
          patterns: ['Tool registration pattern']
        },
        validationMethods: {
          automated: ['Unit tests', 'Integration tests'],
          manual: ['Code review']
        },
        assignedAgent: params.assignedAgent,
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy,
        tags: params.tags || [],
        metadata: {
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy,
          tags: params.tags || []
        }
      };

      // Save task to storage
      const createResult = await storageManager.createTask(task);

      if (!createResult.success) {
        return {
          success: false,
          error: `Failed to save task: ${createResult.error}`,
          metadata: createResult.metadata
        };
      }

      logger.info({ taskId, taskTitle: params.title }, 'Task created successfully');

      return {
        success: true,
        data: createResult.data!,
        metadata: {
          filePath: 'task-operations',
          operation: 'create_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskTitle: params.title }, 'Failed to create task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'create_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.debug({ taskId }, 'Getting task');

      const storageManager = await getStorageManager();
      return await storageManager.getTask(taskId);

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to get task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'get_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Update task
   */
  async updateTask(taskId: string, params: UpdateTaskParams, updatedBy: string = 'system'): Promise<FileOperationResult<AtomicTask>> {
    try {
      logger.info({ taskId, updates: Object.keys(params), updatedBy }, 'Updating task');

      // Validate update parameters
      const validationResult = this.validateUpdateTaskParams(params);
      if (!validationResult.valid) {
        return {
          success: false,
          error: `Task update validation failed: ${validationResult.errors.join(', ')}`,
          metadata: {
            filePath: 'task-operations',
            operation: 'update_task',
            timestamp: new Date()
          }
        };
      }

      // Get existing task to preserve metadata
      const storageManager = await getStorageManager();
      const existingResult = await storageManager.getTask(taskId);
      if (!existingResult.success) {
        return {
          success: false,
          error: `Task not found: ${existingResult.error}`,
          metadata: existingResult.metadata
        };
      }

      const existingTask = existingResult.data!;

      // Prepare update object with proper typing
      const updates: any = {
        ...params,
        metadata: {
          ...existingTask.metadata,
          updatedAt: new Date(),
          ...(params.tags && { tags: params.tags })
        }
      };

      // Update task in storage
      const updateResult = await storageManager.updateTask(taskId, updates);

      if (!updateResult.success) {
        return {
          success: false,
          error: `Failed to update task: ${updateResult.error}`,
          metadata: updateResult.metadata
        };
      }

      logger.info({ taskId }, 'Task updated successfully');

      return {
        success: true,
        data: updateResult.data!,
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to update task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'update_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Delete task
   */
  async deleteTask(taskId: string, deletedBy: string = 'system'): Promise<FileOperationResult<void>> {
    try {
      logger.info({ taskId, deletedBy }, 'Deleting task');

      // Check if task exists
      const storageManager = await getStorageManager();
      const taskExists = await storageManager.taskExists(taskId);

      if (!taskExists) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
          metadata: {
            filePath: 'task-operations',
            operation: 'delete_task',
            timestamp: new Date()
          }
        };
      }

      // Delete task (this will cascade to dependencies)
      const deleteResult = await storageManager.deleteTask(taskId);

      if (!deleteResult.success) {
        return {
          success: false,
          error: `Failed to delete task: ${deleteResult.error}`,
          metadata: deleteResult.metadata
        };
      }

      logger.info({ taskId }, 'Task deleted successfully');

      return {
        success: true,
        metadata: {
          filePath: 'task-operations',
          operation: 'delete_task',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, taskId }, 'Failed to delete task');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'delete_task',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * List tasks with optional filtering
   */
  async listTasks(query?: TaskQueryParams): Promise<FileOperationResult<AtomicTask[]>> {
    try {
      logger.debug({ query }, 'Listing tasks');

      const storageManager = await getStorageManager();
      let result: FileOperationResult<AtomicTask[]>;

      // Apply basic filtering
      if (query?.status && query?.projectId) {
        result = await storageManager.getTasksByStatus(query.status, query.projectId);
      } else if (query?.priority && query?.projectId) {
        result = await storageManager.getTasksByPriority(query.priority, query.projectId);
      } else {
        result = await storageManager.listTasks(query?.projectId, query?.epicId);
      }

      if (!result.success) {
        return result;
      }

      let tasks = result.data!;

      // Apply additional filters
      if (query) {
        tasks = this.applyTaskFilters(tasks, query);
      }

      return {
        success: true,
        data: tasks,
        metadata: {
          filePath: 'task-operations',
          operation: 'list_tasks',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, query }, 'Failed to list tasks');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'list_tasks',
          timestamp: new Date()
        }
      };
    }
  }

  /**
   * Search tasks by query string
   */
  async searchTasks(searchQuery: string, query?: TaskQueryParams): Promise<FileOperationResult<AtomicTask[]>> {
    try {
      logger.debug({ searchQuery, query }, 'Searching tasks');

      const storageManager = await getStorageManager();
      const searchResult = await storageManager.searchTasks(searchQuery, query?.projectId);

      if (!searchResult.success) {
        return searchResult;
      }

      let tasks = searchResult.data!;

      // Apply additional filters
      if (query) {
        tasks = this.applyTaskFilters(tasks, query);
      }

      return {
        success: true,
        data: tasks,
        metadata: {
          filePath: 'task-operations',
          operation: 'search_tasks',
          timestamp: new Date()
        }
      };

    } catch (error) {
      logger.error({ err: error, searchQuery }, 'Failed to search tasks');

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          filePath: 'task-operations',
          operation: 'search_tasks',
          timestamp: new Date()
        }
      };
    }
  }



  /**
   * Validate task creation parameters
   */
  private validateCreateTaskParams(params: CreateTaskParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!params.title || typeof params.title !== 'string' || params.title.trim().length === 0) {
      errors.push('Task title is required and must be a non-empty string');
    }

    if (params.title && params.title.length > 200) {
      errors.push('Task title must be 200 characters or less');
    }

    if (!params.description || typeof params.description !== 'string' || params.description.trim().length === 0) {
      errors.push('Task description is required and must be a non-empty string');
    }

    if (!params.projectId || typeof params.projectId !== 'string') {
      errors.push('Project ID is required and must be a string');
    }

    if (!params.epicId || typeof params.epicId !== 'string') {
      errors.push('Epic ID is required and must be a string');
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.filePaths && !Array.isArray(params.filePaths)) {
      errors.push('File paths must be an array of strings');
    }

    if (params.acceptanceCriteria && !Array.isArray(params.acceptanceCriteria)) {
      errors.push('Acceptance criteria must be an array of strings');
    }

    if (params.tags && !Array.isArray(params.tags)) {
      errors.push('Tags must be an array of strings');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate task update parameters
   */
  private validateUpdateTaskParams(params: UpdateTaskParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (params.title !== undefined) {
      if (typeof params.title !== 'string' || params.title.trim().length === 0) {
        errors.push('Task title must be a non-empty string');
      }
      if (params.title.length > 200) {
        errors.push('Task title must be 200 characters or less');
      }
    }

    if (params.description !== undefined) {
      if (typeof params.description !== 'string' || params.description.trim().length === 0) {
        errors.push('Task description must be a non-empty string');
      }
    }

    if (params.status !== undefined) {
      if (!['pending', 'in_progress', 'completed', 'blocked', 'cancelled'].includes(params.status)) {
        errors.push('Status must be one of: pending, in_progress, completed, blocked, cancelled');
      }
    }

    if (params.priority !== undefined) {
      if (!['low', 'medium', 'high', 'critical'].includes(params.priority)) {
        errors.push('Priority must be one of: low, medium, high, critical');
      }
    }

    if (params.estimatedHours !== undefined && (typeof params.estimatedHours !== 'number' || params.estimatedHours < 0)) {
      errors.push('Estimated hours must be a non-negative number');
    }

    if (params.actualHours !== undefined && (typeof params.actualHours !== 'number' || params.actualHours < 0)) {
      errors.push('Actual hours must be a non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Apply filters to task list
   */
  private applyTaskFilters(tasks: AtomicTask[], query: TaskQueryParams): AtomicTask[] {
    let filtered = tasks;

    // Filter by type
    if (query.type) {
      filtered = filtered.filter(task => task.type === query.type);
    }

    // Filter by assigned agent
    if (query.assignedAgent) {
      filtered = filtered.filter(task => task.assignedAgent === query.assignedAgent);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      filtered = filtered.filter(task =>
        query.tags!.some(tag => task.metadata.tags.includes(tag))
      );
    }

    // Filter by creation date range
    if (query.createdAfter) {
      filtered = filtered.filter(task =>
        task.metadata.createdAt >= query.createdAfter!
      );
    }

    if (query.createdBefore) {
      filtered = filtered.filter(task =>
        task.metadata.createdAt <= query.createdBefore!
      );
    }

    // Apply pagination
    if (query.offset) {
      filtered = filtered.slice(query.offset);
    }

    if (query.limit) {
      filtered = filtered.slice(0, query.limit);
    }

    return filtered;
  }
}

/**
 * Convenience function to get task operations instance
 */
export function getTaskOperations(): TaskOperations {
  return TaskOperations.getInstance();
}
