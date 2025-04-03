import { ToolExecutor } from '../../services/routing/toolRegistry.js';
export declare function initDirectories(): Promise<void>;
/**
 * Generate user stories based on a product description.
 * This function now acts as the executor for the 'generate-user-stories' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export declare const generateUserStories: ToolExecutor;
