import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { performFormatAwareLlmCall } from '../../utils/llmHelper.js';
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { starterKitDefinitionSchema, StarterKitDefinition, fileStructureItemSchema, FileStructureItem } from './schema.js';
import { generateSetupScripts, ScriptOutput } from './scripts.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { jobManager, JobStatus } from '../../services/job-manager/index.js';
import { sseNotifier } from '../../services/sse-notifier/index.js';
import { AppError, ValidationError, ParsingError, ToolExecutionError, ConfigurationError } from '../../utils/errors.js';
import { formatBackgroundJobInitiationResponse } from '../../services/job-response-formatter/index.js';
import { YAMLComposer } from './yaml-composer.js';

// Helper function to get the base output directory
function getBaseOutputDir(): string {
  return process.env.VIBE_CODER_OUTPUT_DIR
    ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
    : path.join(process.cwd(), 'VibeCoderOutput');
}

const STARTER_KIT_DIR = path.join(getBaseOutputDir(), 'fullstack-starter-kit-generator');

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

export async function initDirectories() {
  const baseOutputDir = getBaseOutputDir();
  try {
    await fs.ensureDir(baseOutputDir);
    const toolDir = path.join(baseOutputDir, 'fullstack-starter-kit-generator');
    await fs.ensureDir(toolDir);
    logger.debug(`Ensured starter kit directory exists: ${toolDir}`);
  } catch (error) {
    logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for fullstack-starter-kit-generator.`);
  }
}

const starterKitInputSchemaShape = {
  use_case: z.string().min(5, { message: "Use case must be at least 5 characters." }).describe("The specific use case for the starter kit (e.g., 'E-commerce site', 'Blog platform')"),
  tech_stack_preferences: z.record(z.string().optional()).optional().describe("Optional tech stack preferences (e.g., { frontend: 'Vue', backend: 'Python' })"),
  request_recommendation: z.boolean().optional().describe("Whether to request recommendations for tech stack components based on research"),
  include_optional_features: z.array(z.string()).optional().describe("Optional features to include (e.g., ['Docker', 'CI/CD'])")
};

export const generateFullstackStarterKit: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session';
  if (sessionId === 'unknown-session') {
      logger.warn({ tool: 'generateFullstackStarterKit' }, 'Executing tool without a valid sessionId. SSE progress updates will not be sent.');
  }

  logger.debug({
    configReceived: true,
    hasLlmMapping: Boolean(config.llm_mapping),
    mappingKeys: config.llm_mapping ? Object.keys(config.llm_mapping) : []
  }, 'generateFullstackStarterKit executor received config');

  if (!params.use_case || typeof params.use_case !== 'string') {
    return {
      content: [{ type: 'text', text: 'Error: Missing or invalid required parameter "use_case"' }],
      isError: true
    };
  }

  const input = params as unknown as FullstackStarterKitInput;

  const jobId = jobManager.createJob('generate-fullstack-starter-kit', params);
  logger.info({ jobId, tool: 'generateFullstackStarterKit', sessionId }, 'Starting background job.');

  const initialResponse = formatBackgroundJobInitiationResponse(
    jobId,
    'generate-fullstack-starter-kit',
    'Fullstack Starter Kit Generator'
  );

  setImmediate(async () => {
    const logs: string[] = [];
    let validatedDefinition: StarterKitDefinition | undefined;
    const yamlComposer = new YAMLComposer(config);

    try {
      logger.info({ jobId }, `Starting Fullstack Starter Kit Generator background job for use case: ${input.use_case}`);
      logs.push(`[${new Date().toISOString()}] Starting Fullstack Starter Kit Generator for ${input.use_case}`);
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Initializing starter kit generation...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Initializing...');

      let researchContext = '';
      if (input.request_recommendation) {
        logger.info({ jobId }, "Performing pre-generation research...");
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Performing research...');
        jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Performing research...');
        researchContext = "## Pre-Generation Research Context:\n" + (await Promise.all([
            performResearchQuery(`Tech stack for ${input.use_case}`, config),
            performResearchQuery(`Key features for ${input.use_case}`, config)
        ])).map(r => r.trim()).join("\n\n");
        logs.push(`[${new Date().toISOString()}] Research completed.`);
        sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Research complete.');
      }

      await initDirectories();

      const moduleSelectionPrompt = `
You are an expert Full-Stack Software Architect AI. Based on the user's request and research context, select the appropriate YAML module templates and provide necessary parameters to compose a full-stack starter kit.

User Request:
- Use Case: ${input.use_case}
- Tech Stack Preferences: ${JSON.stringify(input.tech_stack_preferences || {}, null, 2)}
- Optional Features: ${JSON.stringify(input.include_optional_features || [], null, 2)}

${researchContext}

Available YAML Module Categories (and example templates):
- Frontend: 'frontend/react-vite', 'frontend/vue-nuxt', 'frontend/angular-cli', 'frontend/nextjs', 'frontend/svelte-kit'
- Backend: 'backend/nodejs-express', 'backend/python-django', 'backend/java-spring', 'backend/python-fastapi', 'backend/nodejs-nestjs'
- Database: 'database/postgres', 'database/mongodb', 'database/mysql', 'database/supabase', 'database/firebase'
- Authentication: 'auth/jwt', 'auth/oauth2-scaffold', 'auth/firebase-auth', 'auth/supabase-auth', 'auth/auth0'
- Deployment: 'deployment/docker-compose', 'deployment/kubernetes-scaffold', 'deployment/vercel', 'deployment/netlify'
- Utility: 'utility/logging-winston', 'utility/payment-stripe-sdk', 'utility/email-sendgrid', 'utility/voice-recognition-web-api', 'utility/calendar-integration-google', 'utility/push-notifications-web'

CRITICAL: You must respond with EXACTLY this JSON structure. No markdown, no code blocks, no explanations:

{
  "globalParams": {
    "projectName": "string (kebab-case, derived from use case)",
    "projectDescription": "string (detailed description of the project)",
    "frontendPath": "string (default: 'client')",
    "backendPath": "string (default: 'server')",
    "backendPort": 3001,
    "frontendPort": 3000
  },
  "moduleSelections": [
    {
      "modulePath": "string (exact module path from categories above)",
      "moduleKey": "string (use 'frontendPath', 'backendPath', or 'root')",
      "params": {}
    }
  ]
}

REQUIREMENTS:
1. projectName must be kebab-case (e.g., "productivity-project-app")
2. Include at least: frontend, backend, database modules
3. Add authentication if the use case requires user management
4. Add utility modules based on specific features mentioned
5. Use "root" for moduleKey when module applies to project root
6. Use "frontendPath" for frontend modules, "backendPath" for backend modules

Select a comprehensive set of modules for: ${input.use_case}

RESPOND WITH ONLY THE JSON OBJECT - NO OTHER TEXT OR FORMATTING.`;

      logger.info({ jobId }, 'Prompting LLM for YAML module selections and parameters...');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Determining project components...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Determining project components...');

      const llmModuleResponseRaw = await performFormatAwareLlmCall(
        moduleSelectionPrompt,
        '', // System prompt is part of main prompt for this call
        config,
        'fullstack_starter_kit_module_selection',
        'json', // Explicitly specify JSON format
        undefined, // Schema will be inferred from task name
        0.1
      );
      logs.push(`[${new Date().toISOString()}] LLM response for module selection received.`);
      logger.debug({ jobId, rawLlmResponse: llmModuleResponseRaw }, "Raw LLM response for module selection");

      let llmModuleSelections;
      try {
        // Use intelligent parsing with validation-first approach for module selection
        const { intelligentJsonParse } = await import('../../utils/llmHelper.js');
        llmModuleSelections = intelligentJsonParse(llmModuleResponseRaw, `module-selection-${jobId}`);
        logger.debug({ jobId, responseLength: llmModuleResponseRaw.length, parsedSize: JSON.stringify(llmModuleSelections).length }, "Intelligent JSON parsing successful for module selection");
      } catch (e) {
        throw new ParsingError("Failed to parse LLM response for module selections as JSON.", { rawResponse: llmModuleResponseRaw }, e instanceof Error ? e : undefined);
      }

      if (!llmModuleSelections.globalParams || !llmModuleSelections.moduleSelections) {
          throw new ConfigurationError("LLM response for module selections is missing required 'globalParams' or 'moduleSelections' fields.");
      }

      logger.info({ jobId, selections: llmModuleSelections }, 'LLM module selections parsed.');
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Project components identified. Assembling kit...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Assembling kit from components...');

      const composedDefinition = await yamlComposer.compose(
        llmModuleSelections.moduleSelections,
        llmModuleSelections.globalParams
      );
      logs.push(`[${new Date().toISOString()}] YAML modules composed into a single definition.`);
      logger.info({ jobId }, 'Successfully composed starter kit definition from YAML modules.');

      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Validating final kit definition...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Validating final kit definition...');
      const validationResultFinal = starterKitDefinitionSchema.safeParse(composedDefinition);
      if (!validationResultFinal.success) {
        logger.error({ jobId, errors: validationResultFinal.error.issues, composedDefinition }, "Final composed definition failed schema validation");
        throw new ValidationError('Final composed definition (from YAML) failed schema validation.', validationResultFinal.error.issues, { composedDefinition });
      }
      validatedDefinition = validationResultFinal.data;
      logs.push(`[${new Date().toISOString()}] Final definition validated successfully.`);
      logger.info({ jobId }, 'Final starter kit definition validated successfully.');

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const sanitizedName = (validatedDefinition.projectName || input.use_case.substring(0, 30)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const definitionFilename = `${timestamp}-${sanitizedName}-definition.json`;
      const definitionFilePath = path.join(STARTER_KIT_DIR, definitionFilename);

      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Saving kit definition file...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Saving kit definition file...');
      await fs.writeJson(definitionFilePath, validatedDefinition, { spaces: 2 });
      logs.push(`[${new Date().toISOString()}] Saved validated definition to ${definitionFilename}`);
      logger.info({ jobId }, `Saved validated definition to ${definitionFilename}`);

      sseNotifier.sendProgress(sessionId, jobId, JobStatus.RUNNING, 'Generating setup scripts...');
      jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Generating setup scripts...');
      const scripts: ScriptOutput = generateSetupScripts(validatedDefinition, definitionFilename);
      const scriptShFilename = `${timestamp}-${sanitizedName}-setup.sh`;
      const scriptBatFilename = `${timestamp}-${sanitizedName}-setup.bat`;
      const scriptShFilePath = path.join(STARTER_KIT_DIR, scriptShFilename);
      const scriptBatFilePath = path.join(STARTER_KIT_DIR, scriptBatFilename);
      await fs.writeFile(scriptShFilePath, scripts.sh, { mode: 0o755 });
      await fs.writeFile(scriptBatFilePath, scripts.bat);
      logs.push(`[${new Date().toISOString()}] Saved setup scripts: ${scriptShFilename}, ${scriptBatFilename}`);
      logger.info({ jobId }, `Saved setup scripts to ${STARTER_KIT_DIR}`);

      const responseText = `
# Fullstack Starter Kit Generator (YAML Composed)

## Project: ${validatedDefinition.projectName}
${validatedDefinition.description}

## Tech Stack Overview
${Object.entries(validatedDefinition.techStack).map(([key, tech]) =>
  `- **${key}**: ${tech.name}${tech.version ? ` (${tech.version})` : ''} - ${tech.rationale}`
).join('\n')}

## Project Structure Generation
Setup scripts and the full definition JSON have been generated:
* **Definition JSON:** \`VibeCoderOutput/fullstack-starter-kit-generator/${definitionFilename}\`
* **Linux/macOS Script:** \`VibeCoderOutput/fullstack-starter-kit-generator/${scriptShFilename}\`
* **Windows Script:** \`VibeCoderOutput/fullstack-starter-kit-generator/${scriptBatFilename}\`

To use these scripts:
1. Navigate to an empty directory outside this project.
2. Copy the chosen script (\`.sh\` or \`.bat\`) and the definition JSON (\`${definitionFilename}\`) into that directory.
3. The scripts will expect \`${definitionFilename}\` to be in the same directory they are run from.
4. For Linux/macOS: \`chmod +x ${scriptShFilename} && ./${scriptShFilename}\`
5. For Windows: Double-click \`${scriptBatFilename}\` or run it from the command prompt.

The scripts will unpack the JSON definition to:
- Create the project directory structure.
- Generate all necessary files with content or generation prompts from the YAML modules.
- Install dependencies as specified.
- Run setup commands.

## Next Steps
${validatedDefinition.nextSteps.map(step => `- ${step}`).join('\n')}

Generated by Fullstack Starter Kit Generator using YAML module composition.
If any modules were dynamically generated because their templates were missing, they have been saved to the templates directory for future use.
`;

      jobManager.setJobResult(jobId, { content: [{ type: "text", text: responseText }], isError: false });
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.COMPLETED, 'Starter kit generated successfully.');

    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error({ err: error, jobId, tool: 'generateFullstackStarterKit' }, 'Error during background job execution.');
      logs.push(`[${new Date().toISOString()}] Error: ${errorMsg}`);

      let appError: AppError;
      if (error instanceof AppError) {
        appError = error;
      } else if (error instanceof Error) {
        appError = new ToolExecutionError(`Background job ${jobId} failed: ${errorMsg}`, undefined, error);
      } else {
        appError = new ToolExecutionError(`Background job ${jobId} failed with unknown error: ${errorMsg}`);
      }

      const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
      jobManager.setJobResult(jobId, {
        content: [{ type: 'text', text: `Error in job ${jobId}: ${mcpError.message}\n\nFull Error: ${appError.stack}\n\nLogs:\n${logs.join('\n')}` }],
        isError: true,
        errorDetails: mcpError
      });
      sseNotifier.sendProgress(sessionId, jobId, JobStatus.FAILED, `Job failed: ${mcpError.message}`);
    }
  });

  return initialResponse;
};

const starterKitToolDefinition: ToolDefinition = {
  name: "generate-fullstack-starter-kit",
  description: "Generates full-stack project starter kits by composing YAML modules based on user requirements, tech stacks, research-informed recommendations, and then provides setup scripts. Dynamically generates missing YAML modules using LLM.",
  inputSchema: starterKitInputSchemaShape,
  executor: generateFullstackStarterKit
};

registerTool(starterKitToolDefinition);