import { vi } from 'vitest';
import type { StorageManager } from '../../core/storage/storage-manager.js';
import type { ProjectOperations } from '../../core/operations/project-operations.js';
import type { EpicService } from '../../services/epic-service.js';
import type { IdGenerator } from '../../utils/id-generator.js';
import type { OpenRouterConfig } from '../../../../types/workflow.js';
import type { Project, Epic, AtomicTask, TaskStatus, TaskPriority, FunctionalArea } from '../../types/task.js';
import type { FileOperationResult } from '../../utils/file-utils.js';
import type { UnifiedStorageEngine } from '../../core/unified-storage-engine.js';
import type { ProjectStorage } from '../../core/storage/project-storage.js';
import type { TaskStorage } from '../../core/storage/task-storage.js';
import type { DependencyStorage } from '../../core/storage/dependency-storage.js';

/**
 * Create a mock StorageManager with all required methods
 */
export function createMockStorageManager(): StorageManager {
  const mock = {
    // UnifiedStorageEngine properties
    unifiedEngine: {} as UnifiedStorageEngine,
    projectStorage: {} as ProjectStorage,
    taskStorage: {} as TaskStorage,
    dependencyStorage: {} as DependencyStorage,
    dataDirectory: '/test/data',
    initialized: true,
    useUnifiedEngine: true,
    
    // Project operations
    createProject: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getProject: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateProject: vi.fn().mockResolvedValue({ success: true }),
    deleteProject: vi.fn().mockResolvedValue({ success: true }),
    listProjects: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectExists: vi.fn().mockResolvedValue(false),
    
    // Epic operations
    createEpic: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getEpic: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateEpic: vi.fn().mockResolvedValue({ success: true }),
    deleteEpic: vi.fn().mockResolvedValue({ success: true }),
    listEpics: vi.fn().mockResolvedValue({ success: true, data: [] }),
    epicExists: vi.fn().mockResolvedValue(false),
    getEpicsForProject: vi.fn().mockResolvedValue({ success: true, data: [] }),
    
    // Task operations
    createTask: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getTask: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateTask: vi.fn().mockResolvedValue({ success: true }),
    deleteTask: vi.fn().mockResolvedValue({ success: true }),
    listTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
    taskExists: vi.fn().mockResolvedValue(false),
    getTasksForEpic: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getTasksForProject: vi.fn().mockResolvedValue({ success: true, data: [] }),
    
    // Dependency operations
    addDependency: vi.fn().mockResolvedValue({ success: true }),
    removeDependency: vi.fn().mockResolvedValue({ success: true }),
    getDependenciesForTask: vi.fn().mockResolvedValue([]),
    getDependentsForTask: vi.fn().mockResolvedValue([]),
    getDependencyGraph: vi.fn().mockResolvedValue({ success: true, data: {} }),
    validateDependencyGraph: vi.fn().mockResolvedValue({ success: true }),
    
    // Storage management
    initialize: vi.fn().mockResolvedValue({ success: true }),
    cleanup: vi.fn().mockResolvedValue({ success: true }),
    backup: vi.fn().mockResolvedValue({ success: true }),
    restore: vi.fn().mockResolvedValue({ success: true }),
    getStorageStats: vi.fn().mockResolvedValue({ success: true, data: {} }),
    
    // Additional methods from the interface
    clearCache: vi.fn().mockResolvedValue({ success: true }),
    exportData: vi.fn().mockResolvedValue({ success: true }),
    importData: vi.fn().mockResolvedValue({ success: true }),
    validateData: vi.fn().mockResolvedValue({ success: true }),
    optimizeStorage: vi.fn().mockResolvedValue({ success: true }),
    
    // Query operations
    queryProjects: vi.fn().mockResolvedValue({ success: true, data: [] }),
    queryTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
    queryEpics: vi.fn().mockResolvedValue({ success: true, data: [] }),
    
    // Batch operations
    batchCreateTasks: vi.fn().mockResolvedValue({ success: true, data: [] }),
    batchUpdateTasks: vi.fn().mockResolvedValue({ success: true }),
    batchDeleteTasks: vi.fn().mockResolvedValue({ success: true }),
    
    // Transaction support
    beginTransaction: vi.fn().mockResolvedValue({ success: true }),
    commitTransaction: vi.fn().mockResolvedValue({ success: true }),
    rollbackTransaction: vi.fn().mockResolvedValue({ success: true }),
    
    // Health check
    healthCheck: vi.fn().mockResolvedValue({ success: true, data: { healthy: true } }),
    
    // Additional required methods
    ensureInitialized: vi.fn().mockResolvedValue(undefined),
    getProjectPath: vi.fn().mockReturnValue('/test/project'),
    getEpicPath: vi.fn().mockReturnValue('/test/epic'),
    getTaskPath: vi.fn().mockReturnValue('/test/task'),
    getDependencyPath: vi.fn().mockReturnValue('/test/dependency'),
    getBackupPath: vi.fn().mockReturnValue('/test/backup'),
    getExportPath: vi.fn().mockReturnValue('/test/export'),
    getImportPath: vi.fn().mockReturnValue('/test/import'),
    getCachePath: vi.fn().mockReturnValue('/test/cache'),
    getLogPath: vi.fn().mockReturnValue('/test/log'),
    getTempPath: vi.fn().mockReturnValue('/test/temp'),
    getConfigPath: vi.fn().mockReturnValue('/test/config'),
    getDataPath: vi.fn().mockReturnValue('/test/data'),
    getStoragePath: vi.fn().mockReturnValue('/test/storage'),
    getWorkspacePath: vi.fn().mockReturnValue('/test/workspace'),
    getArchivePath: vi.fn().mockReturnValue('/test/archive'),
    getMetadataPath: vi.fn().mockReturnValue('/test/metadata'),
    getIndexPath: vi.fn().mockReturnValue('/test/index'),
    getSnapshotPath: vi.fn().mockReturnValue('/test/snapshot')
  };
  
  return mock as unknown as StorageManager;
}

