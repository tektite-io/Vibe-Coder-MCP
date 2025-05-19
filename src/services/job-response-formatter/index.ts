// src/services/job-response-formatter/index.ts
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ToolExecutionContext } from '../routing/toolRegistry.js';
import { JobStatus } from '../job-manager/index.js';
import { createJobStatusMessage } from '../job-manager/jobStatusMessage.js';

/**
 * Formats a response for a background job initiation.
 * @param jobId The ID of the newly created job.
 * @param toolName The name of the tool that created the job.
 * @param message A message to include in the response.
 * @param context The tool execution context.
 * @returns A formatted CallToolResult object.
 */
export function formatBackgroundJobInitiationResponse(
  jobId: string,
  toolName: string,
  message: string,
  context?: ToolExecutionContext
): CallToolResult {
  const sessionId = context?.sessionId || 'unknown-session';
  const transportType = context?.transportType || 'unknown';

  // Create a standardized job status message
  const statusMessage = createJobStatusMessage(
    jobId,
    toolName,
    JobStatus.PENDING,
    message,
    0, // 0% progress
    Date.now(),
    Date.now()
  );

  // Create a human-readable response message
  let responseText = `Job started: ${jobId} (${toolName})\n\n${message}\n\n`;

  // Add polling instructions based on transport type
  if (transportType === 'stdio' || sessionId === 'stdio-session') {
    responseText += `To check the status of this job, use the get-job-result tool with the following parameters:\n\n`;
    responseText += `{\n  "jobId": "${jobId}"\n}\n\n`;
    responseText += `Recommended initial polling interval: ${statusMessage.pollingRecommendation?.interval ? statusMessage.pollingRecommendation.interval / 1000 : 5} seconds.`;
  } else {
    responseText += `You will receive real-time updates on the job status via SSE.`;
  }

  return {
    content: [{ type: 'text', text: responseText }],
    isError: false,
    jobId,
    jobStatus: statusMessage
  };
}
