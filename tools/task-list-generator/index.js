// src/tools/task-list-generator/index.ts
import fs from 'fs-extra';
import path from 'path';
// Removed duplicate fs and path imports
import { z } from 'zod';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { performDirectLlmCall } from '../../utils/llmHelper.js'; // Import the SHARED helper
import { performResearchQuery } from '../../utils/researchHelper.js';
import logger from '../../logger.js';
import { registerTool } from '../../services/routing/toolRegistry.js';
import { AppError, ToolExecutionError } from '../../utils/errors.js';
// Removed selectModelForTask as it's handled within performDirectLlmCall
// --- Constants ---
const TASK_ID_PREFIX = 'T-';
const SUBTASK_ID_SEPARATOR = '.';
// Helper function to get the base output directory
function getBaseOutputDir() {
    // Prioritize environment variable, resolve to ensure it's treated as an absolute path if provided
    // Fallback to default relative to CWD
    return process.env.VIBE_CODER_OUTPUT_DIR
        ? path.resolve(process.env.VIBE_CODER_OUTPUT_DIR)
        : path.join(process.cwd(), 'workflow-agent-files');
}
// Define tool-specific directory using the helper
const TASK_LIST_DIR = path.join(getBaseOutputDir(), 'task-list-generator');
// Ensure directories exist
export async function initDirectories() {
    const baseOutputDir = getBaseOutputDir();
    try {
        await fs.ensureDir(baseOutputDir); // Ensure base directory exists
        const toolDir = path.join(baseOutputDir, 'task-list-generator');
        await fs.ensureDir(toolDir); // Ensure tool-specific directory exists
        logger.debug(`Ensured task list directory exists: ${toolDir}`);
    }
    catch (error) {
        logger.error({ err: error, path: baseOutputDir }, `Failed to ensure base output directory exists for task-list-generator.`);
        // Decide if we should re-throw or just log. Logging might be safer.
    }
}
// --- System Prompts ---
const INITIAL_TASK_LIST_SYSTEM_PROMPT = `
# Task List Generator - High-Level Tasks

# ROLE & GOAL
You are an expert Project Manager AI. Your goal is to generate ONLY the high-level development tasks (typically corresponding to Epics or major features) based on user stories and research context. DO NOT decompose into sub-tasks yet.

# CORE TASK
Generate a high-level, hierarchical development task list based on the user's product description, provided user stories, and research context. Focus on major phases and features.

# INPUT HANDLING
- Analyze 'productDescription' and 'userStories'.
- Analyze 'Pre-Generation Research Context' for lifecycle phases and key areas.

# RESEARCH CONTEXT INTEGRATION
- Use research insights (Lifecycle, Estimation, Team Structure) to:
    - Structure the list logically by standard phases (e.g., Setup, Backend, Frontend, Testing, Deployment).
    - Define realistic 'Dependencies' between these high-level tasks.
    - Apply appropriate relative 'Estimated Effort' (Small, Medium, Large).

# OUTPUT FORMAT & STRUCTURE (Strict Markdown)
- Your entire response **MUST** be valid Markdown.
- Start **directly** with the main title: '# Task List: [Inferred Product Name]'
- Organize tasks hierarchically using Markdown headings and nested lists:
    - \`## Phase: [Phase Name]\`
    - \`### Epic/Feature: [Related Epic or Feature]\` (Optional grouping)
    - Use a single level of bullet points (\`-\`) for the high-level tasks.
- For **each High-Level Task**, include ONLY the following details:
    - **ID:** T-[auto-incrementing number, e.g., T-101]
    - **Title:** [Clear, Action-Oriented Task Title]
    - *(Description):* [Brief explanation.]
    - *(User Story):* [ID(s) of related User Story | N/A]
    - *(Priority):* [High | Medium | Low]
    - *(Dependencies):* [List of Task IDs | None]
    - *(Est. Effort):* [Small | Medium | Large]

**Example High-Level Task Format:**
\`\`\`markdown
- **ID:** T-201
  **Title:** Implement User Authentication Backend
  *(Description):* Set up API endpoints and logic for user registration, login, and session management.
  *(User Story):* US-101, US-102
  *(Priority):* High
  *(Dependencies):* T-101
  *(Est. Effort):* Large
\`\`\`

# CONSTRAINTS
- **NO SUB-TASKS:** Do NOT break tasks down further in this step.
- **NO Conversational Filler.** Start directly with '# Task List: ...'.
- **Strict Formatting:** Use \`##\` for Phases, \`###\` for Epics, \`-\` for tasks. Use exact field names in bold.
- **IMPORTANT:** Your thought must contain ONLY the properly formatted Markdown task list.
`;
const TASK_DECOMPOSITION_SYSTEM_PROMPT = `
# Task Decomposition Specialist

# ROLE & GOAL
You are an expert Technical Lead specializing in breaking down a single software development task into its smallest, most actionable sub-components. Your goal is to take ONE high-level task and decompose it into detailed sub-tasks suitable for individual assignment, including specific implementation guidance.

# CORE TASK
Decompose the provided high-level task into the smallest possible, independently executable sub-tasks. For each sub-task, provide detailed implementation guidance.

# INPUT
You will receive the details of a SINGLE high-level task (the Parent Task), including its ID, Title, Description, etc.

# OUTPUT FORMAT & STRUCTURE (Strict Markdown List of Sub-Tasks ONLY)
- Your entire response **MUST** be a Markdown list containing **only** the sub-tasks derived from the single Parent Task provided.
- **DO NOT** repeat the Parent Task details in your output.
- **DO NOT** include any introductory text, concluding text, or phase/epic headings. Just the flat list of sub-tasks for the *one* parent task.
- For **each sub-task**, use the following precise format as a list item. **Adhere EXACTLY to this structure, field names, bolding, and indentation.**

- **Sub-Task ID:** {Parent Task ID}.[auto-incrementing number starting from 1, e.g., T-101.1, T-101.2]
  **Goal:** [Briefly state the specific objective of this sub-task.]
  **Task:** [Clear, highly specific action for the developer to perform.]
  **Rationale:** [Explain *why* this sub-task is necessary and how it contributes to the parent task.]
  **Expected Outcome:** [Describe the concrete, verifiable result of completing this sub-task.]
  **Objectives:** [Bulleted list of specific, measurable mini-goals or checks for this sub-task. Each objective MUST start with '* '. ]
    * Objective 1
    * Objective 2
  **Implementation Prompt:** [A detailed, guiding prompt for an AI coding assistant (like Cline) to implement this specific sub-task. Be language/framework specific if possible based on context from the Parent Task Description/Title.]
  **Example Code:**
  \`\`\`[language, e.g., python, typescript, jsx]
  // Provide a concise, relevant code snippet or structure example
  // illustrating the expected implementation approach.
  // Keep it focused on the sub-task's core logic. Use placeholders.
  \`\`\`

# DECOMPOSITION GUIDELINES
- Break the parent task down until sub-tasks represent roughly 1-4 hours of focused work, if possible.
- Sub-tasks should be logically sequential where necessary.
- Ensure sub-tasks collectively fulfill the parent task's description and objectives.
- Focus on technical implementation steps (e.g., "Define database schema", "Create API endpoint", "Implement UI component", "Write unit test").

# IMPLEMENTATION PROMPT & EXAMPLE CODE GUIDELINES
- The **Implementation Prompt** should be clear enough for another AI to take it and generate the required code. Include necessary context (e.g., function names, variable types, expected inputs/outputs).
- The **Example Code** should be a minimal, illustrative snippet demonstrating the pattern or key part of the implementation, not the full solution. Infer the likely language/framework if possible.

# CONSTRAINTS (MANDATORY)
- **ONLY output the Markdown list of sub-tasks.** No other text, explanations, or summaries before or after the list.
- Adhere **STRICTLY** to the sub-task format provided above. Double-check field names, bolding, indentation, and the bullet points for Objectives.
- Ensure sub-task IDs correctly follow the parent ID (e.g., T-101.1, T-101.2 for parent T-101). Start numbering from .1 for each parent.
- The **Example Code** section MUST use triple backticks (\`\`\`) with a language identifier.
- **Before finishing, review your generated list one last time to ensure it perfectly matches the required format.**
- **IMPORTANT:** Your thought must contain ONLY the properly formatted Markdown sub-task list.
`;
// --- Zod Schema ---
const taskListInputSchemaShape = {
    productDescription: z.string().min(10, { message: "Product description must be at least 10 characters." }).describe("Description of the product"),
    userStories: z.string().min(20, { message: "User stories must be provided and be at least 20 characters." }).describe("User stories (in Markdown format) to use for task list generation")
};
/** Parses the high-level Markdown task list, robustly handling formatting variations. */
function parseHighLevelTasks(markdownContent) {
    const tasks = [];
    const lines = markdownContent.split('\n');
    let currentTask = null;
    let currentTaskLines = [];
    const idRegex = /^\s*-\s+\*\*ID:\*\*\s*(T-\d+)/;
    const titleRegex = /^\s+\*\*Title:\*\*\s*(.*)/;
    const fieldRegex = /^\s+\*\(([\w\s.]+)\):\*\s*(.*)/; // Matches Description, User Story, etc.
    function finalizeCurrentTask() {
        if (currentTask && currentTask.id && currentTask.title) {
            // Reconstruct the original markdown block for this task
            currentTask.markdownLine = currentTaskLines.join('\n');
            tasks.push(currentTask);
            logger.debug(`Finalized task: ${currentTask.id}`);
        }
        else if (currentTask) {
            logger.warn({ task: currentTask }, "Discarding incomplete task block during parsing.");
        }
        currentTask = null;
        currentTaskLines = [];
    }
    for (const line of lines) {
        const idMatch = line.match(idRegex);
        if (idMatch) {
            // Found a new task ID, finalize the previous one (if any)
            finalizeCurrentTask();
            // Start a new task
            currentTask = { id: idMatch[1] };
            currentTaskLines.push(line);
            logger.debug(`Started parsing task: ${currentTask.id}`);
            continue; // Move to the next line
        }
        // If we are inside a task block
        if (currentTask) {
            currentTaskLines.push(line); // Add line to the current block's markdown
            const titleMatch = line.match(titleRegex);
            const fieldMatch = line.match(fieldRegex);
            if (titleMatch) {
                currentTask.title = titleMatch[1].trim();
            }
            else if (fieldMatch) {
                const key = fieldMatch[1].trim().toLowerCase();
                const value = fieldMatch[2].trim();
                switch (key) {
                    case 'description':
                        currentTask.description = value;
                        break;
                    case 'user story':
                        currentTask.userStory = value;
                        break;
                    case 'priority':
                        currentTask.priority = value;
                        break;
                    case 'dependencies':
                        currentTask.dependencies = value;
                        break;
                    case 'est. effort':
                        currentTask.effort = value;
                        break;
                    default:
                        logger.warn(`Unknown field key found in task ${currentTask.id}: ${key}`);
                }
            }
            // Ignore lines that don't match ID, Title, or Field patterns within a task block (e.g., blank lines)
        }
        // Ignore lines outside of task blocks (e.g., headers, blank lines before first task)
    }
    // Finalize the last task after the loop finishes
    finalizeCurrentTask();
    logger.info(`Parsed ${tasks.length} high-level tasks.`); // Changed level to info for better visibility
    if (tasks.length === 0 && markdownContent.trim().length > 0) {
        logger.warn("Parsing completed, but no tasks were successfully extracted. Check LLM output format against expected patterns.");
    }
    return tasks;
}
/** Fallback parser for when the primary parser fails */
function extractFallbackTasks(markdownContent) {
    logger.warn("Primary task parser failed. Attempting fallback parsing...");
    const tasks = [];
    const lines = markdownContent.split('\n');
    let taskCounter = 1;
    // Simple regex to find potential task lines (bullets or numbers)
    const potentialTaskRegex = /^\s*[-*]\s+(.*)|^\s*\d+\.\s+(.*)/;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(potentialTaskRegex);
        if (match) {
            const title = (match[1] || match[2] || 'Untitled Fallback Task').trim();
            // Avoid picking up sub-items of the expected format
            if (title.startsWith('**ID:**') || title.startsWith('*(Description):*')) {
                continue;
            }
            const taskId = `T-FALLBACK-${taskCounter++}`;
            logger.debug(`Fallback parser found potential task: ${taskId} - ${title}`);
            tasks.push({
                id: taskId,
                title: title,
                description: `(Fallback Parsed) ${title}`, // Use title as description
                userStory: 'N/A',
                priority: 'Medium',
                dependencies: 'None',
                effort: 'Medium',
                markdownLine: lines[i], // Store the original line
                subTasksMarkdown: undefined
            });
        }
    }
    if (tasks.length > 0) {
        logger.warn(`Fallback parser extracted ${tasks.length} potential tasks.`);
    }
    else {
        logger.error("Fallback parser also failed to extract any tasks from the content.");
    }
    return tasks;
}
/** Reconstructs the final Markdown with sub-tasks */
function reconstructMarkdown(originalMarkdown, decomposedTasks) {
    let finalMarkdown = "";
    const lines = originalMarkdown.split('\n');
    let currentTaskBlock = "";
    let currentTaskId = null;
    for (const line of lines) {
        const idMatch = line.match(/^\s*-\s+\*\*ID:\*\*\s*(T-\d+)/);
        if (idMatch) {
            // If we were processing a previous task block, add it and its subtasks
            if (currentTaskId && currentTaskBlock) {
                finalMarkdown += currentTaskBlock.trimEnd() + '\n'; // Add the parent task block
                if (decomposedTasks.has(currentTaskId)) {
                    const subTasks = decomposedTasks.get(currentTaskId);
                    if (subTasks) {
                        const indentedSubTasks = subTasks.split('\n').map(subLine => subLine.trim() ? `  ${subLine}` : '').join('\n');
                        finalMarkdown += indentedSubTasks.trimEnd() + '\n'; // Add indented sub-tasks
                    }
                }
            }
            // Start the new task block
            currentTaskId = idMatch[1];
            currentTaskBlock = line + '\n';
        }
        else if (currentTaskId) {
            // Continue adding lines to the current task block
            currentTaskBlock += line + '\n';
        }
        else {
            // Add lines before the first task (like title, phase headers)
            finalMarkdown += line + '\n';
        }
    }
    // Add the last task block and its subtasks
    if (currentTaskId && currentTaskBlock) {
        finalMarkdown += currentTaskBlock.trimEnd() + '\n';
        if (decomposedTasks.has(currentTaskId)) {
            const subTasks = decomposedTasks.get(currentTaskId);
            if (subTasks) {
                const indentedSubTasks = subTasks.split('\n').map(subLine => subLine.trim() ? `  ${subLine}` : '').join('\n');
                finalMarkdown += indentedSubTasks.trimEnd() + '\n';
            }
        }
    }
    return finalMarkdown.trim(); // Trim final newline
}
// --- Tool Executor ---
/**
 * Generate a task list, now with a decomposition step.
 */
