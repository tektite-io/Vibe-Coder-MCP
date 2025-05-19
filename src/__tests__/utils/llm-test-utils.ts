/**
 * Utilities for testing LLM calls
 */

import { vi } from 'vitest';
import { OpenRouterConfig } from '../../types/workflow.js';

/**
 * Create a mock LLM response
 * @param content Response content
 * @param model Model name
 * @param usage Token usage
 * @returns Mock LLM response
 */
export function createMockLlmResponse(
  content: string,
  model: string = 'test-model',
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } = {
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
  }
) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage,
  };
}

/**
 * Create a mock LLM error
 * @param message Error message
 * @param status HTTP status code
 * @param type Error type
 * @returns Mock LLM error
 */
export function createMockLlmError(
  message: string = 'LLM API error',
  status: number = 500,
  type: string = 'api_error'
) {
  const error = new Error(message);

  Object.assign(error, {
    response: {
      status,
      data: {
        error: {
          message,
          type,
          param: null,
          code: null,
        },
      },
    },
  });

  return error;
}

/**
 * Create a mock LLM client
 * @returns Mock LLM client
 */
// Define types for LLM responses and requests
type LlmResponse = ReturnType<typeof createMockLlmResponse>;
type LlmError = ReturnType<typeof createMockLlmError>;
type LlmRequestParams = {
  model: string;
  messages: Array<{role: string; content: string}>;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
};

export function createMockLlmClient() {
  const mockResponses = new Map<string, LlmResponse>();
  const mockErrors = new Map<string, LlmError>();
  const requestHistory: LlmRequestParams[] = [];

  return {
    chat: {
      completions: {
        create: vi.fn(async (params: LlmRequestParams) => {
          const key = JSON.stringify(params);
          requestHistory.push(params);

          if (mockErrors.has(key)) {
            throw mockErrors.get(key);
          }

          if (mockResponses.has(key)) {
            return mockResponses.get(key);
          }

          // Default response if no mock is set
          return createMockLlmResponse('This is a mock response.');
        }),
      },
    },

    // Utility methods for testing
    _mockResponse: (params: LlmRequestParams, response: LlmResponse) => {
      const key = JSON.stringify(params);
      mockResponses.set(key, response);
    },

    _mockError: (params: LlmRequestParams, error: LlmError) => {
      const key = JSON.stringify(params);
      mockErrors.set(key, error);
    },

    _getRequestHistory: () => [...requestHistory],

    _reset: () => {
      mockResponses.clear();
      mockErrors.clear();
      requestHistory.length = 0;
    },
  };
}

/**
 * Create a mock OpenRouter config
 * @param apiKey API key
 * @param baseUrl Base URL
 * @param geminiModel Gemini model name
 * @param perplexityModel Perplexity model name
 * @returns Mock OpenRouter config
 */
export function createMockOpenRouterConfig(
  apiKey: string = 'test-api-key',
  baseUrl: string = 'https://api.openrouter.ai/api/v1',
  geminiModel: string = 'google/gemini-2.5-pro-exp-03-25:free',
  perplexityModel: string = 'perplexity/sonar-deep-research'
): OpenRouterConfig {
  return {
    apiKey,
    baseUrl,
    geminiModel,
    perplexityModel,
  };
}

/**
 * Mock LLM helper functions
 * @param mockResponses Map of prompt patterns to responses
 * @param mockErrors Map of prompt patterns to errors
 */
export function mockLlmHelpers(
  mockResponses: Map<string, string> = new Map(),
  mockErrors: Map<string, Error> = new Map()
) {
  vi.mock('../../utils/llmHelper.js', () => ({
    performDirectLlmCall: vi.fn(async (prompt: string, _systemPrompt: string, _config: Record<string, unknown>, _logicalTaskName: string) => {
      // Check if any error pattern matches
      for (const [pattern, error] of mockErrors.entries()) {
        if (prompt.includes(pattern)) {
          throw error;
        }
      }

      // Check if any response pattern matches
      for (const [pattern, response] of mockResponses.entries()) {
        if (prompt.includes(pattern)) {
          return response;
        }
      }

      // Default response
      return 'This is a mock LLM response.';
    }),
  }));
}

/**
 * Restore LLM helper functions
 */
export function restoreLlmHelpers() {
  vi.unmock('../../utils/llmHelper.js');
}

/**
 * Mock research helper functions
 * @param mockResponses Map of query patterns to responses
 * @param mockErrors Map of query patterns to errors
 */
export function mockResearchHelpers(
  mockResponses: Map<string, string> = new Map(),
  mockErrors: Map<string, Error> = new Map()
) {
  vi.mock('../../utils/researchHelper.js', () => ({
    performResearchQuery: vi.fn(async (query: string, _config: Record<string, unknown>) => {
      // Check if any error pattern matches
      for (const [pattern, error] of mockErrors.entries()) {
        if (query.includes(pattern)) {
          throw error;
        }
      }

      // Check if any response pattern matches
      for (const [pattern, response] of mockResponses.entries()) {
        if (query.includes(pattern)) {
          return response;
        }
      }

      // Default response
      return 'This is a mock research response.';
    }),
  }));
}

/**
 * Restore research helper functions
 */
export function restoreResearchHelpers() {
  vi.unmock('../../utils/researchHelper.js');
}
