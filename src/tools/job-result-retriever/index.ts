// src/tools/job-result-retriever/index.ts
import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode, TextContent } from '@modelcontextprotocol/sdk/types.js'; // Import TextContent
import { OpenRouterConfig } from '../../types/workflow.js'; // Although not used directly, keep for ToolExecutor signature
import logger from '../../logger.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import JobManager and types

// --- Zod Schema ---
const getJobResultInputSchemaShape = {
  jobId: z.string().uuid({ message: "Invalid Job ID format. Must be a UUID." }).describe("The unique identifier of the job to retrieve.")
};

// --- Tool Executor ---

/**
 * Retrieves the status and result of a background job.
 */
export const getJobResult: ToolExecutor = async (
  params: Record<string, unknown>,
  _config: OpenRouterConfig, // Config might not be needed here, but keep for signature
  _context?: ToolExecutionContext // Context might not be needed here
): Promise<CallToolResult> => {
  const { jobId } = params as { jobId: string };

  try {
    logger.info({ jobId }, `Attempting to retrieve result for job.`);
    const job = jobManager.getJob(jobId);

    if (!job) {
      logger.warn({ jobId }, `Job not found.`);
      // Return a specific error for not found job
      const notFoundError = new McpError(ErrorCode.InvalidParams, `Job with ID '${jobId}' not found.`);
      return {
        content: [{ type: 'text', text: notFoundError.message }],
        isError: true,
        errorDetails: notFoundError
      };
    }

    // Prepare the response based on job status
    let responseText = '';
    let finalResult: CallToolResult | undefined = undefined;

    switch (job.status) {
      case JobStatus.PENDING:
        responseText = `Job '${jobId}' (${job.toolName}) is pending. Created at: ${new Date(job.createdAt).toISOString()}.`;
        break;
      case JobStatus.RUNNING:
        responseText = `Job '${jobId}' (${job.toolName}) is running. Status updated at: ${new Date(job.updatedAt).toISOString()}. Progress: ${job.progressMessage || 'No progress message available.'}`;
        break;
      case JobStatus.COMPLETED:
        responseText = `Job '${jobId}' (${job.toolName}) completed successfully at: ${new Date(job.updatedAt).toISOString()}.`;
        // If the result exists, we might want to return it directly
        if (job.result) {
            // Make a deep copy to avoid modifying the stored result
            finalResult = JSON.parse(JSON.stringify(job.result));
            // Check if finalResult is defined before accessing content
            if (finalResult) {
                // Optionally add a note about completion to the result content
                const completionNote: TextContent = { type: 'text', text: `\n---\nJob Status: COMPLETED (${new Date(job.updatedAt).toISOString()})` };
                // Ensure content array exists before pushing
                finalResult.content = [...(finalResult.content || []), completionNote];
            } else {
                 // Log if deep copy failed unexpectedly
                 logger.error({ jobId }, "Deep copy of job result failed unexpectedly for COMPLETED job.");
                 responseText += ' Failed to process final result.';
            }
        } else {
            // Should not happen if status is COMPLETED, but handle defensively
            responseText += ' However, the final result is missing.';
            logger.error({ jobId }, "Job status is COMPLETED but result is missing.");
        }
        break;
      case JobStatus.FAILED:
        responseText = `Job '${jobId}' (${job.toolName}) failed at: ${new Date(job.updatedAt).toISOString()}. Reason: ${job.progressMessage || 'No failure message available.'}`;
         // If the error result exists, return it directly
        if (job.result && job.result.isError) {
            // Make a deep copy to avoid modifying the stored result
            finalResult = JSON.parse(JSON.stringify(job.result));
             // Check if finalResult is defined before accessing content
            if (finalResult) {
                 // Optionally add a note about failure to the result content
                const failureNote: TextContent = { type: 'text', text: `\n---\nJob Status: FAILED (${new Date(job.updatedAt).toISOString()})` };
                // Ensure content array exists before pushing
                finalResult.content = [...(finalResult.content || []), failureNote];
            } else {
                 // Log if deep copy failed unexpectedly
                 logger.error({ jobId }, "Deep copy of job result failed unexpectedly for FAILED job.");
                 responseText += ' Failed to process error result.';
            }
        } else {
             responseText += ' Error details are missing.';
             logger.error({ jobId }, "Job status is FAILED but error result is missing or not marked as error.");
             // Construct a generic error result if specific one is missing
             finalResult = {
                 content: [{ type: 'text', text: responseText }],
                 isError: true,
                 errorDetails: new McpError(ErrorCode.InternalError, "Job failed but error details are missing.", { jobId })
             };
        }
        break;
      default:
        // Should not happen
        logger.error({ jobId, status: job.status }, `Job has unknown status.`);
        responseText = `Job '${jobId}' has an unknown status: ${job.status}.`;
        break;
    }

    // If we have a final result (from COMPLETED or FAILED job with result stored), return it
    if (finalResult) {
        logger.info({ jobId, status: job.status }, `Returning final stored result for job.`);
        return finalResult;
    }

    // Otherwise, return the status text
    logger.info({ jobId, status: job.status }, `Returning current status for job.`);
    return {
      content: [{ type: "text", text: responseText }],
      isError: false // It's not an error to report pending/running status
    };

  } catch (error) {
    logger.error({ err: error, jobId }, 'Error retrieving job result.');
    const execError = new McpError(ErrorCode.InternalError, `An unexpected error occurred while retrieving job '${jobId}'.`, { originalError: String(error) });
    return {
      content: [{ type: 'text', text: execError.message }],
      isError: true,
      errorDetails: execError
    };
  }
};

// --- Tool Registration ---
const getJobResultToolDefinition: ToolDefinition = {
  name: "get-job-result",
  description: "Retrieves the current status and, if available, the final result of a background job.",
  inputSchema: getJobResultInputSchemaShape,
  executor: getJobResult
};

registerTool(getJobResultToolDefinition);

logger.info("Registered tool: get-job-result");
