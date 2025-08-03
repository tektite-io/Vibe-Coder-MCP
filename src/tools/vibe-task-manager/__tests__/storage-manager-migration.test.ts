/**
 * StorageManager Migration Test
 * 
 * Tests the migration of StorageManager to use UnifiedStorageEngine
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StorageManager } from '../core/storage/storage-manager.js';
import { Project, TaskStatus } from '../types/task.js';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Test data creation functions
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

describe('StorageManager Migration', () => {
  let storageManager: StorageManager;
  let testDir: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    testDir = join(tmpdir(), `vibe-task-manager-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // Configure security boundaries to allow access to test directory
    process.env.VIBE_CODER_OUTPUT_DIR = testDir;
    process.env.VIBE_TASK_MANAGER_READ_DIR = testDir;
    
    // Initialize storage manager with test directory
    storageManager = StorageManager.getInstance(testDir);
    await storageManager.initialize();
  });

  afterEach(async () => {
    // Clean up environment variables
    delete process.env.VIBE_CODER_OUTPUT_DIR;
    delete process.env.VIBE_TASK_MANAGER_READ_DIR;
    
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Project Operations with Unified Engine', () => {
    it('should create project using unified engine', async () => {
      const project = createTestProject('test-project-1');
      
      const result = await storageManager.createProject(project);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('test-project-1');
      expect(result.metadata?.filePath).toBe('unified-storage-engine');
    });

    it('should retrieve project using unified engine', async () => {
      const project = createTestProject('test-project-2');
      
      // Create project first
      await storageManager.createProject(project);
      
      // Retrieve project
      const result = await storageManager.getProject('test-project-2');
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('test-project-2');
      expect(result.metadata?.filePath).toBe('unified-storage-engine');
    });

    it('should update project using unified engine', async () => {
      const project = createTestProject('test-project-3');
      
      // Create project first
      await storageManager.createProject(project);
      
      // Update project
      const updates = { name: 'Updated Project Name' };
      const result = await storageManager.updateProject('test-project-3', updates);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.name).toBe('Updated Project Name');
      expect(result.metadata?.filePath).toBe('unified-storage-engine');
    });

    it('should delete project using unified engine', async () => {
      const project = createTestProject('test-project-4');
      
      // Create project first
      await storageManager.createProject(project);
      
      // Delete project
      const result = await storageManager.deleteProject('test-project-4');
      
      expect(result.success).toBe(true);
      expect(result.metadata?.filePath).toBe('unified-storage-engine');
    });

    it('should list projects using unified engine', async () => {
      const project1 = createTestProject('test-project-5');
      const project2 = createTestProject('test-project-6');
      
      // Create projects
      await storageManager.createProject(project1);
      await storageManager.createProject(project2);
      
      // List projects
      const result = await storageManager.listProjects();
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.length).toBeGreaterThanOrEqual(2);
      expect(result.metadata?.filePath).toBe('unified-storage-engine');
    });

    it('should check project existence using unified engine', async () => {
      const project = createTestProject('test-project-7');
      
      // Check before creation
      const existsBefore = await storageManager.projectExists('test-project-7');
      expect(existsBefore).toBe(false);
      
      // Create project
      await storageManager.createProject(project);
      
      // Check after creation
      const existsAfter = await storageManager.projectExists('test-project-7');
      expect(existsAfter).toBe(true);
    });
  });

  describe('Legacy Storage Security Boundaries', () => {
    it('should handle legacy storage security boundaries correctly', async () => {
      // Test methods that don't have unified engine implementation yet
      const result = await storageManager.getProjectsByStatus('active');
      
      // Should fail due to security boundaries (expected behavior)
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Path outside allowed boundaries');
      
      // Should not have unified-storage-engine metadata (confirms it's using legacy storage)
      expect(result.metadata?.filePath).not.toBe('unified-storage-engine');
      
      // Metadata should contain the temporary directory path
      expect(result.metadata?.filePath).toContain('vibe-task-manager-test-');
    });
  });
});