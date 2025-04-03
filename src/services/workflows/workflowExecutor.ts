// src/services/workflows/workflowExecutor.ts
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url'; // Need this for relative pathing in ES Modules
// import { z } from 'zod'; // Removed unused import
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { executeTool } from '../routing/toolRegistry.js'; // Adjust path if necessary
import { OpenRouterConfig } from '../../types/workflow.js'; // Adjust path if necessary
import logger from '../../logger.js'; // Adjust path if necessary
import { AppError, ToolExecutionError, ConfigurationError, ParsingError } from '../../utils/errors.js'; // Adjust path if necessary

// --- Interfaces ---

/** Defines a single step within a workflow template. */
interface WorkflowStep {
  /** Unique identifier for this step within the workflow. */
  id: string;
  /** The name of the tool to execute for this step. */
  toolName: string;
  /** Parameters for the tool, where values can be static or template strings. */
  params: Record<string, string>; // Values are templates like "{workflow.input.xyz}" or "{steps.id.output...}"
}

/** Defines the structure of a workflow template. */
interface WorkflowDefinition {
  /** A description of what the workflow achieves. */
  description: string;
  /** Optional schema defining expected inputs for the entire workflow. */
  inputSchema?: Record<string, string>; // Simple type check for now
  /** Ordered array of steps to execute. */
  steps: WorkflowStep[];
  /** Optional template defining the structure of the final workflow output. */
  output?: Record<string, string>;
}

/** Defines the expected structure of the workflows JSON file. */
interface WorkflowFileFormat {
  /** A map where keys are workflow names and values are WorkflowDefinition objects. */
  workflows: Record<string, WorkflowDefinition>;
}

/** Defines the result structure returned by executeWorkflow. */
export interface WorkflowResult {
  /** Indicates if the workflow completed all steps successfully. */
  success: boolean;
  /** A summary message indicating the outcome. */
  message: string;
  /** Optional: The processed final output based on the workflow's output template. */
  outputs?: Record<string, unknown>;
  /** Optional: Raw results of each executed step, keyed by step ID. */
  stepResults?: Map<string, CallToolResult>;
  /** Optional: Details about the error if the workflow failed. */
  error?: {
    /** The ID of the step where the error occurred. */
    stepId?: string;
    /** The name of the tool that failed. */
    toolName?: string;
    /** The error message. */
    message: string;
    /** Additional error details, if available. */
    details?: Record<string, unknown>;
  };
}

// --- Store for loaded definitions ---
let loadedWorkflows = new Map<string, WorkflowDefinition>();

// --- Calculate default path relative to this file ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Go up three levels (src/services/workflows -> src/services -> src -> project root)
const defaultWorkflowPath = path.resolve(__dirname, '../../../workflows.json');

/**
 * Loads and performs basic validation on workflow definitions from a JSON file.
 * Clears existing loaded workflows before attempting to load.
 * Logs warnings or errors but does not throw if loading fails, allowing the server to start.
 * @param filePath Path to the workflows JSON file. Defaults to 'workflows.json' in the project root.
 */
export function loadWorkflowDefinitions(filePath: string = defaultWorkflowPath): void {
  logger.info(`Attempting to load workflow definitions from: ${filePath}`);
  loadedWorkflows = new Map(); // Clear previous definitions first

  try {
    if (!fs.existsSync(filePath)) {
      logger.warn(`Workflow definition file not found: ${filePath}. No workflows loaded.`);
      return;
    }
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const workflowData: WorkflowFileFormat = JSON.parse(fileContent);

    // Basic structural validation
    if (!workflowData || typeof workflowData.workflows !== 'object' || workflowData.workflows === null) {
      throw new ConfigurationError('Invalid workflow file format: Root "workflows" object missing or invalid.');
    }

    // TODO: Add more robust validation using Zod for the WorkflowFileFormat structure
    //       This would involve defining Zod schemas for WorkflowDefinition, WorkflowStep etc.
    //       and parsing workflowData against that schema.

    loadedWorkflows = new Map(Object.entries(workflowData.workflows));
    logger.info(`Successfully loaded ${loadedWorkflows.size} workflow definitions.`);

  } catch (error) {
    logger.error({ err: error, filePath }, 'Failed to load or parse workflow definitions. Workflows will be unavailable.');
    // Clear workflows again in case of partial loading before error
    loadedWorkflows = new Map();
    // Consider re-throwing if workflow loading is critical:
    // if (error instanceof Error) {
    //     throw new ConfigurationError(`Failed to load workflows from ${filePath}: ${error.message}`, undefined, error);
    // } else {
    //     throw new ConfigurationError(`Failed to load workflows from ${filePath}: Unknown error.`);
    // }
  }
}

