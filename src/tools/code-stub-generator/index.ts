// src/tools/code-stub-generator/index.ts
import axios from 'axios';
import { CodeStubInput, codeStubInputSchema } from './schema.js'; // Import schema/type
import { OpenRouterConfig } from '../../types/workflow.js';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js'; // Import McpError, ErrorCode
import { registerTool, ToolDefinition, ToolExecutor } from '../../services/routing/toolRegistry.js';
import { ApiError, ParsingError, ToolExecutionError, AppError, ConfigurationError } from '../../utils/errors.js'; // Import custom errors, Added ConfigurationError
import { readFileContent } from '../../utils/fileReader.js'; // Import file reader utility
import logger from '../../logger.js';
import { selectModelForTask } from '../../utils/configLoader.js'; // Import the new utility
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

const CODE_STUB_SYSTEM_PROMPT = `You are an expert code generation assistant. Your task is to generate a clean, syntactically correct code stub based ONLY on the user's specifications.

**IMPORTANT RULES:**
1.  ONLY output the raw code for the requested stub.
2.  Do NOT include any explanations, apologies, comments about the code, markdown formatting (like \`\`\`language ... \`\`\`), or any text other than the code itself.
3.  Generate idiomatic code for the specified language.
4.  Include basic docstrings/comments within the code stub explaining parameters and purpose, based on the provided description.
5.  If generating a function or method body, include a placeholder comment like '// TODO: Implement logic' or 'pass' (for Python).
6.  If essential information is missing, make reasonable assumptions but keep the stub minimal.
`;

// Function to generate the user prompt for the LLM
function createLLMPrompt(params: CodeStubInput, fileContext?: string, previousContextText?: string): string { // Added previousContextText param
   let prompt = `Generate a code stub with the following specifications:\n`;
   prompt += `- Language: ${params.language}\n`;
   prompt += `- Type: ${params.stubType}\n`;
   prompt += `- Name: ${params.name}\n`;
   prompt += `- Description: ${params.description}\n`;

   if (params.parameters && params.parameters.length > 0) {
       prompt += `- Parameters:\n`;
       params.parameters.forEach(p => {
           prompt += `  - Name: ${p.name}${p.type ? `, Type: ${p.type}` : ''}${p.description ? `, Desc: ${p.description}` : ''}\n`;
       });
   }
   if (params.returnType) {
       prompt += `- Return Type: ${params.returnType}\n`;
   }
   if (params.classProperties && params.classProperties.length > 0) {
       prompt += `- Properties (for class):\n`;
       params.classProperties.forEach(p => {
           prompt += `  - Name: ${p.name}${p.type ? `, Type: ${p.type}` : ''}${p.description ? `, Desc: ${p.description}` : ''}\n`;
       });
   }
    if (params.methods && params.methods.length > 0) {
        prompt += `- Methods (for class/interface):\n`;
        params.methods.forEach(m => {
            prompt += `  - Name: ${m.name}${m.description ? `, Desc: ${m.description}` : ''}\n`;
         });
     }

    if (fileContext) {
        prompt += `\nConsider the following file content as additional context:\n---\n${fileContext}\n---\n`;
    }

    // Add previous context if available
    if (previousContextText) {
        prompt += `\nConsider the result of the previous operation:\n---\n${previousContextText}\n---\n`;
    }

    prompt += `\nOutput ONLY the raw code stub.`;
    return prompt;
 }

 // Function to clean up potential markdown fences
 function cleanCodeOutput(rawOutput: string): string {
    let cleaned = rawOutput.trim();
    // Remove ```language / ``` fences
    const fenceRegex = /^```(?:\w+)?\s*([\s\S]*?)\s*```$/;
    const match = cleaned.match(fenceRegex);
    if (match && match[1]) {
        cleaned = match[1].trim();
    }
     // Remove leading/trailing empty lines potentially left after fence removal
    cleaned = cleaned.replace(/^\s*\n|\n\s*$/g, '');
    return cleaned;
 }


import { ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import context type

// Main executor function
export const generateCodeStub: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => {
  // ---> Step 2.5(CSG).2: Inject Dependencies & Get Session ID <---
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateCodeStub' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  // Log the config received by the executor
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generateCodeStub executor received config');

  // Validation happens in executeTool, but we cast here for type safety
  const validatedParams = params as CodeStubInput;

  // ---> Step 2.5(CSG).3: Create Job & Return Job ID <---
  const jobId = jobManager.createJob('generate-code-stub', params);
  logger.info({ jobId, tool: 'generateCodeStub', sessionId }, 'Starting background job.');

  // Return immediately
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'Code Stub Generation',
    'Your code stub generation request has been submitted. You can retrieve the result using the job ID.'
  );

  // ---> Step 2.5(CSG).4: Wrap Logic in Async Block <---
  setImmediate(async () => {
    // Define variables needed within the async scope
    let fileContext = '';
    // let previousText: string | undefined = undefined; // Removed - context.previousResponse is not reliable here
    const logicalTaskName = 'code_stub_generation';
    const defaultModel = config.geminiModel || "google/gemini-2.0-flash-001"; // Or a better default code model
    const logs: string[] = []; // Keep logs specific to this job execution
    let modelToUse: string = defaultModel; // Declare modelToUse here

    // ---> Step 2.5(CSG).7: Update Final Result/Error Handling (Try Block Start) <---
    try {
      // ---> Step 2.5(CSG).6: Add Progress Updates (Initial) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting code stub generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting code stub generation...');
      logger.info({ jobId }, `Generating ${validatedParams.language} ${validatedParams.stubType} stub: ${validatedParams.name}`);
      logs.push(`[${new Date().toISOString()}] Generating ${validatedParams.language} ${validatedParams.stubType} stub: ${validatedParams.name}`);

      if (validatedParams.contextFilePath) {
          logger.debug({ jobId }, `Reading context file: ${validatedParams.contextFilePath}`);
          // ---> Step 2.5(CSG).6: Add Progress Updates (Context Reading) <---
          jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Reading context file: ${validatedParams.contextFilePath}`);
          sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Reading context file: ${validatedParams.contextFilePath}`);
          try {
              fileContext = await readFileContent(validatedParams.contextFilePath);
              logger.info({ jobId }, `Successfully added context from file: ${validatedParams.contextFilePath}`);
              logs.push(`[${new Date().toISOString()}] Successfully read context file.`);
              sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Context file read successfully.`);
          } catch (readError) {
              const errorMsg = readError instanceof Error ? readError.message : String(readError);
              logger.warn({ jobId, err: readError }, `Could not read context file '${validatedParams.contextFilePath}'. Proceeding without file context.`);
              logs.push(`[${new Date().toISOString()}] Warning: Failed to read context file: ${errorMsg}`);
              sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Warning: Could not read context file: ${errorMsg}`);
              fileContext = `\n\n[Warning: Failed to read context file '${validatedParams.contextFilePath}'. Error: ${errorMsg}]`;
          }
      }

      // Removed previousText logic as context.previousResponse is not reliable in setImmediate

      const userPrompt = createLLMPrompt(validatedParams, fileContext /*, previousText */); // Pass fileContext

      // Select the model (assign to variable declared outside try)
      modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);
      logs.push(`[${new Date().toISOString()}] Selected model: ${modelToUse}`);

      // Check for API key
      if (!config.apiKey) {
        throw new ConfigurationError("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
      }

      // ---> Step 2.5(CSG).6: Add Progress Updates (LLM Call) <---
      logger.info({ jobId, modelToUse }, `Calling LLM for code stub generation...`);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Calling LLM (${modelToUse}) for stub generation...`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Calling LLM (${modelToUse}) for stub generation...`);

      // Add Code Stub Generator header
      const response = await axios.post(
        `${config.baseUrl}/chat/completions`,
      {
        model: modelToUse, // Use selected model
        messages: [
          { role: "system", content: CODE_STUB_SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 1000, // Adjust as needed
        temperature: 0.2, // Lower temperature for more predictable code
        // No stream needed for simple stub
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local", // Optional - Added comma
        },
      }
    );

      // ---> Step 2.5(CSG).6: Add Progress Updates (Processing Response) <---
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, `Received response from LLM. Processing...`);
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Received response from LLM. Processing...`);

      if (response.data?.choices?.[0]?.message?.content) {
        const rawCode = response.data.choices[0].message.content;
        const cleanCode = cleanCodeOutput(rawCode);

        if (!cleanCode) {
             throw new ParsingError("LLM returned empty code content after cleanup.", { rawCode, modelUsed: modelToUse });
        }

        logger.info({ jobId, modelUsed: modelToUse }, `Successfully generated code stub for ${validatedParams.name}`);
        logs.push(`[${new Date().toISOString()}] Successfully generated code stub.`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Stub generation complete.`);

        // ---> Step 2.5(CSG).7: Update Final Result/Error Handling (Set Success Result) <---
        const finalResult: CallToolResult = {
          content: [{ type: 'text', text: cleanCode }], // Return the cleaned code
          isError: false,
        };
        jobManager.setJobResult(jobId, finalResult);
        // Optional explicit SSE: sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Code stub generation completed successfully.');

      } else {
        logger.warn({ jobId, responseData: response.data, modelUsed: modelToUse }, "Received empty or unexpected response from LLM for code stub generation");
         throw new ParsingError("No valid content received from LLM for code stub generation", { responseData: response.data, modelUsed: modelToUse });
      }

    // ---> Step 2.5(CSG).7: Update Final Result/Error Handling (Catch Block) <---
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generate-code-stub', params: validatedParams, modelUsed: modelToUse }, `Error generating code stub for ${validatedParams.name}`);
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      let appError: AppError;
      const cause = error instanceof Error ? error : undefined;

      if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          appError = new ApiError(`Code stub generation API Error: Status ${status || 'N/A'}. ${error.message}`, status, { params: validatedParams, modelUsed: modelToUse }, error);
      } else if (error instanceof AppError) {
          appError = error; // Use existing AppError
      } else {
          appError = new ToolExecutionError(`Failed to generate code stub: ${errorMsg}`, { params: validatedParams, modelUsed: modelToUse }, cause);
      }

      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context); // Corrected McpError class name
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
const codeStubToolDefinition: ToolDefinition = {
  name: "generate-code-stub",
  description: "Generates a code stub (function, class, etc.) in a specified language based on a description. Can optionally use content from a file (relative path) as context.", // Updated description
  inputSchema: codeStubInputSchema.shape, // Pass the raw shape to the registry
  executor: generateCodeStub
};

registerTool(codeStubToolDefinition);
