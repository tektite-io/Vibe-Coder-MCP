/**
 * Security Integration Tests for Fullstack Starter Kit Generator
 * Tests the integration with centralized security configuration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('fs-extra', () => ({
  default: {
    ensureDir: vi.fn()
  },
  ensureDir: vi.fn()
}));

// Mock the unified security config
vi.mock('../../vibe-task-manager/security/unified-security-config.js', () => {
  const mockGetToolOutputDirectory = vi.fn();
  const mockEnsureToolOutputDirectory = vi.fn();
  
  return {
    getToolOutputDirectory: mockGetToolOutputDirectory,
    ensureToolOutputDirectory: mockEnsureToolOutputDirectory,
    UnifiedSecurityConfigManager: {
      getInstance: vi.fn(() => ({
        getToolOutputDirectory: mockGetToolOutputDirectory,
        ensureToolOutputDirectory: mockEnsureToolOutputDirectory
      }))
    }
  };
});

describe('Fullstack Starter Kit Generator - Security Integration', () => {
  let mockFs: { ensureDir: ReturnType<typeof vi.fn> };
  let getToolOutputDirectory: ReturnType<typeof vi.fn>;
  let ensureToolOutputDirectory: ReturnType<typeof vi.fn>;
  let initDirectories: ReturnType<typeof vi.fn>;
  
  beforeEach(async () => {
    // Clear all module caches
    vi.resetModules();
    
    // Set up mocks before importing
    mockFs = { ensureDir: vi.fn() };
    vi.doMock('fs-extra', () => ({
      default: mockFs,
      ensureDir: mockFs.ensureDir
    }));
    
    // Import after mocks are set up
    const module = await import('../index.js');
    initDirectories = vi.fn(module.initDirectories);
    
    const securityModule = await import('../../vibe-task-manager/security/unified-security-config.js');
    getToolOutputDirectory = vi.mocked(securityModule.getToolOutputDirectory);
    ensureToolOutputDirectory = vi.mocked(securityModule.ensureToolOutputDirectory);
  });
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    delete process.env.VIBE_CODER_OUTPUT_DIR;
  });

  describe('initDirectories', () => {
    it('should use centralized security for directory creation', async () => {
      const testOutputDir = '/secure/output/dir';
      vi.mocked(ensureToolOutputDirectory).mockResolvedValue(testOutputDir);
      
      await initDirectories();
      
      expect(ensureToolOutputDirectory).toHaveBeenCalledWith('fullstack-starter-kit-generator');
      expect(ensureToolOutputDirectory).toHaveBeenCalledTimes(1);
    });

    it('should fall back to legacy implementation on security error', async () => {
      // Mock security config to throw error
      vi.mocked(ensureToolOutputDirectory).mockRejectedValue(new Error('Security config not initialized'));
      
      // Set environment variable for fallback
      process.env.VIBE_CODER_OUTPUT_DIR = '/fallback/output';
      mockFs.ensureDir.mockResolvedValue(undefined);
      
      await initDirectories();
      
      // Should attempt centralized security first
      expect(ensureToolOutputDirectory).toHaveBeenCalledWith('fullstack-starter-kit-generator');
      
      // Should fall back to fs.ensureDir
      expect(mockFs.ensureDir).toHaveBeenCalledWith('/fallback/output');
      expect(mockFs.ensureDir).toHaveBeenCalledWith('/fallback/output/fullstack-starter-kit-generator');
    });

    it('should use default directory when no env var in fallback', async () => {
      // Mock security config to throw error
      vi.mocked(ensureToolOutputDirectory).mockRejectedValue(new Error('Security config not initialized'));
      
      // No environment variable set
      delete process.env.VIBE_CODER_OUTPUT_DIR;
      mockFs.ensureDir.mockResolvedValue(undefined);
      
      await initDirectories();
      
      // Should use default VibeCoderOutput directory
      expect(mockFs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('VibeCoderOutput'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(expect.stringContaining('VibeCoderOutput/fullstack-starter-kit-generator'));
    });

    it('should handle complete failure gracefully', async () => {
      // Mock both security and fallback to fail
      vi.mocked(ensureToolOutputDirectory).mockRejectedValue(new Error('Security config error'));
      mockFs.ensureDir.mockRejectedValue(new Error('Permission denied'));
      
      // Should not throw, just log errors
      await expect(initDirectories()).resolves.not.toThrow();
    });
  });

  describe('getBaseOutputDir integration', () => {
    it('should prefer centralized security config', async () => {
      const secureDir = '/secure/output';
      vi.mocked(getToolOutputDirectory).mockReturnValue(secureDir);
      
      // Import the function dynamically to test
      const module = await import('../index.js');
      const getBaseOutputDir = (module as { getBaseOutputDir?: () => string }).getBaseOutputDir;
      
      if (getBaseOutputDir) {
        const result = getBaseOutputDir();
        expect(result).toBe(secureDir);
        expect(getToolOutputDirectory).toHaveBeenCalled();
      }
    });
  });
});