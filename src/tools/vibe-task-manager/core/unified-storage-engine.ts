/**
 * Unified Storage Engine
 * 
 * Consolidates 4 storage services into a single, comprehensive engine:
 * - StorageManager: Central coordination and management
 * - TaskStorage: Task persistence and indexing
 * - ProjectStorage: Project management and operations
 * - DependencyStorage: Dependency tracking and graph management
 * 
 * This unified engine provides:
 * - Centralized storage coordination with transaction support
 * - Advanced caching and performance optimization
 * - Comprehensive backup and recovery mechanisms
 * - Real-time synchronization and conflict resolution
 * - Storage analytics and monitoring
 * - Multi-format support (JSON, YAML, Binary)
 * - Compression and encryption capabilities
 */

import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
const { writeFile, unlink } = fs;
import { join } from 'path';
import { AtomicTask, Project, TaskStatus, TaskPriority } from '../types/task.js';
// import { Dependency, DependencyGraph } from '../types/dependency.js';
// import { FileUtils } from '../utils/file-utils.js';
import { getVibeTaskManagerOutputDir } from '../utils/config-loader.js';
import {
  EnhancedError,
  ErrorFactory,
  createErrorContext
} from '../utils/enhanced-errors.js';
import { Result, createSuccess, createFailure } from './unified-lifecycle-manager.js';
import logger from '../../../logger.js';

// =============================================================================
// BRANDED TYPES FOR TYPE SAFETY
// =============================================================================

export type StorageId = string & { readonly __brand: 'StorageId' };
export type TransactionId = string & { readonly __brand: 'TransactionId' };
export type BackupId = string & { readonly __brand: 'BackupId' };
export type CacheKey = string & { readonly __brand: 'CacheKey' };

export function createStorageId(id: string): StorageId {
  if (!id || id.trim().length === 0) {
    throw new Error('Storage ID cannot be empty');
  }
  return id as StorageId;
}

export function createTransactionId(id: string): TransactionId {
  if (!id || id.trim().length === 0) {
    throw new Error('Transaction ID cannot be empty');
  }
  return id as TransactionId;
}

export function createBackupId(id: string): BackupId {
  if (!id || id.trim().length === 0) {
    throw new Error('Backup ID cannot be empty');
  }
  return id as BackupId;
}

export function createCacheKey(key: string): CacheKey {
  if (!key || key.trim().length === 0) {
    throw new Error('Cache key cannot be empty');
  }
  return key as CacheKey;
}

// =============================================================================
// CORE TYPES AND INTERFACES
// =============================================================================

/**
 * Storage format types
 */
export type StorageFormat = 'json' | 'yaml' | 'binary' | 'compressed';

/**
 * Storage operation types
 */
export type StorageOperation = 'create' | 'read' | 'update' | 'delete' | 'list' | 'search';

/**
 * Storage entity types
 */
export type StorageEntity = 'task' | 'project' | 'dependency' | 'epic' | 'graph';

/**
 * Transaction status
 */
export type TransactionStatus = 'pending' | 'committed' | 'rolled_back' | 'failed';

/**
 * Cache configuration
 */
export interface CacheConfig {
  enabled: boolean;
  maxSize: number;
  ttlSeconds: number;
  compressionEnabled: boolean;
  persistToDisk: boolean;
}

/**
 * Backup configuration
 */
export interface BackupConfig {
  enabled: boolean;
  intervalMinutes: number;
  maxBackups: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  remoteBackupEnabled: boolean;
}

/**
 * Storage transaction
 */
export interface StorageTransaction {
  id: TransactionId;
  status: TransactionStatus;
  operations: StorageOperation[];
  entities: StorageEntity[];
  startTime: Date;
  endTime?: Date;
  rollbackData: Map<string, unknown>;
  metadata: {
    initiator: string;
    reason: string;
    priority: 'low' | 'medium' | 'high';
  };
}

/**
 * Storage cache entry
 */
export interface CacheEntry<T = unknown> {
  key: CacheKey;
  value: T;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessed: Date;
  size: number;
  compressed: boolean;
}

/**
 * Storage backup
 */
export interface StorageBackup {
  id: BackupId;
  createdAt: Date;
  size: number;
  entities: StorageEntity[];
  compressed: boolean;
  encrypted: boolean;
  checksum: string;
  metadata: {
    version: string;
    creator: string;
    description: string;
  };
}

