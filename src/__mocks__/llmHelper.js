/**
 * Enhanced Centralized LLM Helper Mock for Testing Infrastructure
 * 
 * Provides comprehensive mocking for all LLM operations with format-aware responses.
 * Handles all patterns found in the codebase audit to prevent mock conflicts.
 */

import { vi } from 'vitest';

// Valid functional areas from the system
const FUNCTIONAL_AREAS = [
  'authentication',
  'user-management', 
  'content-management',
  'data-management',
  'integration',
  'admin',
  'ui-components',
  'performance'
];

// Response templates for different LLM operations
const RESPONSE_TEMPLATES = {
  epic_identification: {
    epics: [
      {
        name: "User Authentication System",
        functionalArea: "authentication",
        description: "Complete user authentication and authorization system",
        priority: "high",
        estimatedComplexity: "medium"
      },
      {
        name: "Content Management Framework", 
        functionalArea: "content-management",
        description: "Content creation, editing, and management system",
        priority: "medium",
        estimatedComplexity: "high"
      },
      {
        name: "API Integration Layer",
        functionalArea: "integration", 
        description: "External API integration and data synchronization",
        priority: "medium",
        estimatedComplexity: "medium"
      }
    ]
  },
  
  task_decomposition: {
    contextualInsights: {
      codebaseAlignment: "Mock alignment with existing patterns",
      researchIntegration: "Mock research integration",
      technologySpecifics: "TypeScript, Node.js, Vitest",
      estimationFactors: "Mock estimation factors"
    },
    tasks: [
      {
        title: "Mock decomposed task",
        description: "Mock task description for testing",
        type: "development",
        priority: "medium",
        estimatedHours: 2,
        filePaths: ["src/mock/file.ts"],
        acceptanceCriteria: ["Mock acceptance criterion"],
        tags: ["mock", "test"],
        dependencies: [],
        contextualNotes: {
          codebaseReferences: "Mock codebase references",
          researchJustification: "Mock research justification",
          integrationConsiderations: "Mock integration considerations",
          riskMitigation: "Mock risk mitigation"
        }
      },
      {
        title: "Mock task 2",
        description: "Another mock task for testing",
        type: "testing",
        priority: "low",
        estimatedHours: 1,
        filePaths: ["src/mock/test.ts"],
        acceptanceCriteria: ["Mock test criterion"],
        tags: ["test"],
        dependencies: []
      }
    ]
  },

  atomic_analysis: {
    isAtomic: true,
    confidence: 0.8,
    reasoning: "Task meets atomic criteria based on mock analysis",
    estimatedHours: 0.2,
    complexityFactors: ["Single responsibility", "Clear scope"],
    recommendations: ["Add unit tests", "Consider edge cases"]
  },

  research_evaluation: {
    decision: {
      shouldTriggerResearch: false,
      confidence: 0.8,
      primaryReason: "sufficient_context",
      reasoning: "Mock research evaluation for testing"
    },
    recommendedScope: {
      estimatedQueries: 0,
      priority: "low"
    }
  },

  intent_recognition: {
    intent: "create_task",
    confidence: 0.9,
    entities: [
      {
        type: "task_type",
        value: "development",
        confidence: 0.8
      }
    ],
    parameters: {
      title: "Mock recognized task",
      description: "Mock task from intent recognition"
    }
  }
};

// Advanced mock queue for complex test scenarios
let mockQueue = [];
let queueIndex = 0;

export function queueMockResponse(response) {
  mockQueue.push(response);
}

export function queueMultipleMockResponses(responses) {
  mockQueue.push(...responses);
}

export function clearMockQueue() {
  mockQueue = [];
  queueIndex = 0;
}

export function getNextQueuedResponse() {
  if (queueIndex < mockQueue.length) {
    return mockQueue[queueIndex++];
  }
  return null;
}

