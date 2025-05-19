// src/services/routing/toolRegistry.ts
import { z } from 'zod';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js'; // Ensure OpenRouterConfig is imported
import logger from '../../logger.js';
// Removed ValidationIssue import as it's no longer exported from errors.ts
import { AppError, ValidationError } from '../../utils/errors.js';

/**
 * Defines the structure for passing contextual information to tool executors.
 */
export interface ToolExecutionContext {
  /** Identifier for the client connection (e.g., SSE session) */
  sessionId: string;
  /** The type of transport being used (stdio, sse) */
  transportType?: string;
  /** Any additional context information */
  [key: string]: unknown;
}

/**
 * Defines the function signature for executing a tool's core logic.
 * @param params The validated parameters for the tool, matching its inputSchema.
 * @param config The OpenRouter configuration, potentially needed for LLM calls within the tool.
 * @param context Optional context about the conversation or previous interactions.
 * @returns A Promise resolving to a CallToolResult object.
 */
export type ToolExecutor = (
  params: Record<string, unknown>, // Using Record<string, unknown> for better type safety
  config: OpenRouterConfig, // Ensure config parameter is here
  context?: ToolExecutionContext // Add optional context parameter
) => Promise<CallToolResult>;

/**
 * Defines the structure for registering a tool, including its metadata,
 * input validation schema, and execution logic.
 */
export interface ToolDefinition {
  /** The unique name used to identify and call the tool. */
  name: string;
  /** A description of the tool's purpose, used for LLM awareness and potentially routing. */
  description: string;
  /** The raw shape definition for the Zod schema, defining expected input parameters. */
  inputSchema: z.ZodRawShape; // Changed to store the raw shape
  /** The asynchronous function that implements the tool's core logic. */
  executor: ToolExecutor;
}

// Singleton instance will manage the tool registry

// Singleton instance holder
let instance: ToolRegistry | null = null;

/**
 * Manages the registration and execution of tools.
 * Uses Singleton pattern to ensure a single registry instance.
 */
export class ToolRegistry {
    private tools = new Map<string, ToolDefinition>();
    private config: OpenRouterConfig; // Store config if needed globally

    // Private constructor for Singleton
    private constructor(config: OpenRouterConfig) {
        this.config = config; // Store the initial config if necessary
        logger.info('ToolRegistry instance created.');
    }

    /**
     * Gets the singleton instance of the ToolRegistry.
     * Requires initial configuration on first call or will update config if provided.
     * @param config The OpenRouter configuration (required on first call or for config updates).
     * @returns The singleton ToolRegistry instance.
     */
    public static getInstance(config?: OpenRouterConfig): ToolRegistry {
        if (!instance) {
            if (!config) {
                throw new Error("ToolRegistry requires configuration on first initialization.");
            }
            instance = new ToolRegistry(config);
            logger.info('ToolRegistry initialized with configuration', {
                hasLlmMapping: Boolean(config.llm_mapping),
                mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
            });

            // Process any pending tool registrations after initial initialization
            processPendingToolRegistrations();
        } else if (config) {
            // Always update the config when provided
            instance.config = {...config}; // Make a copy to avoid reference issues
            logger.info('ToolRegistry configuration updated', {
                hasLlmMapping: Boolean(config.llm_mapping),
                mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
            });
        }
        return instance;
    }

    /**
     * Registers a tool definition.
     * @param definition The tool definition.
     */
    public registerTool(definition: ToolDefinition): void {
        if (this.tools.has(definition.name)) {
            logger.warn(`Tool "${definition.name}" is already registered. Overwriting.`);
        }
        this.tools.set(definition.name, definition);
        logger.info(`Registered tool: ${definition.name}`);
    }

    /**
     * Retrieves a tool definition by name.
     * @param toolName The name of the tool.
     * @returns The tool definition or undefined.
     */
    public getTool(toolName: string): ToolDefinition | undefined {
        return this.tools.get(toolName);
    }

