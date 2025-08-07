/**
 * CLI Configuration Loader Test Suite
 * Tests for CLI configuration loading and centralized system integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  loadOpenRouterConfig, 
  getCLISecurityBoundaries, 
  initializeCLIConfiguration,
  validateEnvironment 
} from '../utils/config-loader.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { OpenRouterConfigManager } from '../../utils/openrouter-config-manager.js';
import { getUnifiedSecurityConfig, UnifiedSecurityConfigManager } from '../../tools/vibe-task-manager/security/unified-security-config.js';

// Mock the centralized systems
vi.mock('../../utils/openrouter-config-manager.js', () => ({
  OpenRouterConfigManager: {
    getInstance: vi.fn()
  }
}));

vi.mock('../../tools/vibe-task-manager/security/unified-security-config.js', () => ({
  getUnifiedSecurityConfig: vi.fn()
}));

vi.mock('../../logger.js', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('CLI Configuration Loader', () => {
  const mockConfigManager = {
    getInstance: vi.fn(),
    initialize: vi.fn(),
    getOpenRouterConfig: vi.fn(),
    validateConfiguration: vi.fn()
  };

  const mockSecurityManager = {
    getConfig: vi.fn()
  };

  const mockOpenRouterConfig: OpenRouterConfig = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: 'test-api-key',
    geminiModel: 'google/gemini-2.5-flash-preview-05-20',
    perplexityModel: 'perplexity/sonar',
    llm_mapping: {
      'default_generation': 'google/gemini-2.5-flash-preview-05-20'
    },
    env: {
      VIBE_TASK_MANAGER_READ_DIR: '/test/read',
      VIBE_CODER_OUTPUT_DIR: '/test/output'
    }
  };

  const mockSecurityConfig = {
    allowedReadDirectory: '/test/read',
    allowedWriteDirectory: '/test/output',
    securityMode: 'strict' as const
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup OpenRouterConfigManager mock
    vi.mocked(OpenRouterConfigManager.getInstance).mockReturnValue(mockConfigManager as unknown as OpenRouterConfigManager);
    mockConfigManager.initialize.mockResolvedValue(undefined);
    mockConfigManager.getOpenRouterConfig.mockResolvedValue(mockOpenRouterConfig);
    mockConfigManager.validateConfiguration.mockReturnValue({ valid: true, errors: [], warnings: [], suggestions: [] });

    // Setup UnifiedSecurityConfig mock
    vi.mocked(getUnifiedSecurityConfig).mockReturnValue(mockSecurityManager as unknown as Promise<UnifiedSecurityConfigManager>);
    mockSecurityManager.getConfig.mockReturnValue(mockSecurityConfig);
  });

  describe('loadOpenRouterConfig', () => {
    it('should load configuration through centralized manager', async () => {
      const config = await loadOpenRouterConfig();

      expect(OpenRouterConfigManager.getInstance).toHaveBeenCalled();
      expect(mockConfigManager.initialize).toHaveBeenCalled();
      expect(mockConfigManager.getOpenRouterConfig).toHaveBeenCalled();
      expect(config).toEqual(mockOpenRouterConfig);
    });

    it('should handle configuration loading errors', async () => {
      mockConfigManager.getOpenRouterConfig.mockRejectedValue(new Error('Config load failed'));

      await expect(loadOpenRouterConfig()).rejects.toThrow('Failed to load OpenRouter configuration: Config load failed');
    });

    it('should handle initialization errors', async () => {
      mockConfigManager.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(loadOpenRouterConfig()).rejects.toThrow('Failed to load OpenRouter configuration: Init failed');
    });
  });

  describe('getCLISecurityBoundaries', () => {
    it('should load security boundaries from unified config', async () => {
      const boundaries = await getCLISecurityBoundaries();

      expect(getUnifiedSecurityConfig).toHaveBeenCalled();
      expect(mockSecurityManager.getConfig).toHaveBeenCalled();
      expect(boundaries).toEqual({
        allowedReadDirectories: ['/test/read'],
        allowedWriteDirectory: '/test/output',
        securityMode: 'strict'
      });
    });

    it('should handle security config errors', async () => {
      mockSecurityManager.getConfig.mockImplementation(() => {
        throw new Error('Security config failed');
      });

      await expect(getCLISecurityBoundaries()).rejects.toThrow('Failed to load security configuration: Security config failed');
    });

    it('should handle permissive security mode', async () => {
      mockSecurityManager.getConfig.mockReturnValue({
        ...mockSecurityConfig,
        securityMode: 'permissive' as const
      });

      const boundaries = await getCLISecurityBoundaries();
      expect(boundaries.securityMode).toBe('permissive');
    });
  });

  describe('initializeCLIConfiguration', () => {
    it('should initialize both OpenRouter and security configurations', async () => {
      const result = await initializeCLIConfiguration();

      expect(result).toEqual({
        openRouterConfig: mockOpenRouterConfig,
        securityBoundaries: {
          allowedReadDirectories: ['/test/read'],
          allowedWriteDirectory: '/test/output',
          securityMode: 'strict'
        }
      });
    });

    it('should handle initialization failures gracefully', async () => {
      mockConfigManager.initialize.mockRejectedValue(new Error('Init failed'));

      await expect(initializeCLIConfiguration()).rejects.toThrow('CLI configuration initialization failed: Init failed');
    });
  });

  describe('validateEnvironment', () => {
    const originalEnv = process.env;
    const originalVersion = process.version;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
      Object.defineProperty(process, 'version', {
        value: originalVersion,
        configurable: true
      });
    });

    it('should validate successful environment', async () => {
      process.env.OPENROUTER_API_KEY = 'test-key';
      Object.defineProperty(process, 'version', {
        value: 'v20.0.0',
        configurable: true
      });

      const result = await validateEnvironment();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect Node.js version issues', async () => {
      Object.defineProperty(process, 'version', {
        value: 'v18.0.0',
        configurable: true
      });

      const result = await validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Node.js 20.0.0+ is required. Current version: v18.0.0');
    });

    it('should detect configuration validation failures', async () => {
      mockConfigManager.validateConfiguration.mockReturnValue({
        valid: false,
        errors: ['Missing API key'],
        warnings: [],
        suggestions: []
      });

      const result = await validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Configuration: Missing API key');
    });

    it('should detect security configuration failures', async () => {
      mockSecurityManager.getConfig.mockImplementation(() => {
        throw new Error('Security error');
      });

      const result = await validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('Security configuration: Security error'))).toBe(true);
    });

    it('should handle OpenRouter config loading failures', async () => {
      mockConfigManager.getOpenRouterConfig.mockRejectedValue(new Error('OpenRouter error'));

      const result = await validateEnvironment();
      expect(result.valid).toBe(false);
      expect(result.errors.some(error => error.includes('OpenRouter configuration: OpenRouter error'))).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined config manager', async () => {
      vi.mocked(OpenRouterConfigManager.getInstance).mockImplementation(() => {
        throw new Error('Config manager unavailable');
      });

      await expect(loadOpenRouterConfig()).rejects.toThrow('Failed to load OpenRouter configuration: Config manager unavailable');
    });

    it('should handle undefined security manager', async () => {
      vi.mocked(getUnifiedSecurityConfig).mockImplementation(() => {
        throw new Error('Security manager unavailable');
      });

      await expect(getCLISecurityBoundaries()).rejects.toThrow('Failed to load security configuration: Security manager unavailable');
    });
  });

  describe('Integration with Centralized Systems', () => {
    it('should use singleton pattern for configuration manager', async () => {
      await loadOpenRouterConfig();
      await loadOpenRouterConfig();
      
      // Should call getInstance twice but initialize only once per instance
      expect(OpenRouterConfigManager.getInstance).toHaveBeenCalledTimes(2);
    });

    it('should properly propagate configuration from centralized systems', async () => {
      const config = await loadOpenRouterConfig();
      const boundaries = await getCLISecurityBoundaries();

      expect(config.env?.VIBE_TASK_MANAGER_READ_DIR).toBe('/test/read');
      expect(boundaries.allowedReadDirectories[0]).toBe('/test/read');
    });
  });
});