/**
 * Fixtures for Workflow Runner end-to-end tests
 */

import { JobStatus } from '../../src/services/job-manager/index.js';

/**
 * Create expected job status updates for Workflow Runner
 * @param jobId Job ID
 * @returns Expected job status updates
 */
export function createExpectedWorkflowRunnerJobStatusUpdates(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Starting workflow execution',
      progress: 10,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Executing workflow',
      progress: 50,
      pollInterval: 800,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Finalizing workflow execution',
      progress: 90,
      pollInterval: 500,
    },
    {
      jobId,
      status: JobStatus.COMPLETED,
      message: 'Workflow execution completed',
      progress: 100,
      pollInterval: 0,
    },
  ];
}

/**
 * Create expected workflow error updates
 * @param jobId Job ID
 * @returns Expected workflow error updates
 */
export function createExpectedWorkflowErrorUpdates(jobId: string) {
  return [
    {
      jobId,
      status: JobStatus.PENDING,
      message: 'Job created',
      progress: 0,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.IN_PROGRESS,
      message: 'Starting workflow execution',
      progress: 10,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.ERROR,
      message: 'Error executing workflow',
      progress: 10,
      pollInterval: 0,
    },
  ];
}

/**
 * Create a simple workflow definition
 * @returns Simple workflow definition
 */
export function createSimpleWorkflowDefinition() {
  return {
    name: 'simple-workflow',
    description: 'A simple workflow for testing',
    steps: [
      {
        id: 'step1',
        tool: 'echo',
        params: {
          message: 'Hello, world!'
        }
      }
    ]
  };
}

/**
 * Create a multi-step workflow definition
 * @returns Multi-step workflow definition
 */
export function createMultiStepWorkflowDefinition() {
  return {
    name: 'multi-step-workflow',
    description: 'A multi-step workflow for testing',
    steps: [
      {
        id: 'step1',
        tool: 'echo',
        params: {
          message: 'Step 1'
        }
      },
      {
        id: 'step2',
        tool: 'echo',
        params: {
          message: 'Step 2'
        }
      },
      {
        id: 'step3',
        tool: 'echo',
        params: {
          message: 'Step 3'
        }
      }
    ]
  };
}

/**
 * Create a workflow definition with input parameters
 * @returns Workflow definition with input parameters
 */
export function createWorkflowWithInputParameters() {
  return {
    name: 'workflow-with-input',
    description: 'A workflow with input parameters for testing',
    steps: [
      {
        id: 'step1',
        tool: 'echo',
        params: {
          message: '{{input.message}}'
        }
      }
    ]
  };
}

/**
 * Create a workflow definition with step outputs
 * @returns Workflow definition with step outputs
 */
export function createWorkflowWithStepOutputs() {
  return {
    name: 'workflow-with-step-outputs',
    description: 'A workflow with step outputs for testing',
    steps: [
      {
        id: 'step1',
        tool: 'echo',
        params: {
          message: 'Step 1'
        }
      },
      {
        id: 'step2',
        tool: 'echo',
        params: {
          message: '{{steps.step1.output}}'
        }
      }
    ]
  };
}
