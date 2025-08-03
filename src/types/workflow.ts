/**
 * MCP Client Environment Variables Interface
 * Represents environment variables passed from MCP client configuration
 */
export interface MCPEnvironmentVariables {
  readonly VIBE_TASK_MANAGER_READ_DIR?: string;
  readonly VIBE_CODER_OUTPUT_DIR?: string;
  readonly CODE_MAP_ALLOWED_DIR?: string;
  readonly VIBE_TASK_MANAGER_SECURITY_MODE?: 'strict' | 'permissive';
  readonly LOG_LEVEL?: string;
  readonly NODE_ENV?: string;
  readonly LLM_CONFIG_PATH?: string;
  readonly [key: string]: string | undefined;
}

/**
 * Configuration options for using OpenRouter API
 */
export interface OpenRouterConfig {
  baseUrl: string;
  apiKey: string;
  geminiModel: string;
  perplexityModel: string;
  llm_mapping?: Record<string, string>; // Optional: Mapping of logical task names to model strings

  // Tool-specific configurations
  tools?: Record<string, unknown>;
  config?: Record<string, unknown>;
  
  // MCP Client environment variables (optional)
  env?: MCPEnvironmentVariables;
}


/**
 * Message object for LLM requests
 */
export interface Message {
  role: string;
  content: string;
}

/**
 * Request format for LLM API calls
 */
export interface LLMRequest {
  messages: Message[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  stop?: string[];
}

/**
 * Response format from LLM API calls
 */
export interface LLMResponse {
  id: string;
  choices: {
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  model: string;
}

/**
 * Result type for the PRD Generator tool
 */
export interface PrdGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the User Stories Generator tool
 */
export interface UserStoriesGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Task List Generator tool
 */
export interface TaskListGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Research Manager tool
 */
export interface ResearchManagerResult {
  content: {
    type: "text";
    text: string;
  }[];
}

/**
 * Result type for the Rules Generator tool
 */
export interface RulesGeneratorResult {
  content: {
    type: "text";
    text: string;
  }[];
}


/**
 * Standard response format for all tools
 */
export interface ToolResponse {
  content: {
    type: "text";
    text: string;
  }[];
  isError?: boolean;
}
