/**
 * Fixtures for Fullstack Starter Kit Generator end-to-end tests
 */

import { JobStatus } from '../../src/services/job-manager/index.js';

/**
 * Create expected job status updates for Fullstack Starter Kit Generator
 * @param jobId Job ID
 * @returns Expected job status updates
 */
export function createExpectedFullstackStarterKitJobStatusUpdates(jobId: string) {
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
      status: JobStatus.RUNNING,
      message: 'Initializing fullstack starter kit generator',
      progress: 10,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Researching tech stack',
      progress: 30,
      pollInterval: 1000,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Generating project structure',
      progress: 50,
      pollInterval: 800,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Creating setup scripts',
      progress: 70,
      pollInterval: 500,
    },
    {
      jobId,
      status: JobStatus.RUNNING,
      message: 'Finalizing project',
      progress: 90,
      pollInterval: 200,
    },
    {
      jobId,
      status: JobStatus.COMPLETED,
      message: 'Fullstack starter kit generated successfully',
      progress: 100,
      pollInterval: 0,
    },
  ];
}

/**
 * Create expected markdown sections for Fullstack Starter Kit Generator
 * @returns Expected markdown sections
 */
export function createExpectedMarkdownSections() {
  return [
    'Project:',
    'Tech Stack:',
    'Frontend:',
    'Backend:',
    'Setup Instructions:',
    'Next Steps:',
  ];
}

/**
 * Create expected error messages for Fullstack Starter Kit Generator
 * @returns Expected error messages
 */
export function createExpectedErrorMessages() {
  return [
    'Error: Invalid tech stack',
    'Error: Failed to research tech stack',
    'Error: Failed to generate project structure',
    'Error: Failed to create setup scripts',
    'Error: Failed to finalize project',
  ];
}

/**
 * Create expected file structure for Fullstack Starter Kit Generator
 * @param projectName Project name
 * @returns Expected file structure
 */
export function createExpectedFileStructure(projectName: string) {
  return [
    `${projectName}-definition.json`,
    `${projectName}-setup.sh`,
    `${projectName}-setup.bat`,
  ];
}

/**
 * Create expected tech stack options for Fullstack Starter Kit Generator
 * @returns Expected tech stack options
 */
export function createExpectedTechStackOptions() {
  return [
    'react-node',
    'vue-node',
    'react-python',
    'vue-python',
    'angular-node',
    'angular-python',
    'react-java',
    'vue-java',
    'angular-java',
  ];
}