/**
 * Resolves a parameter value template string against workflow inputs and step outputs.
 * Handles simple path traversal for step outputs (e.g., `content[0].text`).
 *
 * @param valueTemplate Template string (e.g., "{workflow.input.xyz}", "{steps.id.output.content[0].text}") or a literal value.
 * @param workflowInput The initial input object provided to the workflow.
 * @param stepOutputs A Map containing results (CallToolResult) from previously executed steps, keyed by step ID.
 * @returns The resolved value.
 * @throws {ParsingError} if the template syntax is invalid or the referenced data cannot be found.
 */
function resolveParamValue(
  valueTemplate: unknown, 
  workflowInput: Record<string, unknown>, 
  stepOutputs: Map<string, CallToolResult>
): unknown {
  if (typeof valueTemplate !== 'string') {
    return valueTemplate; // Return non-strings (like numbers, booleans, objects from template) directly
  }

  const match = valueTemplate.match(/^{(workflow\.input\.([\w-]+))|(steps\.([\w-]+)\.output\.(.+))}$/);
  if (!match) {
    return valueTemplate; // Not a template, return as literal string
  }

  try {
      if (match[1]) { // workflow.input match (e.g., {workflow.input.productDescription})
          const inputKey = match[2];
          if (workflowInput && typeof workflowInput === 'object' && inputKey in workflowInput) {
              logger.debug(`Resolved template '${valueTemplate}' from workflow input key '${inputKey}'.`);
              // Use type assertion to tell TypeScript that this access is valid
              // We've already checked that inputKey exists in workflowInput
              return workflowInput[inputKey as keyof typeof workflowInput];
          }
          throw new ParsingError(`Workflow input key "${inputKey}" not found for template '${valueTemplate}'.`);
      } else if (match[3]) { // steps match (e.g., {steps.step1_id.output.content[0].text})
          const stepId = match[4];
          const outputPath = match[5]; // e.g., 'content[0].text' or 'errorDetails.message'
          const stepResult = stepOutputs.get(stepId);

          if (!stepResult) {
              throw new ParsingError(`Output from step "${stepId}" not found (required for template '${valueTemplate}'). Ensure step IDs match and the step executed.`);
          }

          // Basic path traversal - handle potential errors gracefully
          let currentValue: unknown = stepResult;
          // Split by '.' or array access like '[0]'
          const pathParts = outputPath.match(/([^[.\]]+)|\[(\d+)\]/g);
          if (!pathParts) {
              throw new ParsingError(`Invalid output path format '${outputPath}' in template '${valueTemplate}'.`);
          }

          for (const part of pathParts) {
              if (currentValue === null || currentValue === undefined) {
                   throw new ParsingError(`Cannot access path part '${part}' in '${outputPath}' from step '${stepId}' output because parent value is null or undefined. Template: '${valueTemplate}'.`);
              }
              const arrayMatch = part.match(/^\[(\d+)\]$/);
              if (arrayMatch) { // Array index like '[0]'
                  const index = parseInt(arrayMatch[1], 10);
                  if (!Array.isArray(currentValue) || index >= currentValue.length) {
                      throw new ParsingError(`Index ${index} out of bounds for array in path '${outputPath}' from step '${stepId}'. Template: '${valueTemplate}'.`);
                  }
                  currentValue = currentValue[index];
              } else { // Object key
                  if (typeof currentValue !== 'object' || currentValue === null || !(part in currentValue)) {
                       throw new ParsingError(`Key '${part}' not found in object path '${outputPath}' from step '${stepId}'. Template: '${valueTemplate}'.`);
                  }
                  // Use a type assertion to access the property after we've verified it exists
                  currentValue = (currentValue as Record<string, unknown>)[part];
              }
          }

          if (currentValue === undefined) {
             // It's possible for a valid path to resolve to undefined. Log and return it.
             logger.warn(`Resolved path '${outputPath}' resulted in undefined for step '${stepId}'. Template: '${valueTemplate}'`);
          }
          logger.debug(`Resolved template '${valueTemplate}' from step '${stepId}' output path '${outputPath}'.`);
          return currentValue;
      }
  } catch (error) {
      if (error instanceof ParsingError) throw error; // Re-throw known parsing errors
      logger.error({ err: error, template: valueTemplate }, `Error resolving parameter template`);
      // Wrap unexpected errors
      throw new ParsingError(`Unexpected error resolving template "${valueTemplate}": ${error instanceof Error ? error.message : String(error)}`);
  }

  // Should not be reached if regex matches correctly
  logger.warn(`Template '${valueTemplate}' matched regex but failed to resolve logic.`);
  return valueTemplate; // Fallback to literal
}


/**
 * Executes a predefined workflow by its name.
 * Iterates through the steps, resolves parameters, executes tools, and handles errors.
 *
 * @param workflowName The name of the workflow (must be loaded).
 * @param workflowInput Input data for the workflow, matching its inputSchema.
 * @param config OpenRouter configuration passed to tools.
 * @param sessionId Optional session ID for potential future state logging (currently unused).
 * @returns A promise resolving to the WorkflowResult.
 */
