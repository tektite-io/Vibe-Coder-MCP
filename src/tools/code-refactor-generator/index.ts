// src/tools/code-refactor-generator/index.ts
import axios from 'axios';
// z is imported in schema.ts and not needed here
import { CodeRefactorInput, codeRefactorInputSchema } from './schema.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import ToolExecutionContext
import { readFileContent } from '../../utils/fileReader.js'; // Adjust path if necessary
import { ApiError, ParsingError, ToolExecutionError, AppError, ConfigurationError } from '../../utils/errors.js'; // Adjust path if necessary, Added ConfigurationError
import logger from '../../logger.js'; // Adjust path if necessary
import { selectModelForTask } from '../../utils/configLoader.js'; // Import the new utility
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier

// TODO: Consider moving cleanCodeOutput to a shared utils/codeUtils.ts
function cleanCodeOutput(rawOutput: string): string {
   let cleaned = rawOutput.trim();
   const fenceRegex = /^```(?:\w+)?\s*([\s\S]*?)\s*```$/;
   const match = cleaned.match(fenceRegex);
   if (match && match[1]) {
       cleaned = match[1].trim();
   }
   cleaned = cleaned.replace(/^\s*\n|\n\s*$/g, '');
   return cleaned;
}


const REFACTOR_SYSTEM_PROMPT = `You are an expert software engineer specializing in code refactoring. Your task is to rewrite the provided code snippet according to the given instructions, preserving its original functionality while improving its structure, readability, or performance as requested.

**IMPORTANT RULES:**
1.  ONLY output the refactored code for the specified snippet.
2.  Do NOT include any explanations, apologies, comments about the changes, markdown formatting (like \`\`\`language ... \`\`\`), or any text other than the refactored code itself.
3.  Ensure the refactored code is syntactically correct for the specified language.
4.  Adhere strictly to the refactoring instructions provided.
5.  If surrounding context is provided, use it to inform the refactoring but only output the modified version of the original snippet.
6.  If the instructions are unclear or cannot be safely applied, return the original code snippet unchanged.
`;

// Function to create the prompt for the LLM
function createLLMPrompt(params: CodeRefactorInput, fileContext?: string): string {
    let prompt = `Refactor the following ${params.language} code snippet:\n\n`;
    prompt += `\`\`\`${params.language}\n${params.codeContent}\n\`\`\`\n\n`;
    prompt += `Refactoring Instructions: ${params.refactoringInstructions}\n\n`;

    // Ensure fileContext is a string before concatenating
    if (fileContext && typeof fileContext === 'string') {
        prompt += `Consider the following surrounding code context:\n---\n${fileContext}\n---\n\n`;
    }

    prompt += `Output ONLY the refactored version of the original code snippet.`;
    return prompt;
}


