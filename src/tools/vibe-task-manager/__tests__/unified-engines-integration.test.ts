import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import { promises as fs } from 'fs';
import { UnifiedStorageEngine } from '../core/unified-storage-engine.js';
import { UnifiedSecurityEngine } from '../core/unified-security-engine.js';
import { UnifiedOrchestrationEngine } from '../core/unified-orchestration-engine.js';
import { createDefaultStorageConfig } from '../core/unified-storage-engine.js';
import type { UnifiedStorageEngineConfig } from '../core/unified-storage-engine.js';

describe('Unified Engines Integration', () => {
  let testDataDir: string;

  beforeEach(async () => {
    testDataDir = join(tmpdir(), `unified-engines-test-${Date.now()}`);
  });

  afterEach(async () => {
    // Clean up test directories
    try {
      await fs.rm(testDataDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    
    // Reset all singletons
    UnifiedStorageEngine.resetInstance();
    UnifiedSecurityEngine.resetInstance();
    UnifiedOrchestrationEngine.resetInstance();
  });

  describe('Storage Engine', () => {
    it('should initialize and create basic storage structure', async () => {
      const config: UnifiedStorageEngineConfig = {
        ...createDefaultStorageConfig(),
        dataDirectory: testDataDir,
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

      const engine = UnifiedStorageEngine.getInstance(config);
      const result = await engine.initialize();
      
      expect(result.success).toBe(true);
      expect(engine).toBeDefined();
      
      // Verify directories were created
      const directories = ['tasks', 'projects', 'dependencies', 'epics', 'graphs', 'indexes', 'backups', 'cache', 'logs'];
      for (const dir of directories) {
        const dirPath = join(testDataDir, dir);
        const exists = await fs.access(dirPath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
      
      engine.dispose();
    });

    it('should create and retrieve tasks', async () => {
      const config: UnifiedStorageEngineConfig = {
        ...createDefaultStorageConfig(),
        dataDirectory: testDataDir,
        cache: { enabled: false, maxSize: 100, ttlSeconds: 60, compressionEnabled: false, persistToDisk: false },
        backup: { enabled: false, intervalMinutes: 60, maxBackups: 5, compressionEnabled: false, encryptionEnabled: false, remoteBackupEnabled: false },
        monitoring: { enableMetrics: false, metricsInterval: 10, enableAuditLog: false, enablePerformanceTracking: false }
      };

      const engine = UnifiedStorageEngine.getInstance(config);
      await engine.initialize();
      
      const task = {
        id: 'test-task-1',
        title: 'Test Task',
        description: 'A test task',
        status: 'pending' as const,
        priority: 'medium' as const,
        projectId: 'test-project',
        assignedTo: 'test-user',
        createdAt: new Date(),
        updatedAt: new Date(),
        dueDate: new Date(Date.now() + 86400000), // 1 day from now
        tags: ['test'],
        dependencies: [],
        estimatedHours: 2,
        actualHours: 0,
        completionPercentage: 0
      };

      const createResult = await engine.createTask(task);
      expect(createResult.success).toBe(true);
      
      const getResult = await engine.getTask('test-task-1');
      expect(getResult.success).toBe(true);
      if (getResult.success) {
        expect(getResult.data.id).toBe('test-task-1');
        expect(getResult.data.title).toBe('Test Task');
      }
      
      engine.dispose();
    });
  });

  describe('Security Engine', () => {
    it('should initialize with default configuration', async () => {
      const engine = UnifiedSecurityEngine.getInstance();
      const result = await engine.initialize();
      
      expect(result.success).toBe(true);
      expect(engine).toBeDefined();
      
      engine.dispose();
    });

    it('should validate file paths', async () => {
      const engine = UnifiedSecurityEngine.getInstance();
      await engine.initialize();
      
      const validPath = join(testDataDir, 'test-file.txt');
      const result = await engine.validatePath(validPath, 'read');
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isValid).toBe(true);
      }
      
      engine.dispose();
    });
  });

  describe('Orchestration Engine', () => {
    it('should initialize with default configuration', async () => {
      const engine = UnifiedOrchestrationEngine.getInstance();
      const result = await engine.initialize();
      
      expect(result.success).toBe(true);
      expect(engine).toBeDefined();
      
      engine.dispose();
    });
  });

  describe('Engine Integration', () => {
    it('should work together as a unified system', async () => {
      // Initialize storage engine
      const storageConfig: UnifiedStorageEngineConfig = {
        ...createDefaultStorageConfig(),
        dataDirectory: testDataDir,
        cache: { enabled: false, maxSize: 100, ttlSeconds: 60, compressionEnabled: false, persistToDisk: false },
        backup: { enabled: false, intervalMinutes: 60, maxBackups: 5, compressionEnabled: false, encryptionEnabled: false, remoteBackupEnabled: false },
        monitoring: { enableMetrics: false, metricsInterval: 10, enableAuditLog: false, enablePerformanceTracking: false }
      };
      
      const storageEngine = UnifiedStorageEngine.getInstance(storageConfig);
      const storageResult = await storageEngine.initialize();
      expect(storageResult.success).toBe(true);
      
      // Initialize security engine
      const securityEngine = UnifiedSecurityEngine.getInstance();
      const securityResult = await securityEngine.initialize();
      expect(securityResult.success).toBe(true);
      
      // Initialize orchestration engine
      const orchestrationEngine = UnifiedOrchestrationEngine.getInstance();
      const orchestrationResult = await orchestrationEngine.initialize();
      expect(orchestrationResult.success).toBe(true);
      
      // Test that all engines are working
      expect(storageEngine).toBeDefined();
      expect(securityEngine).toBeDefined();
      expect(orchestrationEngine).toBeDefined();
      
      // Clean up
      storageEngine.dispose();
      securityEngine.dispose();
      orchestrationEngine.dispose();
    });
  });
});