/**
 * Create a mock ProjectOperations with all required methods
 */
export function createMockProjectOperations(): ProjectOperations {
  return {
    resolveProjectRootPath: vi.fn().mockReturnValue('/test/project'),
    createProject: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getProject: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateProject: vi.fn().mockResolvedValue({ success: true }),
    deleteProject: vi.fn().mockResolvedValue({ success: true }),
    listProjects: vi.fn().mockResolvedValue({ success: true, data: [] }),
    projectExists: vi.fn().mockResolvedValue(false),
    queryProjects: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getProjectStats: vi.fn().mockResolvedValue({ success: true, data: {} }),
    archiveProject: vi.fn().mockResolvedValue({ success: true }),
    unarchiveProject: vi.fn().mockResolvedValue({ success: true }),
    exportProject: vi.fn().mockResolvedValue({ success: true }),
    importProject: vi.fn().mockResolvedValue({ success: true }),
    validateProject: vi.fn().mockResolvedValue({ success: true }),
    getProjectHistory: vi.fn().mockResolvedValue({ success: true, data: [] }),
    addProjectCollaborator: vi.fn().mockResolvedValue({ success: true }),
    removeProjectCollaborator: vi.fn().mockResolvedValue({ success: true }),
    getProjectCollaborators: vi.fn().mockResolvedValue({ success: true, data: [] })
  } as unknown as ProjectOperations;
}

/**
 * Create a mock EpicService with all required methods
 */
export function createMockEpicService(): EpicService {
  return {
    createEpic: vi.fn().mockResolvedValue({ success: true, data: {} }),
    getEpic: vi.fn().mockResolvedValue({ success: true, data: {} }),
    updateEpic: vi.fn().mockResolvedValue({ success: true }),
    deleteEpic: vi.fn().mockResolvedValue({ success: true }),
    listEpics: vi.fn().mockResolvedValue({ success: true, data: [] }),
    epicExists: vi.fn().mockResolvedValue(false),
    getEpicsForProject: vi.fn().mockResolvedValue({ success: true, data: [] }),
    queryEpics: vi.fn().mockResolvedValue({ success: true, data: [] }),
    getEpicStats: vi.fn().mockResolvedValue({ success: true, data: {} }),
    validateEpic: vi.fn().mockResolvedValue({ success: true }),
    getEpicHistory: vi.fn().mockResolvedValue({ success: true, data: [] })
  } as unknown as EpicService;
}

/**
 * Create a mock IdGenerator with all required methods
 */