    /**
     * Retrieves all registered tool definitions.
     * @returns An array of all tool definitions.
     */
    public getAllTools(): ToolDefinition[] {
        return Array.from(this.tools.values());
    }

     /**
     * Clears the tool registry. Intended for use in testing environments ONLY.
     * @internal
     */
    public clearRegistryForTesting(): void {
        if (process.env.NODE_ENV !== 'test') {
            logger.warn('Attempted to clear tool registry outside of a test environment. Operation aborted.');
            return;
        }
        this.tools.clear();
        // Reset singleton instance for testing purposes
        instance = null;
        logger.debug('Tool registry cleared for testing.');
    }
}


// --- Standalone Functions (using the Singleton instance) ---

/**
 * Registers a tool definition with the singleton registry instance.
 * @param definition The ToolDefinition object to register.
 */
export function registerTool(definition: ToolDefinition): void {
    // Store tool definition temporarily if ToolRegistry is not yet initialized
    if (!instance) {
        logger.info(`Tool "${definition.name}" registration deferred until ToolRegistry is initialized with proper config.`);
        // Store this tool definition in a queue for later registration
        pendingToolRegistrations.push(definition);
        return;
    }

    // Otherwise, register immediately with the initialized registry
    ToolRegistry.getInstance().registerTool(definition);
}

// Queue to hold tool registrations that occur before ToolRegistry is initialized
const pendingToolRegistrations: ToolDefinition[] = [];

/**
 * Process any pending tool registrations that were attempted before ToolRegistry was initialized.
 * This should be called once after ToolRegistry.getInstance is first called with the proper config.
 * @internal This is called automatically when ToolRegistry.getInstance is called with config.
 */
export function processPendingToolRegistrations(): void {
    if (!instance) {
        logger.error("Tried to process pending tool registrations but ToolRegistry is still not initialized");
        return;
    }

    const pendingCount = pendingToolRegistrations.length;
    if (pendingCount > 0) {
        logger.info(`Processing ${pendingCount} pending tool registrations`);

        // Register all pending tools
        for (const toolDef of pendingToolRegistrations) {
            ToolRegistry.getInstance().registerTool(toolDef);
        }

        // Clear the pending queue
        pendingToolRegistrations.length = 0;

        logger.info(`Successfully registered ${pendingCount} pending tools`);
    }
}

/**
 * Retrieves a tool definition from the singleton registry by its name.
 * @param toolName The name of the tool to retrieve.
 * @returns The ToolDefinition if found, otherwise undefined.
 */
export function getTool(toolName: string): ToolDefinition | undefined {
     if (!instance) {
         logger.warn("Attempted to get tool before ToolRegistry initialization.");
         return undefined;
     }
    return ToolRegistry.getInstance().getTool(toolName);
}

/**
 * Retrieves all registered tool definitions as an array from the singleton registry.
 * @returns An array containing all ToolDefinition objects currently in the registry.
 */
export function getAllTools(): ToolDefinition[] {
     if (!instance) {
         logger.warn("Attempted to get all tools before ToolRegistry initialization.");
         return [];
     }
    return ToolRegistry.getInstance().getAllTools();
}


/**
 * Finds a tool by name, validates the input parameters against its schema,
 * and executes the tool's logic with the validated parameters using the singleton registry.
 *
 * @param toolName The name of the tool to execute.
 * @param params The raw parameters received for the tool execution.
 * @param config The OpenRouter configuration, passed to the tool executor.
 * @param context Optional context object to pass to the tool executor.
 * @returns A Promise resolving to the CallToolResult from the tool's executor.
 * @throws Error if the tool is not found in the registry. Returns an error CallToolResult if validation fails or execution fails.
 */