export async function executeWorkflow(
  workflowName: string,
  workflowInput: Record<string, unknown>,
  config: OpenRouterConfig,
  sessionId?: string // Optional for logging/state
): Promise<WorkflowResult> {
  const workflow = loadedWorkflows.get(workflowName);
  if (!workflow) {
    logger.error(`Workflow "${workflowName}" not found.`);
    return { success: false, message: `Workflow "${workflowName}" not found.`, error: { message: `Workflow "${workflowName}" not found.`} };
  }

  logger.info({ workflowName, sessionId }, `Starting workflow execution.`);
  // Use Map for step outputs as it preserves insertion order if needed, and allows any string key
  const stepOutputs = new Map<string, CallToolResult>();
  let currentStepIndex = 0;
  let currentStep: WorkflowStep | undefined;

  try {
     // TODO: Optional: Validate workflowInput against workflow.inputSchema here if defined

    for (const step of workflow.steps) {
      currentStep = step; // Keep track of the current step for error reporting
      currentStepIndex++;
      logger.info({ workflowName, sessionId, stepId: step.id, toolName: step.toolName, stepNum: currentStepIndex }, `Executing workflow step ${currentStepIndex}/${workflow.steps.length}`);

      // Resolve parameters for this step
      const resolvedParams: Record<string, unknown> = {};
      for (const [key, template] of Object.entries(step.params)) {
         try {
            resolvedParams[key] = resolveParamValue(template, workflowInput, stepOutputs);
            logger.debug(`Resolved param '${key}' for step '${step.id}'`);
         } catch (resolveError) {
             // If a parameter cannot be resolved, fail the workflow immediately
              logger.error({ err: resolveError, workflowName, sessionId, stepId: step.id, paramKey: key, template }, `Failed to resolve parameter`);
              throw new AppError(`Failed to resolve parameter '${key}' for step '${step.id}': ${(resolveError as Error).message}`, { stepId: step.id, paramKey: key }, resolveError instanceof Error ? resolveError : undefined);
         }
      }

      // Execute the tool for this step
      // Note: We are NOT passing conversational context (ToolExecutionContext) here.
      // Workflow execution context (stepOutputs) is managed separately.
      const stepResult = await executeTool(step.toolName, resolvedParams, config);

      // Store the result, keyed by step ID
      stepOutputs.set(step.id, stepResult);

      // Check for errors from the tool execution
      if (stepResult.isError) {
        logger.error({ workflowName, sessionId, stepId: step.id, toolName: step.toolName, errorResult: stepResult }, `Workflow step failed.`);
         // Propagate the error, adding workflow context
         throw new ToolExecutionError(`Step '${step.id}' (Tool: ${step.toolName}) failed: ${stepResult.content[0]?.text || 'Unknown tool error'}`, { stepId: step.id, toolName: step.toolName, toolResult: stepResult });
      }

      logger.debug({ stepId: step.id, toolName: step.toolName }, `Workflow step completed successfully.`);
    } // End loop through steps

    // Process final output if defined
    let finalOutputData: Record<string, unknown> | undefined;
    let finalMessage = `Workflow "${workflowName}" completed successfully.`;
    if (workflow.output) {
       finalOutputData = {};
       logger.debug(`Processing final workflow output template for ${workflowName}`);
       for (const [key, template] of Object.entries(workflow.output)) {
            try {
                 finalOutputData[key] = resolveParamValue(template, workflowInput, stepOutputs);
                 if (key === 'summary' && typeof finalOutputData[key] === 'string') {
                    finalMessage = finalOutputData[key]; // Use template summary if available
                 }
            } catch (resolveError) {
                 logger.warn({ err: resolveError, key, template }, `Could not resolve output template key '${key}' for workflow ${workflowName}. Skipping.`);
                 // Include error in the output for visibility
                 finalOutputData[key] = `Error: Failed to resolve output template - ${(resolveError as Error).message}`;
            }
       }
    }


    logger.info({ workflowName, sessionId }, `Workflow execution finished successfully.`);
    return {
      success: true,
      message: finalMessage,
      outputs: finalOutputData,
      stepResults: stepOutputs, // Include raw results for debugging/auditing
    };

  } catch (error) {
     // Catch errors from parameter resolution or tool execution
     logger.error({ err: error, workflowName, sessionId, failedStepId: currentStep?.id, failedToolName: currentStep?.toolName }, `Workflow execution failed.`);
     const errDetails = {
        stepId: currentStep?.id,
        toolName: currentStep?.toolName,
        message: error instanceof Error ? error.message : 'Unknown workflow execution error',
        details: error instanceof AppError ? error.context : undefined,
     };

     return {
       success: false,
       message: `Workflow "${workflowName}" failed at step ${currentStepIndex} (${currentStep?.toolName || 'N/A'}): ${errDetails.message}`,
       stepResults: stepOutputs, // Include results up to the point of failure
       error: errDetails,
     };
  }
}

// --- Load definitions on server startup ---
// Ensures workflows are ready when the server starts.
// Consider making this async if validation becomes complex or involves I/O.
loadWorkflowDefinitions();
