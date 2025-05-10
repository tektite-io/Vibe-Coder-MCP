// src/services/job-response-formatter/index.ts
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { JobStatus } from '../job-manager/index.js'; // Assuming JobStatus is needed/useful

/**
 * Formats the initial response for a background job that has been successfully initiated.
 *
 * @param jobId The unique identifier for the job.
 * @param toolName The internal, registered name of the tool (e.g., "generate-prd").
 * @param toolDisplayName A user-friendly name for the tool (e.g., "PRD Generator").
 * @returns A CallToolResult object suitable for immediate return to the client.
 */
export function formatBackgroundJobInitiationResponse(
  jobId: string,
  toolName: string,
  toolDisplayName: string
): CallToolResult {
  const userMessage = `Your request to use the '${toolDisplayName}' tool has been initiated with Job ID: ${jobId}. Your request will be completed shortly.`;
  const retrievalPrompt = `To check the status and retrieve the output of your request with Job ID ${jobId}, please use the 'get-job-result' tool with the following parameters: { "jobId": "${jobId}" }.`;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          jobId: jobId,
          message: userMessage,
          retrievalPrompt: retrievalPrompt,
          status: JobStatus.PENDING, // Reflecting the initial status
          toolName: toolName, // The actual tool name for consistency/internal use
        }),
      },
    ],
    isError: false,
  };
}
