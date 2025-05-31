/**
 * Example: Integrating Prompt Optimization into Existing Tools
 * 
 * This file demonstrates how to integrate the prompt optimization system
 * into existing tools for better JSON generation success rates.
 */

import { performOptimizedJsonLlmCall, normalizeJsonResponse } from '../utils/llmHelper.js';
import { getPromptOptimizer } from '../utils/prompt-optimizer.js';
import { OpenRouterConfig } from '../types/workflow.js';
import logger from '../logger.js';

/**
 * Example 1: Enhanced Fullstack Starter Kit Module Selection
 * Shows how to integrate prompt optimization into the module selection process
 */
export async function enhancedModuleSelection(
  useCase: string,
  techStackPreferences: object,
  config: OpenRouterConfig
): Promise<{ globalParams: object; moduleSelections: Array<object> }> {
  
  // Define the expected schema for better optimization
  const expectedSchema = {
    type: "object",
    required: ["globalParams", "moduleSelections"],
    properties: {
      globalParams: {
        type: "object",
        properties: {
          projectName: { type: "string" },
          projectDescription: { type: "string" }
        }
      },
      moduleSelections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            modulePath: { type: "string" },
            params: { type: "object" },
            moduleKey: { type: "string" }
          }
        }
      }
    }
  };

  const systemPrompt = `You are an expert Full-Stack Software Architect AI. 
Select appropriate YAML module templates and provide necessary parameters to compose a full-stack starter kit.`;

  const userPrompt = `
Based on the following requirements, select modules and parameters:

Use Case: ${useCase}
Tech Stack Preferences: ${JSON.stringify(techStackPreferences, null, 2)}

Select a sensible and comprehensive set of modules for a complete starter kit.
Consider including:
- A frontend framework
- A backend framework  
- A database (if applicable)
- Authentication (if applicable)
- Basic security considerations
- Docker setup (if appropriate)`;

  try {
    // Use the optimized LLM call with automatic prompt enhancement
    const result = await performOptimizedJsonLlmCall(
      userPrompt,
      systemPrompt,
      config,
      'fullstack_starter_kit_module_selection',
      expectedSchema,
      0.1
    );

    logger.info({
      optimizationApplied: result.optimizationApplied,
      responseLength: result.response.length
    }, 'Enhanced module selection completed with prompt optimization');

    // Parse the response with enhanced error recovery
    const normalizedResponse = normalizeJsonResponse(result.response, 'module_selection');
    const moduleSelections = JSON.parse(normalizedResponse);

    return moduleSelections;
  } catch (error) {
    logger.error({ error }, 'Enhanced module selection failed');
    throw error;
  }
}

/**
 * Example 2: Enhanced YAML Module Generation
 * Shows how to optimize prompts for dynamic YAML module generation
 */
export async function enhancedYamlModuleGeneration(
  category: string,
  technology: string,
  modulePathSegment: string,
  config: OpenRouterConfig
): Promise<object> {

  const expectedSchema = {
    type: "object",
    required: ["moduleName", "description", "type"],
    properties: {
      moduleName: { type: "string" },
      description: { type: "string" },
      type: { type: "string" },
      placeholders: { type: "array", items: { type: "string" } },
      provides: {
        type: "object",
        properties: {
          techStack: { type: "object" },
          directoryStructure: { type: "array" },
          dependencies: { type: "object" },
          setupCommands: { type: "array" }
        }
      }
    }
  };

  const systemPrompt = `You are an expert software architect specializing in project template generation.
Your task is to generate a JSON object that represents the structure of a YAML module file.
This JSON object must conform to the ParsedYamlModule TypeScript interface structure.

The generated module is for: Category '${category}', Technology '${technology}'.
The module path segment is '${modulePathSegment}'.

IMPORTANT:
- Generate ONLY the raw JSON object. Do NOT use Markdown, code blocks, or any surrounding text.
- Ensure all paths in 'directoryStructure' are relative to the module's own root.
- For 'directoryStructure', a 'file' type should not have a 'children' array.
- Use common placeholders like {projectName}, {backendPort}, {frontendPort} where appropriate.
- Be comprehensive but sensible for a starter module of type '${category}' using '${technology}'.`;

  const userPrompt = `Generate the JSON representation for a YAML module.
Category: ${category}
Technology: ${technology}
Module Path Segment: ${modulePathSegment}

Consider typical files, dependencies, and configurations for this type of module.
Provide a sensible set of placeholders if needed.
Ensure the output is a single, raw JSON object without any other text or formatting.`;

  try {
    const result = await performOptimizedJsonLlmCall(
      userPrompt,
      systemPrompt,
      config,
      'fullstack_starter_kit_dynamic_yaml_module_generation',
      expectedSchema,
      0.2
    );

    logger.info({
      modulePathSegment,
      optimizationApplied: result.optimizationApplied
    }, 'Enhanced YAML module generation completed');

    const normalizedResponse = normalizeJsonResponse(result.response, `yaml_gen_${modulePathSegment}`);
    const yamlModule = JSON.parse(normalizedResponse);

    return yamlModule;
  } catch (error) {
    logger.error({ error, modulePathSegment }, 'Enhanced YAML module generation failed');
    throw error;
  }
}

