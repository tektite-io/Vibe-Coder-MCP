import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PromptService, PromptType, getPrompt, getPromptService } from '../../services/prompt-service.js';
import { readFile } from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn()
}));

// Mock yaml
vi.mock('yaml', () => ({
  default: {
    parse: vi.fn()
  }
}));

// Mock logger
vi.mock('../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('PromptService', () => {
  let promptService: PromptService;
  let mockReadFile: any;
  let mockYamlParse: any;

  beforeEach(async () => {
    // Clear singleton instance
    (PromptService as any).instance = undefined;
    promptService = PromptService.getInstance();

    const fs = await import('fs/promises');
    const yaml = await import('yaml');

    mockReadFile = vi.mocked(fs.readFile);
    mockYamlParse = vi.mocked(yaml.default.parse);

    // Clear cache before each test
    promptService.clearCache();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = PromptService.getInstance();
      const instance2 = PromptService.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should work with convenience function', () => {
      const instance1 = getPromptService();
      const instance2 = PromptService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('getPrompt', () => {
    const mockPromptConfig = {
      system_prompt: 'Main system prompt for testing',
      atomic_detection_prompt: 'Atomic detection specific prompt',
      context_integration_prompt: 'Context integration prompt',
      coordination_prompt: 'Coordination prompt',
      escalation_prompt: 'Escalation prompt',
      fallback_prompt: 'Fallback prompt',
      version: '1.0',
      last_updated: '2024-01-20',
      compatibility: ['test-compatibility']
    };

    beforeEach(() => {
      mockReadFile.mockResolvedValue('mock yaml content');
      mockYamlParse.mockReturnValue(mockPromptConfig);
    });

    it('should load decomposition prompt', async () => {
      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toBe(mockPromptConfig.system_prompt);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('decomposition-prompt.yaml'),
        'utf-8'
      );
    });

    it('should load atomic detection prompt', async () => {
      const prompt = await promptService.getPrompt('atomic_detection');
      expect(prompt).toBe(mockPromptConfig.atomic_detection_prompt);
    });

    it('should load context integration prompt', async () => {
      const prompt = await promptService.getPrompt('context_integration');
      expect(prompt).toBe(mockPromptConfig.context_integration_prompt);
    });

    it('should load agent system prompt', async () => {
      const prompt = await promptService.getPrompt('agent_system');
      expect(prompt).toBe(mockPromptConfig.system_prompt);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('agent-system-prompt.yaml'),
        'utf-8'
      );
    });

    it('should load coordination prompt', async () => {
      const prompt = await promptService.getPrompt('coordination');
      expect(prompt).toBe(mockPromptConfig.coordination_prompt);
    });

    it('should load escalation prompt', async () => {
      const prompt = await promptService.getPrompt('escalation');
      expect(prompt).toBe(mockPromptConfig.escalation_prompt);
    });

    it('should load intent recognition prompt', async () => {
      const prompt = await promptService.getPrompt('intent_recognition');
      expect(prompt).toBe(mockPromptConfig.system_prompt);
      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('intent-recognition-prompt.yaml'),
        'utf-8'
      );
    });

    it('should load fallback prompt', async () => {
      const prompt = await promptService.getPrompt('fallback');
      expect(prompt).toBe(mockPromptConfig.fallback_prompt);
    });

    it('should fall back to system prompt when specific prompt is missing', async () => {
      const configWithoutSpecificPrompts = {
        system_prompt: 'Main system prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockYamlParse.mockReturnValue(configWithoutSpecificPrompts);

      const prompt = await promptService.getPrompt('atomic_detection');
      expect(prompt).toBe(configWithoutSpecificPrompts.system_prompt);
    });

    it('should cache loaded prompts', async () => {
      await promptService.getPrompt('decomposition');
      await promptService.getPrompt('decomposition');

      // Should only read file once due to caching
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should return fallback prompt on error', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });

    it('should handle invalid prompt type', async () => {
      const prompt = await promptService.getPrompt('invalid_type' as PromptType);
      expect(prompt).toContain('I\'m not sure what you\'d like me to do');
    });
  });

  describe('prompt validation', () => {
    it('should validate prompt configuration', async () => {
      const validConfig = {
        system_prompt: 'Valid prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(validConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toBe(validConfig.system_prompt);
    });

    it('should reject configuration without system_prompt', async () => {
      const invalidConfig = {
        version: '1.0',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(invalidConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });

    it('should reject configuration without version', async () => {
      const invalidConfig = {
        system_prompt: 'Valid prompt',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(invalidConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });

    it('should reject configuration without compatibility', async () => {
      const invalidConfig = {
        system_prompt: 'Valid prompt',
        version: '1.0'
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(invalidConfig);

      const prompt = await promptService.getPrompt('decomposition');
      expect(prompt).toContain('expert software development task decomposition specialist');
    });
  });

  describe('cache management', () => {
    beforeEach(() => {
      const mockConfig = {
        system_prompt: 'Test prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(mockConfig);
    });

    it('should clear cache', async () => {
      await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      promptService.clearCache();
      await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });

    it('should reload specific prompt', async () => {
      await promptService.getPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(1);

      await promptService.reloadPrompt('decomposition');
      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('metadata and utilities', () => {
    const mockConfig = {
      system_prompt: 'Test prompt',
      version: '1.0',
      last_updated: '2024-01-20',
      compatibility: ['test-compatibility']
    };

    beforeEach(() => {
      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(mockConfig);
    });

    it('should get prompt metadata', async () => {
      const metadata = await promptService.getPromptMetadata('decomposition');

      expect(metadata).toEqual({
        version: '1.0',
        lastUpdated: '2024-01-20',
        compatibility: ['test-compatibility']
      });
    });

    it('should list available prompt types', () => {
      const types = promptService.getAvailablePromptTypes();

      expect(types).toContain('decomposition');
      expect(types).toContain('atomic_detection');
      expect(types).toContain('agent_system');
      expect(types).toContain('intent_recognition');
      expect(types.length).toBeGreaterThan(0);
    });

    it('should validate all prompts', async () => {
      const result = await promptService.validateAllPrompts();

      expect(result.valid).toContain('decomposition');
      expect(result.valid).toContain('agent_system');
      // Since we're mocking file reads, some prompts may fail validation
      expect(result.valid.length).toBeGreaterThan(0);
    });

    it('should handle validation failures', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const result = await promptService.validateAllPrompts();

      // Since getPrompt catches errors and returns fallback prompts,
      // validation failures won't actually fail - they'll return valid fallback prompts
      expect(result.valid.length).toBeGreaterThan(0);
      expect(result.invalid.length).toBe(0);
    });

    it('should substitute variables in prompts', async () => {
      const configWithVariables = {
        system_prompt: 'Hello {{name}}, your task is {{task}}',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockYamlParse.mockReturnValue(configWithVariables);

      const prompt = await promptService.getPromptWithVariables('decomposition', {
        name: 'Agent',
        task: 'implement feature'
      });

      expect(prompt).toBe('Hello Agent, your task is implement feature');
    });
  });

  describe('convenience functions', () => {
    it('should work with getPrompt convenience function', async () => {
      const mockConfig = {
        system_prompt: 'Test prompt',
        version: '1.0',
        last_updated: '2024-01-20',
        compatibility: ['test']
      };

      mockReadFile.mockResolvedValue('yaml content');
      mockYamlParse.mockReturnValue(mockConfig);

      const prompt = await getPrompt('decomposition');
      expect(prompt).toBe(mockConfig.system_prompt);
    });
  });
});
