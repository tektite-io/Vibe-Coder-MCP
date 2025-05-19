/**
 * Utilities for testing tools and routing
 */

import { vi } from 'vitest';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create a mock tool result
 * @param content Result content
 * @param isError Whether the result is an error
 * @param errorDetails Error details
 * @returns Mock tool result
 */
export function createMockToolResult(
  content: string | { text: string }[] = 'Tool executed successfully',
  isError: boolean = false,
  errorDetails: Record<string, unknown> | null = null
): CallToolResult {
  return {
    content: Array.isArray(content)
      ? content.map(item => ({ ...item, type: 'text' }))
      : [{ type: 'text', text: content }],
    isError,
    errorDetails,
  };
}

/**
 * Create a mock async tool result
 * @param jobId Job ID
 * @param message Message
 * @param pollInterval Poll interval
 * @returns Mock async tool result
 */
export function createMockAsyncToolResult(
  jobId: string = 'mock-job-id',
  message: string = 'Tool execution started',
  pollInterval: number = 1000
) {
  return {
    jobId,
    message,
    pollInterval,
  };
}

/**
 * Create a mock tool
 * @param name Tool name
 * @param isAsync Whether the tool is asynchronous
 * @param result Tool result
 * @param error Error to throw
 * @returns Mock tool
 */
export function createMockTool(
  name: string,
  isAsync: boolean = false,
  result: CallToolResult | ReturnType<typeof createMockAsyncToolResult> | null = null,
  error: Error | null = null
) {
  return {
    name,
    description: `Mock ${isAsync ? 'asynchronous' : 'synchronous'} tool`,
    execute: vi.fn(async (_params: Record<string, unknown>, _config: Record<string, unknown>, _context: Record<string, unknown>) => {
      if (error) {
        throw error;
      }

      if (result) {
        return result;
      }

      if (isAsync) {
        return createMockAsyncToolResult();
      } else {
        return createMockToolResult();
      }
    }),
    isAsync,
  };
}

/**
 * Create a mock tool registry
 * @returns Mock tool registry
 */
export function createMockToolRegistry() {
  const tools = new Map<string, ReturnType<typeof createMockTool>>();

  return {
    registerTool: vi.fn((tool: ReturnType<typeof createMockTool>) => {
      tools.set(tool.name, tool);
    }),

    executeTool: vi.fn(async (name: string, params: Record<string, unknown>, config: Record<string, unknown>, context: Record<string, unknown>) => {
      const tool = tools.get(name);

      if (!tool) {
        return createMockToolResult(`Tool not found: ${name}`, true, {
          message: `Tool not found: ${name}`,
          type: 'ToolNotFoundError',
        });
      }

      try {
        return await tool.execute(params, config, context);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return createMockToolResult(`Error executing tool: ${errorMessage}`, true, {
          message: errorMessage,
          type: 'ToolExecutionError',
          cause: error,
        });
      }
    }),

    clearRegistryForTesting: vi.fn(() => {
      tools.clear();
    }),

    // Utility methods for testing
    _tools: tools,

    _reset: () => {
      tools.clear();
    },

    _addTool: (tool: ReturnType<typeof createMockTool>) => {
      tools.set(tool.name, tool);
    },

    _removeTool: (name: string) => {
      tools.delete(name);
    },
  };
}

/**
 * Mock tool registry
 * @param mockToolRegistry Mock tool registry
 */
export function mockToolRegistry(mockToolRegistry: ReturnType<typeof createMockToolRegistry>) {
  vi.mock('../../services/routing/toolRegistry.js', () => ({
    registerTool: mockToolRegistry.registerTool,
    executeTool: mockToolRegistry.executeTool,
    clearRegistryForTesting: mockToolRegistry.clearRegistryForTesting,
  }));
}

/**
 * Restore tool registry
 */
export function restoreToolRegistry() {
  vi.unmock('../../services/routing/toolRegistry.js');
}

/**
 * Create a mock request processor
 * @returns Mock request processor
 */
export function createMockRequestProcessor() {
  return {
    processRequest: vi.fn(async (request: Record<string, unknown>, sessionId: string, _transportType: string = 'stdio') => {
      return createMockToolResult(`Processed request for tool: ${request.name}`);
    }),
  };
}

/**
 * Mock request processor
 * @param mockRequestProcessor Mock request processor
 */
export function mockRequestProcessor(mockRequestProcessor: ReturnType<typeof createMockRequestProcessor>) {
  vi.mock('../../services/request-processor/index.js', () => ({
    processRequest: mockRequestProcessor.processRequest,
  }));
}

/**
 * Restore request processor
 */
export function restoreRequestProcessor() {
  vi.unmock('../../services/request-processor/index.js');
}

/**
 * Create a mock workflow executor
 * @returns Mock workflow executor
 */
// Define a type for workflow definitions
type WorkflowDefinition = {
  name: string;
  description: string;
  steps: Array<{
    id: string;
    tool: string;
    params: Record<string, unknown>;
  }>;
  [key: string]: unknown;
};

export function createMockWorkflowExecutor() {
  const workflows = new Map<string, WorkflowDefinition>();

  return {
    executeWorkflow: vi.fn(async (workflowName: string, _workflowInput: Record<string, unknown>, _config: Record<string, unknown>, _context: Record<string, unknown>) => {
      if (!workflows.has(workflowName)) {
        return {
          success: false,
          message: `Workflow not found: ${workflowName}`,
          error: {
            message: `Workflow not found: ${workflowName}`,
            type: 'WorkflowNotFoundError',
          },
        };
      }

      return {
        success: true,
        message: 'Workflow completed ok.',
        outputs: { result: 'Success' },
      };
    }),

    loadWorkflowDefinitions: vi.fn(async () => {
      const result: Record<string, WorkflowDefinition> = {};

      for (const [name, workflow] of workflows.entries()) {
        result[name] = workflow;
      }

      return result;
    }),

    // Utility methods for testing
    _workflows: workflows,

    _reset: () => {
      workflows.clear();
    },

    _addWorkflow: (name: string, workflow: WorkflowDefinition) => {
      workflows.set(name, workflow);
    },

    _removeWorkflow: (name: string) => {
      workflows.delete(name);
    },
  };
}

/**
 * Mock workflow executor
 * @param mockWorkflowExecutor Mock workflow executor
 */
export function mockWorkflowExecutor(mockWorkflowExecutor: ReturnType<typeof createMockWorkflowExecutor>) {
  vi.mock('../../services/workflows/workflowExecutor.js', () => ({
    executeWorkflow: mockWorkflowExecutor.executeWorkflow,
    loadWorkflowDefinitions: mockWorkflowExecutor.loadWorkflowDefinitions,
  }));
}

/**
 * Restore workflow executor
 */
export function restoreWorkflowExecutor() {
  vi.unmock('../../services/workflows/workflowExecutor.js');
}
