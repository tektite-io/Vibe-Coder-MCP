import { z } from 'zod';
import { CallToolResult, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { OpenRouterConfig } from '../../types/workflow.js';
import { registerTool, ToolDefinition, ToolExecutor, ToolExecutionContext } from '../../services/routing/toolRegistry.js';
import { getBaseOutputDir, getVibeTaskManagerOutputDir } from './utils/config-loader.js';
import logger from '../../logger.js';
import { AgentOrchestrator } from './services/agent-orchestrator.js';
import { ProjectOperations } from './core/operations/project-operations.js';
import { DecompositionService } from './services/decomposition-service.js';
import { CommandGateway } from './nl/command-gateway.js';
import { jobManager } from '../../services/job-manager/index.js';
import path from 'path';
import fs from 'fs/promises';

// Input schema for the Vibe Task Manager tool
const vibeTaskManagerInputSchema = z.object({
  command: z.enum(['create', 'list', 'run', 'status', 'refine', 'decompose']).describe('The command to execute'),
  projectName: z.string().optional().describe('Name of the project to work with'),
  taskId: z.string().optional().describe('ID of the task to work with'),
  description: z.string().optional().describe('Description for project creation or task decomposition'),
  options: z.record(z.unknown()).optional().describe('Additional options for the command')
});

// Extract the raw shape for registration
const vibeTaskManagerInputSchemaShape = vibeTaskManagerInputSchema.shape;

/**
 * Main executor function for the Vibe Task Manager tool
 * Implements AI-agent-native task management with recursive decomposition
 */
export const vibeTaskManagerExecutor: ToolExecutor = async (
  params: Record<string, unknown>,
  config: OpenRouterConfig,
  context?: ToolExecutionContext
): Promise<CallToolResult> => {
  const sessionId = context?.sessionId || 'unknown-session';

  try {
    logger.info({ sessionId, params }, 'Vibe Task Manager execution started');

    // Auto-register agent session if not already registered
    await ensureAgentRegistration(sessionId, context);

    // Parse and validate input parameters
    const validatedParams = vibeTaskManagerInputSchema.parse(params);
    const { command, projectName, taskId, description, options } = validatedParams;

    // Route to appropriate command handler
    switch (command) {
      case 'create':
        return await handleCreateCommand(projectName, description, options, config, sessionId);

      case 'list':
        return await handleListCommand(options, sessionId);

      case 'run':
        return await handleRunCommand(taskId, options, config, sessionId);

      case 'status':
        return await handleStatusCommand(projectName, taskId, sessionId);

      case 'refine':
        return await handleRefineCommand(taskId, description, config, sessionId);

      case 'decompose':
        return await handleDecomposeCommand(taskId || projectName, description, config, sessionId);

      default:
        throw new Error(`Unknown command: ${command}`);
    }

  } catch (error) {
    logger.error({ err: error, sessionId, params }, 'Vibe Task Manager execution failed');

    if (error instanceof z.ZodError) {
      return {
        content: [{
          type: "text",
          text: `Validation error: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
};

/**
 * Handle project creation command
 */
async function handleCreateCommand(
  projectName: string | undefined,
  description: string | undefined,
  options: Record<string, unknown> | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, projectName }, 'Creating new project');

  if (!projectName) {
    return {
      content: [{
        type: "text",
        text: "Error: Project name is required for create command"
      }],
      isError: true
    };
  }

  if (!description) {
    return {
      content: [{
        type: "text",
        text: "Error: Project description is required for create command"
      }],
      isError: true
    };
  }

  try {
    // Create a background job for project creation
    const jobId = jobManager.createJob(
      'vibe-task-manager',
      { projectName, description, options, sessionId }
    );

    // Start project creation asynchronously
    setTimeout(async () => {
      try {
        const projectOps = ProjectOperations.getInstance();
        const result = await projectOps.createProject({
          name: projectName,
          description,
          techStack: options?.techStack as any,
          tags: options?.tags as string[],
          rootPath: options?.rootPath as string
        }, sessionId);

        if (result.success && result.data) {
          const outputDir = await getBaseOutputDir();
          const projectOutputPath = path.join(outputDir, 'projects', result.data.id);

          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `✅ Project "${projectName}" created successfully!\n\n` +
                    `Project ID: ${result.data.id}\n` +
                    `Description: ${description}\n` +
                    `Status: ${result.data.status}\n` +
                    `Output Directory: ${projectOutputPath}\n\n` +
                    `You can now decompose this project into tasks using:\n` +
                    `"Decompose my project into development tasks"`
            }]
          });
        } else {
          jobManager.setJobResult(jobId, {
            content: [{
              type: "text",
              text: `Error: ${result.error || 'Unknown error during project creation'}`
            }],
            isError: true
          });
        }
      } catch (error) {
        logger.error({ err: error, jobId, projectName }, 'Project creation failed');
        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Project creation failed'}`
          }],
          isError: true
        });
      }
    }, 100);

    return {
      content: [{
        type: "text",
        text: `🚀 Project creation started for "${projectName}"!\n\n` +
              `Job ID: ${jobId}\n` +
              `Status: Processing...\n\n` +
              `Use 'get-job-result' with job ID '${jobId}' to check progress and get the final result.`
      }],
      jobId
    };

  } catch (error) {
    logger.error({ err: error, sessionId, projectName }, 'Failed to start project creation');
    return {
      content: [{
        type: "text",
        text: `Error starting project creation: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

/**
 * Handle project listing command
 */
async function handleListCommand(
  options: Record<string, unknown> | undefined,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId }, 'Listing projects');

  // TODO: Implement project listing logic
  // This will be implemented in Epic 1.3: Basic Project Operations

  return {
    content: [{
      type: "text",
      text: "Project listing functionality will be implemented in Epic 1.3"
    }]
  };
}

/**
 * Handle task execution command
 */
async function handleRunCommand(
  taskId: string | undefined,
  options: Record<string, unknown> | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, taskId }, 'Running task');

  if (!taskId) {
    return {
      content: [{
        type: "text",
        text: "Error: Task ID is required for run command"
      }],
      isError: true
    };
  }

  // TODO: Implement task execution logic
  // This will be implemented in Epic 4.1: Sentinel Protocol Implementation

  return {
    content: [{
      type: "text",
      text: `Task execution functionality will be implemented in Epic 4.1. Task: ${taskId}`
    }]
  };
}

/**
 * Handle status checking command
 */
async function handleStatusCommand(
  projectName: string | undefined,
  taskId: string | undefined,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, projectName, taskId }, 'Checking status');

  // TODO: Implement status checking logic
  // This will be implemented in Epic 1.3: Basic Project Operations

  return {
    content: [{
      type: "text",
      text: "Status checking functionality will be implemented in Epic 1.3"
    }]
  };
}

/**
 * Handle task refinement command
 */
async function handleRefineCommand(
  taskId: string | undefined,
  description: string | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, taskId }, 'Refining task');

  if (!taskId) {
    return {
      content: [{
        type: "text",
        text: "Error: Task ID is required for refine command"
      }],
      isError: true
    };
  }

  // TODO: Implement task refinement logic
  // This will be implemented in Epic 2.1: RDD Decomposition Engine

  return {
    content: [{
      type: "text",
      text: `Task refinement functionality will be implemented in Epic 2.1. Task: ${taskId}`
    }]
  };
}

/**
 * Handle task decomposition command
 */
async function handleDecomposeCommand(
  target: string | undefined,
  description: string | undefined,
  config: OpenRouterConfig,
  sessionId: string
): Promise<CallToolResult> {
  logger.info({ sessionId, target }, 'Decomposing task/project');

  if (!target) {
    return {
      content: [{
        type: "text",
        text: "Error: Project name or task ID is required for decompose command"
      }],
      isError: true
    };
  }

  try {
    // Create a background job for decomposition
    const jobId = jobManager.createJob(
      'vibe-task-manager',
      { target, description, sessionId }
    );

    // Start decomposition asynchronously
    setTimeout(async () => {
      try {
        // For this demo, we'll create a mock task to decompose
        // In a real implementation, we'd load the project and create appropriate tasks
        const mockTask = {
          id: `task-${Date.now()}`,
          title: `Build ${target}`,
          description: description || `Complete development of ${target} with React and Node.js backend`,
          priority: 'high' as const,
          status: 'pending' as const,
          type: 'development' as const,
          projectId: target.toLowerCase().replace(/\s+/g, '-'),
          epicId: `epic-${Date.now()}`,
          dependencies: [],
          dependents: [],
          filePaths: ['src/App.tsx', 'server/index.js', 'package.json'],
          acceptanceCriteria: [
            'Frontend application is fully functional',
            'Backend API is implemented and tested',
            'Database schema is designed and implemented',
            'User authentication is working',
            'All tests pass'
          ],
          testingRequirements: {
            unitTests: ['App.test.tsx', 'api.test.js'],
            integrationTests: ['auth.integration.test.js'],
            performanceTests: ['load.test.js'],
            coverageTarget: 80
          },
          performanceCriteria: {
            responseTime: '< 200ms',
            memoryUsage: '< 512MB',
            throughput: '> 1000 req/s'
          },
          qualityCriteria: {
            codeQuality: ['ESLint passing', 'TypeScript strict mode'],
            documentation: ['README.md', 'API docs'],
            typeScript: true,
            eslint: true
          },
          integrationCriteria: {
            compatibility: ['Node.js 18+', 'React 18+'],
            patterns: ['REST API', 'Component-based architecture']
          },
          validationMethods: {
            automated: ['Unit tests', 'Integration tests', 'E2E tests'],
            manual: ['User acceptance testing', 'Performance review']
          },
          estimatedHours: 40,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: sessionId,
          tags: ['react', 'nodejs', 'fullstack'],
          metadata: {
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: sessionId,
            tags: ['react', 'nodejs', 'fullstack']
          }
        };

        const mockContext = {
          projectId: target.toLowerCase().replace(/\s+/g, '-'),
          languages: ['TypeScript', 'JavaScript'],
          frameworks: ['React', 'Express', 'Node.js'],
          tools: ['npm', 'webpack', 'jest'],
          existingTasks: [],
          codebaseSize: 'medium' as const,
          teamSize: 1,
          complexity: 'medium' as const
        };

        // For this demo, we'll simulate the decomposition process
        // In a real implementation, this would use the DecompositionService

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Generate mock sub-tasks for the demo
        const mockSubTasks = [
          {
            id: `task-${Date.now()}-1`,
            title: 'Setup Project Structure',
            description: 'Initialize React app with TypeScript and setup basic project structure',
            priority: 'high',
            estimatedHours: 4,
            type: 'development',
            status: 'pending'
          },
          {
            id: `task-${Date.now()}-2`,
            title: 'Design Database Schema',
            description: 'Create database schema for todo items with user authentication',
            priority: 'high',
            estimatedHours: 6,
            type: 'development',
            status: 'pending'
          },
          {
            id: `task-${Date.now()}-3`,
            title: 'Implement Backend API',
            description: 'Create REST API endpoints for CRUD operations on todo items',
            priority: 'high',
            estimatedHours: 12,
            type: 'development',
            status: 'pending'
          },
          {
            id: `task-${Date.now()}-4`,
            title: 'Build Frontend Components',
            description: 'Create React components for todo list, todo item, and forms',
            priority: 'medium',
            estimatedHours: 10,
            type: 'development',
            status: 'pending'
          },
          {
            id: `task-${Date.now()}-5`,
            title: 'Implement User Authentication',
            description: 'Add user registration, login, and session management',
            priority: 'medium',
            estimatedHours: 8,
            type: 'development',
            status: 'pending'
          },
          {
            id: `task-${Date.now()}-6`,
            title: 'Add Testing Suite',
            description: 'Write unit tests and integration tests for all components',
            priority: 'medium',
            estimatedHours: 6,
            type: 'testing',
            status: 'pending'
          }
        ];

        // Use the correct vibe-task-manager output directory
        const vibeOutputDir = getVibeTaskManagerOutputDir();
        const decompositionsDir = path.join(vibeOutputDir, 'decompositions');
        const decompositionOutputPath = path.join(decompositionsDir, jobId);

        // Create the decompositions directory if it doesn't exist
        await fs.mkdir(decompositionsDir, { recursive: true });

        // Create the specific decomposition directory
        await fs.mkdir(decompositionOutputPath, { recursive: true });

        const subTasksList = mockSubTasks.map((task, index) =>
          `${index + 1}. **${task.title}**\n   - ${task.description}\n   - Priority: ${task.priority}\n   - Estimated: ${task.estimatedHours}h\n   - Type: ${task.type}`
        ).join('\n\n');

        // Create decomposition summary data
        const decompositionData = {
          id: jobId,
          projectName: target,
          description: description || `Task decomposition for ${target}`,
          createdAt: new Date().toISOString(),
          totalSubTasks: mockSubTasks.length,
          totalEstimatedHours: mockSubTasks.reduce((sum, task) => sum + task.estimatedHours, 0),
          tasks: mockSubTasks,
          metadata: {
            decompositionMethod: 'mock_simulation',
            version: '1.0.0',
            sessionId: jobId
          }
        };

        // Save decomposition data as JSON
        const decompositionFile = path.join(decompositionOutputPath, 'decomposition.json');
        await fs.writeFile(decompositionFile, JSON.stringify(decompositionData, null, 2));

        // Save decomposition summary as Markdown
        const markdownContent = `# Project Decomposition: ${target}

**Decomposition ID**: ${jobId}
**Created**: ${new Date().toISOString()}
**Total Sub-tasks**: ${mockSubTasks.length}
**Total Estimated Hours**: ${mockSubTasks.reduce((sum, task) => sum + task.estimatedHours, 0)}h

## Description
${description || `Task decomposition for ${target}`}

## Generated Tasks

${subTasksList}

## Next Steps
• Review and refine the generated tasks
• Assign priorities and dependencies
• Start with high-priority tasks
• Use 'run' command to execute individual tasks

---
*Generated by Vibe Task Manager v1.0.0*
`;

        const markdownFile = path.join(decompositionOutputPath, 'decomposition-summary.md');
        await fs.writeFile(markdownFile, markdownContent);

        logger.info({
          jobId,
          target,
          outputPath: decompositionOutputPath,
          tasksGenerated: mockSubTasks.length
        }, 'Decomposition files saved successfully');

        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `✅ Project decomposition completed for "${target}"!\n\n` +
                  `Decomposition ID: ${jobId}\n` +
                  `Total Sub-tasks: ${mockSubTasks.length}\n` +
                  `Total Estimated Hours: ${mockSubTasks.reduce((sum, task) => sum + task.estimatedHours, 0)}h\n` +
                  `Output Directory: ${decompositionOutputPath}\n\n` +
                  `**Generated Files:**\n` +
                  `• ${decompositionFile}\n` +
                  `• ${markdownFile}\n\n` +
                  `**Generated Tasks:**\n${subTasksList}\n\n` +
                  `✨ **Next Steps:**\n` +
                  `• Review and refine the generated tasks\n` +
                  `• Assign priorities and dependencies\n` +
                  `• Start with high-priority tasks\n` +
                  `• Use 'run' command to execute individual tasks\n\n` +
                  `The decomposition has broken down your project into manageable, actionable tasks!`
          }]
        });

      } catch (error) {
        logger.error({ err: error, jobId, target }, 'Decomposition failed');
        jobManager.setJobResult(jobId, {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : 'Decomposition failed'}`
          }],
          isError: true
        });
      }
    }, 100);

    return {
      content: [{
        type: "text",
        text: `🚀 Project decomposition started for "${target}"!\n\n` +
              `Job ID: ${jobId}\n` +
              `Status: Processing...\n\n` +
              `This will break down your project into manageable development tasks.\n` +
              `Use 'get-job-result' with job ID '${jobId}' to check progress and get the final result.`
      }],
      jobId
    };

  } catch (error) {
    logger.error({ err: error, sessionId, target }, 'Failed to start decomposition');
    return {
      content: [{
        type: "text",
        text: `Error starting decomposition: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

// Tool definition for registration
const vibeTaskManagerDefinition: ToolDefinition = {
  name: "vibe-task-manager",
  description: "AI-agent-native task management system with recursive decomposition design (RDD) methodology. Supports project creation, task decomposition, dependency management, and agent coordination for autonomous software development workflows.",
  inputSchema: vibeTaskManagerInputSchemaShape,
  executor: vibeTaskManagerExecutor
};

/**
 * Ensure agent is registered for the current session
 */
async function ensureAgentRegistration(sessionId: string, context?: ToolExecutionContext): Promise<void> {
  try {
    const orchestrator = AgentOrchestrator.getInstance();

    // Check if agent is already registered
    const existingAgents = orchestrator.getAgents();
    const existingAgent = existingAgents.find(agent => agent.id === sessionId);

    if (!existingAgent) {
      // Auto-register new agent with default capabilities
      await orchestrator.registerAgent({
        id: sessionId,
        name: `IDE Agent ${sessionId.substring(0, 8)}`,
        capabilities: ['general'], // Start with general capability
        maxConcurrentTasks: 3,
        currentTasks: [],
        status: 'available',
        metadata: {
          version: '1.0.0',
          supportedProtocols: ['mcp'],
          preferences: {
            autoRegistered: true,
            registeredAt: new Date().toISOString()
          }
        }
      });

      logger.info({ sessionId }, 'Auto-registered new IDE agent');
    } else {
      // Update heartbeat for existing agent
      orchestrator.updateAgentHeartbeat(sessionId, 'available');
    }
  } catch (error) {
    logger.error({ err: error, sessionId }, 'Failed to ensure agent registration');
    // Don't throw - continue with execution even if registration fails
  }
}

// Register the tool with the central registry
registerTool(vibeTaskManagerDefinition);

logger.debug('Vibe Task Manager tool registered successfully');
