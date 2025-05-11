import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js'; // Import the new helper
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';
import { starterKitDefinitionSchema, StarterKitDefinition, fileStructureItemSchema } from './schema.js';
import { generateSetupScripts, ScriptOutput } from './scripts.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js'; // Import ToolExecutionContext
import { jobManager, JobStatus } from '../../services/job-manager/index.js'; // Import job manager & status
import { sseNotifier } from '../../services/sse-notifier/index.js'; // Import SSE notifier
// Import necessary error types for direct LLM calls and parsing
import { AppError, ValidationError, ParsingError, ToolExecutionError } from '../../utils/errors.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
  // Fallback to default relative to CWD
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'workflow-agent-files');
}

// Define tool-specific directory using the helper
const STARTER_KIT_DIR = path.join(getBaseOutputDir(), 'fullstack-starter-kit-generator');

/**
 * Input schema for the Fullstack Starter Kit Generator tool
 */
export interface FullstackStarterKitInput {
  use_case: string;
  tech_stack_preferences?: {
    frontend?: string;
    backend?: string;
    database?: string;
    orm?: string;
    authentication?: string;
    deployment?: string;
    [key: string]: string | undefined;
  };
  request_recommendation?: boolean;
  include_optional_features?: string[];
}

// Initialize directories if they don't exist
export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir); // Ensure base directory exists
    const toolDir = path.join(baseOutputDir, 'fullstack-starter-kit-generator');
    await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
    logger.debug(`Ensured starter kit directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for fullstack-starter-kit-generator.`);
    // Decide if we should re-throw or just log. Logging might be safer.
  }
}

