// src/tools/git-summary-generator/index.ts
import { GitSummaryInput, gitSummaryInputSchema } from './schema.js';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'; // Import McpError, ErrorCode
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Adjust path if necessary, Import ToolExecutionContext
import { getGitDiffSummary } from '../../utils/gitHelper.js'; // Adjust path if necessary
import { AppError } from '../../utils/errors.js'; // Adjust path if necessary
import logger from '../../logger.js'; // Adjust path if necessary
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
import { OpenRouterConfig } from '../../types/workflow.js'; // Import OpenRouterConfig for type consistency

// Define the executor function
export const generateGitSummary: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig, // Add config for type consistency, even if unused
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => {
  // ---> Step 2.5(GSG).2: Inject Dependencies & Get Session ID <---
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateGitSummary' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  // Validation happens in executeTool, but we cast here for type safety
  const validatedParams = params as GitSummaryInput;

  // ---> Step 2.5(GSG).3: Create Job & Return Job ID <---
  const jobId = jobManager.createJob('generate-git-summary', params);
  logger.info({ jobId, tool: 'generateGitSummary', sessionId }, 'Starting background job.');

  // Return immediately
  const initialResponse: CallToolResult = {
    content: [{ type: 'text', text: `Git summary generation started. Job ID: ${jobId}` }],
    isError: false,
  };

  // ---> Step 2.5(GSG).4: Wrap Logic in Async Block <---
  setImmediate(async () => {
    const logs: string[] = []; // Keep logs specific to this job execution

    // ---> Step 2.5(GSG).7: Update Final Result/Error Handling (Try Block Start) <---
    try {
      // ---> Step 2.5(GSG).6: Add Progress Updates (Initial) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting Git summary generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting Git summary generation...');
      logger.info({ jobId }, `Generating Git summary (staged: ${validatedParams.staged})`);
      logs.push(`[${new Date().toISOString()}] Generating Git summary (staged: ${validatedParams.staged}).`);

      // Call the helper function
      const diffSummary = await getGitDiffSummary({ staged: validatedParams.staged });

      // ---> Step 2.5(GSG).6: Add Progress Updates (Completion) <---
      logger.info({ jobId }, `Successfully generated Git summary.`);
      logs.push(`[${new Date().toISOString()}] Successfully generated Git summary.`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Git summary generated.`);

      // ---> Step 2.5(GSG).7: Update Final Result/Error Handling (Set Success Result) <---
      // The helper already returns a user-friendly message for no changes
      const finalResult: CallToolResult = {
        content: [{ type: 'text', text: diffSummary }],
        isError: false,
      };
      jobManager.setJobResult(jobId, finalResult);
      // Optional explicit SSE: sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Git summary generation completed successfully.');

    // ---> Step 2.5(GSG).7: Update Final Result/Error Handling (Catch Block) <---
    } catch (error: unknown) {
      // Extract error message safely
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      logger.error({ err: error, jobId, tool: 'generate-git-summary', params: validatedParams }, `Error getting Git summary: ${errorMessage}`);
      logs.push(`[${new Date().toISOString()}] Error: ${errorMessage}`);

      // Ensure the error is an AppError or wrap it
      const appErr = error instanceof AppError
        ? error
        : new AppError(`Unknown error getting Git summary: ${errorMessage}`);

      const mcpError = new McpError(ErrorCode.InternalError, appErr.message, appErr.context);
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
      };

      // Store error result in Job Manager
      jobManager.setJobResult(jobId, errorResult);
      // Send final failed status via SSE (optional if jobManager handles it)
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  }); // ---> END OF setImmediate WRAPPER <---

  return initialResponse; // Return the initial response with Job ID
};

// Define and Register Tool
const gitSummaryToolDefinition: ToolDefinition = {
  name: "generate-git-summary",
  description: "Retrieves a summary of current Git changes (diff). Can show staged or unstaged changes.",
  inputSchema: gitSummaryInputSchema.shape, // Pass the raw shape
  executor: generateGitSummary
};

registerTool(gitSummaryToolDefinition);
