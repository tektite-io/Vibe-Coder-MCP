// Reconnecting pattern matching for improved NLP accuracy
import { matchRequest } from "../matching-service/index.js";
import { MatchResult } from "../../types/tools.js";
import { processWithSequentialThinking } from "../../tools/sequential-thinking.js";
import { OpenRouterConfig } from "../../types/workflow.js";
import { findBestSemanticMatch } from "../routing/semanticMatcher.js";
import logger from "../../logger.js";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Confidence thresholds
// const HIGH_CONFIDENCE = 0.8; // Currently unused but may be needed for future confidence checks
// const MEDIUM_CONFIDENCE = 0.6; // Removed unused variable
// const LOW_CONFIDENCE = 0.4; // Removed unused variable

// Cache for tool descriptions
let toolDescriptionsCache: Record<string, string> | null = null;

/**
 * Hybrid matching result with additional metadata
 */
export interface EnhancedMatchResult extends MatchResult {
  parameters: Record<string, unknown>;
  matchMethod: "rule" | "intent" | "semantic" | "sequential"; // Added "semantic"
  requiresConfirmation: boolean;
}

/**
 * Load tool descriptions from mcp-config.json
 * @returns Map of tool names to descriptions
 */
function loadToolDescriptions(): Record<string, string> {
  if (toolDescriptionsCache) {
    return toolDescriptionsCache;
  }
  
  try {
    const configPath = path.join(__dirname, '../../../mcp-config.json');
    const configContent = readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configContent);
    
    interface ToolConfig {
      description?: string;
      [key: string]: unknown;
    }
    
    const descriptions: Record<string, string> = {};
    for (const [name, tool] of Object.entries(config.tools)) {
      const toolData = tool as ToolConfig;
      descriptions[name] = toolData.description || '';
    }
    
    toolDescriptionsCache = descriptions;
    return descriptions;
  } catch (error) {
    logger.error({ err: error }, 'Failed to load tool descriptions');
    return {};
  }
}

/**
 * Try keyword matching for the request
 */
async function tryKeywordMatch(request: string): Promise<MatchResult | null> {
  const lowerRequest = request.toLowerCase();
  const toolKeywords: Record<string, string[]> = {
    'prd-generator': ['prd', 'product requirement'],
    'user-stories-generator': ['user stor', 'acceptance criteria'],
    'task-list-generator': ['task list', 'todo', 'tasks'],
    'vibe-task-manager': ['vibe', 'task manager', 'decompose', 'atomic'],
    'map-codebase': ['map', 'codebase', 'structure', 'architecture'],
    'research-manager': ['research', 'investigate', 'explore'],
    'curate-context': ['curate', 'context', 'meta-prompt'],
    'run-workflow': ['workflow', 'run workflow'],
    'rules-generator': ['rules', 'standards', 'guidelines', 'style guide'],
    'fullstack-starter-kit-generator': ['starter kit', 'scaffold', 'boilerplate'],
    'get-job-result': ['job result', 'job status', 'check job'],
    'register-agent': ['register agent', 'add agent'],
    'get-agent-tasks': ['agent tasks', 'poll tasks'],
    'submit-task-response': ['submit response', 'task completion'],
    'process-request': ['process request', 'route request']
  };

  for (const [tool, keywords] of Object.entries(toolKeywords)) {
    if (keywords.some(kw => lowerRequest.includes(kw))) {
      logger.debug(`Keyword match for ${tool}`);
      return {
        toolName: tool,
        confidence: 0.85,
        matchedPattern: 'keyword_match'
      };
    }
  }
  
  return null;
}

/**
 * Try pattern matching for the request
 */
async function tryPatternMatch(request: string): Promise<MatchResult | null> {
  const patternMatch = matchRequest(request);
  if (patternMatch && patternMatch.confidence >= 0.6) {
    logger.debug(`Pattern match found: ${patternMatch.toolName} (${patternMatch.confidence})`);
    return patternMatch;
  }
  return null;
}

/**
 * Try semantic matching for the request
 */
async function trySemanticMatch(request: string): Promise<MatchResult | null> {
  const semanticMatch = await findBestSemanticMatch(request);
  if (semanticMatch) {
    logger.debug(`Semantic match found: ${semanticMatch.toolName} (${semanticMatch.confidence})`);
    return semanticMatch;
  }
  return null;
}

/**
 * Try LLM matching for the request
 */
