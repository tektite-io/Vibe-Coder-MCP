/**
 * End-to-end tests for job status polling optimization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeCodeMapGenerator } from '../src/tools/code-map-generator/index.js';
import { executeJobResultRetriever } from '../src/tools/job-result-retriever/index.js';
import { JobStatus } from '../src/services/job-manager/index.js';
import {
  createMockContext,
  wait
} from '../src/__tests__/utils/job-polling-test-utils.js';
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

(runTests ? describe : describe.skip)('Job Status Polling E2E Tests', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir('job-polling-e2e-');

    // Create a simple project structure
    const files = new Map<string, string>([
      ['index.js', 'const utils = require("./utils");\n\nfunction main() {\n  utils.helper();\n}\n\nmain();'],
      ['utils.js', 'function helper() {\n  console.log("Helper function");\n}\n\nmodule.exports = { helper };'],
    ]);
    projectDir = createTempProject(files, tempDir);
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should provide adaptive polling recommendations for stdio transport', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-stdio', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBeGreaterThan(0);

    const jobId = result.jobId;

    // Poll for the job result
    let jobResult;
    const pollIntervals: number[] = [];
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      // Wait for the polling interval
      await wait(result.pollInterval || 1000);

      // Retrieve the job result
      const jobResultParams = createMockJobResultRetrieverParams(jobId);
      jobResult = await executeJobResultRetriever(jobResultParams, context);

      // Track poll intervals
      if (jobResult.pollInterval !== undefined) {
        pollIntervals.push(jobResult.pollInterval);
      }

      // Check if the job is completed
      if (jobResult.job?.status === JobStatus.COMPLETED) {
        break;
      }

      attempts++;
    }

    // Verify poll intervals
    expect(pollIntervals.length).toBeGreaterThan(0);

    // Verify that the final poll interval is 0
    expect(pollIntervals[pollIntervals.length - 1]).toBe(0);
  });

  it('should provide zero polling interval for SSE transport', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-sse', 'sse');
    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');
    expect(result).toHaveProperty('pollInterval');
    expect(result.pollInterval).toBe(0);
  });

  it('should report progress with percentage updates', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-progress', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);

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

  it('should handle rate limiting for job status polling', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-rate-limit', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);

    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');

    const jobId = result.jobId;

    // Poll for the job result multiple times in quick succession
    const jobResultParams = createMockJobResultRetrieverParams(jobId);

    // First poll - we don't need to check the result, just making the call
    await executeJobResultRetriever(jobResultParams, context);

    // Second poll immediately after
    const jobResult2 = await executeJobResultRetriever(jobResultParams, context);

    // Verify that rate limiting is applied
    expect(jobResult2.pollInterval).toBeGreaterThan(0);
  });

  it('should handle both stdio and SSE transports', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('e2e-test-stdio-transport', 'stdio');
    const stdioParams = createMockCodeMapGeneratorParams(projectDir);

    const stdioResult = await executeCodeMapGenerator(stdioParams, stdioContext);
    expect(stdioResult).toHaveProperty('jobId');
    expect(stdioResult).toHaveProperty('pollInterval');
    expect(stdioResult.pollInterval).toBeGreaterThan(0);

    // Test with SSE transport
    const sseContext = createMockContext('e2e-test-sse-transport', 'sse');
    const sseParams = createMockCodeMapGeneratorParams(projectDir);

    const sseResult = await executeCodeMapGenerator(sseParams, sseContext);
    expect(sseResult).toHaveProperty('jobId');
    expect(sseResult).toHaveProperty('pollInterval');
    expect(sseResult.pollInterval).toBe(0);
  });
});
