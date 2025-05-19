/**
 * Factories for creating mock objects for testing
 */

import { JobStatus } from '../../services/job-manager/index.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Create a mock context object for testing
 * @param sessionId Session ID
 * @param transportType Transport type (stdio or sse)
 * @returns Mock context object
 */
export function createMockContext(sessionId: string = 'test-session', transportType: 'stdio' | 'sse' = 'stdio') {
  return {
    sessionId,
    transportType,
  };
}

/**
 * Create a mock tool parameters object for testing
 * @param toolName Tool name
 * @param params Tool parameters
 * @returns Mock tool parameters object
 */
export function createMockToolParams(toolName: string, params: Record<string, unknown> = {}) {
  return {
    name: toolName,
    parameters: params,
  };
}

/**
 * Create a mock code map generator parameters object for testing
 * @param rootDir Root directory
 * @param ignoredPatterns Ignored patterns
 * @param maxDepth Maximum depth
 * @returns Mock code map generator parameters object
 */
export function createMockCodeMapGeneratorParams(
  rootDir: string = '.',
  ignoredPatterns: string[] = ['node_modules', 'build', 'dist'],
  maxDepth: number = 5
) {
  return createMockToolParams('map-codebase', {
    rootDir,
    ignoredPatterns,
    maxDepth,
  });
}

/**
 * Create a mock fullstack starter kit generator parameters object for testing
 * @param projectName Project name
 * @param projectType Project type
 * @returns Mock fullstack starter kit generator parameters object
 */
export function createMockFullstackStarterKitGeneratorParams(
  projectName: string = 'test-project',
  projectType: string = 'react-node'
) {
  return {
    use_case: `${projectName} - ${projectType}`,
    tech_stack_preferences: {
      frontend: 'React',
      backend: 'Node.js'
    },
    request_recommendation: true,
    include_optional_features: ['Docker']
  };
}

/**
 * Create a mock job result retriever parameters object for testing
 * @param jobId Job ID
 * @returns Mock job result retriever parameters object
 */
export function createMockJobResultRetrieverParams(jobId: string = 'test-job') {
  return createMockToolParams('get-job-result', {
    jobId,
  });
}

/**
 * Create a mock workflow runner parameters object for testing
 * @param workflowName Workflow name
 * @param workflowParams Workflow parameters
 * @returns Mock workflow runner parameters object
 */
export function createMockWorkflowRunnerParams(
  workflowName: string = 'test-workflow',
  workflowParams: Record<string, unknown> = {}
) {
  return createMockToolParams('run-workflow', {
    workflowName,
    workflowParams,
  });
}

/**
 * Create a mock git summary generator parameters object for testing
 * @param repoPath Repository path
 * @param branch Branch
 * @param since Since date
 * @returns Mock git summary generator parameters object
 */
export function createMockGitSummaryGeneratorParams(
  repoPath: string = '.',
  branch: string = 'main',
  since: string = '1 week ago'
) {
  return createMockToolParams('generate-git-summary', {
    repoPath,
    branch,
    since,
  });
}

/**
 * Create a mock code refactor generator parameters object for testing
 * @param filePath File path
 * @param refactorType Refactor type
 * @param options Refactor options
 * @returns Mock code refactor generator parameters object
 */
export function createMockCodeRefactorGeneratorParams(
  filePath: string = 'src/index.ts',
  refactorType: string = 'extract-function',
  options: Record<string, unknown> = {}
) {
  return createMockToolParams('generate-code-refactor', {
    filePath,
    refactorType,
    options,
  });
}

/**
 * Create a mock PRD generator parameters object for testing
 * @param projectName Project name
 * @param outputPath Output path
 * @returns Mock PRD generator parameters object
 */
export function createMockPrdGeneratorParams(
  projectName: string = 'test-project',
  outputPath: string = './output/prd.md'
) {
  return createMockToolParams('generate-prd', {
    projectName,
    outputPath,
  });
}

/**
 * Create a mock research manager parameters object for testing
 * @param topic Research topic
 * @param outputPath Output path
 * @returns Mock research manager parameters object
 */
export function createMockResearchManagerParams(
  topic: string = 'test-topic',
  outputPath: string = './output/research.md'
) {
  return createMockToolParams('manage-research', {
    topic,
    outputPath,
  });
}

