/**
 * Test helpers for code-map-generator tests
 */

import { OpenRouterConfig } from '../../../types/workflow.js';

/**
 * Creates a mock OpenRouterConfig object for testing
 * @param config Partial configuration to include
 * @returns A complete OpenRouterConfig object
 */
export function createMockConfig(config: Record<string, any> = {}): OpenRouterConfig {
  return {
    baseUrl: 'https://test.example.com',
    apiKey: 'test-api-key',
    geminiModel: 'test-gemini-model',
    perplexityModel: 'test-perplexity-model',
    ...config
  };
}
