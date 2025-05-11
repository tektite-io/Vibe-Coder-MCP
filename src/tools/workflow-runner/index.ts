// src/tools/workflow-runner/index.ts
// import { z } from 'zod'; // Removed unused import
import { WorkflowRunnerInput, workflowRunnerInputSchema } from './schema.js'; // Import schema and type from sibling file
import { OpenRouterConfig } from '../../types/workflow.js'; // Import common config type
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js'; // Import MCP result type
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import registry functions and types (Added ToolExecutionContext)
import { executeWorkflow, WorkflowResult } from '../../services/workflows/workflowExecutor.js'; // Import the core workflow execution function
import { AppError, ToolExecutionError } from '../../utils/errors.js'; // Import base error type, ToolExecutionError
import logger from '../../logger.js'; // Import logger
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'; // Import McpError, ErrorCode
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

/**
 * Formats the result of a workflow execution into a user-friendly Markdown string.
 * @param result The WorkflowResult object returned by executeWorkflow.
 * @returns A formatted string summarizing the workflow outcome.
 */
function formatWorkflowResult(result: WorkflowResult): string {
   let output = `## Workflow Execution: ${result.success ? 'Completed' : 'Failed'}\n\n`;
   // Use the message from the result as the primary status indicator
   output += `**Status:** ${result.message}\n\n`;

   // Include successfully resolved outputs if the workflow succeeded overall
   if (result.success && result.outputs && Object.keys(result.outputs).length > 0) {
       output += `**Workflow Output Summary:**\n`;
       // Iterate through the defined outputs in the result
       for (const [key, value] of Object.entries(result.outputs)) {
           // Format the output value cleanly
           let formattedValue = '(Not available)';
           if (value !== undefined && value !== null) {
               // Limit length of displayed output values to avoid overly long messages
               const valueString = typeof value === 'string' ? value : JSON.stringify(value);
               formattedValue = valueString.length > 200 ? valueString.substring(0, 200) + '...' : valueString;
           }
           output += `- ${key}: ${formattedValue}\n`;
       }
       output += `\n`;
   }

   // Include error details if the workflow failed
   if (result.error) {
       output += `**Error Details:**\n`;
       output += `- Step ID: ${result.error.stepId || 'N/A'}\n`;
       output += `- Tool: ${result.error.toolName || 'N/A'}\n`;
       // Ensure error message is included clearly
       output += `- Message: ${result.error.message || 'No specific error message provided.'}\n`;
       // Optionally include more details if present
       if (result.error.details) {
           try {
               output += `- Context: ${JSON.stringify(result.error.details, null, 2)}\n`; // Pretty print context object
           } catch {
               output += `- Context: (Could not serialize error details)\n`;
           }
       }
       output += `\n`;
   }

   // Add a concluding note about logs or history
   output += `\n*Note: Detailed step results might be available in server logs or session history for debugging.*`;
   return output;
}

