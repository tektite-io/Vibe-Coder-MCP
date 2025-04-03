import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js'; // Import the new helper
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';
import { starterKitDefinitionSchema, fileStructureItemSchema } from './schema.js';
import { generateSetupScripts } from './scripts.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
// Import necessary error types for direct LLM calls and parsing
import { AppError, ValidationError, ParsingError, ToolExecutionError } from '../../utils/errors.js';
// Helper function to get the base output directory
function getBaseOutputDir() {
    // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
    // Fallback to default relative to CWD
    return process.env.VIBE_CODER_OUTPUT_DIR
        ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
        : path.join(process.cwd(), 'workflow-agent-files');
}
// Define tool-specific directory using the helper
const STARTER_KIT_DIR = path.join(getBaseOutputDir(), 'fullstack-starter-kit-generator');
// Initialize directories if they don't exist
export async function initDirectories() {
    const baseOutputDir = getBaseOutputDir();
    try {
        await fs.ensureDir(baseOutputDir); // Ensure base directory exists
        const toolDir = path.join(baseOutputDir, 'fullstack-starter-kit-generator');
        await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
        logger.debug(`Ensured starter kit directory exists: ${toolDir}`);
    }
    catch (error) {
        logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for fullstack-starter-kit-generator.`);
        // Decide if we should re-throw or just log. Logging might be safer.
    }
}
// --- Helper Function to Parse Directory Structure Markdown ---
// This parser is specific to the schema defined in ./schema.ts
function parseDirectoryStructureMarkdown(markdownList) {
    logger.debug(`Parsing Directory Structure Markdown:\n${markdownList}`);
    const lines = markdownList.trim().split('\n');
    const root = [];
    const stack = [];
    lines.forEach(line => {
        if (!line.trim())
            return;
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
        const newNode = {
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
        }
        else {
            const parentNode = stack[stack.length - 1].node;
            if (parentNode.type === 'directory' && parentNode.children) {
                parentNode.children.push(newNode);
            }
            else {
                logger.error(`Attempted to add child "${newNode.path}" to non-directory parent "${parentNode.path}". Adding to root.`);
                root.push(newNode);
            }
        }
        if (newNode.type === 'directory') {
            if (!newNode.children)
                newNode.children = [];
            stack.push({ level: indentLevel, node: newNode });
        }
    });
    logger.debug(`Parsed structure (before validation): ${JSON.stringify(root, null, 2)}`);
    const validationResult = z.array(fileStructureItemSchema).safeParse(root);
    if (!validationResult.success) {
        logger.error(`Parsed directory structure failed Zod validation: ${validationResult.error.message}`);
        // Pass the actual issues array to the ValidationError constructor
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
export const generateFullstackStarterKit = async (params, // Use unknown instead of any for type safety
config) => {
    // Log the config received by the executor
    logger.debug({
        configReceived: true,
        hasLlmMapping: Boolean(config.llm_mapping),
        mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
    }, 'generateFullstackStarterKit executor received config');
    // Validate params before casting to ensure required fields exist
    if (!params.use_case || typeof params.use_case !== 'string') {
        return {
            content: [{ type: 'text', text: 'Error: Missing or invalid required parameter "use_case"' }],
            isError: true
        };
    }
    // Now we can safely cast since we've verified the required field exists
    // Use double cast pattern (first to unknown, then to specific type) to satisfy TypeScript
    const input = params;
    const logs = [];
    // const errors: string[] = []; // Removed errors array, using AppError.handle
    try {
        // Log the start
        logger.info(`Starting Fullstack Starter Kit Generator for use case: ${input.use_case}`);
        logs.push(`[${new Date().toISOString()}] Starting Fullstack Starter Kit Generator`);
        logs.push(`[${new Date().toISOString()}] Use case: ${input.use_case}`);
        // Step 1: Analyze the use case and tech stack preferences using sequential thinking
        const analysisPrompt = `
You are tasked with creating a fullstack starter kit based on the following use case:
${input.use_case}

Tech stack preferences (if any):
${JSON.stringify(input.tech_stack_preferences || {}, null, 2)}

Request recommendation: ${input.request_recommendation ? 'Yes' : 'No'}
Include optional features: ${JSON.stringify(input.include_optional_features || [], null, 2)}

If research context is provided in the following steps, carefully consider the information about technology stack recommendations, best practices, architectural patterns, and development tooling from Perplexity Sonar Deep Research.

Please provide a comprehensive analysis of:
1. The most appropriate tech stack for this use case
2. Core features that should be included
3. Project structure and architecture
4. Key configurations and best practices

Base your recommendations on modern development practices, the specific needs of the use case, and any research insights provided.
Do NOT attempt to access external files or previous context outside of what's provided in this prompt.
`;
        // Run initial analysis to understand requirements better
        // Note: The result isn't directly used, but the process helps the LLM understand the requirements
        // Note: Skipping initial analysis call as it wasn't used directly
        // await processWithSequentialThinking(analysisPrompt, config);
        // logger.debug('Completed initial analysis');
        // logs.push(`[${new Date().toISOString()}] Completed initial analysis`);
        // Perform pre-generation research using Perplexity if recommendation is requested
        let researchContext = '';
        if (input.request_recommendation) {
            logger.info({ inputs: { use_case: input.use_case } }, "Fullstack Starter Kit Generator: Starting pre-generation research...");
            logs.push(`[${new Date().toISOString()}] Starting pre-generation research using Perplexity (sonar-deep-research)`);
            try {
                // Define relevant research queries
                const query1 = `Latest technology stack recommendations for ${input.use_case}`;
                const query2 = `Best practices and architectural patterns for ${input.use_case}`;
                const query3 = `Modern development tooling and libraries for ${input.use_case}`;
                // Execute research queries in parallel using Perplexity
                const researchResults = await Promise.allSettled([
                    performResearchQuery(query1, config), // Uses config.perplexityModel (perplexity/sonar-deep-research)
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
                    }
                    else {
                        logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
                        researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
                    }
                });
                logger.info("Fullstack Starter Kit Generator: Pre-generation research completed.");
                logs.push(`[${new Date().toISOString()}] Completed pre-generation research`);
            }
            catch (researchError) {
                logger.error({ err: researchError }, "Fullstack Starter Kit Generator: Error during research aggregation");
                researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
                logs.push(`[${new Date().toISOString()}] Error during research: ${researchError instanceof Error ? researchError.message : String(researchError)}`);
            }
        }
        else {
            logger.debug('Skipping research - recommendation not requested');
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
        let mainPartsJson;
        try {
            logger.info('Generating main starter kit parts (excluding directory structure) using direct LLM call...');
            // Use performDirectLlmCall instead of processWithSequentialThinking
            const mainPartsRawText = await performDirectLlmCall(mainPartsPrompt, '', // No specific system prompt needed here as it's in mainPartsPrompt
            config, 'fullstack_starter_kit_generation', // Logical task name
            0.2 // Use a low temperature for JSON generation
            );
            logs.push(`[${new Date().toISOString()}] Received main parts generation output (raw text).`);
            logger.debug({ rawJsonText: mainPartsRawText }, "Raw JSON text received from LLM");
            // Robust JSON Parsing
            let parsedJson;
            try {
                // Attempt direct parsing first
                parsedJson = JSON.parse(mainPartsRawText);
            }
            catch (parseError) {
                logger.warn({ err: parseError }, "Direct JSON parsing failed. Attempting to extract JSON block...");
                // Fallback: Try to extract JSON block if direct parsing fails (e.g., due to fences)
                const jsonMatch = mainPartsRawText.match(/\{[\s\S]*\}/); // Find first { to last }
                if (jsonMatch && jsonMatch[0]) {
                    try {
                        parsedJson = JSON.parse(jsonMatch[0]);
                        logger.info("Successfully extracted and parsed JSON block from raw text.");
                    }
                    catch (nestedParseError) {
                        logger.error({ err: nestedParseError, extractedText: jsonMatch[0] }, "Failed to parse extracted JSON block.");
                        throw new ParsingError(`LLM response could not be parsed as JSON, even after extraction. Raw text: ${mainPartsRawText}`, { rawText: mainPartsRawText }, nestedParseError);
                    }
                }
                else {
                    logger.error({ rawText: mainPartsRawText }, "Could not find JSON block in LLM response.");
                    throw new ParsingError(`LLM response did not contain a valid JSON block. Raw text: ${mainPartsRawText}`, { rawText: mainPartsRawText }, parseError);
                }
            }
            // Validate the parsed JSON against the schema
            const validationResult = mainPartsSchema.safeParse(parsedJson);
            if (!validationResult.success) {
                logger.error({ errors: validationResult.error.issues, parsedJson }, "Main parts output failed schema validation");
                throw new ValidationError('Main parts output failed schema validation.', validationResult.error.issues);
            }
            mainPartsJson = validationResult.data;
            logger.info('Successfully parsed and validated main starter kit parts.');
            logs.push(`[${new Date().toISOString()}] Successfully parsed and validated main parts.`);
        }
        catch (error) {
            logger.error({ err: error }, 'Error generating or parsing main starter kit parts');
            // Handle specific errors from direct call or parsing/validation
            let appError;
            if (error instanceof AppError) {
                appError = error;
            }
            else if (error instanceof Error) {
                appError = new ToolExecutionError('Failed to generate main starter kit parts.', { originalError: error.message }, error);
            }
            else {
                appError = new ToolExecutionError('An unknown error occurred while generating main starter kit parts.', { thrownValue: String(error) });
            }
            const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
            return { content: [{ type: 'text', text: `Error: ${mcpError.message}` }], isError: true, errorDetails: mcpError };
        }
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
        let directoryStructureMarkdown;
        try {
            logger.info('Generating directory structure as Markdown using direct LLM call...');
            // Use performDirectLlmCall instead of processWithSequentialThinking
            directoryStructureMarkdown = await performDirectLlmCall(dirStructurePrompt, '', // No specific system prompt needed here as it's in dirStructurePrompt
            config, 'fullstack_starter_kit_generation', // Can reuse the same logical task name or create a specific one
            0.1 // Low temperature for structured Markdown
            );
            logs.push(`[${new Date().toISOString()}] Received directory structure Markdown output.`);
            // Basic validation for Markdown structure (e.g., starts with a list item)
            if (!directoryStructureMarkdown || typeof directoryStructureMarkdown !== 'string' || !directoryStructureMarkdown.trim().startsWith('- ')) {
                logger.warn({ markdown: directoryStructureMarkdown }, 'Directory structure generation returned empty or potentially invalid Markdown format.');
                // Decide if this should be a hard error or just a warning. Let's make it an error for now.
                throw new ToolExecutionError('Directory structure generation returned empty or invalid Markdown content.');
            }
            logger.info('Successfully generated directory structure Markdown.');
            logs.push(`[${new Date().toISOString()}] Successfully generated directory structure Markdown.`);
        }
        catch (error) {
            logger.error({ err: error }, 'Error generating directory structure Markdown');
            // Handle specific errors from direct call
            let appError;
            if (error instanceof AppError) {
                appError = error;
            }
            else if (error instanceof Error) {
                appError = new ToolExecutionError('Failed to generate directory structure Markdown.', { originalError: error.message }, error);
            }
            else {
                appError = new ToolExecutionError('An unknown error occurred while generating directory structure Markdown.', { thrownValue: String(error) });
            }
            const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
            return { content: [{ type: 'text', text: `Error: ${mcpError.message}` }], isError: true, errorDetails: mcpError };
        }
        // --- Step 3c: Parse Markdown Directory Structure ---
        let directoryStructureJson;
        try {
            logger.info('Parsing directory structure Markdown...');
            directoryStructureJson = parseDirectoryStructureMarkdown(directoryStructureMarkdown);
            logger.info('Successfully parsed directory structure.');
            logs.push(`[${new Date().toISOString()}] Successfully parsed directory structure.`);
        }
        catch (error) {
            logger.error({ err: error }, 'Error parsing directory structure Markdown');
            // Instantiate the correct error type
            const appError = (error instanceof AppError) ? error : new AppError('Failed to parse generated directory structure.', undefined, error);
            // Use InvalidParams if it's a ValidationError, otherwise InternalError
            const errorCode = (error instanceof ValidationError) ? ErrorCode.InvalidParams : ErrorCode.InternalError;
            const mcpError = new McpError(errorCode, appError.message, appError.context);
            return { content: [{ type: 'text', text: `Error: ${mcpError.message}` }], isError: true, errorDetails: mcpError };
        }
        // --- Step 4: Combine Parts and Final Validation ---
        const finalDefinition = {
            ...mainPartsJson,
            directoryStructure: directoryStructureJson, // Add the parsed structure
        };
        let validatedDefinition;
        try {
            logger.info('Validating final combined starter kit definition...');
            const validationResult = starterKitDefinitionSchema.safeParse(finalDefinition);
            if (!validationResult.success) {
                logger.error({ errors: validationResult.error.issues, finalDefinition }, "Final combined definition failed schema validation");
                // Pass the actual issues array
                throw new ValidationError('Final combined definition failed schema validation.', validationResult.error.issues);
            }
            validatedDefinition = validationResult.data;
            logger.info('Final starter kit definition validated successfully.');
            logs.push(`[${new Date().toISOString()}] Final definition validated successfully.`);
        }
        catch (error) {
            logger.error({ err: error }, 'Final starter kit definition failed validation');
            // Instantiate the correct error type
            const appError = (error instanceof AppError) ? error : new AppError('Generated starter kit definition failed final validation.', undefined, error);
            const errorCode = (error instanceof ValidationError) ? ErrorCode.InvalidParams : ErrorCode.InternalError;
            const mcpError = new McpError(errorCode, appError.message, appError.context);
            return { content: [{ type: 'text', text: `Error: ${mcpError.message}` }], isError: true, errorDetails: mcpError };
        }
        // --- Step 5: Save Definition and Generate Scripts ---
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedName = input.use_case.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const definitionFilename = `${timestamp}-${sanitizedName}-definition.json`;
        const definitionFilePath = path.join(STARTER_KIT_DIR, definitionFilename);
        await fs.writeJson(definitionFilePath, validatedDefinition, { spaces: 2 });
        logger.info(`Saved validated definition to ${definitionFilename}`);
        logs.push(`[${new Date().toISOString()}] Saved validated definition to ${definitionFilename}`);
        // Generate setup scripts
        logger.info('Generating setup scripts...');
        let scripts = { sh: '# Error generating script', bat: 'REM Error generating script' };
        try {
            scripts = generateSetupScripts(validatedDefinition); // Use validated definition
            logs.push(`[${new Date().toISOString()}] Generated setup scripts content.`);
        }
        catch (scriptError) {
            logger.error({ err: scriptError }, "Failed to generate setup scripts content");
            logs.push(`[${new Date().toISOString()}] Error generating setup scripts: ${scriptError.message}`);
            // Continue to save whatever script content was generated, even if partial or error message
        }
        // Save the generated scripts (even if they contain error messages)
        const scriptShFilename = `${timestamp}-${sanitizedName}-setup.sh`;
        const scriptBatFilename = `${timestamp}-${sanitizedName}-setup.bat`;
        const scriptShFilePath = path.join(STARTER_KIT_DIR, scriptShFilename);
        const scriptBatFilePath = path.join(STARTER_KIT_DIR, scriptBatFilename);
        try {
            await fs.writeFile(scriptShFilePath, scripts.sh, { mode: 0o755 }); // Make executable
            await fs.writeFile(scriptBatFilePath, scripts.bat);
            logs.push(`[${new Date().toISOString()}] Saved setup scripts: ${scriptShFilename}, ${scriptBatFilename}`);
            logger.info(`Saved setup scripts to ${STARTER_KIT_DIR}`);
        }
        catch (saveError) {
            // Log the error but don't necessarily fail the whole operation, just report it in logs
            logger.error({ err: saveError }, "Failed to save setup scripts");
            // Remove the incorrect errors.push call
            // errors.push(`Failed to save setup scripts: ${errorMessage}`);
            logs.push(`[${new Date().toISOString()}] Error saving setup scripts: ${saveError.message}`);
        }
        // Format the response
        const responseText = `
# Fullstack Starter Kit Generator

## Use Case
${input.use_case}

## Project: ${validatedDefinition.projectName}
${validatedDefinition.description}

## Tech Stack
${Object.entries(validatedDefinition.techStack).map(([key, tech]) => `- **${key}**: ${tech.name}${tech.version ? ` (${tech.version})` : ''} - ${tech.rationale}`).join('\n')}

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
        return {
            content: [
                {
                    type: "text",
                    text: responseText
                }
            ],
            isError: false // Indicate success
        };
    }
    catch (error) {
        // Catch-all for any unexpected errors during the process
        logger.error({ err: error }, 'Fullstack Starter Kit Generator Error');
        logs.push(`[${new Date().toISOString()}] Unexpected Error: ${error.message}`);
        // Instantiate the correct error type
        const appError = (error instanceof AppError) ? error : new AppError('An unexpected error occurred during starter kit generation.', undefined, error);
        const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
        return {
            content: [{ type: 'text', text: `Error: ${mcpError.message}\n\nLogs:\n${logs.join('\n')}` }],
            isError: true,
            errorDetails: mcpError
        };
    }
};
// --- Tool Registration ---
// Tool definition for the starter kit generator tool
const starterKitToolDefinition = {
    name: "generate-fullstack-starter-kit",
    description: "Generates full-stack project starter kits with custom tech stacks, research-informed recommendations, and setup scripts.",
    inputSchema: starterKitInputSchemaShape, // Use the raw shape
    executor: generateFullstackStarterKit // Reference the adapted function
};
// Register the tool with the central registry
registerTool(starterKitToolDefinition);
