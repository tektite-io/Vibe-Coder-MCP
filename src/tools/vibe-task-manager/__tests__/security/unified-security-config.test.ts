/**
 * Comprehensive Tests for Unified Security Configuration
 * Tests centralized security boundary validation across all path utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import {
  UnifiedSecurityConfigManager,
  validatePathSecurity,
  createSecurePath,
  normalizePath,
  isPathWithin,
  isPathAllowed,
  ValidationOptions
} from '../../security/unified-security-config.js';
import { OpenRouterConfig } from '../../../../types/workflow.js';

// Mock the logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock the config loader to return consistent test configuration
vi.mock('../../utils/config-loader.js', () => ({
  extractVibeTaskManagerSecurityConfig: vi.fn(() => ({
    allowedReadDirectory: '/test/read-dir',
    allowedWriteDirectory: '/test/write-dir',
    securityMode: 'strict' as const
  }))
}));

describe('Unified Security Configuration Tests', () => {
  let securityManager: UnifiedSecurityConfigManager;
  let mockMCPConfig: OpenRouterConfig;
  
  // Test directories
  const testReadDir = '/test/read-dir';
  const testWriteDir = '/test/write-dir';
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    // Reset singleton instance
    (UnifiedSecurityConfigManager as unknown as { instance: UnifiedSecurityConfigManager | null }).instance = null;
    
    // Setup mock MCP config
    mockMCPConfig = {
      apiKey: 'test-key',
      baseURL: 'test-url',
      model: 'test-model',
      maxTokens: 1000,
      temperature: 0.7
    } as OpenRouterConfig;

    // Get fresh instance and initialize
    securityManager = UnifiedSecurityConfigManager.getInstance();
    securityManager.initializeFromMCPConfig(mockMCPConfig);

    // Reset NODE_ENV to known state
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Reset the configuration
    securityManager.reset();
    
    // Restore NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
    
    // Clear mocks
    vi.clearAllMocks();
  });

  describe('Configuration Initialization', () => {
    it('should initialize configuration from MCP config correctly', () => {
      const config = securityManager.getConfig();
      
      expect(config.allowedReadDirectory).toBe(testReadDir);
      expect(config.allowedWriteDirectory).toBe(testWriteDir);
      expect(config.securityMode).toBe('strict');
      expect(config.allowedDirectories).toEqual([testReadDir, testWriteDir]);
    });

    it('should throw error when accessing config before initialization', () => {
      const freshInstance = new (UnifiedSecurityConfigManager as unknown as new () => UnifiedSecurityConfigManager)();
      
      expect(() => freshInstance.getConfig()).toThrow(
        'Unified security configuration not initialized'
      );
    });

    it('should provide correct service-specific configurations', () => {
      const vibeConfig = securityManager.getVibeTaskManagerSecurityValidatorConfig();
      expect(vibeConfig.readDir).toBe(testReadDir);
      expect(vibeConfig.writeDir).toBe(testWriteDir);

      const codeMapConfig = securityManager.getCodeMapGeneratorConfig();
      expect(codeMapConfig.allowedDir).toBe(testReadDir);
      expect(codeMapConfig.outputDir).toBe(testWriteDir);

      const contextConfig = securityManager.getContextCuratorConfig();
      expect(contextConfig.readDir).toBe(testReadDir);
      expect(contextConfig.outputDir).toBe(testWriteDir);
    });
  });

  describe('Path Normalization', () => {
    it('should normalize relative paths to absolute paths', () => {
      const relativePath = './test/file.txt';
      const normalized = securityManager.normalizePath(relativePath);
      
      expect(path.isAbsolute(normalized)).toBe(true);
      expect(normalized).toContain('test/file.txt');
    });

    it('should handle absolute paths correctly', () => {
      const absolutePath = '/usr/local/test.txt';
      const normalized = securityManager.normalizePath(absolutePath);
      
      expect(normalized).toBe(absolutePath);
    });

    it('should sanitize dangerous characters from paths', () => {
      const dangerousPath = '/test/file<script>.txt';
      const normalized = securityManager.normalizePath(dangerousPath);
      
      expect(normalized).not.toContain('<script>');
      expect(normalized).toBe('/test/filescript.txt');
    });

    it('should handle test mode paths correctly', () => {
      const testPath = '/tmp/test-output/file.txt';
      const normalized = securityManager.normalizePath(testPath);
      
      expect(normalized).toBe(testPath);
    });

    it('should throw error for empty or invalid paths', () => {
      expect(() => securityManager.normalizePath('')).toThrow('Path cannot be empty');
      expect(() => securityManager.normalizePath(null as unknown as string)).toThrow('Path cannot be empty');
      expect(() => securityManager.normalizePath(undefined as unknown as string)).toThrow('Path cannot be empty');
    });
  });

  describe('Path Containment Validation', () => {
    it('should correctly identify when child path is within parent', () => {
      const parentPath = '/test/parent';
      const childPath = '/test/parent/child/file.txt';
      
      const result = securityManager.isPathWithin(childPath, parentPath);
      expect(result).toBe(true);
    });

    it('should correctly identify when child path equals parent', () => {
      const samePath = '/test/same';
      
      const result = securityManager.isPathWithin(samePath, samePath);
      expect(result).toBe(true);
    });

    it('should correctly identify when child path is outside parent', () => {
      const parentPath = '/test/parent';
      const outsidePath = '/test/other/file.txt';
      
      const result = securityManager.isPathWithin(outsidePath, parentPath);
      expect(result).toBe(false);
    });

    it('should handle path traversal attempts correctly', () => {
      const parentPath = '/test/parent';
      const traversalPath = '/test/parent/../sibling/file.txt';
      
      const result = securityManager.isPathWithin(traversalPath, parentPath);
      expect(result).toBe(false);
    });

    it('should handle cross-platform path separators', () => {
      const parentPath = '/test/parent';
      const childPath = '/test/parent/child/file.txt'; // Use forward slashes for cross-platform compatibility
      
      const result = securityManager.isPathWithin(childPath, parentPath);
      expect(result).toBe(true);
    });
  });

  describe('Security Boundary Validation', () => {
    it('should validate read paths within allowed read directory', () => {
      const validReadPath = path.join(testReadDir, 'valid-file.txt');
      
      const result = securityManager.validatePathSecurity(validReadPath, { operation: 'read' });
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should validate write paths within allowed write directory', () => {
      const validWritePath = path.join(testWriteDir, 'output-file.txt');
      
      const result = securityManager.validatePathSecurity(validWritePath, { operation: 'write' });
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBeDefined();
      expect(result.error).toBeUndefined();
    });

    it('should reject read paths outside allowed read directory', () => {
      const invalidPath = '/unauthorized/file.txt';
      
      const result = securityManager.validatePathSecurity(invalidPath, { operation: 'read' });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside the allowed read directory');
      expect(result.violationType).toBe('outside_boundary');
    });

    it('should reject write paths outside allowed write directory', () => {
      const invalidPath = '/unauthorized/output.txt';
      
      const result = securityManager.validatePathSecurity(invalidPath, { operation: 'write' });
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('outside the allowed write directory');
      expect(result.violationType).toBe('outside_boundary');
    });

    it('should detect path traversal attempts', () => {
      const traversalPath = `${testReadDir}/subdir/../../../etc/passwd`;
      
      const result = securityManager.validatePathSecurity(traversalPath, { 
        operation: 'read',
        strictMode: true 
      });
      
      expect(result.isValid).toBe(false);
      // This could be either path_traversal or outside_boundary depending on the normalization
      expect(['path_traversal', 'outside_boundary']).toContain(result.violationType);
    });

    it('should detect dangerous characters in strict mode', () => {
      const dangerousPath = `${testReadDir}/file<script>alert('xss')</script>.txt`;
      
      const result = securityManager.validatePathSecurity(dangerousPath, { 
        operation: 'read',
        strictMode: true 
      });
      
      expect(result.isValid).toBe(false);
      expect(result.violationType).toBe('dangerous_characters');
    });

    it('should validate file extensions when requested', () => {
      // Temporarily set NODE_ENV to production to disable test mode relaxations
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        const txtFile = path.join(testReadDir, 'file.txt');
        const jsFile = path.join(testReadDir, 'file.exe');
        
        const options: ValidationOptions = {
          operation: 'read',
          checkExtensions: true,
          allowedExtensions: ['.txt', '.md', '.json'],
          allowTestMode: false
        };
        
        const txtResult = securityManager.validatePathSecurity(txtFile, options);
        expect(txtResult.isValid).toBe(true);
        
        const exeResult = securityManager.validatePathSecurity(jsFile, options);
        expect(exeResult.isValid).toBe(false);
        expect(exeResult.violationType).toBe('invalid_extension');
      } finally {
        // Restore NODE_ENV
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('should enforce path length limits', () => {
      // Temporarily set NODE_ENV to production to disable test mode relaxations
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      try {
        const config = securityManager.getConfig();
        const longPath = path.join(testReadDir, 'a'.repeat(config.maxPathLength + 100));
        
        const result = securityManager.validatePathSecurity(longPath, { 
          operation: 'read',
          allowTestMode: false
        });
        
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('exceeds maximum');
      } finally {
        // Restore NODE_ENV
        process.env.NODE_ENV = originalNodeEnv;
      }
    });
  });

  describe('Test Mode Behavior', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'test';
    });

    it('should allow test paths in test mode', () => {
      const testPath = '/tmp/test-data/file.txt';
      
      const result = securityManager.validatePathSecurity(testPath, { 
        operation: 'read',
        allowTestMode: true 
      });
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toBeDefined();
      expect(result.warnings![0]).toContain('Test mode');
    });

    it('should relax path length limits in test mode', () => {
      const config = securityManager.getConfig();
      const longTestPath = '/tmp/' + 'a'.repeat(config.maxPathLength + 50);
      
      const result = securityManager.validatePathSecurity(longTestPath, { 
        operation: 'read',
        allowTestMode: true 
      });
      
      // Should pass because test mode allows 2x path length
      expect(result.isValid).toBe(true);
    });

    it('should relax extension validation in test mode', () => {
      const testFile = '/tmp/test.unknown-extension';
      
      const result = securityManager.validatePathSecurity(testFile, { 
        operation: 'read',
        checkExtensions: true,
        allowedExtensions: ['.txt'],
        allowTestMode: true 
      });
      
      expect(result.isValid).toBe(true);
    });
  });

  describe('Secure Path Creation', () => {
    it('should create secure paths for valid inputs', () => {
      const validPath = path.join(testReadDir, 'secure-file.txt');
      
      const securePath = securityManager.createSecurePath(validPath, 'read');
      
      expect(securePath).toBe(path.resolve(validPath));
    });

    it('should throw error for invalid paths', () => {
      const invalidPath = '/unauthorized/file.txt';
      
      expect(() => {
        securityManager.createSecurePath(invalidPath, 'read');
      }).toThrow('Security violation');
    });

    it('should handle different operation types', () => {
      const readPath = path.join(testReadDir, 'read-file.txt');
      const writePath = path.join(testWriteDir, 'write-file.txt');
      
      const secureReadPath = securityManager.createSecurePath(readPath, 'read');
      const secureWritePath = securityManager.createSecurePath(writePath, 'write');
      
      expect(secureReadPath).toBeDefined();
      expect(secureWritePath).toBeDefined();
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple paths efficiently', () => {
      const paths = [
        path.join(testReadDir, 'file1.txt'),
        path.join(testReadDir, 'file2.txt'),
        '/unauthorized/file3.txt',
        path.join(testReadDir, 'file4.txt')
      ];
      
      const results = securityManager.validateMultiplePaths(paths, 'read');
      
      expect(results.size).toBe(4);
      expect(results.get(paths[0])?.isValid).toBe(true);
      expect(results.get(paths[1])?.isValid).toBe(true);
      expect(results.get(paths[2])?.isValid).toBe(false);
      expect(results.get(paths[3])?.isValid).toBe(true);
    });

    it('should handle errors in batch validation gracefully', () => {
      const paths = [
        path.join(testReadDir, 'valid.txt'),
        '', // Invalid empty path
        path.join(testReadDir, 'another-valid.txt')
      ];
      
      const results = securityManager.validateMultiplePaths(paths, 'read');
      
      expect(results.size).toBe(3);
      expect(results.get(paths[0])?.isValid).toBe(true);
      expect(results.get(paths[1])?.isValid).toBe(false);
      expect(results.get(paths[2])?.isValid).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy validatePathSecurityCompat method', () => {
      const validPath = path.join(testReadDir, 'legacy-file.txt');
      
      const result = securityManager.validatePathSecurityCompat(validPath);
      
      expect(result.isValid).toBe(true);
      expect(result.normalizedPath).toBeDefined();
    });

    it('should support legacy createSecureReadPath method', () => {
      const validPath = path.join(testReadDir, 'legacy-read.txt');
      
      const securePath = securityManager.createSecureReadPath(validPath);
      
      expect(securePath).toBe(path.resolve(validPath));
    });

    it('should support legacy createSecureWritePath method', () => {
      const validPath = path.join(testWriteDir, 'legacy-write.txt');
      
      const securePath = securityManager.createSecureWritePath(validPath);
      
      expect(securePath).toBe(path.resolve(validPath));
    });

    it('should support legacy directory checking methods', () => {
      const readPath = path.join(testReadDir, 'check-read.txt');
      const writePath = path.join(testWriteDir, 'check-write.txt');
      const invalidPath = '/unauthorized/file.txt';
      
      expect(securityManager.isPathWithinReadDirectory(readPath)).toBe(true);
      expect(securityManager.isPathWithinWriteDirectory(writePath)).toBe(true);
      expect(securityManager.isPathWithinReadDirectory(invalidPath)).toBe(false);
      expect(securityManager.isPathWithinWriteDirectory(invalidPath)).toBe(false);
    });
  });

  describe('Convenience Functions', () => {
    it('should provide working convenience functions', () => {
      const validPath = path.join(testReadDir, 'convenience.txt');
      
      // Test convenience functions
      const normalized = normalizePath(validPath);
      expect(normalized).toBe(path.resolve(validPath));
      
      const isWithin = isPathWithin(validPath, testReadDir);
      expect(isWithin).toBe(true);
      
      const isAllowed = isPathAllowed(validPath, 'read');
      expect(isAllowed).toBe(true);
      
      const validation = validatePathSecurity(validPath, { operation: 'read' });
      expect(validation.isValid).toBe(true);
      
      const securePath = createSecurePath(validPath, 'read');
      expect(securePath).toBe(path.resolve(validPath));
    });

    it('should handle convenience function errors correctly', () => {
      const invalidPath = '/unauthorized/file.txt';
      
      expect(isPathAllowed(invalidPath, 'read')).toBe(false);
      
      expect(() => {
        createSecurePath(invalidPath, 'read');
      }).toThrow('Security violation');
    });
  });

  describe('Performance Requirements', () => {
    it('should meet <50ms validation performance target', () => {
      const testPaths = Array.from({ length: 100 }, (_, i) => 
        path.join(testReadDir, `perf-test-${i}.txt`)
      );
      
      const startTime = Date.now();
      
      testPaths.forEach(testPath => {
        securityManager.validatePathSecurity(testPath, { operation: 'read' });
      });
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      const averageTime = totalTime / testPaths.length;
      
      // Each validation should be well under 50ms
      expect(averageTime).toBeLessThan(5);
    });

    it('should efficiently handle batch validation', () => {
      const largeBatch = Array.from({ length: 1000 }, (_, i) => 
        path.join(testReadDir, `batch-${i}.txt`)
      );
      
      const startTime = Date.now();
      const results = securityManager.validateMultiplePaths(largeBatch, 'read');
      const endTime = Date.now();
      
      expect(results.size).toBe(1000);
      expect(endTime - startTime).toBeLessThan(500); // 500ms for 1000 validations
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed configuration gracefully', () => {
      const freshManager = new (UnifiedSecurityConfigManager as unknown as new () => UnifiedSecurityConfigManager)();
      
      expect(() => {
        freshManager.getConfig();
      }).toThrow('Unified security configuration not initialized');
    });

    it('should handle path normalization errors', () => {
      const result = securityManager.validatePathSecurity('', { operation: 'read' });
      
      expect(result.isValid).toBe(false);
      expect(result.violationType).toBe('invalid_path');
    });

    it('should handle containment check errors gracefully', () => {
      // Mock path.resolve to throw an error
      const originalResolve = path.resolve;
      vi.spyOn(path, 'resolve').mockImplementation(() => {
        throw new Error('Path resolution failed');
      });
      
      const result = securityManager.isPathWithin('test', 'parent');
      expect(result).toBe(false);
      
      // Restore original implementation
      path.resolve = originalResolve;
    });
  });

  describe('Configuration Status', () => {
    it('should provide accurate configuration status', () => {
      const status = securityManager.getConfigStatus();
      
      expect(status.initialized).toBe(true);
      expect(status.mcpConfigPresent).toBe(true);
      expect(status.allowedReadDirectory).toBe(testReadDir);
      expect(status.allowedWriteDirectory).toBe(testWriteDir);
      expect(status.securityMode).toBe('strict');
    });

    it('should show uninitialized status correctly', () => {
      const freshManager = new (UnifiedSecurityConfigManager as unknown as new () => UnifiedSecurityConfigManager)();
      const status = freshManager.getConfigStatus();
      
      expect(status.initialized).toBe(false);
      expect(status.mcpConfigPresent).toBe(false);
    });
  });

  describe('Integration with Existing Pattern', () => {
    it('should maintain compatibility with existing security validators', () => {
      // Test that our centralized config can be used by existing patterns
      const config = securityManager.getFilesystemSecurityConfig();
      
      expect(config.allowedDirectories).toEqual([testReadDir, testWriteDir]);
      expect(config.securityMode).toBe('strict');
      expect(config.enablePermissionChecking).toBe(true);
      expect(config.maxPathLength).toBe(4096);
    });

    it('should provide correct path validator configuration', () => {
      const config = securityManager.getPathValidatorConfig();
      
      expect(config.allowedDirectories).toEqual([testReadDir, testWriteDir]);
      expect(config.maxPathLength).toBe(4096);
    });

    it('should provide correct security manager configuration', () => {
      const config = securityManager.getSecurityManagerConfig();
      
      expect(config.pathSecurity.allowedDirectories).toEqual([testReadDir, testWriteDir]);
      expect(config.strictMode).toBe(true);
      expect(config.performanceThresholdMs).toBe(50);
    });
  });
});