// Enhanced format-aware mock implementation
export const performFormatAwareLlmCall = vi.fn().mockImplementation(
  (prompt, system, config, logicalTaskName, expectedFormat) => {
    // Check for queued responses first
    const queuedResponse = getNextQueuedResponse();
    if (queuedResponse) {
      return Promise.resolve(
        expectedFormat === 'json' ? JSON.stringify(queuedResponse) : queuedResponse
      );
    }

    // Handle specific logical task names
    if (logicalTaskName === 'epic_identification' && expectedFormat === 'json') {
      return Promise.resolve(JSON.stringify(RESPONSE_TEMPLATES.epic_identification));
    }
    
    if (logicalTaskName === 'task_decomposition' || logicalTaskName?.includes('decomposition')) {
      if (expectedFormat === 'json') {
        return Promise.resolve(JSON.stringify(RESPONSE_TEMPLATES.task_decomposition));
      } else {
        return Promise.resolve(`# Mock Task Decomposition\n\n1. Mock Task 1\n2. Mock Task 2`);
      }
    }

    if (logicalTaskName?.includes('atomic') || prompt?.includes('atomic') || prompt?.includes('isAtomic')) {
      // Enhanced atomic analysis based on task content
      if (prompt?.includes('Create a simple button') || prompt?.includes('single component') || prompt?.includes('Frontend component')) {
        return Promise.resolve(JSON.stringify({
          isAtomic: true,
          confidence: 0.85,
          reasoning: "Task has clear scope and can be completed in estimated time",
          estimatedHours: 0.1,
          complexityFactors: ["Frontend component"],
          recommendations: ["Add unit tests", "Consider error handling"]
        }));
      }
      
      if (prompt?.includes('Create user management') || prompt?.includes('multiple modules') || prompt?.includes('complex system')) {
        return Promise.resolve(JSON.stringify({
          isAtomic: false,
          confidence: 0.2,
          reasoning: "Task involves multiple components and exceeds atomic criteria",
          estimatedHours: 8,
          complexityFactors: ["Multiple modules", "Complex integration"],
          recommendations: ["Task exceeds 20-minute atomic criteria", "Split into separate tasks"]
        }));
      }
      
      // Default atomic analysis
      return Promise.resolve(JSON.stringify(RESPONSE_TEMPLATES.atomic_analysis));
    }

    if (logicalTaskName?.includes('research') || prompt?.includes('research') || prompt?.includes('shouldTriggerResearch')) {
      return Promise.resolve(JSON.stringify(RESPONSE_TEMPLATES.research_evaluation));
    }

    if (logicalTaskName?.includes('intent') || prompt?.includes('intent')) {
      return Promise.resolve(JSON.stringify(RESPONSE_TEMPLATES.intent_recognition));
    }

    // Pattern-based responses for prompts without specific task names
    if (prompt?.includes('task') && (prompt?.includes('complex') || prompt?.includes('break') || prompt?.includes('split'))) {
      const response = {
        tasks: [
          {
            title: "Fallback decomposed task",
            description: "Fallback mock task description",
            type: "development",
            priority: "medium",
            estimatedHours: 2,
            filePaths: ["src/fallback/mock.ts"],
            acceptanceCriteria: ["Fallback acceptance criterion"],
            tags: ["fallback", "mock"],
            dependencies: []
          }
        ]
      };
      return Promise.resolve(expectedFormat === 'json' ? JSON.stringify(response) : JSON.stringify(response));
    }

    // Default response based on format
    if (expectedFormat === 'json') {
      const response = {
        result: "Mock LLM response for testing with centralized config",
        confidence: 0.9,
        reasoning: "Mock reasoning for test environment"
      };
      return Promise.resolve(JSON.stringify(response));
    }
    
    // Default markdown response
    return Promise.resolve("# Mock Response\n\nThis is a mock response for testing purposes.");
  }
);

// Mock other llmHelper functions with consistent patterns
export const performDirectLlmCall = vi.fn().mockImplementation(async (prompt, config, options) => {
  // Simulate different response types based on prompt content
  if (prompt?.includes('atomic')) {
    return JSON.stringify(RESPONSE_TEMPLATES.atomic_analysis);
  }
  
  if (prompt?.includes('research')) {
    return JSON.stringify(RESPONSE_TEMPLATES.research_evaluation);
  }
  
  return JSON.stringify({
    result: "Mock direct LLM response",
    timestamp: Date.now()
  });
});

export const llmCall = vi.fn().mockResolvedValue("Mock LLM response");

export const performLLMCall = vi.fn().mockResolvedValue("Mock LLM response");

export const performResearchCall = vi.fn().mockImplementation(async (query, config) => {
  return JSON.stringify({
    results: [
      {
        title: "Mock Research Result",
        content: "Mock research content for testing",
        relevance: 0.9,
        source: "mock-source"
      }
    ],
    query,
    totalResults: 1
  });
});

// Enhanced context-aware call (if exists in some files)
export const performContextAwareLlmCall = vi.fn().mockImplementation(async (prompt, context, config) => {
  const contextType = context?.type || 'general';
  
  return JSON.stringify({
    result: `Mock context-aware response for ${contextType}`,
    context: context,
    confidence: 0.85
  });
});

// Utility functions for test setup
export function resetAllMocks() {
  clearMockQueue();
  performFormatAwareLlmCall.mockClear();
  performDirectLlmCall.mockClear();
  llmCall.mockClear();
  performLLMCall.mockClear();
  performResearchCall.mockClear();
  performContextAwareLlmCall.mockClear();
}

export function mockLLMFailure(error = new Error('Mock LLM failure')) {
  performFormatAwareLlmCall.mockRejectedValueOnce(error);
  performDirectLlmCall.mockRejectedValueOnce(error);
}

export function mockLLMTimeout() {
  const timeoutError = new Error('LLM call timed out');
  timeoutError.code = 'TIMEOUT';
  mockLLMFailure(timeoutError);
}

// Export all functions for comprehensive coverage
export default {
  performFormatAwareLlmCall,
  performDirectLlmCall,
  llmCall,
  performLLMCall,
  performResearchCall,
  performContextAwareLlmCall,
  
  // Queue management
  queueMockResponse,
  queueMultipleMockResponses,
  clearMockQueue,
  getNextQueuedResponse,
  
  // Utility functions
  resetAllMocks,
  mockLLMFailure,
  mockLLMTimeout,
  
  // Response templates for custom mocking
  RESPONSE_TEMPLATES,
  FUNCTIONAL_AREAS
};