/**
 * Create a mock rules generator parameters object for testing
 * @param domain Domain
 * @param outputPath Output path
 * @returns Mock rules generator parameters object
 */
export function createMockRulesGeneratorParams(
  domain: string = 'test-domain',
  outputPath: string = './output/rules.md'
) {
  return createMockToolParams('generate-rules', {
    domain,
    outputPath,
  });
}

/**
 * Create a mock task list generator parameters object for testing
 * @param project Project
 * @param outputPath Output path
 * @returns Mock task list generator parameters object
 */
export function createMockTaskListGeneratorParams(
  project: string = 'test-project',
  outputPath: string = './output/tasks.md'
) {
  return createMockToolParams('generate-task-list', {
    project,
    outputPath,
  });
}

/**
 * Create a mock user stories generator parameters object for testing
 * @param project Project
 * @param outputPath Output path
 * @returns Mock user stories generator parameters object
 */
export function createMockUserStoriesGeneratorParams(
  project: string = 'test-project',
  outputPath: string = './output/user-stories.md'
) {
  return createMockToolParams('generate-user-stories', {
    project,
    outputPath,
  });
}

/**
 * Create a mock job
 * @param id Job ID
 * @param status Job status
 * @param message Job message
 * @param progress Job progress
 * @param result Job result
 * @returns Mock job
 */
export function createMockJob(
  id: string = 'test-job',
  status: JobStatus = JobStatus.PENDING,
  message: string = 'Job created',
  progress: number = 0,
  result: CallToolResult | null = null
) {
  return {
    id,
    toolName: 'test-tool',
    params: {
      use_case: 'Test use case',
      tech_stack_preferences: {
        frontend: 'React',
        backend: 'Node.js'
      }
    },
    status,
    progressMessage: message,
    progress,
    result,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastAccessedAt: Date.now(),
  };
}

/**
 * Create a mock job with rate limit
 * @param job Mock job
 * @param waitTime Wait time in milliseconds
 * @returns Mock job with rate limit
 */
export function createMockJobWithRateLimit(job: ReturnType<typeof createMockJob> | null, waitTime: number = 1000) {
  return {
    job,
    waitTime,
    shouldWait: waitTime > 0
  };
}

/**
 * Create a mock tool result
 * @param content Result content
 * @param isError Whether the result is an error
 * @param errorDetails Error details
 * @returns Mock tool result
 */
export function createMockToolResult(
  content: string | { type: string, text: string }[] = 'Tool executed successfully',
  isError: boolean = false,
  errorDetails: Record<string, unknown> | null = null
): CallToolResult {
  return {
    content: Array.isArray(content)
      ? content.map(item => {
          if (item.type === 'resource') {
            return item as any;
          }
          return {
            ...item,
            type: 'text'
          };
        })
      : [{
          type: 'text',
          text: typeof content === 'string' ? content : (content as { text: string }).text
        }],
    isError,
    errorDetails,
  };
}

/**
 * Create a mock async tool result
 * @param jobId Job ID
 * @param message Message
 * @param pollInterval Poll interval
 * @returns Mock async tool result
 */
export function createMockAsyncToolResult(
  jobId: string = 'mock-job-id',
  message: string = 'Tool execution started',
  pollInterval: number = 1000
) {
  return {
    jobId,
    message,
    pollInterval,
  };
}

/**
 * Create a mock workflow definition
 * @param name Workflow name
 * @param description Workflow description
 * @param steps Workflow steps
 * @returns Mock workflow definition
 */
export function createMockWorkflowDefinition(
  name: string = 'test-workflow',
  description: string = 'Test workflow',
  steps: Record<string, unknown>[] = []
) {
  return {
    name,
    description,
    steps: steps.length > 0 ? steps : [
      {
        id: 'step1',
        tool: 'echo',
        params: {
          message: 'Hello, world!',
        },
      },
    ],
  };
}

/**
 * Create a mock workflow execution result
 * @param success Whether the workflow execution was successful
 * @param message Message
 * @param outputs Workflow outputs
 * @param error Error details
 * @returns Mock workflow execution result
 */
export function createMockWorkflowExecutionResult(
  success: boolean = true,
  message: string = 'Workflow completed ok.',
  outputs: Record<string, unknown> = { result: 'Success' },
  error: Record<string, unknown> | null = null
) {
  return {
    success,
    message,
    outputs: success ? outputs : undefined,
    error: success ? undefined : error,
  };
}