/**
 * Example 3: Enhanced Intent Recognition
 * Shows how to optimize prompts for task manager intent recognition
 */
export async function enhancedIntentRecognition(
  userInput: string,
  context: object,
  config: OpenRouterConfig
): Promise<{
  intent: string;
  confidence: number;
  parameters: object;
  context: object;
  alternatives: Array<object>;
  clarifications_needed: Array<string>;
}> {

  const expectedSchema = {
    type: "object",
    required: ["intent", "confidence", "parameters"],
    properties: {
      intent: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      parameters: { type: "object" },
      context: { type: "object" },
      alternatives: { type: "array" },
      clarifications_needed: { type: "array", items: { type: "string" } }
    }
  };

  const systemPrompt = `You are an expert natural language processing system for task management.
Analyze user input and identify specific task management intents with relevant parameters.
Provide confidence scores based on how clear the intent is.`;

  const userPrompt = `Please analyze the following user input and identify the intent:

"${userInput}"

Additional context:
${JSON.stringify(context, null, 2)}

Focus on accuracy and provide confidence scores based on how clear the intent is.`;

  try {
    const result = await performOptimizedJsonLlmCall(
      userPrompt,
      systemPrompt,
      config,
      'vibe_task_manager_intent_recognition',
      expectedSchema,
      0.1
    );

    logger.info({
      userInput: userInput.substring(0, 100),
      optimizationApplied: result.optimizationApplied
    }, 'Enhanced intent recognition completed');

    const normalizedResponse = normalizeJsonResponse(result.response, 'intent_recognition');
    const intentResult = JSON.parse(normalizedResponse);

    return intentResult;
  } catch (error) {
    logger.error({ error, userInput }, 'Enhanced intent recognition failed');
    throw error;
  }
}

/**
 * Example 4: Monitoring and Analytics
 * Shows how to monitor prompt optimization effectiveness
 */
export function getPromptOptimizationAnalytics(): {
  overallStats: object;
  taskBreakdown: Array<{ task: string; successRate: number; totalAttempts: number }>;
  topErrors: Array<{ pattern: string; frequency: number }>;
  recommendations: Array<string>;
} {
  const optimizer = getPromptOptimizer();
  const stats = optimizer.getOptimizationStats();

  // Generate recommendations based on statistics
  const recommendations: string[] = [];
  
  if (stats.averageSuccessRate < 0.8) {
    recommendations.push('Consider enabling schema hints for better JSON structure guidance');
  }
  
  if (stats.errorPatterns > 10) {
    recommendations.push('High number of error patterns detected - review and update error prevention rules');
  }
  
  if (stats.topErrors.length > 0) {
    const topError = stats.topErrors[0];
    recommendations.push(`Most common error: ${topError.pattern} (${topError.frequency} occurrences) - consider targeted optimization`);
  }

  return {
    overallStats: {
      totalTasks: stats.totalTasks,
      averageSuccessRate: stats.averageSuccessRate,
      errorPatterns: stats.errorPatterns
    },
    taskBreakdown: [], // Would be populated with per-task statistics
    topErrors: stats.topErrors,
    recommendations
  };
}

/**
 * Example 5: Configuration Management
 * Shows how to configure prompt optimization for different environments
 */
export function configurePromptOptimization(environment: 'development' | 'staging' | 'production') {
  const optimizer = getPromptOptimizer({
    enableJsonOptimization: true,
    includeSchemaHints: environment !== 'production', // More verbose in dev/staging
    useErrorPatternLearning: true,
    maxPromptLength: environment === 'production' ? 3000 : 4000 // Shorter in production
  });

  logger.info({
    environment,
    config: {
      enableJsonOptimization: true,
      includeSchemaHints: environment !== 'production',
      useErrorPatternLearning: true,
      maxPromptLength: environment === 'production' ? 3000 : 4000
    }
  }, 'Prompt optimization configured for environment');

  return optimizer;
}