export const generateTaskList = async (params, config) => {
    const { productDescription, userStories } = params;
    const decomposedTasks = new Map(); // Store decomposed tasks <ParentID, SubTasksMarkdown>
    try {
        // Ensure directories are initialized before writing
        await initDirectories();
        // --- Step 1: Generate High-Level Tasks ---
        logger.info("Task List Generator: Starting Step 1 - High-Level Task Generation...");
        let researchContext = '';
        try {
            const query1 = `Software development lifecycle tasks and milestones for: ${productDescription}`;
            const query2 = `Task estimation and dependency management best practices for software projects`;
            const query3 = `Development team structures and work breakdown for projects similar to: ${productDescription}`;
            const researchResults = await Promise.allSettled([
                performResearchQuery(query1, config),
                performResearchQuery(query2, config),
                performResearchQuery(query3, config)
            ]);
            researchContext = "## Pre-Generation Research Context (From Perplexity Sonar Deep Research):\n\n";
            researchResults.forEach((result, index) => {
                const queryLabels = ["Development Lifecycle & Milestones", "Task Estimation & Dependencies", "Team Structure & Work Breakdown"];
                if (result.status === "fulfilled") {
                    researchContext += `### ${queryLabels[index]}:\n${result.value.trim()}\n\n`;
                }
                else {
                    logger.warn({ error: result.reason }, `Research query ${index + 1} failed`);
                    researchContext += `### ${queryLabels[index]}:\n*Research on this topic failed.*\n\n`;
                }
            });
            logger.info("Task List Generator: Pre-generation research completed.");
        }
        catch (researchError) {
            logger.error({ err: researchError }, "Task List Generator: Error during research aggregation");
            researchContext = "## Pre-Generation Research Context:\n*Error occurred during research phase.*\n\n";
        }
        const initialGenerationPrompt = `Create a detailed task list for the following product:\n\n${productDescription}\n\nBased on these user stories:\n\n${userStories}\n\n${researchContext}`;
        // Use the SHARED direct LLM call helper
        const highLevelTaskListMarkdown = await performDirectLlmCall(initialGenerationPrompt, INITIAL_TASK_LIST_SYSTEM_PROMPT, // System prompt
        config, 'task_list_initial_generation' // Use the specific logical name
        );
        logger.debug({ rawOutput: highLevelTaskListMarkdown }, "Raw output from Step 1 (High-Level Task Generation - Direct Call):"); // Updated log message
        logger.info("Task List Generator: Step 1 - High-Level Task Generation completed (using direct call).");
        // --- Step 2: Decompose Each High-Level Task ---
        logger.info("Task List Generator: Starting Step 2 - Task Decomposition...");
        let parsedTasks = parseHighLevelTasks(highLevelTaskListMarkdown);
        // If primary parsing fails, attempt fallback parsing
        if (parsedTasks.length === 0 && highLevelTaskListMarkdown.trim().length > 0) {
            parsedTasks = extractFallbackTasks(highLevelTaskListMarkdown);
        }
        if (parsedTasks.length === 0) {
            // Log error if both primary and fallback parsing failed
            logger.error("Both primary and fallback parsers failed to extract any tasks from the initial generation step. Cannot proceed with decomposition.");
            // Potentially throw an error or return an error result here if needed
            // For now, we'll let it proceed, and reconstructMarkdown will just return the original markdown
        }
        else {
            logger.info(`Proceeding with decomposition for ${parsedTasks.length} tasks (potentially including fallback tasks).`);
            for (const task of parsedTasks) {
                // Skip decomposition if essential details are missing (robustness check, especially for fallback)
                if (!task.id || !task.title || !task.description) {
                    logger.warn({ taskId: task.id }, `Skipping decomposition for task ${task.id} due to missing details.`);
                    decomposedTasks.set(task.id, `- *(Skipped decomposition due to missing parent task details)*`);
                    continue;
                }
                logger.debug(`Decomposing task: ${task.id} - ${task.title}`);
                // Construct the prompt for the decomposition LLM call
                const decompositionPrompt = `Decompose the following high-level Parent Task into detailed, actionable sub-tasks:\n\nParent Task ID: ${task.id}\nParent Title: ${task.title}\nParent Description: ${task.description}\nRelated User Story: ${task.userStory || 'N/A'}\nPriority: ${task.priority || 'N/A'}\nDependencies: ${task.dependencies || 'None'}\nEst. Effort: ${task.effort || 'N/A'}`;
                try {
                    // Call LLM directly for decomposition using the specific decomposition prompt
                    // This is the key change - we're using a direct LLM call instead of processWithSequentialThinking
                    const subTasksMarkdown = await performDirectLlmCall(decompositionPrompt, TASK_DECOMPOSITION_SYSTEM_PROMPT, config, 'task_list_decomposition' // Pass the logical task name
                    );
                    // Basic validation: Check if the output looks like a list
                    if (subTasksMarkdown && subTasksMarkdown.trim().startsWith('- **Sub-Task ID:**')) {
                        decomposedTasks.set(task.id, subTasksMarkdown.trim());
                        logger.debug(`Successfully decomposed task ${task.id}`);
                    }
                    else {
                        logger.warn({ taskId: task.id, response: subTasksMarkdown }, `Decomposition for task ${task.id} returned unexpected format. Storing as note.`);
                        decomposedTasks.set(task.id, `- *(Decomposition failed: Unexpected format received)*\n\`\`\`\n${subTasksMarkdown}\n\`\`\``);
                    }
                }
                catch (decompError) {
                    logger.error({ err: decompError, taskId: task.id }, `Failed to decompose task ${task.id}. Storing error message.`);
                    decomposedTasks.set(task.id, `- *(Error: Failed to decompose this task: ${decompError instanceof Error ? decompError.message : String(decompError)})*`);
                }
            }
            logger.info(`Task List Generator: Step 2 - Decomposition completed for ${parsedTasks.length} tasks (check logs for individual errors).`);
        }
        // --- Step 3: Reconstruct Final Output ---
        logger.info("Task List Generator: Reconstructing final Markdown output...");
        // Use the original high-level markdown as the base for reconstruction
        const finalMarkdown = reconstructMarkdown(highLevelTaskListMarkdown, decomposedTasks);
        // --- Step 4: Save and Return ---
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const sanitizedName = productDescription.substring(0, 30).toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const filename = `${timestamp}-${sanitizedName}-task-list-detailed.md`; // Indicate detailed
        const filePath = path.join(TASK_LIST_DIR, filename); // Uses potentially configured TASK_LIST_DIR
        try {
            await fs.writeFile(filePath, finalMarkdown, 'utf8');
            logger.info(`Detailed task list generated and saved to ${filePath}`);
        }
        catch (saveError) {
            logger.error({ err: saveError, filePath }, "Failed to save the final detailed task list.");
            // Still return the content even if saving failed
        }
        return {
            content: [{ type: "text", text: finalMarkdown }],
            isError: false
        };
    }
    catch (error) {
        logger.error({ err: error, params }, 'Task List Generator Error (Outer Catch)');
        // Handle specific errors from direct call or research
        let appError;
        if (error instanceof AppError) {
            appError = error;
        }
        else if (error instanceof Error) {
            appError = new ToolExecutionError('Failed to generate task list.', { originalError: error.message }, error);
        }
        else {
            appError = new ToolExecutionError('An unknown error occurred while generating the task list.', { thrownValue: String(error) });
        }
        const mcpError = new McpError(ErrorCode.InternalError, appError.message, appError.context);
        return {
            content: [{ type: 'text', text: `Error: ${mcpError.message}` }],
            isError: true,
            errorDetails: mcpError
        };
    }
};
// --- Tool Registration ---
const taskListToolDefinition = {
    name: "generate-task-list",
    description: "Creates structured development task lists, decomposing high-level tasks into detailed sub-tasks with implementation guidance.", // Updated description
    inputSchema: taskListInputSchemaShape,
    executor: generateTaskList
};
registerTool(taskListToolDefinition);
// Initialize directories on load
initDirectories().catch((err) => logger.error({ err }, "Failed to initialize task-list-generator directories on startup."));
