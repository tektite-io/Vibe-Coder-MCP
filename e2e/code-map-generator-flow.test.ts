/**
 * End-to-end tests for the Code Map Generator tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { codeMapExecutor } from '../src/tools/code-map-generator/index.js';
import { executeJobResultRetriever } from '../src/tools/job-result-retriever/index.js';
import { JobStatus } from '../src/services/job-manager/index.js';
import {
  createMockContext,
  wait
} from '../src//__tests__/utils/job-polling-test-utils.js';
import {
  createMockCodeMapGeneratorParams,
  createMockJobResultRetrieverParams
} from '../src/__tests__/utils/mock-factories.js';
import {
  createTempDir,
  removeTempDir,
  createTempProject
} from '../src/__tests__/utils/test-helpers.js';

// Skip these tests in CI environment
const runTests = process.env.CI !== 'true';

(runTests ? describe : describe.skip)('Code Map Generator E2E Tests', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir('code-map-e2e-');

    // Create a simple project structure
    const files = new Map<string, string>([
      ['index.js', 'const utils = require("./utils");\n\nfunction main() {\n  utils.helper();\n}\n\nmain();'],
      ['utils.js', 'function helper() {\n  console.log("Helper function");\n}\n\nmodule.exports = { helper };'],
      ['src/app.js', 'const config = require("../config");\n\nclass App {\n  constructor() {\n    this.config = config;\n  }\n\n  start() {\n    console.log("App started");\n  }\n}\n\nmodule.exports = App;'],
      ['config.js', 'module.exports = {\n  port: 3000,\n  host: "localhost"\n};'],
    ]);
    projectDir = createTempProject(files, tempDir);
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should generate a code map and retrieve the result', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    const result = await codeMapExecutor(params, {}, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');
    expect(result).toHaveProperty('message');
    expect(result).toHaveProperty('pollInterval');

    const jobId = result.jobId;

    // Poll for the job result
    let jobResult;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // Wait for the polling interval
      await wait(result.pollInterval || 1000);

      // Retrieve the job result
      const jobResultParams = createMockJobResultRetrieverParams(jobId);
      jobResult = await executeJobResultRetriever(jobResultParams, context);

      // Check if the job is completed
      if (jobResult.job?.status === JobStatus.COMPLETED) {
        break;
      }

      attempts++;
    }

    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
    expect(jobResult.job).toHaveProperty('result');
    expect(jobResult.job.result).toHaveProperty('markdown');

    // Verify the markdown content
    const markdown = jobResult.job.result.markdown;
    expect(markdown).toContain('Code Map for project');
    expect(markdown).toContain('File: index.js');
    expect(markdown).toContain('File: utils.js');
    expect(markdown).toContain('File: src/app.js');
    expect(markdown).toContain('File: config.js');

    // Verify the diagrams
    expect(markdown).toContain('File Dependency Diagram');
    expect(markdown).toContain('graph LR');

    // Verify the class information
    expect(markdown).toContain('Classes');
    expect(markdown).toContain('App');

    // Verify the function information
    expect(markdown).toContain('Functions');
    expect(markdown).toContain('main');
    expect(markdown).toContain('helper');
  });

  it('should handle both stdio and SSE transports', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('e2e-test-stdio', 'stdio');
    const stdioParams = createMockCodeMapGeneratorParams(projectDir);

    const stdioResult = await codeMapExecutor(stdioParams, {}, stdioContext);
    expect(stdioResult).toHaveProperty('jobId');
    expect(stdioResult).toHaveProperty('pollInterval');
    expect(stdioResult.pollInterval).toBeGreaterThan(0);

    // Wait for the job to complete
    await wait(2000);

    // Retrieve the job result
    const stdioJobResultParams = createMockJobResultRetrieverParams(stdioResult.jobId);
    const stdioJobResult = await executeJobResultRetriever(stdioJobResultParams, stdioContext);

    expect(stdioJobResult).toHaveProperty('job');
    expect(stdioJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);

    // Test with SSE transport
    const sseContext = createMockContext('e2e-test-sse', 'sse');
    const sseParams = createMockCodeMapGeneratorParams(projectDir);

    const sseResult = await codeMapExecutor(sseParams, {}, sseContext);
    expect(sseResult).toHaveProperty('jobId');
    expect(sseResult).toHaveProperty('pollInterval');
    expect(sseResult.pollInterval).toBe(0);

    // Wait for the job to complete
    await wait(2000);

    // Retrieve the job result
    const sseJobResultParams = createMockJobResultRetrieverParams(sseResult.jobId);
    const sseJobResult = await executeJobResultRetriever(sseJobResultParams, sseContext);

    expect(sseJobResult).toHaveProperty('job');
    expect(sseJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
  });

  it('should handle errors gracefully', async () => {
    // Create context and parameters with an invalid directory
    const context = createMockContext('e2e-test-error', 'stdio');
    const params = createMockCodeMapGeneratorParams('/non-existent-directory');

    // Execute the code map generator
    const result = await codeMapExecutor(params, {}, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');

    // Wait for the job to complete
    await wait(2000);

    // Retrieve the job result
    const jobResultParams = createMockJobResultRetrieverParams(result.jobId);
    const jobResult = await executeJobResultRetriever(jobResultParams, context);

    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('status', JobStatus.FAILED);
    expect(jobResult.job).toHaveProperty('message');
    expect(jobResult.job.message).toContain('Error');
  });

  it('should report progress with percentage updates', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-progress', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    const result = await codeMapExecutor(params, {}, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');

    const jobId = result.jobId;

    // Poll for the job result and track progress
    let jobResult;
    const progressValues: number[] = [];
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // Wait for the polling interval
      await wait(result.pollInterval || 1000);

      // Retrieve the job result
      const jobResultParams = createMockJobResultRetrieverParams(jobId);
      jobResult = await executeJobResultRetriever(jobResultParams, context);

      // Track progress
      if (jobResult.job?.progress !== undefined) {
        progressValues.push(jobResult.job.progress);
      }

      // Check if the job is completed
      if (jobResult.job?.status === JobStatus.COMPLETED) {
        break;
      }

      attempts++;
    }

    // Verify progress values
    expect(progressValues.length).toBeGreaterThan(0);

    // Verify that progress values are non-decreasing
    for (let i = 1; i < progressValues.length; i++) {
      expect(progressValues[i]).toBeGreaterThanOrEqual(progressValues[i - 1]);
    }

    // Verify that the final progress value is 100
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });
});
