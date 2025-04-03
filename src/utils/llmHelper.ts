import axios, { AxiosError } from 'axios';
import { OpenRouterConfig } from '../types/workflow.js';
import logger from '../logger.js';
import { AppError, ApiError, ConfigurationError, ParsingError } from './errors.js';
import { selectModelForTask } from './configLoader.js';

/**
 * Performs a direct LLM call for text generation (not sequential thinking).
 * This allows more control over the exact output format without the sequential thinking wrapper.
 *
 * @param prompt The user prompt to send to the LLM.
 * @param systemPrompt The system prompt defining the LLM's role and output format.
 * @param config OpenRouter configuration containing API key and model information.
 * @param logicalTaskName A string identifier for the logical task being performed, used for model selection via llm_mapping.
 * @param temperature Optional temperature override (defaults to 0.1 for deterministic output).
 * @returns The raw text response from the LLM.
 * @throws AppError or subclasses (ConfigurationError, ApiError, ParsingError) if the call fails.
 */
export async function performDirectLlmCall(
  prompt: string,
  systemPrompt: string,
  config: OpenRouterConfig,
  logicalTaskName: string,
  temperature: number = 0.1 // Default to low temperature for predictable generation
): Promise<string> {
  // Log the received config object for debugging
  logger.debug({
    configReceived: true,
    apiKeyPresent: Boolean(config.apiKey),
    mapping: config.llm_mapping ? 'present' : 'missing',
    mappingSize: config.llm_mapping ? Object.keys(config.llm_mapping).length : 0,
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, `performDirectLlmCall received config for task: ${logicalTaskName}`);

  // Check for API key
  if (!config.apiKey) {
    throw new ConfigurationError("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
  }

  // Select the model using the utility function
  // Provide a sensible default if no specific model is found or configured
  const defaultModel = config.geminiModel || "google/gemini-2.0-flash-001"; // Use a known default
  const modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);
  logger.info({ modelSelected: modelToUse, logicalTaskName }, `Selected model for direct LLM call.`);

  try {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: modelToUse,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        max_tokens: 4000, // Consider making this configurable if needed
        temperature: temperature // Use the provided or default temperature
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local" // Optional: Referer for tracking
        },
        timeout: 90000 // Increased timeout to 90s for potentially longer generations
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      const responseText = response.data.choices[0].message.content.trim();
      logger.debug({ modelUsed: modelToUse, responseLength: responseText.length }, "Direct LLM call successful");
      return responseText;
    } else {
      logger.warn({ responseData: response.data, modelUsed: modelToUse }, "Received empty or unexpected response structure from LLM");
      throw new ParsingError(
        "Invalid API response structure received from LLM",
        { responseData: response.data, modelUsed: modelToUse, logicalTaskName }
      );
    }
  } catch (error) {
    // Log with the actual model used
    logger.error({ err: error, modelUsed: modelToUse, logicalTaskName }, `Direct LLM API call failed for ${logicalTaskName}`);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;
      const apiMessage = `LLM API Error: Status ${status || 'N/A'}. ${axiosError.message}`;
      throw new ApiError(
        apiMessage,
        status,
        { modelUsed: modelToUse, logicalTaskName, responseData }, // Include logicalTaskName in context
        axiosError
      );
    } else if (error instanceof AppError) {
      // Re-throw specific AppErrors (like ParsingError from above)
      throw error;
    } else if (error instanceof Error) {
      // Wrap other generic errors
      throw new AppError(
        `LLM call failed for ${logicalTaskName}: ${error.message}`,
        { modelUsed: modelToUse, logicalTaskName }, // Include logicalTaskName
        error
      );
    } else {
      // Handle non-Error throws
      throw new AppError(
        `Unknown error during LLM call for ${logicalTaskName}.`,
        { modelUsed: modelToUse, logicalTaskName, thrownValue: String(error) } // Include logicalTaskName
      );
    }
  }
}
