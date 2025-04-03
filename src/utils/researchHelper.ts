import axios, { AxiosError } from 'axios';
import { OpenRouterConfig } from '../types/workflow.js';
import logger from '../logger.js';
import { ApiError, ParsingError, AppError, ConfigurationError } from './errors.js'; // Import custom errors
import { selectModelForTask } from './configLoader.js'; // Import the new utility

/**
 * Performs a single research query using the configured Perplexity model.
 * @param query The research query string.
 * @param config OpenRouter configuration containing the specific perplexityModel name.
 * @returns The research result content as a string.
 * @throws Error if the API call fails or returns no content.
 */
export async function performResearchQuery(query: string, config: OpenRouterConfig): Promise<string> {
  const logicalTaskName = 'research_query';
  logger.debug({ query, model: config.perplexityModel }, "Performing Perplexity research query"); // Keep original log for context

  // Check for API key first
  if (!config.apiKey) {
    throw new ConfigurationError("OpenRouter API key (OPENROUTER_API_KEY) is not configured.");
  }

  // Select the model using the utility function
  const defaultModel = config.perplexityModel || "perplexity/sonar-deep-research"; // Use configured perplexity model as default
  const modelToUse = selectModelForTask(config, logicalTaskName, defaultModel);

  try {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: modelToUse, // Use the dynamically selected model
        messages: [
          { role: "system", content: "You are a sophisticated AI research assistant using Perplexity Sonar Deep Research. Provide comprehensive, accurate, and up-to-date information. Research the user's query thoroughly." },
          { role: "user", content: query }
        ],
        max_tokens: 4000,
        temperature: 0.1
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${config.apiKey}`,
          "HTTP-Referer": "https://vibe-coder-mcp.local" // Optional
        },
        timeout: 90000 // Increased timeout for potentially deeper research (90s)
      }
    );

    if (response.data?.choices?.[0]?.message?.content) {
      logger.debug({ query, modelUsed: modelToUse }, "Research query successful");
      return response.data.choices[0].message.content.trim();
    } else {
      logger.warn({ query, responseData: response.data, modelUsed: modelToUse }, "Received empty or unexpected response structure from research call");
      // Throw specific ParsingError
      throw new ParsingError(
        "Invalid API response structure received from research call",
        { query, responseData: response.data, modelUsed: modelToUse }
      );
    }
  } catch (error) {
    logger.error({ err: error, query, modelUsed: modelToUse }, "Research API call failed");

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data;
      const apiMessage = `Research API Error: Status ${status || 'N/A'}. ${axiosError.message}`;
      // Throw specific ApiError
      throw new ApiError(
        apiMessage,
        status,
        { query, modelUsed: modelToUse, responseData },
        axiosError // Pass original AxiosError
      );
    } else if (error instanceof AppError) {
        // Re-throw known AppErrors (like ParsingError from above)
        throw error;
    } else if (error instanceof Error) {
      // Wrap other standard errors
       throw new AppError(
         `Research failed: ${error.message}`,
         { query, modelUsed: modelToUse },
         error // Pass original Error
       );
    } else {
      // Handle cases where a non-Error was thrown
      throw new AppError(
        `Unknown error during research.`,
        { query, modelUsed: modelToUse, thrownValue: String(error) }
      );
    }
  }
}