export function createMockIdGenerator(): IdGenerator {
  const mock = {
    config: {} as OpenRouterConfig,
    generateProjectId: vi.fn().mockResolvedValue({ success: true, id: 'proj-test-123' }),
    generateEpicId: vi.fn().mockResolvedValue({ success: true, id: 'epic-test-123' }),
    generateTaskId: vi.fn().mockResolvedValue({ success: true, id: 'task-test-123' }),
    generateDependencyId: vi.fn().mockResolvedValue({ success: true, id: 'dep-test-123' }),
    generateSessionId: vi.fn().mockReturnValue('session-test-123'),
    generateWorkflowId: vi.fn().mockReturnValue('workflow-test-123'),
    generateBatchId: vi.fn().mockReturnValue('batch-test-123'),
    generateTransactionId: vi.fn().mockReturnValue('transaction-test-123'),
    generateBackupId: vi.fn().mockReturnValue('backup-test-123'),
    generateExportId: vi.fn().mockReturnValue('export-test-123'),
    generateImportId: vi.fn().mockReturnValue('import-test-123'),
    validateId: vi.fn().mockReturnValue(true),
    parseId: vi.fn().mockReturnValue({ type: 'project', timestamp: Date.now(), random: '123' }),
    // Add missing methods
    createProjectBaseId: vi.fn().mockReturnValue('proj-base'),
    suggestShorterName: vi.fn().mockReturnValue('short-name'),
    validateProjectName: vi.fn().mockReturnValue(true),
    isValidProjectId: vi.fn().mockReturnValue(true),
    generateUniqueId: vi.fn().mockReturnValue('unique-123'),
    generateTimestamp: vi.fn().mockReturnValue('2025-01-01'),
    generateRandomString: vi.fn().mockReturnValue('random-123')
  };
  
  return mock as unknown as IdGenerator;
}

/**
 * Create a mock OpenRouterConfig with all required properties
 */
export function createMockOpenRouterConfig(): OpenRouterConfig {
  return {
    baseUrl: 'https://test.openrouter.ai/api/v1',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-flash-preview-05-20',
    perplexityModel: 'perplexity/sonar'
  };
}

/**
 * Create a mock Project with all required properties
 */
export function createMockProject(overrides?: Partial<Project>): Project {
  return {
    id: 'proj-test-123',
    name: 'Test Project',
    description: 'A test project',
    status: 'active' as TaskStatus,
    rootPath: '/test/project',
    epicIds: [],
    techStack: {
      languages: ['TypeScript'],
      frameworks: ['Node.js'],
      tools: ['Vitest']
    },
    config: {
      maxConcurrentTasks: 5,
      defaultTaskTemplate: 'default',
      agentConfig: {
        maxAgents: 3,
        defaultAgent: 'default',
        agentCapabilities: {}
      },
      performanceTargets: {
        maxResponseTime: 5000,
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
        backupEnabled: false
      }
    },
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: [],
      version: '1.0.0',

    },
    ...overrides
  };
}

/**
 * Create a mock Epic with all required properties
 */
export function createMockEpic(overrides?: Partial<Epic>): Epic {
  return {
    id: 'epic-test-123',
    projectId: 'proj-test-123',
    title: 'Test Epic',
    description: 'A test epic',
    functionalArea: 'backend' as FunctionalArea,
    status: 'pending' as TaskStatus,
    priority: 'medium' as TaskPriority,
    estimatedHours: 8,
    taskIds: [],
    dependencies: [],
    dependents: [],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: []
    },
    ...overrides
  };
}

/**
 * Create a mock AtomicTask with all required properties
 */
export function createMockAtomicTask(overrides?: Partial<AtomicTask>): AtomicTask {
  return {
    id: 'task-test-123',
    title: 'Test Task',
    description: 'A test task',
    type: 'development',
    priority: 'medium' as TaskPriority,
    estimatedHours: 2,
    status: 'pending' as TaskStatus,
    epicId: 'epic-test-123',
    projectId: 'proj-test-123',
    functionalArea: 'backend' as FunctionalArea,
    dependencies: [],
    dependents: [],
    filePaths: [],
    acceptanceCriteria: ['Task completes successfully'],
    testingRequirements: {
      unitTests: ['Test task functionality'],
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
    tags: [],
    metadata: {
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: 'test-user',
      tags: []
    },
    ...overrides
  };
}

/**
 * Create a mock FileOperationResult
 */
export function createMockFileOperationResult<T>(
  success: boolean,
  data?: T,
  error?: string
): FileOperationResult<T> {
  return {
    success,
    data,
    error,
    metadata: {
      filePath: 'test-file',
      operation: 'test-operation',
      timestamp: new Date()
    }
  };
}