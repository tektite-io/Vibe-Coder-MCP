// src/tools/code-refactor-generator/index.ts
import axios from 'axios';
// z is imported in schema.ts and not needed here
import { codeRefactorInputSchema } from './schema.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { readFileContent } from '../../utils/fileReader.js'; // Adjust path if necessary
import { ApiError, ParsingError, ToolExecutionError, AppError, ConfigurationError } from '../../utils/errors.js'; // Adjust path if necessary, Added ConfigurationError
import logger from '../../logger.js'; // Adjust path if necessary
import { selectModelForTask } from '../../utils/configLoader.js'; // Import the new utility
// TODO: Consider moving cleanCodeOutput to a shared utils/codeUtils.ts
function cleanCodeOutput(rawOutput) {
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
function createLLMPrompt(params, fileContext) {
    let prompt = `Refactor the following ${params.language} code snippet:\n\n`;
    prompt += `\`\`\`${params.language}\n${params.codeContent}\n\`\`\`\n\n`;
    prompt += `Refactoring Instructions: ${params.refactoringInstructions}\n\n`;
    if (fileContext) {
        prompt += `Consider the following surrounding code context:\n---\n${fileContext}\n---\n\n`;
    }
    prompt += `Output ONLY the refactored version of the original code snippet.`;
    return prompt;
}
// Main executor function
export const refactorCode = async (params, config) => {
    // Log the config received by the executor
    logger.debug({
        configReceived: true,
        hasLlmMapping: Boolean(config.llm_mapping),
        mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
    }, 'refactorCode executor received config');
    // Validation happens in executeTool, but we cast here for type safety
    const validatedParams = params;
    logger.info(`Refactoring ${validatedParams.language} code based on: "${validatedParams.refactoringInstructions.substring(0, 50)}..."`);
    let fileContext = '';
    // Read context file if provided
    if (validatedParams.contextFilePath) {
        logger.debug(`Reading context file for refactoring: ${validatedParams.contextFilePath}`);
        try {
            fileContext = await readFileContent(validatedParams.contextFilePath);
            logger.info(`Added context from file: ${validatedParams.contextFilePath}`);
        }
        catch (readError) {
            logger.warn({ err: readError }, `Could not read context file '${validatedParams.contextFilePath}'. Proceeding without file context.`);
            fileContext = `\n\n[Warning: Failed to read context file '${validatedParams.contextFilePath}'. Error: ${readError instanceof Error ? readError.message : String(readError)}]`;
        }
    }
    const userPrompt = createLLMPrompt(validatedParams, fileContext);
    // Select the model
    const logicalTaskName = 'code_refactoring';
    const defaultModel = config.geminiModel || "google/gemini-2.0-flash-001"; // Or a better default code model
    const modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);
    // Check for API key
    if (!config.apiKey) {
        throw new ConfigurationError("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
    }
    try {
        // Add Code Refactor Generator header
        const response = await axios.post(`${config.baseUrl}/chat/completions`, {
            model: modelToUse, // Use selected model
            messages: [
                { role: "system", content: REFACTOR_SYSTEM_PROMPT },
                { role: "user", content: userPrompt }
            ],
            max_tokens: 2000, // Adjust based on expected code size
            temperature: 0.1, // Very low temperature for deterministic refactoring
        }, {
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${config.apiKey}`,
                "HTTP-Referer": "https://vibe-coder-mcp.local" // Optional
            },
            timeout: 60000 // 60 seconds timeout
        });
        if (response.data?.choices?.[0]?.message?.content) {
            const rawCode = response.data.choices[0].message.content;
            const cleanCode = cleanCodeOutput(rawCode);
            if (!cleanCode) {
                throw new ParsingError("LLM returned empty code content after cleanup.", { rawCode, modelUsed: modelToUse });
            }
            logger.debug({ modelUsed: modelToUse }, `Successfully generated refactored code.`);
            return {
                content: [{ type: 'text', text: cleanCode }],
                isError: false,
            };
        }
        else {
            logger.warn({ responseData: response.data, modelUsed: modelToUse }, "Received empty or unexpected response from LLM for code refactoring");
            throw new ParsingError("No valid content received from LLM for code refactoring", { responseData: response.data, modelUsed: modelToUse });
        }
    }
    catch (error) {
        logger.error({ err: error, tool: 'refactor-code', params: validatedParams, modelUsed: modelToUse }, `Error refactoring code.`);
        let specificError;
        // Wrap errors (similar to generateCodeStub)
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            specificError = new ApiError(`Code refactoring API Error: Status ${status || 'N/A'}. ${error.message}`, status, { params: validatedParams, modelUsed: modelToUse }, error);
        }
        else if (error instanceof AppError) {
            // Create a new context object including the model info
            const newContext = { ...(error.context || {}), modelUsed: modelToUse };
            // Re-create the error with the new context (assuming constructor allows context)
            // This might need adjustment based on the actual AppError constructor signature
            // If AppError subclasses don't take context in constructor, we might need a different approach
            // For now, assuming a generic ToolExecutionError wrapper is acceptable if original type can't be preserved with new context
            specificError = new ToolExecutionError(error.message, newContext, error.originalError);
            // Alternatively, if AppError has a method like `withContext`:
            // specificError = error.withContext({ ...error.context, modelUsed: modelToUse });
        }
        else if (error instanceof Error) {
            specificError = new ToolExecutionError(`Failed to refactor code: ${error.message}`, { params: validatedParams, modelUsed: modelToUse }, error);
        }
        else {
            specificError = new ToolExecutionError(`Unknown error during code refactoring.`, { params: validatedParams, modelUsed: modelToUse });
        }
        return {
            content: [{ type: 'text', text: specificError.message }],
            isError: true,
            errorDetails: { type: specificError.name, message: specificError.message },
        };
    }
};
// Define and Register Tool
const codeRefactorToolDefinition = {
    name: "refactor-code",
    description: "Refactors a given code snippet based on specific instructions, optionally using surrounding file context.",
    inputSchema: codeRefactorInputSchema.shape, // Pass the raw shape
    executor: refactorCode
};
registerTool(codeRefactorToolDefinition);
