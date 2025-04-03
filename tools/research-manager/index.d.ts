import { ToolExecutor } from '../../services/routing/toolRegistry.js';
export declare function initDirectories(): Promise<void>;
/**
 * Perform research on a topic using Perplexity Sonar via OpenRouter and enhance with sequential thinking.
 * This function now acts as the executor for the 'research' tool.
 * @param params The tool parameters, expecting { query: string }.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export declare const performResearch: ToolExecutor;