async function tryLLMMatch(request: string, config: OpenRouterConfig): Promise<MatchResult | null> {
  // Keep one debug log for monitoring when LLM is called
  logger.debug(`🔍 LLM: Processing request: "${request.substring(0, 50)}..."`);
  
  try {
    const sequentialResult = await performSequentialThinking(
      request,
      "", // System prompt not needed with enhanced function
      config
    );

    logger.debug(`🔍 LLM: Response received (${sequentialResult.length} chars)`);

    // Try to extract tool name from the response
    let toolName = "";
    
    // First, try the simple case - LLM returns just the tool name
    const cleanResponse = sequentialResult.trim().toLowerCase();
    const validTools = [
      "research-manager", "prd-generator", "user-stories-generator", "task-list-generator", 
      "rules-generator", "run-workflow", "get-job-result", "map-codebase", 
      "vibe-task-manager", "curate-context", "fullstack-starter-kit-generator", 
      "register-agent", "get-agent-tasks", "submit-task-response", "process-request"
    ];
    
    // Check if the entire response is a valid tool name (best case)
    if (validTools.includes(cleanResponse)) {
      toolName = cleanResponse;
      logger.debug(`🔍 LLM: Clean match - "${toolName}"`);
    }
    
    // If not a direct match, try to find tool name with various patterns
    if (!toolName) {
      // Try to find a tool name mentioned in backticks
      const backtickMatch = sequentialResult.match(/`([^`]+)`/);
      if (backtickMatch) {
        const candidate = backtickMatch[1].toLowerCase().trim();
        if (validTools.includes(candidate)) {
          toolName = candidate;
        }
      }
    }
    
    // If still no match, look for tool names anywhere in the text
    if (!toolName) {
      // Check if any valid tool name appears in the response
      for (const tool of validTools) {
        if (sequentialResult.toLowerCase().includes(tool)) {
          toolName = tool;
          break;
        }
      }
    }
    
    // If still no match, try extracting from first line after colon
    if (!toolName) {
      const colonExtract = sequentialResult
        .split("\n")[0]
        .split(":").pop()
        ?.trim().toLowerCase() || "";
      
      if (validTools.includes(colonExtract)) {
        toolName = colonExtract;
      }
    }
    
    // Validate the extracted tool name
    if (toolName && validTools.includes(toolName)) {
      logger.debug(`🔍 LLM: Matched "${toolName}" with confidence 0.7`);
      return {
        toolName: toolName,
        confidence: 0.7,
        matchedPattern: "llm_match"
      };
    }
  } catch (error) {
    logger.error({ err: error }, "LLM matching failed");
  }
  
  return null;
}

/**
 * Combine results from all matching methods using weighted voting
 */
function combineResults(
  keyword: MatchResult | null,
  pattern: MatchResult | null,
  semantic: MatchResult | null,
  llm: MatchResult | null,
  request: string
): EnhancedMatchResult {
  // Adjusted weights for better accuracy
  const weights = {
    keyword: 0.35,   // High - exact matches are very reliable
    pattern: 0.30,   // High - structured patterns are reliable
    semantic: 0.15,  // Lower - can be confused by similar vocabulary
    llm: 0.20        // Medium - has context but can hallucinate
  };
  
  // Collect all tool recommendations with weighted scores
  const toolScores: Record<string, number> = {};
  
  if (keyword) {
    const tool = keyword.toolName;
    toolScores[tool] = (toolScores[tool] || 0) + (keyword.confidence * weights.keyword);
  }
  
  if (pattern) {
    const tool = pattern.toolName;
    toolScores[tool] = (toolScores[tool] || 0) + (pattern.confidence * weights.pattern);
  }
  
  if (semantic) {
    const tool = semantic.toolName;
    toolScores[tool] = (toolScores[tool] || 0) + (semantic.confidence * weights.semantic);
  }
  
  if (llm) {
    const tool = llm.toolName;
    toolScores[tool] = (toolScores[tool] || 0) + (llm.confidence * weights.llm);
  }
  
  // Find best tool
  let bestTool = 'research-manager'; // Default fallback
  let bestScore = 0.1; // Minimum confidence
  
  for (const [tool, score] of Object.entries(toolScores)) {
    if (score > bestScore) {
      bestTool = tool;
      bestScore = score;
    }
  }
  
  // Determine match method based on which method contributed most
  let matchMethod: "rule" | "semantic" | "sequential" = "sequential";
  if (keyword && keyword.toolName === bestTool) {
    matchMethod = "rule";
  } else if (pattern && pattern.toolName === bestTool) {
    matchMethod = "rule";
  } else if (semantic && semantic.toolName === bestTool) {
    matchMethod = "semantic";
  }
  
  // Extract parameters based on the tool
  // Using 'unknown' for parameters as they vary by tool and will be validated by each tool's schema
  let parameters: Record<string, unknown> = {};
  
  // For research-manager: requires 'query'
  if (bestTool === 'research-manager') {
    // Remove common prefixes like "research", "investigate", "explore" from the request
    let query = request
      .replace(/^(research|investigate|explore|find out about|look up|search for|what is|how to)\s+/i, '')
      .trim();
    
    // If nothing was removed, use the full request
    if (!query || query === request.trim()) {
      query = request;
    }
    
    parameters = { query };
  } 
  // For PRD generator: requires 'productDescription'
  else if (bestTool === 'prd-generator') {
    // Remove common prefixes like "generate prd for", "create prd for"
    let productDescription = request
      .replace(/^(generate|create|make|build|write)\s+(a\s+)?prd\s+(for|about)?\s*/i, '')
      .trim();
    
    if (!productDescription) {
      productDescription = request;
    }
    
    parameters = { productDescription };
  }
  // For user stories generator: requires 'productDescription'
  else if (bestTool === 'user-stories-generator') {
    // Remove common prefixes
    let productDescription = request
      .replace(/^(generate|create|make|build|write)\s+(user\s+)?stories?\s+(for|about)?\s*/i, '')
      .trim();
    
    if (!productDescription) {
      productDescription = request;
    }
    
    parameters = { productDescription };
  }
  // For task list generator: requires 'productDescription' and 'userStories'
  else if (bestTool === 'task-list-generator') {
    // Remove common prefixes
    let productDescription = request
      .replace(/^(generate|create|make|build|write)\s+(development\s+)?(task\s+)?list\s+(for|about|to\s+implement)?\s*/i, '')
      .trim();
    
    if (!productDescription) {
      productDescription = request;
    }
    
    // Generate default user stories based on the product description if not provided
    // This ensures we meet the minimum 20 character requirement
    const defaultUserStories = `As a user, I want to use the ${productDescription} so that I can achieve my goals efficiently.`;
    
    parameters = { 
      productDescription,
      userStories: defaultUserStories
    };
  }
  // For rules generator: requires 'productDescription', optionally 'userStories' and 'ruleCategories'
  else if (bestTool === 'rules-generator') {
    // Remove common prefixes
    let productDescription = request
      .replace(/^(generate|create|make|build|write)\s+rules?\s+(for|about)?\s*/i, '')
      .trim();
    
    if (!productDescription) {
      productDescription = request;
    }
    
    parameters = { 
      productDescription,
      userStories: '', // Optional
      ruleCategories: [] as string[] // Optional array
    };
  }
  // For context curator: requires 'prompt' or 'task_type'
  else if (bestTool === 'curate-context' || bestTool === 'context-curator') {
    // Remove common prefixes
    let prompt = request
      .replace(/^(curate|create|generate|build)\s+context\s+(for|about)?\s*/i, '')
      .trim();
    
    if (!prompt) {
      prompt = request;
    }
    
    // Detect task type based on keywords in the request
    let task_type: string = 'auto_detect'; // Default to auto_detect
    if (request.match(/\b(bug|fix|error|issue|problem)\b/i)) {
      task_type = 'bug_fix';
    } else if (request.match(/\b(refactor|clean|improve|restructure)\b/i)) {
      task_type = 'refactoring';
    } else if (request.match(/\b(performance|optimize|speed|faster)\b/i)) {
      task_type = 'performance_optimization';
    } else if (request.match(/\b(feature|add|implement|create|new)\b/i)) {
      task_type = 'feature_addition';
    }
    
    parameters = { 
      prompt,
      task_type
    };
  }
  // For fullstack starter kit generator: requires 'use_case'
  else if (bestTool === 'fullstack-starter-kit-generator') {
    // Remove common prefixes
    let use_case = request
      .replace(/^(generate|create|make|build|scaffold)\s+(a\s+)?(fullstack\s+)?starter\s+(kit|project|app)\s+(for|about)?\s*/i, '')
      .trim();
    
    if (!use_case) {
      use_case = request;
    }
    
    parameters = { use_case };
  }
  // For map-codebase: optional 'directory' parameter
  else if (bestTool === 'map-codebase') {
    // Check if a specific directory is mentioned
    const dirMatch = request.match(/(?:for|in|of|at)\s+([\w\-./]+)/i);
    if (dirMatch) {
      parameters = { directory: dirMatch[1] };
    } else {
      parameters = { directory: '.' }; // Default to current directory
    }
  }
  // For vibe-task-manager: uses 'task' parameter
  else if (bestTool === 'vibe-task-manager') {
    // Remove common prefixes
    let task = request
      .replace(/^(use\s+)?vibe(\s+task\s+manager)?\s+(to|for)?\s*/i, '')
      .trim();
    
    if (!task) {
      task = request;
    }
    
    parameters = { task };
  }
  // For workflow runner: requires 'workflowName' and 'workflowInput'
  else if (bestTool === 'run-workflow') {
    // Try to extract workflow name from request
    const workflowMatch = request.match(/(?:run|execute|start)\s+([a-zA-Z0-9-_]+)\s+workflow/i);
    if (workflowMatch) {
      parameters = { 
        workflowName: workflowMatch[1],
        workflowInput: {} as Record<string, unknown> // Empty object as default
      };
    } else {
      // If no specific workflow mentioned, look for "run workflow" pattern
      const simpleMatch = request.match(/(?:run|execute)\s+workflow/i);
      if (simpleMatch) {
        // Try to find the workflow name elsewhere in the request
        const nameMatch = request.match(/\b([a-zA-Z0-9-_]+)\b/);
        parameters = {
          workflowName: nameMatch ? nameMatch[1] : 'default',
          workflowInput: {} as Record<string, unknown>
        };
      } else {
        // Fallback - use the full request
        parameters = {
          workflowName: 'default',
          workflowInput: { request } as Record<string, unknown>
        };
      }
    }
  }
  // For get-job-result: requires 'jobId'
  else if (bestTool === 'get-job-result') {
    // Clean up the request first
    const cleanRequest = request.replace(/\s+/g, ' ').trim();
    
    // Try to extract job ID from request - look for various patterns
    // Order matters: most specific patterns first
    const patterns = [
      // UUID pattern
      /\b([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\b/i,
      // job- prefix pattern with full ID
      /\b(job-[\w-]+)\b/i,
      // task- prefix pattern
      /\b(task-[\w-]+)\b/i,
      // abc-123-xyz pattern
      /\b([a-zA-Z]+-\d+-[a-zA-Z]+)\b/,
      // Date-based pattern (2024-01-15-001)
      /\b(\d{4}-\d{2}-\d{2}-\d{3})\b/,
      // Look for "job" or "result" followed by an ID-like string
      /(?:job|result|id)\s+(?:for\s+)?(?:job\s+)?([a-zA-Z0-9][a-zA-Z0-9-_]*)/i,
      // Any hyphenated string that looks like an ID
      /\b([a-zA-Z0-9]+(?:-[a-zA-Z0-9]+){1,})\b/,
    ];
    
    let jobId = '';
    for (const pattern of patterns) {
      const match = cleanRequest.match(pattern);
      if (match && match[1]) {
        // Skip common words that might match but aren't IDs
        const candidate = match[1];
        if (!['for', 'job', 'result', 'get', 'check', 'status', 'of'].includes(candidate.toLowerCase())) {
          jobId = candidate;
          break;
        }
      }
    }
    
    // If still no match, try to find the most ID-like token
    if (!jobId) {
      const words = cleanRequest.split(/\s+/);
      // Look for words with hyphens or that look like IDs
      const candidates = words.filter(w => 
        (w.includes('-') && w.length > 3) || 
        (w.length > 8 && /[0-9]/.test(w))
      );
      
      // Pick the most ID-like candidate
      if (candidates.length > 0) {
        // Prefer candidates with hyphens
        jobId = candidates.find(c => c.includes('-')) || candidates[0];
      }
    }
    
    parameters = { 
      jobId: jobId || 'unknown',
      includeDetails: true // Default to true
    };
  }
  // For process-request: uses the full request
  else if (bestTool === 'process-request') {
    parameters = { request };
  }
  // Default fallback for any other tools
  else {
    // Use common parameter names that many tools might accept
    parameters = { 
      description: request,
      prompt: request,
      query: request,
      task: request
    };
  }
  
  // Return in existing format
  return {
    toolName: bestTool,
    confidence: bestScore,
    matchedPattern: 'ensemble',
    parameters,
    matchMethod,
    requiresConfirmation: bestScore < 0.7
  };
}

/**
 * Normalize input to handle compound words and variations
 * @param input The raw input string
 * @returns Normalized input string
 */
function normalizeInput(input: string): string {
  return input
    .toLowerCase()
    .replace(/[-_\s]+/g, ' ') // Normalize spaces/hyphens/underscores
    .replace(/\btasklist\b/g, 'task list') // Expand compound words
    .replace(/\bcodebase\b/g, 'code base')
    .replace(/\btodo\s?list\b/g, 'task list')
    .replace(/\busersto/g, 'user sto') // Handle common typos
    .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
    .trim();
}

/**
 * Main hybrid matching function that implements the fallback flow
 * 1. Try Pattern Matching (fastest, most accurate for defined patterns)
 * 2. Try Semantic Matching (embeddings-based similarity)
 * 3. Fall back to Sequential Thinking (LLM-based)
 * 4. Default Fallback
 *
 * @param request The user request to match
 * @param config OpenRouter configuration for sequential thinking
 * @returns Enhanced match result with parameters and metadata
 */
export async function hybridMatch(
  request: string,
  config: OpenRouterConfig
): Promise<EnhancedMatchResult> {
  // Normalize the input first
  const normalizedRequest = normalizeInput(request);
  
  logger.info(`Starting parallel matching for: "${normalizedRequest.substring(0, 50)}..."`);
  
  // Run ALL methods simultaneously for parallel processing
  const [keywordResult, patternResult, semanticResult, llmResult] = await Promise.all([
    tryKeywordMatch(normalizedRequest),
    tryPatternMatch(normalizedRequest),
    trySemanticMatch(normalizedRequest),
    tryLLMMatch(normalizedRequest, config)
  ]);
  
  // Log results for debugging
  if (keywordResult) {
    logger.info(`Keyword match: ${keywordResult.toolName} (${keywordResult.confidence})`);
  }
  if (patternResult) {
    logger.info(`Pattern match: ${patternResult.toolName} (${patternResult.confidence})`);
  }
  if (semanticResult) {
    logger.info(`Semantic match: ${semanticResult.toolName} (${semanticResult.confidence})`);
  }
  if (llmResult) {
    logger.info(`LLM match: ${llmResult.toolName} (${llmResult.confidence})`);
  }
  
  // Combine results into single recommendation using weighted voting
  const result = combineResults(
    keywordResult,
    patternResult,
    semanticResult,
    llmResult,
    request  // Use original request for parameter extraction to preserve hyphens in IDs
  );
  
  logger.info(`Final recommendation: ${result.toolName} at ${(result.confidence * 100).toFixed(1)}% confidence`);
  
  return result;
}

/**
 * Helper function to use sequential thinking for tool selection
 *
 * @param request The user's request
 * @param systemPrompt The prompt to guide sequential thinking
 * @param config OpenRouter configuration
 * @returns The result of sequential thinking
 */
async function performSequentialThinking(
  request: string,
  systemPrompt: string,
  config: OpenRouterConfig
): Promise<string> {
  // Load tool descriptions for enhanced context
  const toolDescriptions = loadToolDescriptions();
  
  // Build enhanced prompt with tool descriptions
  const toolNames = Object.keys(toolDescriptions);
  const enhancedPrompt = `You are a tool selection expert. Your task is to select the BEST tool for the user's request.

AVAILABLE TOOLS WITH DESCRIPTIONS:
${Object.entries(toolDescriptions).map(([name, desc]) => 
  `- ${name}: ${desc}`
).join('\n')}

USER REQUEST: "${request}"

ANALYSIS STEPS:
1. What action does the user want? (create/research/analyze/etc)
2. What output do they expect? (list/document/code/etc)
3. Which tool's purpose best matches?

CRITICAL INSTRUCTIONS:
- You MUST respond with ONLY the tool name
- Do NOT include any explanation or reasoning
- Do NOT include quotes, backticks, or formatting
- Just type the exact tool name and nothing else

VALID TOOL NAMES (choose one):
${toolNames.join(', ')}

EXAMPLE RESPONSES:
User: "I need to create a task list for my project"
Response: task-list-generator

User: "Research best practices for React"
Response: research-manager

User: "Generate PRD for mobile app"
Response: prd-generator

NOW RESPOND WITH ONLY THE TOOL NAME:`;
  
  return await processWithSequentialThinking(enhancedPrompt, config);
}

/**
 * Get a human-readable description of why a match was chosen
 *
 * @param match The enhanced match result
 * @returns A string explaining the match
 */
export function getMatchExplanation(match: EnhancedMatchResult): string {
  switch (match.matchMethod) {
    // Removed "rule" and "intent" cases
    case "semantic":
      return `I chose the ${match.toolName} because your request seems semantically similar to its purpose. I'm ${Math.round(match.confidence * 100)}% confident.`;

    case "sequential":
      if (match.matchedPattern === "fallback") {
        return `I wasn't sure which tool to use, so I'm defaulting to the ${match.toolName}. Please let me know if you'd prefer a different tool.`;
      } else {
        return `After analyzing your request, I believe the ${match.toolName} is the most appropriate tool to use.`;
      }

    default:
      return `I selected the ${match.toolName} based on your request.`;
  }
}