// --- Helper Function to Parse Directory Structure Markdown ---
// This parser is specific to the schema defined in ./schema.ts
function parseDirectoryStructureMarkdown(markdownList: string): z.infer<typeof fileStructureItemSchema>[] {
  logger.debug(`Parsing Directory Structure Markdown:\n${markdownList}`);
  const lines = markdownList.trim().split('\n');
  const root: z.infer<typeof fileStructureItemSchema>[] = [];
  const stack: { level: number; node: z.infer<typeof fileStructureItemSchema> }[] = [];

  lines.forEach(line => {
    if (!line.trim()) return;

    const indentMatch = line.match(/^(\s*)-\s*/);
    if (!indentMatch) {
      logger.warn(`Skipping line due to non-list format: "${line}"`);
      return;
    }

    const indentLevel = indentMatch[1].length / 2; // Assuming 2 spaces per indent
    const content = line.substring(indentMatch[0].length).trim();
    const nameMatch = content.match(/^([^#]+)/);
    let name = nameMatch ? nameMatch[1].trim() : content.trim();

    const isDirectory = name.endsWith('/');
    if (isDirectory) {
      name = name.slice(0, -1);
    }

    if (!name) {
      logger.warn(`Skipping line due to empty name after processing: "${line}"`);
      return;
    }

    // Use relative path from parent for 'path' field
    const relativePath = name; // In this simple parser, name is the relative path segment

    const newNode: z.infer<typeof fileStructureItemSchema> = {
      path: relativePath,
      type: isDirectory ? 'directory' : 'file',
      content: null, // Default to null, LLM should provide content/prompt separately if needed
      generationPrompt: null, // Default to null
      ...(isDirectory && { children: [] }),
    };

    while (stack.length > 0 && stack[stack.length - 1].level >= indentLevel) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(newNode);
    } else {
      const parentNode = stack[stack.length - 1].node;
      if (parentNode.type === 'directory' && parentNode.children) {
        parentNode.children.push(newNode);
      } else {
        logger.error(`Attempted to add child "${newNode.path}" to non-directory parent "${parentNode.path}". Adding to root.`);
        root.push(newNode);
      }
    }

    if (newNode.type === 'directory') {
      if (!newNode.children) newNode.children = [];
      stack.push({ level: indentLevel, node: newNode });
    }
  });

  logger.debug(`Parsed structure (before validation): ${JSON.stringify(root, null, 2)}`);
  const validationResult = z.array(fileStructureItemSchema).safeParse(root);
  if (!validationResult.success) {
    // Access error safely
    logger.error(`Parsed directory structure failed Zod validation: ${validationResult.error.message}`);
    throw new ValidationError('Parsed directory structure is invalid.', validationResult.error.issues);
  }

  return validationResult.data;
}


/**
 * Generate a fullstack starter kit with automatic validation
 */
// Define Input Type based on Schema for registration
const starterKitInputSchemaShape = {
  use_case: z.string().min(5, { message: "Use case must be at least 5 characters." }).describe("The specific use case for the starter kit (e.g., 'E-commerce site', 'Blog platform')"),
  tech_stack_preferences: z.record(z.string().optional()).optional().describe("Optional tech stack preferences (e.g., { frontend: 'Vue', backend: 'Python' })"),
  request_recommendation: z.boolean().optional().describe("Whether to request recommendations for tech stack components based on research"),
  include_optional_features: z.array(z.string()).optional().describe("Optional features to include (e.g., ['Docker', 'CI/CD'])")
};
// Keep internal type for function clarity if needed, but params will be Record<string, any>
// type FullstackStarterKitInput = z.infer<typeof z.object(starterKitInputSchemaShape)>;

/**
 * Generate a fullstack starter kit with automatic validation.
 * This function now acts as the executor for the 'generate-fullstack-starter-kit' tool.
 * @param params The validated tool parameters.
 * @param config OpenRouter configuration.
 * @returns A Promise resolving to a CallToolResult object.
 */
export const generateFullstackStarterKit: ToolExecutor = async (
  params: Record<string, unknown>, // Use unknown instead of any for type safety
  config: OpenRouterConfig,
  context?: ToolExecutionContext // Add context parameter
): Promise<CallToolResult> => { // Return CallToolResult
  const sessionId = context?.sessionId || 'unknown-session'; // Get sessionId, provide fallback
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateFullstackStarterKit' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }
  // Log the config received by the executor
  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generateFullstackStarterKit executor received config');

  // Validate params before casting to ensure required fields exist
  if (!params.use_case || typeof params.use_case !== 'string') {
    // This error happens before job creation, so return directly
    return {
      content: [{ type: 'text', text: 'Error: Missing or invalid required parameter "use_case"' }],
      isError: true
    };
  }

  // Now we can safely cast since we've verified the required field exists
  // Use double cast pattern (first to unknown, then to specific type) to satisfy TypeScript
  const input = params as unknown as FullstackStarterKitInput;

  // --- Create Job & Return Immediately --- 
  const jobId = jobManager.createJob('generate-fullstack-starter-kit', params);
  logger.info({ jobId, tool: 'generateFullstackStarterKit', sessionId }, 'Starting background job.');

  // Use the shared service to format the initial response
  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-fullstack-starter-kit', // Internal tool name
    'Fullstack Starter Kit Generator' // User-friendly display name
  );

  // --- Execute Long-Running Logic Asynchronously --- 
  setImmediate(async () => {
    const logs: string[] = []; // Keep logs for background process
    let mainPartsJson: Omit<StarterKitDefinition, 'directoryStructure'> | undefined; // Define here for broader scope
    let validatedDefinition: StarterKitDefinition | undefined; // Define here for broader scope

    try { // This try block now wraps the entire async operation
      // Log the start
      logger.info({ jobId }, `Starting Fullstack Starter Kit Generator background job for use case: ${input.use_case}`);
      logs.push(`[${new Date().toISOString()}] Starting Fullstack Starter Kit Generator`);
      logs.push(`[${new Date().toISOString()}] Use case: ${input.use_case}`);

      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Starting starter kit generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Starting starter kit generation...');

      // Step 1: Analyze the use case and tech stack preferences using sequential thinking
      // (Skipped as per previous logic)

      // Perform pre-generation research using Perplexity if recommendation is requested
      let researchContext = '';
      if (input.request_recommendation) {
        logger.info({ jobId, inputs: { use_case: input.use_case } }, "Fullstack Starter Kit Generator: Starting pre-generation research...");
        logs.push(`[${new Date().toISOString()}] Starting pre-generation research using Perplexity (sonar-deep-research)`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing pre-generation research...');

        try {
          // Define relevant research queries
          const query1 = `Latest technology stack recommendations for ${input.use_case}`;
          const query2 = `Best practices and architectural patterns for ${input.use_case}`;
          const query3 = `Modern development tooling and libraries for ${input.use_case}`;

          // Execute research queries in parallel using Perplexity
          const researchResults = await Promise.allSettled([
            performResearchQuery(query1, config),
            performResearchQuery(query2, config),
            performResearchQuery(query3, config)
          ]);

          // Process research results
          researchContext = "## Pre-Generation Research Context (From Perplexity Sonar Deep Research):\n\n";

          // Add results that were fulfilled
          researchResults.forEach((result, index) => {
            const queryLabels = ["Technology Stack Recommendations", "Best Practices & Architecture", "Development Tooling & Libraries"];
            if (result.status === "fulfilled") {
              researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
            } else {
              logger.warn({ jobId, error: result.reason }, `Research query ${index + 1} failed`);
              researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
            }
          });

          logger.info({ jobId }, "Fullstack Starter Kit Generator: Pre-generation research completed.");
          logs.push(`[${new Date().toISOString()}] Completed pre-generation research`);
          sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research complete.');
        } catch (researchError: unknown) {
          const errorMsg = researchError instanceof Error ? researchError.message : String(researchError);
          logger.error({ jobId, err: researchError }, "Fullstack Starter Kit Generator: Error during research aggregation");
          researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
          logs.push(`[${new Date().toISOString()}] Error during research: ${errorMsg}`);
          sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Research phase failed: ${errorMsg}`);
        }
      } else {
        logger.debug({ jobId }, 'Skipping research - recommendation not requested');
        logs.push(`[${new Date().toISOString()}] Skipping research - recommendation not requested`);
      }

      // Ensure directories are initialized
      await initDirectories();

      // --- Step 3a: Generate Main Parts (excluding directory structure) ---
      const mainPartsSchema = starterKitDefinitionSchema.omit({ directoryStructure: true });
      const mainPartsPrompt = `
# ROLE & GOAL
You are an expert Full-Stack Software Architect AI. Your goal is to generate a **VALID JSON object** defining the main configuration parts (excluding directory structure) for a starter kit based on the provided use case, preferences, and research context.

# CORE TASK
Generate a JSON object that precisely matches the schema described below (excluding 'directoryStructure').

# INPUT HANDLING
- Analyze the 'use_case' to understand the core requirements of the application.
- Consider the 'tech_stack_preferences' provided by the user, but feel free to override them if research suggests better alternatives, explaining why in the 'rationale'.
- If 'request_recommendation' was true, heavily utilize the '## Pre-Generation Research Context' provided below.
- Incorporate any specified 'include_optional_features'.

# RESEARCH CONTEXT INTEGRATION
- **CRITICAL (If Provided):** Carefully review the '## Pre-Generation Research Context (From Perplexity Sonar Deep Research)' section.
- Use insights on 'Technology Stack Recommendations', 'Best Practices & Architecture', and 'Development Tooling & Libraries' to make informed decisions about the \`techStack\`, \`directoryStructure\`, \`dependencies\`, and \`setupCommands\`.
- Justify technology choices in the \`rationale\` field, referencing research findings where applicable.
- Design the \`directoryStructure\` based on standard patterns identified in the research for the chosen tech stack and use case.

# OUTPUT FORMAT & STRUCTURE (Strict JSON Object)
- Your **ENTIRE** response **MUST** be a single, valid JSON object.
- Do **NOT** wrap the JSON in Markdown code blocks (\`\`\`json ... \`\`\`).
- The JSON object **MUST** conform **EXACTLY** to the following structure (excluding 'directoryStructure'):

\`\`\`json
{
  "projectName": "string (e.g., my-ecommerce-app)",
  "description": "string (Detailed description of the project and its purpose)",
  "techStack": {
    "[component: string]": { // e.g., "frontend", "backend", "database", "orm", "authentication"
      "name": "string (e.g., React, Node.js, PostgreSQL, Prisma, NextAuth.js)",
      "version": "string (Optional, e.g., 18.x, ^16.0)",
      "rationale": "string (Justification for choosing this tech, referencing research if applicable)"
    }
    // Include all relevant components for a full-stack app
  },
  // "directoryStructure": OMITTED FOR THIS STEP
  "dependencies": {
    "npm": { // Or potentially "yarn"
      "root": { // Dependencies for the root package.json
        "dependencies": { "[packageName: string]": "string (version, e.g., ^4.18.2)" },
        "devDependencies": { "[packageName: string]": "string (version, e.g., ^3.0.0)" }
      },
      "[subDirectory: string]": { // Optional: For workspaces/monorepos (e.g., "client", "server")
        "dependencies": { "[packageName: string]": "string" },
        "devDependencies": { "[packageName: string]": "string" }
      }
    }
  },
  "setupCommands": [ // Array of shell commands to run after file creation and dependency installation
    "string (e.g., npm install, npx prisma migrate dev, npm run build:client)"
  ],
  "nextSteps": [ // Array of strings describing manual follow-up actions
    "string (e.g., Configure .env file with API keys, Set up database connection string)"
  ]
}
\`\`\`

# QUALITY ATTRIBUTES
- **Valid JSON:** The output must be parseable JSON.
- **Schema Conformant:** The JSON must strictly match the structure and types described above.
- **Comprehensive:** Include all necessary components for a basic working starter kit for the use case.
- **Modern:** Utilize current, stable technologies and practices, informed by research.
- **Well-Rationalized:** Technology choices should be justified.
- **Organized:** The directory structure should be logical and follow common conventions identified in research.
- **Complete:** Provide basic placeholder content or generation prompts for key files.

# CONSTRAINTS (Do NOT Do the Following)
- **NO Conversational Text:** Output **ONLY** the JSON object. No greetings, explanations, apologies, or summaries before or after the JSON.
- **NO Markdown:** Do not use Markdown formatting (like \`\`\`).
- **NO Comments in JSON:** Standard JSON does not support comments.
- **NO External Knowledge:** Base the starter kit *only* on the provided inputs and research context.
- **Strict JSON:** The response must start with \`{\` and end with \`}\` and contain nothing else.
- **Ensure \`content\` OR \`generationPrompt\`:** For files in \`directoryStructure\`, provide either \`content\` (string) or \`generationPrompt\` (string), not both. Both can be \`null\` for an empty file. Directories must have \`content\` and \`generationPrompt\` as \`null\`.

# EXAMPLE INPUTS (for context only, do not include in output):
Use Case: ${input.use_case}
Preferences: ${JSON.stringify(input.tech_stack_preferences || {}, null, 2)}
Research Requested: ${input.request_recommendation}
Optional Features: ${JSON.stringify(input.include_optional_features || [])}
${researchContext ? `Research Context:\n${researchContext}` : 'No research context provided.'}

# FINAL INSTRUCTION: Generate the JSON object for the main parts now.
`;

      logger.info({ jobId }, 'Generating main starter kit parts (excluding directory structure) using direct LLM call...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating core project definition...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating core project definition...');
      const mainPartsRawText = await performDirectLlmCall(
        mainPartsPrompt,
        '', // No specific system prompt needed here as it's in mainPartsPrompt
        config,
        'fullstack_starter_kit_generation', // Logical task name
        0.2 // Use a low temperature for JSON generation
      );
      logs.push(`[${new Date().toISOString()}] Received main parts generation output (raw text).`);
      logger.debug({ jobId, rawJsonText: mainPartsRawText }, "Raw JSON text received from LLM");

      // Robust JSON Parsing
      let parsedJson: unknown;
      try {
        // Attempt direct parsing first
        parsedJson = JSON.parse(mainPartsRawText);
      } catch (parseError: unknown) {
        logger.warn({ jobId, err: parseError }, "Direct JSON parsing failed. Attempting to extract JSON block...");
        const jsonMatch = mainPartsRawText.match(/\{[\s\S]*\}/);
        const matchedText = jsonMatch?.[0];

        if (matchedText) {
          try {
            parsedJson = JSON.parse(matchedText);
            logger.info({ jobId }, "Successfully extracted and parsed JSON block from raw text.");
          } catch (nestedParseError: unknown) {
            const errorCause = nestedParseError instanceof Error ? nestedParseError : undefined;
            logger.error({ jobId, err: nestedParseError, extractedText: matchedText }, "Failed to parse extracted JSON block.");
            throw new ParsingError(`LLM response could not be parsed as JSON, even after extraction. Raw text: ${mainPartsRawText}`, { rawText: mainPartsRawText }, errorCause);
          }
        } else {
          const errorCause = parseError instanceof Error ? parseError : undefined;
          logger.error({ jobId, rawText: mainPartsRawText }, "Could not find JSON block in LLM response.");
          throw new ParsingError(`LLM response did not contain a valid JSON block. Raw text: ${mainPartsRawText}`, { rawText: mainPartsRawText }, errorCause);
        }
      }

      // Validate the parsed JSON against the schema
      const validationResultMain = mainPartsSchema.safeParse(parsedJson);
      if (!validationResultMain.success) {
        // Access error safely within this block
        logger.error({ jobId, errors: validationResultMain.error.issues, parsedJson }, "Main parts output failed schema validation");
        throw new ValidationError('Main parts output failed schema validation.', validationResultMain.error.issues);
      }
      // Assign validated data which is guaranteed by the success check
      mainPartsJson = validationResultMain.data;
      logger.info({ jobId }, 'Successfully parsed and validated main starter kit parts.');
      logs.push(`[${new Date().toISOString()}] Successfully parsed and validated main parts.`); // Log only on success


      // --- Step 3b: Generate Directory Structure as Markdown ---
      const dirStructurePrompt = `
# ROLE & GOAL
You are an expert Full-Stack Software Architect AI. Your goal is to generate an **indented Markdown list** representing the directory structure for a starter kit.

# INPUTS
- Tech Stack: ${JSON.stringify(mainPartsJson.techStack, null, 2)}
- Project Name: ${mainPartsJson.projectName}
- Description: ${mainPartsJson.description}
- Research Context (if provided): ${researchContext || 'N/A'}

# CORE TASK
Generate the directory structure based on the provided tech stack and project details, following standard conventions identified in research (if available).

# OUTPUT FORMAT & STRUCTURE (Strict Markdown List)
- Your **ENTIRE** response **MUST** be an indented Markdown list.
- Use indentation (2 spaces per level) to show nesting (e.g., \`  - \`).
- Mark directories clearly by ending their names with a forward slash (\`/\`).
- Do **NOT** include file content or generation prompts here. Just the structure.
- Do **NOT** include any introductory text, explanations, or JSON. Output **ONLY** the Markdown list.

# EXAMPLE (for a Next.js/NestJS Turborepo):
- apps/
  - frontend/
  - backend/
- packages/
  - database/
  - ui/
  - config/
- package.json
- turbo.json
- tsconfig.base.json

# FINAL INSTRUCTION: Generate the Markdown list for the directory structure now.
`;

      const directoryStructureMarkdown = await performDirectLlmCall(
        dirStructurePrompt,
        '', // No specific system prompt needed here as it's in dirStructurePrompt
        config,
        'fullstack_starter_kit_generation', // Can reuse the same logical task name or create a specific one
        0.1 // Low temperature for structured Markdown
      );
      logs.push(`[${new Date().toISOString()}] Received directory structure Markdown output.`);

      // Basic validation for Markdown structure (e.g., starts with a list item)
      if (!directoryStructureMarkdown || typeof directoryStructureMarkdown !== 'string' || !directoryStructureMarkdown.trim().startsWith('- ')) {
         logger.warn({ jobId, markdown: directoryStructureMarkdown }, 'Directory structure generation returned empty or potentially invalid Markdown format.');
         // Decide if this should be a hard error or just a warning. Let's make it an error for now.
         throw new ToolExecutionError('Directory structure generation returned empty or invalid Markdown content.');
      }
      logger.info({ jobId }, 'Successfully generated directory structure Markdown.');
      logs.push(`[${new Date().toISOString()}] Successfully generated directory structure Markdown.`);


      // --- Step 3c: Parse Markdown Directory Structure ---
      const directoryStructureJson = parseDirectoryStructureMarkdown(directoryStructureMarkdown);
      logger.info({ jobId }, 'Successfully parsed directory structure.');
      logs.push(`[${new Date().toISOString()}] Successfully parsed directory structure.`);


      // --- Step 4: Combine Parts and Final Validation ---
      const finalDefinition: StarterKitDefinition = {
        ...mainPartsJson,
        directoryStructure: directoryStructureJson, // Add the parsed structure
      };

      logger.info({ jobId }, 'Validating final combined starter kit definition...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Validating final definition...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Validating final definition...');
      const validationResultFinal = starterKitDefinitionSchema.safeParse(finalDefinition);
      if (!validationResultFinal.success) {
        // Access error safely within this block
        logger.error({ jobId, errors: validationResultFinal.error.issues, finalDefinition }, "Final combined definition failed schema validation");
        throw new ValidationError('Final combined definition failed schema validation.', validationResultFinal.error.issues);
      }
      // Assign validated data which is guaranteed by the success check
      validatedDefinition = validationResultFinal.data;
      logger.info({ jobId }, 'Final starter kit definition validated successfully.');
      logs.push(`[${new Date().toISOString()}] Final definition validated successfully.`); // Log only on success


      // --- Step 5: Save Definition and Generate Scripts ---
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = input.use_case.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const definitionFilename = `${timestamp}-${sanitizedName}-definition.json`;
      const definitionFilePath = path.join(STARTER_KIT_DIR, definitionFilename);

      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Saving definition file...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Saving definition file...');
      await fs.writeJson(definitionFilePath, validatedDefinition, { spaces: 2 });
      logger.info({ jobId }, `Saved validated definition to ${definitionFilename}`);
      logs.push(`[${new Date().toISOString()}] Saved validated definition to ${definitionFilename}`);

      // Generate setup scripts
      logger.info({ jobId }, 'Generating setup scripts...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating setup scripts...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating setup scripts...');
      let scripts: ScriptOutput = { sh: '# Error generating script', bat: 'REM Error generating script' };
      try {
        scripts = generateSetupScripts(validatedDefinition); // Use validated definition
        logs.push(`[${new Date().toISOString()}] Generated setup scripts content.`);
      } catch (scriptError: unknown) {
        const errorMsg = scriptError instanceof Error ? scriptError.message : String(scriptError);
        logger.error({ jobId, err: scriptError }, "Failed to generate setup scripts content");
        logs.push(`[${new Date().toISOString()}] Error generating setup scripts: ${errorMsg}`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Warning: Failed to generate setup scripts: ${errorMsg}`);
        // Continue to save whatever script content was generated, even if partial or error message
      }

      // Save the generated scripts (even if they contain error messages)
      const scriptShFilename = `${timestamp}-${sanitizedName}-setup.sh`;
      const scriptBatFilename = `${timestamp}-${sanitizedName}-setup.bat`;
      const scriptShFilePath = path.join(STARTER_KIT_DIR, scriptShFilename);
      const scriptBatFilePath = path.join(STARTER_KIT_DIR, scriptBatFilename);

      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Saving setup scripts...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Saving setup scripts...');
      try {
        await fs.writeFile(scriptShFilePath, scripts.sh, { mode: 0o755 }); // Make executable
        await fs.writeFile(scriptBatFilePath, scripts.bat);
        logs.push(`[${new Date().toISOString()}] Saved setup scripts: ${scriptShFilename}, ${scriptBatFilename}`);
        logger.info({ jobId }, `Saved setup scripts to ${STARTER_KIT_DIR}`);
      } catch (saveError: unknown) {
        const errorMsg = saveError instanceof Error ? saveError.message : String(saveError);
        // Log the error but don't necessarily fail the whole operation, just report it in logs
        logger.error({ jobId, err: saveError }, "Failed to save setup scripts");
        logs.push(`[${new Date().toISOString()}] Error saving setup scripts: ${errorMsg}`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, `Warning: Failed to save setup scripts: ${errorMsg}`);
      }

      // Format the response for the final result
      const responseText = `
# Fullstack Starter Kit Generator

## Use Case
${input.use_case}

## Project: ${validatedDefinition.projectName}
${validatedDefinition.description}

## Tech Stack
${Object.entries(validatedDefinition.techStack).map(([key, tech]) =>
  `- **${key}**: ${tech.name}${tech.version ? ` (${tech.version})` : ''} - ${tech.rationale}`
).join('\n')}

## Project Structure Generation

Setup scripts have been generated to create the project structure and install dependencies:

* **Linux/macOS Script:** \`workflow-agent-files/fullstack-starter-kit-generator/${scriptShFilename}\`
* **Windows Script:** \`workflow-agent-files/fullstack-starter-kit-generator/${scriptBatFilename}\`

To use these scripts:
1. Copy the appropriate script to an empty directory outside of this project
2. For Linux/macOS: \`chmod +x ${scriptShFilename} && ./${scriptShFilename}\`
3. For Windows: Double-click the batch file or run from command prompt

The scripts will:
- Create the project directory structure
- Generate all necessary files
- Install dependencies
- Run setup commands

## Dependencies
${JSON.stringify(validatedDefinition.dependencies, null, 2)}

## Setup Commands
${validatedDefinition.setupCommands.map(cmd => `- \`${cmd}\``).join('\n')}

## Next Steps
${validatedDefinition.nextSteps.map(step => `- ${step}`).join('\n')}

Generated with the Fullstack Starter Kit Generator
`;

      // Set final success result in Job Manager
      const finalResult: CallToolResult = {
        content: [{ type: "text", text: responseText }],
        isError: false // Indicate success
      };
      jobManager.setJobResult(jobId, finalResult);
      // Final SSE notification handled by setJobResult logic (or send explicitly if needed)
      // sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Job completed successfully.');

    } catch (error: unknown) { // Catch errors within the async block
      // Catch-all for any unexpected errors during the process
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generateFullstackStarterKit' }, 'Error during background job execution.');
      logs.push(`[${new Date().toISOString()}] Unexpected Error: ${errorMsg}`);

      // Instantiate the correct error type, ensuring the cause is an Error or undefined
      const cause = error instanceof Error ? error : undefined;
      let appError: AppError;
      if (error instanceof AppError) {
          appError = error;
      } else {
          // Create a new AppError, passing the original error as cause if it's an Error
          appError = new AppError('An unexpected error occurred during starter kit generation.', undefined, cause);
      }

      // Now appError is guaranteed to be of type AppError
      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
      const errorResult: CallToolResult = {
        content: [{ type: 'text', text: `Error during background job ${jobId}: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
      };

      // Store error result in Job Manager
      jobManager.setJobResult(jobId, errorResult);
      // Send final failed status via SSE (setJobResult might handle this, but explicit call is safer)
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  }); // End of setImmediate

  return initialResponse; // Return the initial response with Job ID
};

// --- Tool Registration ---

// Tool definition for the starter kit generator tool
const starterKitToolDefinition: ToolDefinition = {
  name: "generate-fullstack-starter-kit",
  description: "Generates full-stack project starter kits with custom tech stacks, research-informed recommendations, and setup scripts.",
  inputSchema: starterKitInputSchemaShape, // Use the raw shape
  executor: generateFullstackStarterKit // Reference the adapted function
};

// Register the tool with the central registry
registerTool(starterKitToolDefinition);
