/**
 * End-to-end tests for transport-specific behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { codeMapExecutor } from '../src/tools/code-map-generator/index.js';
import { executeJobResultRetriever } from '../src/tools/job-result-retriever/index.js';
import { executeWorkflowRunner } from '../src/tools/workflow-runner/index.js';
import { JobStatus } from '../src/services/job-manager/index.js';
import {
  createMockContext,
  wait
} from '../src/__tests__/utils/job-polling-test-utils.js';
import {
  createMockCodeMapGeneratorParams,
  createMockJobResultRetrieverParams,
  createMockWorkflowRunnerParams
} from '../src/__tests__/utils/mock-factories.js';
import {
  createTempDir,
  removeTempDir,
  createTempProject,
  waitForCondition
} from '../src/__tests__/utils/test-helpers.js';
import fs from 'fs-extra';
import path from 'path';

// Skip these tests in CI environment
const runTests = process.env.CI !== 'true';

(runTests ? describe : describe.skip)('Transport-Specific E2E Tests', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir('transport-specific-e2e-');

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

  describe('Stdio Transport', () => {
    it('should provide polling interval for stdio transport', async () => {
      // Create context and parameters
      const context = createMockContext('e2e-test-stdio', 'stdio');
      const params = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator
      const result = await codeMapExecutor(params, {}, context);

      // Verify the response
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('pollInterval');
      expect(result.pollInterval).toBeGreaterThan(0);
    });

    it('should require polling for job status updates with stdio transport', async () => {
      // Create context and parameters
      const context = createMockContext('e2e-test-stdio', 'stdio');
      const params = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator
      const result = await codeMapExecutor(params, {}, context);

      // Verify the response
      expect(result).toHaveProperty('jobId');

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
    });

    it('should provide adaptive polling recommendations for stdio transport', async () => {
      // Create context and parameters
      const context = createMockContext('e2e-test-stdio', 'stdio');
      const params = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator
      const result = await codeMapExecutor(params, {}, context);

      // Verify the response
      expect(result).toHaveProperty('jobId');

      const jobId = result.jobId;

      // Poll for the job result
      let jobResult;
      let pollIntervals: number[] = [];
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
  });

  describe('SSE Transport', () => {
    it('should provide zero polling interval for SSE transport', async () => {
      // Create context and parameters
      const context = createMockContext('e2e-test-sse', 'sse');
      const params = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator
      const result = await codeMapExecutor(params, {}, context);

      // Verify the response
      expect(result).toHaveProperty('jobId');
      expect(result).toHaveProperty('pollInterval');
      expect(result.pollInterval).toBe(0);
    });

    it('should still allow polling for job status updates with SSE transport', async () => {
      // Create context and parameters
      const context = createMockContext('e2e-test-sse', 'sse');
      const params = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator
      const result = await codeMapExecutor(params, {}, context);

      // Verify the response
      expect(result).toHaveProperty('jobId');

      const jobId = result.jobId;

      // Wait for the job to complete
      await wait(2000);

      // Retrieve the job result
      const jobResultParams = createMockJobResultRetrieverParams(jobId);
      const jobResult = await executeJobResultRetriever(jobResultParams, context);

      // Verify the job result
      expect(jobResult).toHaveProperty('job');
      expect(jobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
    });
  });

  describe('Transport-Agnostic Behavior', () => {
    it('should create and execute jobs regardless of transport type', async () => {
      // Create contexts and parameters
      const stdioContext = createMockContext('e2e-test-stdio', 'stdio');
      const sseContext = createMockContext('e2e-test-sse', 'sse');
      const stdioParams = createMockCodeMapGeneratorParams(projectDir);
      const sseParams = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator with stdio transport
      const stdioResult = await codeMapExecutor(stdioParams, {}, stdioContext);
      expect(stdioResult).toHaveProperty('jobId');

      // Execute the code map generator with SSE transport
      const sseResult = await codeMapExecutor(sseParams, {}, sseContext);
      expect(sseResult).toHaveProperty('jobId');

      // Wait for the jobs to complete
      await wait(2000);

      // Retrieve the job results
      const stdioJobResultParams = createMockJobResultRetrieverParams(stdioResult.jobId);
      const sseJobResultParams = createMockJobResultRetrieverParams(sseResult.jobId);
      const stdioJobResult = await executeJobResultRetriever(stdioJobResultParams, stdioContext);
      const sseJobResult = await executeJobResultRetriever(sseJobResultParams, sseContext);

      // Verify the job results
      expect(stdioJobResult).toHaveProperty('job');
      expect(stdioJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
      expect(sseJobResult).toHaveProperty('job');
      expect(sseJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
    });

    it('should report progress with percentage updates regardless of transport type', async () => {
      // Create contexts and parameters
      const stdioContext = createMockContext('e2e-test-stdio-progress', 'stdio');
      const sseContext = createMockContext('e2e-test-sse-progress', 'sse');
      const stdioParams = createMockCodeMapGeneratorParams(projectDir);
      const sseParams = createMockCodeMapGeneratorParams(projectDir);

      // Execute the code map generator with stdio transport
      const stdioResult = await codeMapExecutor(stdioParams, {}, stdioContext);

      // Execute the code map generator with SSE transport
      const sseResult = await codeMapExecutor(sseParams, {}, sseContext);

      // Wait for the jobs to complete
      await wait(2000);

      // Retrieve the job results
      const stdioJobResultParams = createMockJobResultRetrieverParams(stdioResult.jobId);
      const sseJobResultParams = createMockJobResultRetrieverParams(sseResult.jobId);
      const stdioJobResult = await executeJobResultRetriever(stdioJobResultParams, stdioContext);
      const sseJobResult = await executeJobResultRetriever(sseJobResultParams, sseContext);

      // Verify the job results
      expect(stdioJobResult.job).toHaveProperty('progress', 100);
      expect(sseJobResult.job).toHaveProperty('progress', 100);
    });
  });
});