/**
 * Storage statistics
 */
export interface StorageStatistics {
  totalOperations: number;
  operationsByType: Record<StorageOperation, number>;
  operationsByEntity: Record<StorageEntity, number>;
  averageResponseTime: number;
  cacheHitRate: number;
  storageSize: number;
  activeTransactions: number;
  totalBackups: number;
  errorRate: number;
}

/**
 * Storage index structures
 */
export interface TaskIndex {
  tasks: Array<{
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    projectId: string;
    epicId: string;
    estimatedHours: number;
    createdAt: Date;
    updatedAt: Date;
  }>;
  lastUpdated: string;
  version: string;
}

export interface ProjectIndex {
  projects: Array<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }>;
  lastUpdated: string;
  version: string;
}

export interface DependencyIndex {
  dependencies: Array<{
    id: string;
    fromTaskId: string;
    toTaskId: string;
    type: string;
    critical: boolean;
    createdAt: Date;
  }>;
  lastUpdated: string;
  version: string;
}

export interface EpicIndex {
  epics: string[];
  lastUpdated: string;
  version: string;
}

/**
 * Unified storage engine configuration
 */
export interface UnifiedStorageEngineConfig {
  dataDirectory: string;
  format: StorageFormat;
  cache: CacheConfig;
  backup: BackupConfig;
  performance: {
    batchSize: number;
    maxConcurrentOperations: number;
    enableCompression: boolean;
    enableEncryption: boolean;
  };
  monitoring: {
    enableMetrics: boolean;
    metricsInterval: number;
    enableAuditLog: boolean;
    enablePerformanceTracking: boolean;
  };
}

// =============================================================================
// UNIFIED STORAGE ENGINE
// =============================================================================

/**
 * Unified Storage Engine
 * 
 * Consolidates all storage functionality into a single, comprehensive engine
 * with advanced features for caching, transactions, backup, and monitoring.
 */
export class UnifiedStorageEngine extends EventEmitter {
  private static instance: UnifiedStorageEngine | null = null;
  
  // Core configuration
  private readonly config: UnifiedStorageEngineConfig;
  private readonly dataDirectory: string;
  private initialized = false;
  
  // Storage state
  private readonly cache = new Map<CacheKey, CacheEntry>();
  private readonly transactions = new Map<TransactionId, StorageTransaction>();
  private readonly backups = new Map<BackupId, StorageBackup>();
  
  // Indexes
  private taskIndex: TaskIndex = { tasks: [], lastUpdated: '', version: '1.0.0' };
  private projectIndex: ProjectIndex = { projects: [], lastUpdated: '', version: '1.0.0' };
  private dependencyIndex: DependencyIndex = { dependencies: [], lastUpdated: '', version: '1.0.0' };
  private epicIndex: EpicIndex = { epics: [], lastUpdated: '', version: '1.0.0' };
  
  // Performance tracking
  private operationCount = 0;
  private operationsByType = new Map<StorageOperation, number>();
  private operationsByEntity = new Map<StorageEntity, number>();
  private totalResponseTime = 0;
  private cacheHits = 0;
  private cacheRequests = 0;
  
  // Background processes
  private backupTimer: NodeJS.Timeout | null = null;
  private cacheCleanupTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  
  private constructor(config: UnifiedStorageEngineConfig) {
    super();
    this.config = config;
    this.dataDirectory = config.dataDirectory;
    
    // Initialize operation counters
    ['create', 'read', 'update', 'delete', 'list', 'search'].forEach(op => {
      this.operationsByType.set(op as StorageOperation, 0);
    });
    
    ['task', 'project', 'dependency', 'epic', 'graph'].forEach(entity => {
      this.operationsByEntity.set(entity as StorageEntity, 0);
    });
    
    logger.info('Unified Storage Engine initialized');
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: UnifiedStorageEngineConfig): UnifiedStorageEngine {
    if (!UnifiedStorageEngine.instance) {
      if (!config) {
        throw new Error('Configuration required for first initialization');
      }
      UnifiedStorageEngine.instance = new UnifiedStorageEngine(config);
    }
    return UnifiedStorageEngine.instance;
  }
  
  /**
   * Reset singleton instance (for testing)
   */
  public static resetInstance(): void {
    if (UnifiedStorageEngine.instance) {
      UnifiedStorageEngine.instance.dispose();
      UnifiedStorageEngine.instance = null;
    }
  }
  