// Main executor function for the run-workflow tool
export const runWorkflowTool: ToolExecutor = async (
  params: Record<string, unknown>, // Received validated params as unknown
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Accept optional context
): Promise<CallToolResult> => {
  // ---> Step 2.5(WF).2: Inject Dependencies & Get Session ID <---
  // Note: sessionId is already extracted below, but ensure consistency
  const sessionIdForSse = context?.sessionId || `no-session-${Math.random().toString(36).substring(2)}`;
  if (sessionIdForSse.startsWith('no-session')) {
     logger.warn({ tool: 'runWorkflowTool' }, 'Executing workflow tool without a valid sessionId. SSE progress updates might be limited.');
  }

  // Log the config received by the executor
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'runWorkflowTool executor received config');

  // Cast to the specific input type after validation (which happens in executeTool)
  const validatedParams = params as WorkflowRunnerInput;
  const { workflowName, workflowInput } = validatedParams;

  // ---> Step 2.5(WF).3: Create Job & Return Job ID <---
  const jobId = jobManager.createJob('run-workflow', params);
  logger.info({ jobId, tool: 'runWorkflowTool', sessionId: sessionIdForSse, workflowName }, 'Starting background job for workflow.');

  // Return immediately
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    `Workflow '${workflowName}' Execution`,
    `Your request to run workflow '${workflowName}' has been submitted. You can retrieve the result using the job ID.`
  );

  // ---> Step 2.5(WF).4: Wrap Logic in Async Block <---
  setImmediate(async () => {
    const logs: string[] = []; // Keep logs specific to this job execution

    // ---> Step 2.5(WF).7: Update Final Result/Error Handling (Try Block Start) <---
    try {
      // ---> Step 2.5(WF).6: Add Progress Updates (Initial) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Starting workflow '${workflowName}'...`);
      sseNotifier.sendProgress(sessionIdForSse, jobId, JobStatus.RUNNING, `Starting workflow '${workflowName}'...`);
      logs.push(`[${new Date().toISOString()}] Starting workflow '${workflowName}'.`);

      // Execute the workflow using the central workflow executor service
      // Pass the original context which contains the sessionId
      const workflowResult = await executeWorkflow(
          workflowName,
          workflowInput || {}, // Pass empty object if workflowInput is null/undefined
          config,
          context // Pass the original context
      );

      // ---> Step 2.5(WF).6: Add Progress Updates (Completion) <---
      const completionStatus = workflowResult.success ? JobStatus.COMPLETED : JobStatus.FAILED;
      const completionMessage = `Workflow '${workflowName}' finished with status: ${completionStatus}. ${workflowResult.message}`;
      logger.info({ jobId, workflowName, status: completionStatus }, completionMessage);
      logs.push(`[${new Date().toISOString()}] ${completionMessage}`);
      sseNotifier.sendProgress(sessionIdForSse, jobId, completionStatus, completionMessage);

      // Format the result for the MCP response
      const formattedText = formatWorkflowResult(workflowResult);

      // ---> Step 2.5(WF).7: Update Final Result/Error Handling (Set Success/Error Result) <---
      const finalResult: CallToolResult = {
        content: [{ type: 'text', text: formattedText }],
        isError: !workflowResult.success, // Set MCP error flag if workflow failed
         // Pass through structured error details if the workflow failed
        errorDetails: workflowResult.error ? new McpError(ErrorCode.InternalError, workflowResult.error.message, workflowResult.error.details) : undefined
      };
      jobManager.setJobResult(jobId, finalResult);
      // Optional explicit SSE handled by workflowExecutor's internal notifications

    // ---> Step 2.5(WF).7: Update Final Result/Error Handling (Catch Block for unexpected errors) <---
    } catch (error) {
     // Catch unexpected errors *from* executeWorkflow itself (e.g., if it throws unexpectedly)
     const errorMsg = error instanceof Error ? error.message : String(error);
     logger.error({ err: error, jobId, tool: 'run-workflow', workflowName }, `Unexpected error running workflow tool: ${errorMsg}`);
     logs.push(`[${new Date().toISOString()}] Unexpected Error: ${errorMsg}`);

     const appError = error instanceof AppError
        ? error
        : new ToolExecutionError(`Unexpected error running workflow '${workflowName}': ${errorMsg}`, { workflowName }, error instanceof Error ? error : undefined);

     const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
     const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
     };

     // Store error result in Job Manager
     jobManager.setJobResult(jobId, errorResult);
     // Send final failed status via SSE (optional if jobManager handles it)
     sseNotifier.sendProgress(sessionIdForSse, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  }); // ---> END OF setImmediate WRAPPER <---

  return initialResponse; // Return the initial response with Job ID
};

// Tool Definition - specifies metadata and implementation details
const workflowRunnerToolDefinition: ToolDefinition = {
  name: "run-workflow", // The name used to call the tool
  description: "Runs a predefined sequence of tool calls (a workflow) based on a workflow name and input parameters defined in workflows.json.", // Tool description
  inputSchema: workflowRunnerInputSchema.shape, // Pass the raw Zod shape for registration
  executor: runWorkflowTool // Reference the executor function implemented above
};

// Register the tool definition with the central registry
registerTool(workflowRunnerToolDefinition);