export async function executeTool(
  toolName: string,
  params: Record<string, unknown>, // Using unknown for better type safety
  config: OpenRouterConfig, // Config now includes llmMapping
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> {
  // Log the config received by executeTool
  logger.debug({ toolName, receivedConfig: config }, 'executeTool received config object.');
  logger.info(`Attempting to execute tool: ${toolName}`);
  const toolDefinition = getTool(toolName); // Uses singleton via getTool helper

  if (!toolDefinition) {
    logger.error(`Tool "${toolName}" not found in registry.`);
    // Return a structured error indicating the tool wasn't found
    return {
      content: [{ type: 'text', text: `Error: Tool "${toolName}" not found.` }],
      isError: true,
    };
    // Or throw: throw new Error(`Tool "${toolName}" not found.`);
  }

  // Compile the raw shape into a Zod object and validate parameters
  const schemaObject = z.object(toolDefinition.inputSchema);
  const validationResult = schemaObject.safeParse(params);

  if (!validationResult.success) {
    logger.error({ tool: toolName, errors: validationResult.error.issues, paramsReceived: params }, 'Tool parameter validation failed.');
    // Create a specific ValidationError - pass Zod issues directly
    const validationError = new ValidationError(
        `Input validation failed for tool '${toolName}'`,
        validationResult.error.issues, // Pass ZodIssue[] directly
        { toolName, paramsReceived: params }
    );
    // Return structured error in CallToolResult
    return {
      content: [{ type: 'text', text: validationError.message }],
      isError: true,
      errorDetails: { // Add structured details
          type: validationError.name, // 'ValidationError'
          message: validationError.message,
          issues: validationError.validationIssues,
      }
    };
  }

  // Parameters are valid (validationResult.data contains the typed, validated data)
  logger.debug(`Executing tool "${toolName}" with validated parameters.`);
  try {
    // Pass the validated data, the received config, and context to the executor
    logger.debug({ toolName: toolName, sessionId: context?.sessionId }, `Executing tool "${toolName}" executor with context.`); // Added log line
    const result = await toolDefinition.executor(validationResult.data, config, context); // Pass config and context
    logger.info(`Tool "${toolName}" executed successfully.`);
    return result;
  } catch (error) {
    logger.error({ err: error, tool: toolName, params: validationResult.data }, `Error during execution of tool "${toolName}".`);

    let errorMessage = `Execution error in tool '${toolName}'.`;
    let errorType = 'ToolExecutionError'; // Default type
    let errorContext: Record<string, unknown> | undefined = { toolName, params: validationResult.data };

    // Check if it's one of our custom AppErrors
    if (error instanceof AppError) {
      errorMessage = `Error in tool '${toolName}': ${error.message}`;
      errorType = error.name; // Get the specific class name (e.g., 'ApiError', 'ParsingError')
      errorContext = { ...errorContext, ...error.context }; // Merge contexts
    } else if (error instanceof Error) {
      // Generic Error
      errorMessage = `Unexpected error in tool '${toolName}': ${error.message}`;
      errorType = error.name; // e.g., 'TypeError'
    } else {
      // Non-Error type thrown
       errorMessage = `Unknown execution error in tool '${toolName}'.`;
       errorType = 'UnknownExecutionError';
       errorContext.originalValue = String(error); // Log the thrown value
    }

    // Return a structured error via CallToolResult
    return {
      content: [{ type: 'text', text: errorMessage }],
      isError: true,
      errorDetails: { // Add structured details
          type: errorType,
          message: (error instanceof Error) ? error.message : String(error),
          // stack: (error instanceof Error) ? error.stack : undefined, // Optional: stack trace
          context: errorContext,
      }
    };
    // Alternative: Re-throw a specific ToolExecutionError
    // throw new ToolExecutionError(`Execution failed for tool '${toolName}'`, errorContext, error instanceof Error ? error : undefined);
  }
}

/**
 * Clears the tool registry. Intended for use in testing environments ONLY
 * to ensure test isolation.
 * @internal
 */
export function clearRegistryForTesting(): void {
    if (!instance) {
        logger.debug('Tool registry not initialized, nothing to clear for testing.');
        return;
    }
    instance.clearRegistryForTesting();
}
