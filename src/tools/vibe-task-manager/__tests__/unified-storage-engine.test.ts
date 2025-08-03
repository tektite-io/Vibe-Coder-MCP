/**
 * Unified Storage Engine Tests
 * 
 * Comprehensive test suite for the unified storage engine that consolidates
 * 4 storage services into a single, comprehensive engine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  UnifiedStorageEngine,
  createDefaultStorageConfig,
  createStorageId,
  createTransactionId,
  createBackupId,
  createCacheKey,
  type UnifiedStorageEngineConfig
} from '../core/unified-storage-engine.js';
import { AtomicTask, Project, TaskStatus, TaskPriority, TaskType, FunctionalArea } from '../types/task.js';

// Test utilities
function createTestTask(id: string, overrides: Partial<AtomicTask> = {}): AtomicTask {
  return {
    id,
    title: `Test Task ${id}`,
    description: `Description for test task ${id}`,
    status: 'pending' as TaskStatus,
    priority: 'medium' as TaskPriority,
    type: 'development' as TaskType,
    functionalArea: 'backend' as FunctionalArea,
    projectId: 'test-project',
    epicId: 'test-epic',
    estimatedHours: 2,
    actualHours: 0,
    dependencies: [],
    dependents: [],
    filePaths: [],
    acceptanceCriteria: [`Task ${id} should work correctly`],
    testingRequirements: {
      unitTests: [],
      integrationTests: [],
      performanceTests: [],
      coverageTarget: 80
    },
    performanceCriteria: {},
    qualityCriteria: {
      codeQuality: [],
      documentation: [],
      typeScript: true,
      eslint: true
    },
    integrationCriteria: {
      compatibility: [],
      patterns: []
    },
    validationMethods: {
      automated: [],
      manual: []
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
    tags: ['test'],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: ['test']
    },
    ...overrides
  };
}

function createTestProject(id: string, overrides: Partial<Project> = {}): Project {
  return {
    id,
    name: `Test Project ${id}`,
    description: `Description for test project ${id}`,
    status: 'pending' as TaskStatus,
    config: {
      maxConcurrentTasks: 5,
      defaultTaskTemplate: 'default',
      agentConfig: {
        maxAgents: 3,
        defaultAgent: 'default-agent',
        agentCapabilities: {}
      },
      performanceTargets: {
        maxResponseTime: 1000,
        maxMemoryUsage: 512,
        minTestCoverage: 80
      },
      integrationSettings: {
        codeMapEnabled: true,
        researchEnabled: true,
        notificationsEnabled: true
      },
      fileSystemSettings: {
        cacheSize: 100,
        cacheTTL: 3600,
        backupEnabled: true
      }
    },
    epicIds: [],
    rootPath: '/test/project',
    techStack: {
      languages: ['TypeScript'],
      frameworks: ['Node.js'],
      tools: ['npm']
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: ['test'],
      version: '1.0.0'
    },
    ...overrides
  };
}

describe('UnifiedStorageEngine', () => {
  let testDataDir: string;
  let engine: UnifiedStorageEngine;

  // Helper function to create a fresh engine instance for each test
  async function createTestEngine(): Promise<UnifiedStorageEngine> {
    // Create unique temporary directory for this test
    const uniqueTestDir = join(tmpdir(), `vibe-storage-test-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`);
    
    const testConfig: UnifiedStorageEngineConfig = {
      ...createDefaultStorageConfig(),
      dataDirectory: uniqueTestDir,
      cache: {
        enabled: true,
        maxSize: 100,
        ttlSeconds: 60,
        compressionEnabled: false,
        persistToDisk: false
      },
      backup: {
        enabled: false, // Disable for tests
        intervalMinutes: 60,
        maxBackups: 5,
        compressionEnabled: false,
        encryptionEnabled: false,
        remoteBackupEnabled: false
      },
      monitoring: {
        enableMetrics: true,
        metricsInterval: 10,
        enableAuditLog: false,
        enablePerformanceTracking: true
      }
    };

    // Reset singleton and create new instance
    UnifiedStorageEngine.resetInstance();
    const engine = UnifiedStorageEngine.getInstance(testConfig);
    
    // Initialize engine
    const initResult = await engine.initialize();
    expect(initResult.success).toBe(true);
    
    return engine;
  }

  // Helper function to clean up engine and its data
  async function cleanupEngine(engine: UnifiedStorageEngine, dataDir: string): Promise<void> {
    if (engine) {
      engine.dispose();
      UnifiedStorageEngine.resetInstance();
    }
    
    try {
      await fs.rm(dataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  beforeEach(async () => {
    // Create base test directory for this test suite
    testDataDir = join(tmpdir(), `vibe-storage-test-suite-${Date.now()}`);
    
    // Initialize engine for each test
    engine = await createTestEngine();
  });

  afterEach(async () => {
    // Clean up engine and test directories
    if (engine) {
      const engineDataDir = (engine as unknown as { config: { dataDirectory: string } }).config.dataDirectory;
      await cleanupEngine(engine, engineDataDir);
    }
    
    // Clean up any remaining test directories
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    it('should initialize successfully with valid configuration', async () => {
      const engine = await createTestEngine();
      const engineDataDir = (engine as unknown as { config: { dataDirectory: string } }).config.dataDirectory;
      
      expect(engine).toBeDefined();
      
      // Check that directories were created
      const directories = [
        'tasks', 'projects', 'dependencies', 'epics', 
        'graphs', 'indexes', 'backups', 'cache', 'logs'
      ];
      
      for (const dir of directories) {
        const dirPath = join(engineDataDir, dir);
        const exists = await fs.access(dirPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
      
      await cleanupEngine(engine, engineDataDir);
    });

    it('should return singleton instance', async () => {
      const engine = await createTestEngine();
      const engineDataDir = (engine as unknown as { config: { dataDirectory: string } }).config.dataDirectory;
      
      const instance1 = UnifiedStorageEngine.getInstance();
      const instance2 = UnifiedStorageEngine.getInstance();
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(engine);
      
      await cleanupEngine(engine, engineDataDir);
    });

    it('should handle initialization errors gracefully', async () => {
      // Create engine with invalid directory
      const invalidConfig: UnifiedStorageEngineConfig = {
        ...createDefaultStorageConfig(),
        dataDirectory: '/root/invalid/path/that/cannot/be/created',
        cache: {
          enabled: true,
          maxSize: 100,
          ttlSeconds: 60,
          compressionEnabled: false,
          persistToDisk: false
        },
        backup: {
          enabled: false,
          intervalMinutes: 60,
          maxBackups: 5,
          compressionEnabled: false,
          encryptionEnabled: false,
          remoteBackupEnabled: false
        },
        monitoring: {
          enableMetrics: true,
          metricsInterval: 10,
          enableAuditLog: false,
          enablePerformanceTracking: true
        }
      };
      
      UnifiedStorageEngine.resetInstance();
      const invalidEngine = UnifiedStorageEngine.getInstance(invalidConfig);
      
      const result = await invalidEngine.initialize();
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
      
      // Clean up
      invalidEngine.dispose();
      UnifiedStorageEngine.resetInstance();
    });
  });

  describe('Branded Types', () => {
    it('should create valid branded types', () => {
      const storageId = createStorageId('test-storage-id');
      const transactionId = createTransactionId('test-transaction-id');
      const backupId = createBackupId('test-backup-id');
      const cacheKey = createCacheKey('test-cache-key');

      expect(storageId).toBe('test-storage-id');
      expect(transactionId).toBe('test-transaction-id');
      expect(backupId).toBe('test-backup-id');
      expect(cacheKey).toBe('test-cache-key');
    });

    it('should reject empty branded type values', () => {
      expect(() => createStorageId('')).toThrow('Storage ID cannot be empty');
      expect(() => createTransactionId('  ')).toThrow('Transaction ID cannot be empty');
      expect(() => createBackupId('')).toThrow('Backup ID cannot be empty');
      expect(() => createCacheKey('')).toThrow('Cache key cannot be empty');
    });
  });

  describe('Task Storage Operations', () => {
    it('should create a new task successfully', async () => {
      const task = createTestTask('task-1');
      
      const result = await engine.createTask(task);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(task);
      }
      
      // Verify file was created
      const taskPath = join(testDataDir, 'tasks', 'task-1.json');
      const exists = await fs.access(taskPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should prevent creating duplicate tasks', async () => {
      const task = createTestTask('task-duplicate');
      
      // Create first task
      const result1 = await engine.createTask(task);
      expect(result1.success).toBe(true);
      
      // Try to create duplicate
      const result2 = await engine.createTask(task);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain('already exists');
      }
    });

    it('should retrieve a task by ID', async () => {
      const task = createTestTask('task-retrieve');
      
      // Create task
      await engine.createTask(task);
      
      // Retrieve task
      const result = await engine.getTask('task-retrieve');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(task);
      }
    });

    it('should return error for non-existent task', async () => {
      const result = await engine.getTask('non-existent-task');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should update a task successfully', async () => {
      const task = createTestTask('task-update');
      
      // Create task
      await engine.createTask(task);
      
      // Update task
      const updates = {
        title: 'Updated Task Title',
        status: 'in_progress' as TaskStatus,
        priority: 'high' as TaskPriority
      };
      
      const result = await engine.updateTask('task-update', updates);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe('Updated Task Title');
        expect(result.data.status).toBe('in_progress');
        expect(result.data.priority).toBe('high');
        expect(result.data.id).toBe('task-update'); // ID should not change
      }
    });

    it('should delete a task successfully', async () => {
      const task = createTestTask('task-delete');
      
      // Create task
      await engine.createTask(task);
      
      // Verify task exists
      const existsBefore = await engine.taskExists('task-delete');
      expect(existsBefore).toBe(true);
      
      // Delete task
      const result = await engine.deleteTask('task-delete');
      expect(result.success).toBe(true);
      
      // Verify task no longer exists
      const existsAfter = await engine.taskExists('task-delete');
      expect(existsAfter).toBe(false);
    });

    it('should list all tasks', async () => {
      const tasks = [
        createTestTask('task-list-1'),
        createTestTask('task-list-2'),
        createTestTask('task-list-3')
      ];
      
      // Create tasks
      for (const task of tasks) {
        await engine.createTask(task);
      }
      
      // List tasks
      const result = await engine.listTasks();
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data.map((t: AtomicTask) => t.id)).toEqual(['task-list-1', 'task-list-2', 'task-list-3']);
      }
    });

    it('should list tasks filtered by project', async () => {
      const tasks = [
        createTestTask('task-project-1', { projectId: 'project-a' }),
        createTestTask('task-project-2', { projectId: 'project-b' }),
        createTestTask('task-project-3', { projectId: 'project-a' })
      ];
      
      // Create tasks
      for (const task of tasks) {
        await engine.createTask(task);
      }
      
      // List tasks for project-a
      const result = await engine.listTasks('project-a');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(2);
        expect(result.data.map((t: AtomicTask) => t.id)).toEqual(['task-project-1', 'task-project-3']);
      }
    });
  });

  describe('Project Storage Operations', () => {
    it('should create a new project successfully', async () => {
      const project = createTestProject('project-1');
      
      const result = await engine.createProject(project);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(project);
      }
      
      // Verify file was created
      const projectPath = join(testDataDir, 'projects', 'project-1.json');
      const exists = await fs.access(projectPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should prevent creating duplicate projects', async () => {
      const project = createTestProject('project-duplicate');
      
      // Create first project
      const result1 = await engine.createProject(project);
      expect(result1.success).toBe(true);
      
      // Try to create duplicate
      const result2 = await engine.createProject(project);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.error.message).toContain('already exists');
      }
    });

    it('should retrieve a project by ID', async () => {
      const project = createTestProject('project-retrieve');
      
      // Create project
      await engine.createProject(project);
      
      // Retrieve project
      const result = await engine.getProject('project-retrieve');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(project);
      }
    });

    it('should return error for non-existent project', async () => {
      const result = await engine.getProject('non-existent-project');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('not found');
      }
    });

    it('should check project existence', async () => {
      const project = createTestProject('project-exists');
      
      // Check before creation
      const existsBefore = await engine.projectExists('project-exists');
      expect(existsBefore).toBe(false);
      
      // Create project
      await engine.createProject(project);
      
      // Check after creation
      const existsAfter = await engine.projectExists('project-exists');
      expect(existsAfter).toBe(true);
    });
  });

  describe('Cache Management', () => {
    it('should cache task data on read operations', async () => {
      const task = createTestTask('task-cache');
      
      // Create task
      await engine.createTask(task);
      
      // First read (should cache)
      const result1 = await engine.getTask('task-cache');
      expect(result1.success).toBe(true);
      
      // Second read (should hit cache)
      const result2 = await engine.getTask('task-cache');
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data).toEqual(task);
      }
      
      // Verify cache statistics
      const stats = engine.getStatistics();
      expect(stats.cacheHitRate).toBeGreaterThan(0);
    });

    it('should cache project data on read operations', async () => {
      const project = createTestProject('project-cache');
      
      // Create project
      await engine.createProject(project);
      
      // First read (should cache)
      const result1 = await engine.getProject('project-cache');
      expect(result1.success).toBe(true);
      
      // Second read (should hit cache)
      const result2 = await engine.getProject('project-cache');
      expect(result2.success).toBe(true);
      if (result2.success) {
        expect(result2.data).toEqual(project);
      }
    });

    it('should update cache when data is modified', async () => {
      const task = createTestTask('task-cache-update');
      
      // Create and cache task
      await engine.createTask(task);
      await engine.getTask('task-cache-update');
      
      // Update task
      const updates = { title: 'Updated Cached Task' };
      const updateResult = await engine.updateTask('task-cache-update', updates);
      expect(updateResult.success).toBe(true);
      
      // Read task again (should get updated version from cache)
      const readResult = await engine.getTask('task-cache-update');
      expect(readResult.success).toBe(true);
      if (readResult.success) {
        expect(readResult.data.title).toBe('Updated Cached Task');
      }
    });
  });

  describe('Performance Tracking', () => {
    it('should track operation statistics', async () => {
      const task = createTestTask('task-stats');
      
      // Perform operations
      await engine.createTask(task);
      await engine.getTask('task-stats');
      await engine.updateTask('task-stats', { title: 'Updated' });
      
      // Check statistics
      const stats = engine.getStatistics();
      expect(stats.totalOperations).toBeGreaterThan(0);
      expect(stats.operationsByType.create).toBeGreaterThan(0);
      expect(stats.operationsByType.read).toBeGreaterThan(0);
      expect(stats.operationsByType.update).toBeGreaterThan(0);
      expect(stats.operationsByEntity.task).toBeGreaterThan(0);
      expect(stats.averageResponseTime).toBeGreaterThan(0);
    });

    it('should emit events for operations', async () => {
      const events: string[] = [];
      
      // Listen for events
      engine.on('taskCreated', () => events.push('taskCreated'));
      engine.on('taskUpdated', () => events.push('taskUpdated'));
      engine.on('taskDeleted', () => events.push('taskDeleted'));
      engine.on('projectCreated', () => events.push('projectCreated'));
      
      // Perform operations
      const task = createTestTask('task-events');
      const project = createTestProject('project-events');
      
      await engine.createTask(task);
      await engine.createProject(project);
      await engine.updateTask('task-events', { title: 'Updated' });
      await engine.deleteTask('task-events');
      
      // Verify events were emitted
      expect(events).toContain('taskCreated');
      expect(events).toContain('taskUpdated');
      expect(events).toContain('taskDeleted');
      expect(events).toContain('projectCreated');
    });
  });

  describe('Configuration', () => {
    it('should create default configuration', () => {
      const config = createDefaultStorageConfig();
      
      expect(config).toBeDefined();
      expect(config.dataDirectory).toBeDefined();
      expect(config.format).toBe('json');
      expect(config.cache.enabled).toBe(true);
      expect(config.backup.enabled).toBe(true);
      expect(config.monitoring.enableMetrics).toBe(true);
    });

    it('should respect cache configuration', async () => {
      // Test with cache disabled
      const noCacheConfig: UnifiedStorageEngineConfig = {
        ...createDefaultStorageConfig(),
        dataDirectory: join(tmpdir(), `vibe-storage-no-cache-test-${Date.now()}`),
        cache: {
          enabled: false,
          maxSize: 100,
          ttlSeconds: 60,
          compressionEnabled: false,
          persistToDisk: false
        }
      };
      
      UnifiedStorageEngine.resetInstance();
      const noCacheEngine = UnifiedStorageEngine.getInstance(noCacheConfig);
      await noCacheEngine.initialize();
      
      const task = createTestTask('task-no-cache');
      await noCacheEngine.createTask(task);
      
      // Multiple reads should not improve cache hit rate
      await noCacheEngine.getTask('task-no-cache');
      await noCacheEngine.getTask('task-no-cache');
      
      const stats = noCacheEngine.getStatistics();
      expect(stats.cacheHitRate).toBe(0);
      
      noCacheEngine.dispose();
    });
  });

  describe('Cleanup and Disposal', () => {
    it('should dispose resources properly', () => {
      engine.dispose();
      
      // Verify timers are cleared and state is reset
      const stats = engine.getStatistics();
      expect(stats.activeTransactions).toBe(0);
      expect(stats.totalBackups).toBe(0);
    });

    it('should reset singleton instance', () => {
      UnifiedStorageEngine.resetInstance();
      
      // Should require config for new instance
      expect(() => UnifiedStorageEngine.getInstance()).toThrow('Configuration required');
    });
  });
});