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
        max_tokens: 8000, // Increased from 4000 to handle larger template generations
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

/**
 * Normalizes a raw LLM response that should contain JSON.
 * Handles various formats including Markdown code blocks, single-line code blocks,
 * and extraneous text before/after the JSON object.
 *
 * @param rawResponse - The raw response string from the LLM
 * @param jobId - Optional job ID for logging purposes
 * @returns A normalized string that should be valid JSON
 */
export function normalizeJsonResponse(rawResponse: string, jobId?: string): string {
  // If the response is empty or undefined, return it as is
  if (!rawResponse) {
    return rawResponse;
  }
  logger.debug({ jobId, rawResponseLength: rawResponse.length }, "Starting JSON normalization");

  // Step 1: Remove markdown code blocks if present
  // Look for ```json ... ``` or ``` ... ```
  const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/s);
  if (codeBlockMatch && codeBlockMatch[1]) {
    logger.debug({ jobId, extractionMethod: "markdown_code_block" }, "Extracted JSON from Markdown code block");
    return codeBlockMatch[1].trim();
  }

  // Step 2: Remove leading/trailing backticks on a single line if it's likely JSON
  // This is a bit more restrictive to avoid breaking plain strings wrapped in backticks
  const singleLineCodeMatch = rawResponse.match(/^`\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*`$/s);
  if (singleLineCodeMatch && singleLineCodeMatch[1]) {
    logger.debug({ jobId, extractionMethod: "single_line_code" }, "Extracted JSON from single-line code block");
    return singleLineCodeMatch[1].trim();
  }

  // Step 3: Attempt to find the first '{' or '[' and the last '}' or ']'
  // This is a more aggressive cleanup and should be used carefully.
  const jsonContent = rawResponse.trim(); // Trim whitespace first

  const firstBracket = jsonContent.indexOf('[');
  const firstBrace = jsonContent.indexOf('{');
  let start = -1;

  if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
    start = firstBracket;
  } else if (firstBrace !== -1) {
    start = firstBrace;
  }

  if (start !== -1) {
    const lastBracket = jsonContent.lastIndexOf(']');
    const lastBrace = jsonContent.lastIndexOf('}');
    let end = -1;

    // Determine the correct closing character based on the opening one
    if (start === firstBracket) { // Started with [
        end = lastBracket;
    } else { // Started with {
        end = lastBrace;
    }

    // If we found a potential start and a potential end for that type
    if (end !== -1 && end > start) {
        // Further check: what if there's extraneous text *before* the determined start?
        // e.g. "Here is the JSON: { ... }"
        const potentialJson = jsonContent.substring(start, end + 1);
        try {
            JSON.parse(potentialJson); // Try to parse this substring
            logger.debug({ jobId, extractionMethod: "substring_extraction", start, end, originalLength: rawResponse.length, newLength: potentialJson.length }, "Extracted JSON by finding first/last brace/bracket and validating substring");
            return potentialJson;
        } catch (error) {
            // The substring wasn't valid JSON, so the original logic might be flawed for this case.
            // Try a more direct extraction if the string starts/ends with braces/brackets but has surrounding text.
             logger.debug({ jobId, extractionMethod: "substring_extraction_failed_parse", error: error instanceof Error ? error.message : String(error), start, end }, "Substring extraction failed to parse, trying more direct extraction");
        }
    }
  }

  // Fallback: if the trimmed string starts with { and ends with } OR starts with [ and ends with ]
  // then assume it's the JSON object/array itself, possibly with non-JSON text outside.
  if ((jsonContent.startsWith('{') && jsonContent.endsWith('}')) || (jsonContent.startsWith('[') && jsonContent.endsWith(']'))) {
      try {
          JSON.parse(jsonContent); // Check if the trimmed content is already valid JSON
          logger.debug({ jobId, extractionMethod: "trimmed_is_valid_json" }, "Trimmed response is already valid JSON.");
          return jsonContent;
      } catch (e) {
          // If parsing fails, it means there's likely still surrounding text or malformed JSON.
          // The previous brace/bracket finding logic might be more robust here.
          // At this point, if the more targeted extractions didn't work, we might return the trimmed content
          // and let the caller's JSON.parse handle the error.
          logger.warn({ jobId, error: (e as Error).message }, "Trimmed content looks like JSON but failed to parse. Brace/Bracket extraction might be more appropriate if not already tried or successful.");
          // Re-attempt with first/last brace logic if not already done by a more specific match.
          // This handles cases like "Some text {json} some text" where the initial codeBlockMatch failed.
          const firstCurly = rawResponse.indexOf('{');
          const lastCurly = rawResponse.lastIndexOf('}');
          if (firstCurly !== -1 && lastCurly > firstCurly) {
            const extracted = rawResponse.substring(firstCurly, lastCurly + 1);
            try {
              JSON.parse(extracted);
              logger.debug({ jobId, extractionMethod: "aggressive_curly_extraction" }, "Extracted JSON using aggressive curly brace search");
              return extracted;
            } catch (subError) {
              logger.warn({ jobId, subError: (subError as Error).message }, "Aggressive curly brace extraction failed to parse.");
            }
          }
      }
  }


  logger.debug({ jobId, finalResponseLength: jsonContent.length }, "JSON normalization finished, returning potentially modified response.");
  // If no specific extraction method worked, return the trimmed original response.
  // The caller will attempt to parse it.
  return jsonContent;
}