// Main executor function
export const refactorCode: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session'; // Get sessionId, provide fallback
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'refactorCode' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }
  // Log the config received by the executor
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'refactorCode executor received config');

  // Validation happens in executeTool, but we cast here for type safety
  const validatedParams = params as CodeRefactorInput;

  // --- Create Job & Return Immediately ---
  const jobId = jobManager.createJob('refactor-code', params);
  logger.info({ jobId, tool: 'refactorCode', sessionId }, 'Starting background job.');

  // Return immediately
  const initialResponse: CallToolResult = {
    content: [{ type: 'text', text: `Code refactoring started. Job ID: ${jobId}` }],
    isError: false,
  };

  // --- Execute Long-Running Logic Asynchronously ---
  setImmediate(async () => {
    let fileContext = '';
    const logs: string[] = []; // Keep logs specific to this job execution
    // Define these within the async block scope so catch can access them
    const logicalTaskName = 'code_refactoring';
    const defaultModel = config.geminiModel || "google/gemini-2.0-flash-001";

    try {
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting code refactoring process...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting code refactoring process...');
      logger.info({ jobId }, `Refactoring ${validatedParams.language} code based on: "${validatedParams.refactoringInstructions.substring(0, 50)}..."`);
      logs.push(`[${new Date().toISOString()}] Refactoring ${validatedParams.language} code.`);

      // Read context file if provided
      if (validatedParams.contextFilePath) {
          logger.debug({ jobId }, `Reading context file for refactoring: ${validatedParams.contextFilePath}`);
          jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Reading context file: ${validatedParams.contextFilePath}`);
          sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Reading context file: ${validatedParams.contextFilePath}`);
          try {
              fileContext = await readFileContent(validatedParams.contextFilePath);
              logger.info({ jobId }, `Added context from file: ${validatedParams.contextFilePath}`);
              logs.push(`[${new Date().toISOString()}] Successfully read context file.`);
              sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Context file read successfully.`);
          } catch (readError: unknown) { // Catch specific error
              const errorMsg = readError instanceof Error ? readError.message : String(readError);
              logger.warn({ jobId, err: readError }, `Could not read context file '${validatedParams.contextFilePath}'. Proceeding without file context.`);
              logs.push(`[${new Date().toISOString()}] Warning: Failed to read context file: ${errorMsg}`);
              sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Warning: Could not read context file: ${errorMsg}`);
              // Include warning in context passed to LLM, but don't fail the job yet
              fileContext = `\n\n[Warning: Failed to read context file '${validatedParams.contextFilePath}'. Error: ${errorMsg}]`;
          }
      }

      const userPrompt = createLLMPrompt(validatedParams, fileContext);

      // Select the model (variables defined above)
      const modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);
      logs.push(`[${new Date().toISOString()}] Selected model: ${modelToUse}`);

      // Check for API key
      if (!config.apiKey) {
        throw new ConfigurationError("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
      }

      logger.info({ jobId, modelToUse }, `Calling LLM for code refactoring...`);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Calling LLM (${modelToUse}) for refactoring...`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Calling LLM (${modelToUse}) for refactoring...`);

      // LLM API Call
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
        {
          model: modelToUse,
          messages: [
            { role: "system", content: REFACTOR_SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 2000,
          temperature: 0.1,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${config.apiKey}`,
            "HTTP-Referer": "https://vibe-coder-mcp.local" // Optional
           },
           timeout: 90000 // Increased timeout for potentially longer refactoring
        }
      );

      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Received response from LLM. Processing...`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Received response from LLM. Processing...`);

      if (response.data?.choices?.[0]?.message?.content) {
        const rawCode = response.data.choices[0].message.content;
        const cleanCode = cleanCodeOutput(rawCode);

        if (!cleanCode) {
             throw new ParsingError("LLM returned empty code content after cleanup.", { rawCode, modelUsed: modelToUse });
        }

        logger.info({ jobId, modelUsed: modelToUse }, `Successfully generated refactored code.`);
        logs.push(`[${new Date().toISOString()}] Successfully generated refactored code.`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Refactoring complete.`);

        // Set final success result
        const finalResult: CallToolResult = {
          content: [{ type: 'text', text: cleanCode }],
          isError: false,
        };
        jobManager.setJobResult(jobId, finalResult);
        // Optional: Explicit final success notification
        // sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Code refactoring completed successfully.');

      } else {
        logger.warn({ jobId, responseData: response.data, modelUsed: modelToUse }, "Received empty or unexpected response from LLM for code refactoring");
         throw new ParsingError("No valid content received from LLM for code refactoring", { responseData: response.data, modelUsed: modelToUse });
      }

    } catch (error: unknown) { // Catch errors within the async block
       const errorMsg = error instanceof Error ? error.message : String(error);
       logger.error({ err: error, jobId, tool: 'refactor-code', params: validatedParams }, `Error during code refactoring background job.`);
       logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

       // Instantiate the correct error type, ensuring the cause is an Error or undefined
       const cause = error instanceof Error ? error : undefined;
       let appError: AppError;

       if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          // Pass the original Axios error as the cause
          appError = new ApiError(`Code refactoring API Error: Status ${status || 'N/A'}. ${error.message}`, status, { params: validatedParams, modelUsed: selectModelForTask(config, logicalTaskName, defaultModel) }, error);
       } else if (error instanceof AppError) {
           appError = error; // Use the existing AppError
       } else {
           // Create a new AppError for other types of errors
           appError = new ToolExecutionError(`Failed to refactor code: ${errorMsg}`, { params: validatedParams, modelUsed: selectModelForTask(config, logicalTaskName, defaultModel) }, cause);
       }

       const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
       const errorResult: CallToolResult = {
         content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
         isError: true,
         errorDetails: mcpError
       };

       // Store error result in Job Manager
       jobManager.setJobResult(jobId, errorResult);
       // Send final failed status via SSE
       sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  }); // End of setImmediate

  return initialResponse; // Return the initial response with Job ID
};

// Define and Register Tool
const codeRefactorToolDefinition: ToolDefinition = {
  name: "refactor-code",
  description: "Refactors a given code snippet based on specific instructions, optionally using surrounding file context.",
  inputSchema: codeRefactorInputSchema.shape, // Pass the raw shape
  executor: refactorCode
};

registerTool(codeRefactorToolDefinition);