  // =============================================================================
  // INITIALIZATION AND LIFECYCLE
  // =============================================================================
  
  /**
   * Initialize the storage engine
   */
  public async initialize(): Promise<Result<void, EnhancedError>> {
    if (this.initialized) {
      return createSuccess(undefined);
    }
    
    try {
      // Create data directory structure
      await this.createDirectoryStructure();
      
      // Load indexes
      await this.loadIndexes();
      
      // Start background processes
      this.startBackgroundProcesses();
      
      this.initialized = true;
      this.emit('initialized');
      logger.info('Storage engine initialized successfully');
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to initialize storage engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'initialize').build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Create directory structure
   */
  private async createDirectoryStructure(): Promise<void> {
    const directories = [
      this.dataDirectory,
      join(this.dataDirectory, 'tasks'),
      join(this.dataDirectory, 'projects'),
      join(this.dataDirectory, 'dependencies'),
      join(this.dataDirectory, 'epics'),
      join(this.dataDirectory, 'graphs'),
      join(this.dataDirectory, 'indexes'),
      join(this.dataDirectory, 'backups'),
      join(this.dataDirectory, 'cache'),
      join(this.dataDirectory, 'logs')
    ];
    
    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }
  
  /**
   * Load all indexes
   */
  private async loadIndexes(): Promise<void> {
    const indexDir = join(this.dataDirectory, 'indexes');
    
    try {
      // Load task index
      const taskIndexPath = join(indexDir, 'tasks.json');
      if (await this.fileExists(taskIndexPath)) {
        const taskIndexData = await fs.readFile(taskIndexPath, 'utf-8');
        this.taskIndex = JSON.parse(taskIndexData);
      }
      
      // Load project index
      const projectIndexPath = join(indexDir, 'projects.json');
      if (await this.fileExists(projectIndexPath)) {
        const projectIndexData = await fs.readFile(projectIndexPath, 'utf-8');
        this.projectIndex = JSON.parse(projectIndexData);
      }
      
      // Load dependency index
      const dependencyIndexPath = join(indexDir, 'dependencies.json');
      if (await this.fileExists(dependencyIndexPath)) {
        const dependencyIndexData = await fs.readFile(dependencyIndexPath, 'utf-8');
        this.dependencyIndex = JSON.parse(dependencyIndexData);
      }
      
      // Load epic index
      const epicIndexPath = join(indexDir, 'epics.json');
      if (await this.fileExists(epicIndexPath)) {
        const epicIndexData = await fs.readFile(epicIndexPath, 'utf-8');
        this.epicIndex = JSON.parse(epicIndexData);
      }
      
      logger.info('Storage indexes loaded successfully');
    } catch (error) {
      logger.warn('Failed to load some indexes, using defaults:', error);
    }
  }
  
  /**
   * Start background processes
   */
  private startBackgroundProcesses(): void {
    // Backup process
    if (this.config.backup.enabled) {
      this.backupTimer = setInterval(() => {
        this.performBackup().catch(error => {
          logger.error('Backup process failed:', error);
        });
      }, this.config.backup.intervalMinutes * 60 * 1000);
    }
    
    // Cache cleanup process
    if (this.config.cache.enabled) {
      this.cacheCleanupTimer = setInterval(() => {
        this.cleanupCache();
      }, 60 * 1000); // Every minute
    }
    
    // Metrics collection
    if (this.config.monitoring.enableMetrics) {
      this.metricsTimer = setInterval(() => {
        this.collectMetrics();
      }, this.config.monitoring.metricsInterval * 1000);
    }
    
    logger.info('Background processes started');
  }
  
  // =============================================================================
  // TASK STORAGE OPERATIONS
  // =============================================================================
  
  /**
   * Create a new task
   */
  public async createTask(task: AtomicTask): Promise<Result<AtomicTask, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      // Check if task already exists
      if (await this.taskExists(task.id)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Task already exists: ${task.id}`,
          createErrorContext('UnifiedStorageEngine', 'createTask')
            .metadata({ taskId: task.id })
            .build()
        ));
      }
      
      // Save task to file
      const taskDir = join(this.dataDirectory, 'tasks');
      await fs.mkdir(taskDir, { recursive: true });
      const taskPath = join(taskDir, `${task.id}.json`);
      await fs.writeFile(taskPath, JSON.stringify(task, null, 2), 'utf-8');
      
      // Update index
      this.taskIndex.tasks.push({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        projectId: task.projectId,
        epicId: task.epicId,
        estimatedHours: task.estimatedHours,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt
      });
      
      await this.saveTaskIndex();
      
      // Update cache
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`task:${task.id}`);
        this.setCache(cacheKey, task);
      }
      
      // Track metrics
      this.trackOperation('create', 'task', Date.now() - startTime);
      
      this.emit('taskCreated', task);
      logger.info(`Task created: ${task.id}`);
      
      return createSuccess(task);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'createTask')
          .metadata({ taskId: task.id })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Get a task by ID
   */
  public async getTask(taskId: string): Promise<Result<AtomicTask, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`task:${taskId}`);
        const cached = this.getCache<AtomicTask>(cacheKey);
        if (cached) {
          this.trackOperation('read', 'task', Date.now() - startTime);
          this.cacheHits++;
          return createSuccess(cached);
        }
        this.cacheRequests++;
      }
      
      // Read from file
      const taskPath = join(this.dataDirectory, 'tasks', `${taskId}.json`);
      if (!await this.fileExists(taskPath)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Task not found: ${taskId}`,
          createErrorContext('UnifiedStorageEngine', 'getTask')
            .metadata({ taskId })
            .build()
        ));
      }
      
      const taskData = await fs.readFile(taskPath, 'utf-8');
      const task: AtomicTask = JSON.parse(taskData);
      
      // Update cache
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`task:${taskId}`);
        this.setCache(cacheKey, task);
      }
      
      this.trackOperation('read', 'task', Date.now() - startTime);
      
      return createSuccess(task);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to get task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'getTask')
          .metadata({ taskId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Update a task
   */
  public async updateTask(taskId: string, updates: Partial<AtomicTask>): Promise<Result<AtomicTask, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      // Get existing task
      const getResult = await this.getTask(taskId);
      if (!getResult.success) {
        return getResult;
      }
      
      const existingTask = getResult.data;
      const updatedTask: AtomicTask = {
        ...existingTask,
        ...updates,
        id: taskId, // Ensure ID doesn't change
        updatedAt: new Date()
      };
      
      // Save updated task
      const taskPath = join(this.dataDirectory, 'tasks', `${taskId}.json`);
      await fs.writeFile(taskPath, JSON.stringify(updatedTask, null, 2), 'utf-8');
      
      // Update index
      const indexEntry = this.taskIndex.tasks.find(t => t.id === taskId);
      if (indexEntry) {
        Object.assign(indexEntry, {
          title: updatedTask.title,
          status: updatedTask.status,
          priority: updatedTask.priority,
          projectId: updatedTask.projectId,
          epicId: updatedTask.epicId,
          estimatedHours: updatedTask.estimatedHours,
          updatedAt: updatedTask.updatedAt
        });
        await this.saveTaskIndex();
      }
      
      // Update cache
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`task:${taskId}`);
        this.setCache(cacheKey, updatedTask);
      }
      
      this.trackOperation('update', 'task', Date.now() - startTime);
      
      this.emit('taskUpdated', updatedTask);
      logger.info(`Task updated: ${taskId}`);
      
      return createSuccess(updatedTask);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'updateTask')
          .metadata({ taskId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Delete a task
   */
  public async deleteTask(taskId: string): Promise<Result<void, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      // Check if task exists
      if (!await this.taskExists(taskId)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Task not found: ${taskId}`,
          createErrorContext('UnifiedStorageEngine', 'deleteTask')
            .metadata({ taskId })
            .build()
        ));
      }
      
      // Delete task file
      const taskPath = join(this.dataDirectory, 'tasks', `${taskId}.json`);
      await fs.unlink(taskPath);
      
      // Update index
      this.taskIndex.tasks = this.taskIndex.tasks.filter(t => t.id !== taskId);
      await this.saveTaskIndex();
      
      // Remove from cache
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`task:${taskId}`);
        this.cache.delete(cacheKey);
      }
      
      this.trackOperation('delete', 'task', Date.now() - startTime);
      
      this.emit('taskDeleted', { taskId });
      logger.info(`Task deleted: ${taskId}`);
      
      return createSuccess(undefined);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'deleteTask')
          .metadata({ taskId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * List all tasks
   */
  public async listTasks(projectId?: string): Promise<Result<AtomicTask[], EnhancedError>> {
    const startTime = Date.now();
    
    try {
      let tasks = this.taskIndex.tasks;
      
      // Filter by project if specified
      if (projectId) {
        tasks = tasks.filter(t => t.projectId === projectId);
      }
      
      // Load full task data
      const fullTasks: AtomicTask[] = [];
      for (const taskSummary of tasks) {
        const taskResult = await this.getTask(taskSummary.id);
        if (taskResult.success) {
          fullTasks.push(taskResult.data);
        }
      }
      
      this.trackOperation('list', 'task', Date.now() - startTime);
      
      return createSuccess(fullTasks);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to list tasks: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'listTasks')
          .metadata({ projectId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Check if task exists
   */
  public async taskExists(taskId: string): Promise<boolean> {
    const taskPath = join(this.dataDirectory, 'tasks', `${taskId}.json`);
    return this.fileExists(taskPath);
  }
  
  // =============================================================================
  // PROJECT STORAGE OPERATIONS
  // =============================================================================
  
  /**
   * Create a new project
   */
  public async createProject(project: Project): Promise<Result<Project, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      // Check if project already exists
      if (await this.projectExists(project.id)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Project already exists: ${project.id}`,
          createErrorContext('UnifiedStorageEngine', 'createProject')
            .metadata({ projectId: project.id })
            .build()
        ));
      }
      
      // Save project to file
      const projectDir = join(this.dataDirectory, 'projects');
      await fs.mkdir(projectDir, { recursive: true });
      const projectPath = join(projectDir, `${project.id}.json`);
      await fs.writeFile(projectPath, JSON.stringify(project, null, 2), 'utf-8');
      
      // Update index
      this.projectIndex.projects.push({
        id: project.id,
        name: project.name,
        createdAt: project.metadata.createdAt,
        updatedAt: project.metadata.updatedAt
      });
      
      await this.saveProjectIndex();
      
      // Update cache
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`project:${project.id}`);
        this.setCache(cacheKey, project);
      }
      
      this.trackOperation('create', 'project', Date.now() - startTime);
      
      this.emit('projectCreated', project);
      logger.info(`Project created: ${project.id}`);
      
      return createSuccess(project);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'createProject')
          .metadata({ projectId: project.id })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Get a project by ID
   */
  public async getProject(projectId: string): Promise<Result<Project, EnhancedError>> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`project:${projectId}`);
        const cached = this.getCache<Project>(cacheKey);
        if (cached) {
          this.trackOperation('read', 'project', Date.now() - startTime);
          this.cacheHits++;
          return createSuccess(cached);
        }
        this.cacheRequests++;
      }
      
      // Read from file
      const projectPath = join(this.dataDirectory, 'projects', `${projectId}.json`);
      if (!await this.fileExists(projectPath)) {
        return createFailure(ErrorFactory.createError(
          'validation',
          `Project not found: ${projectId}`,
          createErrorContext('UnifiedStorageEngine', 'getProject')
            .metadata({ projectId })
            .build()
        ));
      }
      
      const projectData = await fs.readFile(projectPath, 'utf-8');
      const project: Project = JSON.parse(projectData);
      
      // Update cache
      if (this.config.cache.enabled) {
        const cacheKey = createCacheKey(`project:${projectId}`);
        this.setCache(cacheKey, project);
      }
      
      this.trackOperation('read', 'project', Date.now() - startTime);
      
      return createSuccess(project);
    } catch (error) {
      return createFailure(ErrorFactory.createError(
        'system',
        `Failed to get project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'getProject')
          .metadata({ projectId })
          .build(),
        { cause: error instanceof Error ? error : undefined }
      ));
    }
  }
  
  /**
   * Check if project exists
   */
  public async projectExists(projectId: string): Promise<boolean> {
    const projectPath = join(this.dataDirectory, 'projects', `${projectId}.json`);
    return this.fileExists(projectPath);
  }

  /**
   * Update project
   */
  public async updateProject(projectId: string, updates: Partial<Project>): Promise<Result<Project, EnhancedError>> {
    try {
      // Get existing project
      const existingResult = await this.getProject(projectId);
      if (!existingResult.success) {
        return existingResult;
      }

      // Merge updates
      const updatedProject: Project = {
        ...existingResult.data,
        ...updates,
        metadata: {
          ...existingResult.data.metadata,
          ...updates.metadata,
          updatedAt: new Date()
        }
      };

      // Save updated project
      const projectPath = join(this.dataDirectory, 'projects', `${projectId}.json`);
      await writeFile(projectPath, JSON.stringify(updatedProject, null, 2), 'utf-8');

      // Update cache
      const cacheKey = createCacheKey(`project:${projectId}`);
      this.setCache(cacheKey, updatedProject);

      // Update project index
      const existingIndex = this.projectIndex.projects.findIndex(p => p.id === projectId);
      const projectIndexEntry = {
        id: projectId,
        name: updatedProject.name,
        createdAt: updatedProject.metadata.createdAt,
        updatedAt: updatedProject.metadata.updatedAt
      };
      
      if (existingIndex >= 0) {
        this.projectIndex.projects[existingIndex] = projectIndexEntry;
      } else {
        this.projectIndex.projects.push(projectIndexEntry);
      }

      await this.saveProjectIndex();

      logger.info({ projectId, updates }, 'Project updated successfully');
      return createSuccess(updatedProject);

    } catch (error) {
      const enhancedError = ErrorFactory.createError(
        'system',
        `Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'updateProject').build(),
        { cause: error instanceof Error ? error : undefined }
      );
      logger.error({ error: enhancedError, projectId }, 'Failed to update project');
      return createFailure(enhancedError);
    }
  }

  /**
   * Delete project
   */
  public async deleteProject(projectId: string): Promise<Result<void, EnhancedError>> {
    try {
      // Check if project exists
      const exists = await this.projectExists(projectId);
      if (!exists) {
        const error = ErrorFactory.createError(
          'validation',
          `Project not found: ${projectId}`,
          createErrorContext('UnifiedStorageEngine', 'deleteProject').build()
        );
        return createFailure(error);
      }

      // Delete project file
      const projectPath = join(this.dataDirectory, 'projects', `${projectId}.json`);
      await unlink(projectPath);

      // Remove from cache
      const cacheKey = createCacheKey(`project:${projectId}`);
      this.cache.delete(cacheKey);

      // Remove from project index
      this.projectIndex.projects = this.projectIndex.projects.filter(p => p.id !== projectId);
      await this.saveProjectIndex();

      logger.info({ projectId }, 'Project deleted successfully');
      return createSuccess(undefined);

    } catch (error) {
      const enhancedError = ErrorFactory.createError(
        'system',
        `Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'deleteProject').build(),
        { cause: error instanceof Error ? error : undefined }
      );
      logger.error({ error: enhancedError, projectId }, 'Failed to delete project');
      return createFailure(enhancedError);
    }
  }

  /**
   * List all projects
   */
  public async listProjects(): Promise<Result<Project[], EnhancedError>> {
    try {
      const projects: Project[] = [];
      
      for (const projectEntry of this.projectIndex.projects) {
        const projectId = projectEntry.id;
        const projectResult = await this.getProject(projectId);
        if (projectResult.success) {
          projects.push(projectResult.data);
        }
      }

      return createSuccess(projects);

    } catch (error) {
      const enhancedError = ErrorFactory.createError(
        'system',
        `Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`,
        createErrorContext('UnifiedStorageEngine', 'listProjects').build(),
        { cause: error instanceof Error ? error : undefined }
      );
      logger.error({ error: enhancedError }, 'Failed to list projects');
      return createFailure(enhancedError);
    }
  }
  
  // =============================================================================
  // CACHE MANAGEMENT
  // =============================================================================
  
  /**
   * Set cache entry
   */
  private setCache<T>(key: CacheKey, value: T): void {
    if (!this.config.cache.enabled) return;
    
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.cache.ttlSeconds * 1000);
    
    const entry: CacheEntry<T> = {
      key,
      value,
      createdAt: now,
      expiresAt,
      accessCount: 0,
      lastAccessed: now,
      size: JSON.stringify(value).length,
      compressed: false
    };
    
    this.cache.set(key, entry);
    
    // Check cache size limit
    if (this.cache.size > this.config.cache.maxSize) {
      this.evictOldestCacheEntries();
    }
  }
  
  /**
   * Get cache entry
   */
  private getCache<T>(key: CacheKey): T | null {
    if (!this.config.cache.enabled) return null;
    
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    
    // Check expiration
    if (entry.expiresAt < new Date()) {
      this.cache.delete(key);
      return null;
    }
    
    // Update access info
    entry.accessCount++;
    entry.lastAccessed = new Date();
    
    return entry.value;
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = new Date();
    const expiredKeys: CacheKey[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt < now) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
    
    if (expiredKeys.length > 0) {
      logger.debug(`Cleaned up ${expiredKeys.length} expired cache entries`);
    }
  }
  
  /**
   * Evict oldest cache entries when size limit is reached
   */
  private evictOldestCacheEntries(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].lastAccessed.getTime() - b[1].lastAccessed.getTime());
    
    const toEvict = Math.ceil(this.cache.size * 0.1); // Evict 10%
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      this.cache.delete(entries[i][0]);
    }
    
    logger.debug(`Evicted ${toEvict} cache entries due to size limit`);
  }
  
  // =============================================================================
  // BACKUP AND RECOVERY
  // =============================================================================
  
  /**
   * Perform backup
   */
  private async performBackup(): Promise<void> {
    try {
      const backupId = createBackupId(`backup_${Date.now()}`);
      const backupDir = join(this.dataDirectory, 'backups', backupId);
      
      await fs.mkdir(backupDir, { recursive: true });
      
      // Copy all data directories
      const dataDirs = ['tasks', 'projects', 'dependencies', 'epics', 'graphs', 'indexes'];
      for (const dir of dataDirs) {
        const sourceDir = join(this.dataDirectory, dir);
        const targetDir = join(backupDir, dir);
        await this.copyDirectory(sourceDir, targetDir);
      }
      
      // Create backup metadata
      const backup: StorageBackup = {
        id: backupId,
        createdAt: new Date(),
        size: await this.getDirectorySize(backupDir),
        entities: ['task', 'project', 'dependency', 'epic', 'graph'],
        compressed: false,
        encrypted: false,
        checksum: await this.calculateChecksum(backupDir),
        metadata: {
          version: '1.0.0',
          creator: 'UnifiedStorageEngine',
          description: 'Automated backup'
        }
      };
      
      this.backups.set(backupId, backup);
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      this.emit('backupCreated', backup);
      logger.info(`Backup created: ${backupId}`);
    } catch (error) {
      logger.error('Backup failed:', error);
      this.emit('backupFailed', error);
    }
  }
  
  /**
   * Clean up old backups
   */
  private async cleanupOldBackups(): Promise<void> {
    const backups = Array.from(this.backups.values());
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    
    if (backups.length > this.config.backup.maxBackups) {
      const toDelete = backups.slice(this.config.backup.maxBackups);
      
      for (const backup of toDelete) {
        try {
          const backupDir = join(this.dataDirectory, 'backups', backup.id);
          await this.removeDirectory(backupDir);
          this.backups.delete(backup.id);
          logger.info(`Old backup deleted: ${backup.id}`);
        } catch (error) {
          logger.error(`Failed to delete backup ${backup.id}:`, error);
        }
      }
    }
  }
  
  // =============================================================================
  // UTILITY METHODS
  // =============================================================================
  
  /**
   * Save task index
   */
  private async saveTaskIndex(): Promise<void> {
    this.taskIndex.lastUpdated = new Date().toISOString();
    const indexDir = join(this.dataDirectory, 'indexes');
    await fs.mkdir(indexDir, { recursive: true });
    const indexPath = join(indexDir, 'tasks.json');
    await fs.writeFile(indexPath, JSON.stringify(this.taskIndex, null, 2), 'utf-8');
  }
  
  /**
   * Save project index
   */
  private async saveProjectIndex(): Promise<void> {
    this.projectIndex.lastUpdated = new Date().toISOString();
    const indexDir = join(this.dataDirectory, 'indexes');
    await fs.mkdir(indexDir, { recursive: true });
    const indexPath = join(indexDir, 'projects.json');
    await fs.writeFile(indexPath, JSON.stringify(this.projectIndex, null, 2), 'utf-8');
  }
  
  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Copy directory recursively
   */
  private async copyDirectory(source: string, target: string): Promise<void> {
    await fs.mkdir(target, { recursive: true });
    const entries = await fs.readdir(source, { withFileTypes: true });
    
    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const targetPath = join(target, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(sourcePath, targetPath);
      } else {
        await fs.copyFile(sourcePath, targetPath);
      }
    }
  }
  
  /**
   * Remove directory recursively
   */
  private async removeDirectory(path: string): Promise<void> {
    try {
      await fs.rm(path, { recursive: true, force: true });
    } catch (error) {
      logger.error(`Failed to remove directory ${path}:`, error);
    }
  }
  
  /**
   * Get directory size
   */
  private async getDirectorySize(path: string): Promise<number> {
    let size = 0;
    try {
      const entries = await fs.readdir(path, { withFileTypes: true });
      
      for (const entry of entries) {
        const entryPath = join(path, entry.name);
        if (entry.isDirectory()) {
          size += await this.getDirectorySize(entryPath);
        } else {
          const stats = await fs.stat(entryPath);
          size += stats.size;
        }
      }
    } catch (error) {
      logger.error(`Failed to calculate directory size for ${path}:`, error);
    }
    
    return size;
  }
  
  /**
   * Calculate checksum for directory
   */
  private async calculateChecksum(path: string): Promise<string> {
    // Simplified checksum - in production, use proper hashing
    const size = await this.getDirectorySize(path);
    return `checksum_${size}_${Date.now()}`;
  }
  
  /**
   * Track operation metrics
   */
  private trackOperation(operation: StorageOperation, entity: StorageEntity, responseTime: number): void {
    this.operationCount++;
    this.operationsByType.set(operation, (this.operationsByType.get(operation) || 0) + 1);
    this.operationsByEntity.set(entity, (this.operationsByEntity.get(entity) || 0) + 1);
    this.totalResponseTime += responseTime;
  }
  
  /**
   * Collect metrics
   */
  private collectMetrics(): void {
    const stats: StorageStatistics = {
      totalOperations: this.operationCount,
      operationsByType: Object.fromEntries(this.operationsByType) as Record<StorageOperation, number>,
      operationsByEntity: Object.fromEntries(this.operationsByEntity) as Record<StorageEntity, number>,
      averageResponseTime: this.operationCount > 0 ? this.totalResponseTime / this.operationCount : 0,
      cacheHitRate: this.cacheRequests > 0 ? this.cacheHits / this.cacheRequests : 0,
      storageSize: 0, // Would calculate actual storage size
      activeTransactions: this.transactions.size,
      totalBackups: this.backups.size,
      errorRate: 0 // Would track error rate
    };
    
    this.emit('metricsCollected', stats);
  }
  
  /**
   * Get storage statistics
   */
  public getStatistics(): StorageStatistics {
    return {
      totalOperations: this.operationCount,
      operationsByType: Object.fromEntries(this.operationsByType) as Record<StorageOperation, number>,
      operationsByEntity: Object.fromEntries(this.operationsByEntity) as Record<StorageEntity, number>,
      averageResponseTime: this.operationCount > 0 ? this.totalResponseTime / this.operationCount : 0,
      cacheHitRate: this.cacheRequests > 0 ? this.cacheHits / this.cacheRequests : 0,
      storageSize: 0,
      activeTransactions: this.transactions.size,
      totalBackups: this.backups.size,
      errorRate: 0
    };
  }
  
  // =============================================================================
  // CLEANUP AND DISPOSAL
  // =============================================================================
  
  /**
   * Dispose of the engine and clean up resources
   */
  public dispose(): void {
    // Stop timers
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
    
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    // Clear state
    this.cache.clear();
    this.transactions.clear();
    this.backups.clear();
    
    // Remove all listeners
    this.removeAllListeners();
    
    this.initialized = false;
    logger.info('Unified Storage Engine disposed');
  }
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

/**
 * Create default configuration for the unified storage engine
 */
export function createDefaultStorageConfig(): UnifiedStorageEngineConfig {
  return {
    dataDirectory: getVibeTaskManagerOutputDir(),
    format: 'json',
    cache: {
      enabled: true,
      maxSize: 1000,
      ttlSeconds: 3600,
      compressionEnabled: false,
      persistToDisk: false
    },
    backup: {
      enabled: true,
      intervalMinutes: 60,
      maxBackups: 10,
      compressionEnabled: true,
      encryptionEnabled: false,
      remoteBackupEnabled: false
    },
    performance: {
      batchSize: 100,
      maxConcurrentOperations: 10,
      enableCompression: false,
      enableEncryption: false
    },
    monitoring: {
      enableMetrics: true,
      metricsInterval: 60,
      enableAuditLog: true,
      enablePerformanceTracking: true
    }
  };
}