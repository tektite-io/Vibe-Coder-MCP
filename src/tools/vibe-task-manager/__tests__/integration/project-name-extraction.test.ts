/**
 * Integration tests for project name extraction edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandGateway, type CommandContext } from '../../nl/command-gateway.js';
import { StorageManager } from '../../core/storage/storage-manager.js';
import { IdGenerator } from '../../utils/id-generator.js';
import logger from '../../../../logger.js';
import { 
  createMockStorageManager, 
  createMockIdGenerator
} from '../utils/mock-factories.js';

// Mock dependencies
vi.mock('../../core/storage/storage-manager.js');
vi.mock('../../utils/id-generator.js');
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Project Name Extraction Integration Tests', () => {
  let commandGateway: CommandGateway;
  let mockStorageManager: StorageManager;
  let mockIdGenerator: IdGenerator;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Create mocks using factory functions
    mockStorageManager = createMockStorageManager();
    mockIdGenerator = createMockIdGenerator();
    
    // Override specific mock behaviors for this test
    vi.mocked(mockStorageManager.createProject).mockResolvedValue({ success: true });
    vi.mocked(mockIdGenerator.generateProjectId).mockResolvedValue({ 
      success: true, 
      id: 'PID-TEST-001' 
    });

    // Mock the getInstance methods
    vi.mocked(StorageManager).getInstance = vi.fn().mockReturnValue(mockStorageManager);
    vi.mocked(IdGenerator).getInstance = vi.fn().mockReturnValue(mockIdGenerator);

    // Get command gateway instance
    commandGateway = CommandGateway.getInstance();
  });

  describe('Long Project Name Handling', () => {
    it('should handle the original failing case correctly', async () => {
      const input = 'Create a new project for EduPlay Connect - a web-based educational gaming platform for kids aged 6-12';
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      expect(result.success).toBe(true);
      expect(result.intent).toBe('create_project');
      
      // Verify the project name was extracted correctly (not the full description)
      const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
      expect(projectNameArg).toBe('EduPlay Connect');
      expect(projectNameArg.length).toBeLessThanOrEqual(50);
    });

    it('should handle quoted project names correctly', async () => {
      const input = 'Create project called "EduPlay Connect" for educational gaming';
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      expect(result.success).toBe(true);
      const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
      expect(projectNameArg).toBe('EduPlay Connect');
    });

    it('should truncate extremely long project names', async () => {
      const longName = 'This Is An Extremely Long Project Name That Definitely Exceeds The Fifty Character Limit And Should Be Truncated';
      const input = `Create project called ${longName}`;
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      expect(result.success).toBe(true);
      const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
      expect(projectNameArg.length).toBeLessThanOrEqual(50);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          originalLength: expect.any(Number),
          truncatedLength: expect.any(Number)
        }),
        'Project name truncated to meet 50 character limit'
      );
    });

    it('should handle project names with special characters', async () => {
      const input = 'Create project ABC-123_v2.0 for testing';
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      expect(result.success).toBe(true);
      const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
      expect(projectNameArg).toBe('ABC-123_v2.0');
    });

    it('should handle multi-language project names', async () => {
      const input = 'Create project 测试项目 for testing';
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      expect(result.success).toBe(true);
      // Should fall back to single word pattern for non-ASCII
      const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
      expect(projectNameArg).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle project names at exactly 50 characters', async () => {
      const exactName = 'A'.repeat(50);
      const input = `Create project ${exactName}`;
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      expect(result.success).toBe(true);
      const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
      expect(projectNameArg).toBe(exactName);
      expect(projectNameArg.length).toBe(50);
    });

    it('should handle empty project name gracefully', async () => {
      const input = 'Create project ""';
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      // Should fail validation
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('Project name is required');
    });

    it('should handle project name with only stop words', async () => {
      const input = 'Create project for the with using';
      
      const context: Partial<CommandContext> = {
        sessionId: 'test-session',
        conversationHistory: [],
        userPreferences: {}
      };
      
      const result = await commandGateway.processCommand(input, context);
      
      // Should extract something meaningful or fail gracefully
      if (result.success) {
        const projectNameArg = vi.mocked(mockIdGenerator.generateProjectId).mock.calls[0]?.[0];
        expect(projectNameArg).toBeDefined();
        expect(projectNameArg.length).toBeGreaterThan(0);
      }
    });
  });
});