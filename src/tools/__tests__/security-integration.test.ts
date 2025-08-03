/**
 * Integration Tests for Centralized Security Configuration
 * Tests that all tools properly integrate with the unified security system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  UnifiedSecurityConfigManager,
  getToolOutputDirectory,
  ensureToolOutputDirectory,
  createSecureToolOutputPath
} from '../vibe-task-manager/security/unified-security-config.js';
import { OpenRouterConfig } from '../../types/workflow.js';

// Mock dependencies
vi.mock('../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('../vibe-task-manager/utils/config-loader.js', () => ({
  extractVibeTaskManagerSecurityConfig: vi.fn(() => ({
    allowedReadDirectory: '/test/read-dir',
    allowedWriteDirectory: '/test/write-dir',
    securityMode: 'strict' as const
  }))
}));

describe('Centralized Security Configuration Integration', () => {
  let securityManager: UnifiedSecurityConfigManager;
  let mockMCPConfig: OpenRouterConfig;
  
  beforeEach(() => {
    // Reset singleton
    (UnifiedSecurityConfigManager as unknown as { instance: null }).instance = null;
    
    // Setup mock config
    mockMCPConfig = {
      apiKey: 'test-key',
      baseUrl: 'test-url',
      geminiModel: 'test-model',
      perplexityModel: 'test-model'
    } as OpenRouterConfig;
    
    // Initialize
    securityManager = UnifiedSecurityConfigManager.getInstance();
    securityManager.initializeFromMCPConfig(mockMCPConfig);
  });

  describe('Tool Output Directory Functions', () => {
    it('should provide consistent output directory across all convenience functions', () => {
      const managerOutputDir = securityManager.getToolOutputDirectory();
      const functionOutputDir = getToolOutputDirectory();
      
      expect(managerOutputDir).toBe('/test/write-dir');
      expect(functionOutputDir).toBe('/test/write-dir');
      expect(managerOutputDir).toBe(functionOutputDir);
    });

    it('should create secure paths consistently', () => {
      const relativePath = 'my-tool/output.json';
      const managerPath = securityManager.createSecureToolOutputPath(relativePath);
      const functionPath = createSecureToolOutputPath(relativePath);
      
      expect(managerPath).toBe(functionPath);
      expect(managerPath).toContain('/test/write-dir');
      expect(managerPath).toContain('my-tool/output.json');
    });

    it('should validate tool names in ensureToolOutputDirectory', async () => {
      // Mock fs-extra
      vi.doMock('fs-extra', () => ({
        default: { ensureDir: vi.fn().mockResolvedValue(undefined) },
        ensureDir: vi.fn().mockResolvedValue(undefined)
      }));

      // Valid tool name
      const validToolDir = await ensureToolOutputDirectory('valid-tool-name');
      expect(validToolDir).toBe('/test/write-dir/valid-tool-name');

      // Invalid tool name with path traversal
      await expect(
        ensureToolOutputDirectory('../malicious-tool')
      ).rejects.toThrow('Invalid tool directory');
    });
  });

  describe('Security Boundary Enforcement', () => {
    it('should enforce write boundaries for all tool operations', () => {
      const testCases = [
        { path: 'tool/file.json', shouldPass: true },
        { path: '../outside/file.json', shouldPass: false },
        { path: '/absolute/path/file.json', shouldPass: false },
        { path: '../../etc/passwd', shouldPass: false }
      ];

      testCases.forEach(({ path, shouldPass }) => {
        if (shouldPass) {
          expect(() => createSecureToolOutputPath(path)).not.toThrow();
        } else {
          expect(() => createSecureToolOutputPath(path)).toThrow();
        }
      });
    });

    it('should provide consistent security validation across all methods', () => {
      const maliciousPath = '../../../etc/passwd';
      
      // All methods should reject the same malicious path
      expect(() => securityManager.createSecureToolOutputPath(maliciousPath)).toThrow();
      expect(() => createSecureToolOutputPath(maliciousPath)).toThrow();
      
      // The error should indicate security violation
      try {
        createSecureToolOutputPath(maliciousPath);
      } catch (error) {
        expect(error.message).toContain('Security violation');
      }
    });
  });

  describe('Environment Variable Handling', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should handle environment variables consistently', () => {
      process.env.TEST_OUTPUT_DIR = '/custom/output';
      
      const value1 = securityManager.getEnvironmentVariable('TEST_OUTPUT_DIR');
      const value2 = securityManager.getEnvironmentVariable('TEST_OUTPUT_DIR', '/default');
      
      expect(value1).toBe('/custom/output');
      expect(value2).toBe('/custom/output');
      
      delete process.env.TEST_OUTPUT_DIR;
      
      const value3 = securityManager.getEnvironmentVariable('TEST_OUTPUT_DIR', '/default');
      expect(value3).toBe('/default');
    });
  });

  describe('Tool Migration Patterns', () => {
    it('should support gradual migration with fallback patterns', () => {
      // This tests the pattern used in all migrated tools
      const getBaseOutputDir = () => {
        try {
          return getToolOutputDirectory();
        } catch {
          // Fallback for backward compatibility
          return process.env.VIBE_CODER_OUTPUT_DIR || '/default/output';
        }
      };

      // When security is configured
      expect(getBaseOutputDir()).toBe('/test/write-dir');

      // Reset security config to test fallback
      securityManager.reset();
      process.env.VIBE_CODER_OUTPUT_DIR = '/env/output';
      
      expect(getBaseOutputDir()).toBe('/env/output');
    });
  });
});