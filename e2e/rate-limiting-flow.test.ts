/**
 * End-to-end tests for rate limiting behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  createTempProject,
  waitForCondition
} from '../src/__tests__/utils/test-helpers.js';
import fs from 'fs-extra';
import path from 'path';

// Skip these tests in CI environment
const runTests = process.env.CI !== 'true';

(runTests ? describe : describe.skip)('Rate Limiting E2E Tests', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir('rate-limiting-e2e-');
    
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

  it('should apply rate limiting to job status polling', async () => {
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
    
    // First poll
    const jobResult1 = await executeJobResultRetriever(jobResultParams, context);
    
    // Second poll immediately after
    const jobResult2 = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify that rate limiting is applied
    expect(jobResult2.pollInterval).toBeGreaterThan(0);
  });

  it('should adjust rate limiting based on job status', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-rate-limit-status', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Poll for the job result (job should be in progress)
    const jobResultParams = createMockJobResultRetrieverParams(jobId);
    const jobResult1 = await executeJobResultRetriever(jobResultParams, context);
    
    // Wait for the job to complete
    await wait(2000);
    
    // Poll for the job result again (job should be completed)
    const jobResult2 = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify that rate limiting is adjusted based on job status
    expect(jobResult1.pollInterval).toBeGreaterThan(0);
    expect(jobResult2.pollInterval).toBe(0);
  });

  it('should handle multiple clients polling the same job', async () => {
    // Create context and parameters
    const context1 = createMockContext('e2e-test-client-1', 'stdio');
    const context2 = createMockContext('e2e-test-client-2', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context1);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Poll for the job result from both clients
    const jobResultParams = createMockJobResultRetrieverParams(jobId);
    
    // First client poll
    const jobResult1 = await executeJobResultRetriever(jobResultParams, context1);
    
    // Second client poll
    const jobResult2 = await executeJobResultRetriever(jobResultParams, context2);
    
    // Verify that both clients receive the same job status
    expect(jobResult1.job?.status).toBe(jobResult2.job?.status);
    expect(jobResult1.job?.progress).toBe(jobResult2.job?.progress);
  });

  it('should handle multiple jobs with independent rate limiting', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-multi-job', 'stdio');
    const params1 = createMockCodeMapGeneratorParams(projectDir);
    const params2 = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator twice to create two jobs
    const result1 = await executeCodeMapGenerator(params1, context);
    const result2 = await executeCodeMapGenerator(params2, context);
    
    // Verify the responses
    expect(result1).toHaveProperty('jobId');
    expect(result2).toHaveProperty('jobId');
    
    const jobId1 = result1.jobId;
    const jobId2 = result2.jobId;
    
    // Poll for the first job result multiple times
    const jobResultParams1 = createMockJobResultRetrieverParams(jobId1);
    
    // First poll for job 1
    const jobResult1_1 = await executeJobResultRetriever(jobResultParams1, context);
    
    // Second poll for job 1
    const jobResult1_2 = await executeJobResultRetriever(jobResultParams1, context);
    
    // Poll for the second job result
    const jobResultParams2 = createMockJobResultRetrieverParams(jobId2);
    const jobResult2_1 = await executeJobResultRetriever(jobResultParams2, context);
    
    // Verify that rate limiting is applied independently
    expect(jobResult1_2.pollInterval).toBeGreaterThan(0);
    expect(jobResult2_1.pollInterval).toBeGreaterThanOrEqual(0);
  });

  it('should provide adaptive polling recommendations based on progress', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-adaptive', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Poll for the job result and track poll intervals
    let jobResult;
    let pollIntervals: number[] = [];
    let progressValues: number[] = [];
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      // Wait for the polling interval
      await wait(result.pollInterval || 1000);
      
      // Retrieve the job result
      const jobResultParams = createMockJobResultRetrieverParams(jobId);
      jobResult = await executeJobResultRetriever(jobResultParams, context);
      
      // Track poll intervals and progress values
      if (jobResult.pollInterval !== undefined) {
        pollIntervals.push(jobResult.pollInterval);
      }
      
      if (jobResult.job?.progress !== undefined) {
        progressValues.push(jobResult.job.progress);
      }
      
      // Check if the job is completed
      if (jobResult.job?.status === JobStatus.COMPLETED) {
        break;
      }
      
      attempts++;
    }
    
    // Verify poll intervals and progress values
    expect(pollIntervals.length).toBeGreaterThan(0);
    expect(progressValues.length).toBeGreaterThan(0);
    
    // Verify that the final poll interval is 0
    expect(pollIntervals[pollIntervals.length - 1]).toBe(0);
    
    // Verify that the final progress value is 100
    expect(progressValues[progressValues.length - 1]).toBe(100);
  });
});
