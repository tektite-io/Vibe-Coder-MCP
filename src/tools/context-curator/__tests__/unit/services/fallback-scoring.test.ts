/**
 * Unit tests for Context Curator fallback scoring functionality
 * Tests the fallback scoring mechanism when LLM scoring fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContextCuratorLLMService } from '../../../services/llm-integration.js';
import type { 
  FileDiscoveryResult,
  IntentAnalysisResult
} from '../../../types/llm-tasks.js';
import type { OpenRouterConfig } from '../../../../../types/workflow.js';

// Mock the logger
vi.mock('../../../../../logger.js', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Create mocked functions that we can control
const mockPerformFormatAwareLlmCall = vi.fn();
const mockIntelligentJsonParse = vi.fn();

// Mock dependencies
vi.mock('../../../../../utils/llmHelper.js', () => ({
  performFormatAwareLlmCallWithCentralizedConfig: () => mockPerformFormatAwareLlmCall,
  intelligentJsonParse: () => mockIntelligentJsonParse
}));

vi.mock('../../../../../utils/openrouter-config-manager.js', () => ({
  OpenRouterConfigManager: {
    getInstance: vi.fn().mockReturnValue({
      getConfig: vi.fn().mockReturnValue({
        apiKey: 'test-key',
        baseUrl: 'https://test.com',
        model: 'test-model'
      })
    })
  }
}));

// Create a mock config loader instance
const mockConfigLoader = {
  getLLMModel: vi.fn().mockReturnValue('test-model')
};

vi.mock('../../../services/config-loader.js', () => ({
  ContextCuratorConfigLoader: {
    getInstance: () => mockConfigLoader
  }
}));

describe('Context Curator Fallback Scoring', () => {
  let service: ContextCuratorLLMService;
  let mockConfig: OpenRouterConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    service = ContextCuratorLLMService.getInstance();
    mockConfig = {
      apiKey: 'test-key',
      baseUrl: 'https://test.com',
      model: 'test-model'
    };
  });

  describe('Fallback Scoring Activation', () => {
    it('should apply fallback scoring when LLM call fails', async () => {
      // Mock LLM call to fail
      mockPerformFormatAwareLlmCall.mockRejectedValue(
        new Error('Network error: Unable to reach LLM service')
      );

      const mockFileDiscovery: FileDiscoveryResult = {
        relevantFiles: [
          {
            path: 'src/services/auth.service.ts',
            priority: 'high',
            reasoning: 'Core authentication service',
            confidence: 0.9,
            estimatedTokens: 1000,
            modificationLikelihood: 'high',
            strategy: 'semantic_similarity',
            priorityLevel: 'high',
            includeContent: true
          },
          {
            path: 'src/utils/helpers.ts',
            priority: 'medium',
            reasoning: 'Utility functions',
            confidence: 0.6,
            estimatedTokens: 500,
            modificationLikelihood: 'medium',
            strategy: 'keyword_matching',
            priorityLevel: 'medium',
            includeContent: true
          },
          {
            path: 'tests/auth.test.ts',
            priority: 'low',
            reasoning: 'Test file',
            confidence: 0.3,
            estimatedTokens: 300,
            modificationLikelihood: 'low',
            strategy: 'structural_analysis',
            priorityLevel: 'low',
            includeContent: false
          }
        ],
        totalFilesAnalyzed: 50,
        processingTimeMs: 1000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: 1800,
          averageConfidence: 0.6
        }
      };

      const mockIntentAnalysis: IntentAnalysisResult = {
        taskType: 'refactoring',
        confidence: 0.9,
        reasoning: ['Refactoring authentication system'],
        architecturalComponents: ['auth', 'security'],
        codebaseUnderstanding: {},
        suggestedApproach: ['Update auth service'],
        potentialChallenges: []
      };

      // Execute relevance scoring which should trigger fallback
      const result = await service.performRelevanceScoring(
        'Refactor authentication system',
        mockIntentAnalysis,
        'Refactor the authentication system to use JWT tokens',
        mockFileDiscovery,
        mockConfig
      );

      // Verify fallback scoring was applied
      expect(result).toBeDefined();
      expect(result.fileScores).toHaveLength(3);
      expect(result.scoringStrategy).toBe('hybrid'); // Fallback uses hybrid strategy
      
      // Check first file score (auth.service.ts)
      const authFileScore = result.fileScores[0];
      expect(authFileScore.filePath).toBe('src/services/auth.service.ts');
      expect(authFileScore.relevanceScore).toBeGreaterThan(0.3); // Should be boosted by heuristics
      expect(authFileScore.confidence).toBeGreaterThan(0.5);
      expect(authFileScore.reasoning).toContain('Fallback scoring');
      expect(authFileScore.categories).toContain('api'); // Should detect 'services' directory
      
      // Check test file has lower score
      const testFileScore = result.fileScores[2];
      expect(testFileScore.filePath).toBe('tests/auth.test.ts');
      expect(testFileScore.relevanceScore).toBeLessThan(authFileScore.relevanceScore);
      expect(testFileScore.categories).toContain('test');
    });

    it('should calculate higher scores for files matching user prompt keywords', async () => {
      // Mock LLM call to fail
      mockPerformFormatAwareLlmCall.mockRejectedValue(
        new Error('LLM timeout')
      );

      const mockFileDiscovery: FileDiscoveryResult = {
        relevantFiles: [
          {
            path: 'src/components/user-profile.tsx',
            priority: 'high',
            reasoning: 'User profile component',
            confidence: 0.8,
            estimatedTokens: 800,
            modificationLikelihood: 'high',
            strategy: 'semantic_similarity',
            priorityLevel: 'high',
            includeContent: true
          },
          {
            path: 'src/services/database.ts',
            priority: 'medium',
            reasoning: 'Database service',
            confidence: 0.5,
            estimatedTokens: 600,
            modificationLikelihood: 'medium',
            strategy: 'keyword_matching',
            priorityLevel: 'medium',
            includeContent: true
          }
        ],
        totalFilesAnalyzed: 30,
        processingTimeMs: 800,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: 1400,
          averageConfidence: 0.65
        }
      };

      const mockIntentAnalysis: IntentAnalysisResult = {
        taskType: 'feature_addition',
        confidence: 0.85,
        reasoning: ['Adding user profile features'],
        architecturalComponents: ['ui', 'user'],
        codebaseUnderstanding: {},
        suggestedApproach: ['Enhance user profile'],
        potentialChallenges: []
      };

      // User prompt with 'profile' keyword
      const result = await service.performRelevanceScoring(
        'Add new features to user profile component',
        mockIntentAnalysis,
        'Enhance the user profile component with social features',
        mockFileDiscovery,
        mockConfig
      );

      // Verify keyword matching boosts relevant file
      const profileScore = result.fileScores.find(s => s.filePath.includes('profile'));
      const databaseScore = result.fileScores.find(s => s.filePath.includes('database'));

      expect(profileScore).toBeDefined();
      expect(databaseScore).toBeDefined();
      expect(profileScore!.relevanceScore).toBeGreaterThan(databaseScore!.relevanceScore);
      expect(profileScore!.reasoning).toContain('keyword match');
    });

    it('should properly categorize files based on path patterns', async () => {
      // Mock LLM call to fail
      mockPerformFormatAwareLlmCall.mockRejectedValue(
        new Error('Service unavailable')
      );

      const mockFileDiscovery: FileDiscoveryResult = {
        relevantFiles: [
          { path: 'src/components/Button.tsx', priority: 'high', reasoning: 'UI component', confidence: 0.7, estimatedTokens: 200, modificationLikelihood: 'medium', strategy: 'semantic_similarity', priorityLevel: 'high', includeContent: true },
          { path: 'src/api/users.ts', priority: 'high', reasoning: 'API endpoint', confidence: 0.7, estimatedTokens: 300, modificationLikelihood: 'medium', strategy: 'semantic_similarity', priorityLevel: 'high', includeContent: true },
          { path: 'src/models/User.ts', priority: 'medium', reasoning: 'Data model', confidence: 0.6, estimatedTokens: 150, modificationLikelihood: 'low', strategy: 'semantic_similarity', priorityLevel: 'medium', includeContent: true },
          { path: 'src/utils/format.ts', priority: 'low', reasoning: 'Utility', confidence: 0.4, estimatedTokens: 100, modificationLikelihood: 'low', strategy: 'semantic_similarity', priorityLevel: 'low', includeContent: false },
          { path: 'src/hooks/useAuth.ts', priority: 'medium', reasoning: 'React hook', confidence: 0.6, estimatedTokens: 250, modificationLikelihood: 'medium', strategy: 'semantic_similarity', priorityLevel: 'medium', includeContent: true }
        ],
        totalFilesAnalyzed: 100,
        processingTimeMs: 2000,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: { totalTokens: 1000, averageConfidence: 0.6 }
      };

      const mockIntentAnalysis: IntentAnalysisResult = {
        taskType: 'general',
        confidence: 0.7,
        reasoning: ['General task'],
        architecturalComponents: [],
        codebaseUnderstanding: {},
        suggestedApproach: [],
        potentialChallenges: []
      };

      const result = await service.performRelevanceScoring(
        'Update the application',
        mockIntentAnalysis,
        'Update the application with improvements',
        mockFileDiscovery,
        mockConfig
      );

      // Verify categories are correctly assigned
      const buttonScore = result.fileScores.find(s => s.filePath.includes('Button.tsx'));
      expect(buttonScore?.categories).toContain('ui');

      const apiScore = result.fileScores.find(s => s.filePath.includes('api/users'));
      expect(apiScore?.categories).toContain('api');

      const modelScore = result.fileScores.find(s => s.filePath.includes('models/User'));
      expect(modelScore?.categories).toContain('data');

      const utilScore = result.fileScores.find(s => s.filePath.includes('utils/format'));
      expect(utilScore?.categories).toContain('utility');

      const hookScore = result.fileScores.find(s => s.filePath.includes('hooks/useAuth'));
      expect(hookScore?.categories).toContain('react');
    });

    it('should handle empty file lists gracefully', async () => {
      // Mock LLM call to fail
      mockPerformFormatAwareLlmCall.mockRejectedValue(
        new Error('Connection refused')
      );

      const mockFileDiscovery: FileDiscoveryResult = {
        relevantFiles: [],
        totalFilesAnalyzed: 0,
        processingTimeMs: 100,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: 0,
          averageConfidence: 0
        }
      };

      const mockIntentAnalysis: IntentAnalysisResult = {
        taskType: 'general',
        confidence: 0.5,
        reasoning: ['No specific task'],
        architecturalComponents: [],
        codebaseUnderstanding: {},
        suggestedApproach: [],
        potentialChallenges: []
      };

      const result = await service.performRelevanceScoring(
        'General task',
        mockIntentAnalysis,
        'General task',
        mockFileDiscovery,
        mockConfig
      );

      expect(result).toBeDefined();
      expect(result.fileScores).toHaveLength(0);
      expect(result.overallMetrics.totalFilesScored).toBe(0);
      expect(result.overallMetrics.averageRelevance).toBe(NaN); // Division by zero
    });
  });

  describe('Fallback Score Calculation Heuristics', () => {
    it('should assign higher scores to source files over test files', async () => {
      // Mock LLM call to fail
      mockPerformFormatAwareLlmCall.mockRejectedValue(
        new Error('Rate limited')
      );

      const mockFileDiscovery: FileDiscoveryResult = {
        relevantFiles: [
          {
            path: 'src/core/engine.ts',
            priority: 'high',
            reasoning: 'Core engine',
            confidence: 0.8,
            estimatedTokens: 1000,
            modificationLikelihood: 'high',
            strategy: 'semantic_similarity',
            priorityLevel: 'high',
            includeContent: true
          },
          {
            path: 'tests/core/engine.test.ts',
            priority: 'medium',
            reasoning: 'Engine tests',
            confidence: 0.6,
            estimatedTokens: 800,
            modificationLikelihood: 'medium',
            strategy: 'semantic_similarity',
            priorityLevel: 'medium',
            includeContent: true
          }
        ],
        totalFilesAnalyzed: 20,
        processingTimeMs: 500,
        searchStrategy: 'semantic_similarity',
        coverageMetrics: {
          totalTokens: 1800,
          averageConfidence: 0.7
        }
      };

      const mockIntentAnalysis: IntentAnalysisResult = {
        taskType: 'refactoring',
        confidence: 0.8,
        reasoning: ['Refactor engine'],
        architecturalComponents: ['core'],
        codebaseUnderstanding: {},
        suggestedApproach: ['Update engine'],
        potentialChallenges: []
      };

      const result = await service.performRelevanceScoring(
        'Refactor the engine module',
        mockIntentAnalysis,
        'Refactor the core engine for better performance',
        mockFileDiscovery,
        mockConfig
      );

      const sourceScore = result.fileScores.find(s => s.filePath === 'src/core/engine.ts');
      const testScore = result.fileScores.find(s => s.filePath === 'tests/core/engine.test.ts');

      expect(sourceScore).toBeDefined();
      expect(testScore).toBeDefined();
      expect(sourceScore!.relevanceScore).toBeGreaterThan(testScore!.relevanceScore);
      expect(testScore!.reasoning).toContain('Test file');
    });
  });
});