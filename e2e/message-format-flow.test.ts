/**
 * End-to-end tests for message format
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

(runTests ? describe : describe.skip)('Message Format E2E Tests', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir('message-format-e2e-');
    
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

  it('should include jobId in background job initiation response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    expect(typeof result.jobId).toBe('string');
    expect(result.jobId.length).toBeGreaterThan(0);
  });

  it('should include message in background job initiation response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('message');
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
  });

  it('should include pollInterval in background job initiation response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('pollInterval');
    expect(typeof result.pollInterval).toBe('number');
    expect(result.pollInterval).toBeGreaterThanOrEqual(0);
  });

  it('should include job status in job result response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Retrieve the job result
    const jobResultParams = createMockJobResultRetrieverParams(jobId);
    const jobResult = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('status');
    expect(typeof jobResult.job?.status).toBe('string');
    expect([JobStatus.PENDING, JobStatus.IN_PROGRESS, JobStatus.COMPLETED, JobStatus.ERROR]).toContain(jobResult.job?.status);
  });

  it('should include progress percentage in job result response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Retrieve the job result
    const jobResultParams = createMockJobResultRetrieverParams(jobId);
    const jobResult = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('progress');
    expect(typeof jobResult.job?.progress).toBe('number');
    expect(jobResult.job?.progress).toBeGreaterThanOrEqual(0);
    expect(jobResult.job?.progress).toBeLessThanOrEqual(100);
  });

  it('should include pollInterval in job result response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Retrieve the job result
    const jobResultParams = createMockJobResultRetrieverParams(jobId);
    const jobResult = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the job result
    expect(jobResult).toHaveProperty('pollInterval');
    expect(typeof jobResult.pollInterval).toBe('number');
    expect(jobResult.pollInterval).toBeGreaterThanOrEqual(0);
  });

  it('should include result in completed job response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
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
    expect(jobResult.job).toHaveProperty('result');
    expect(jobResult.job?.result).not.toBeNull();
  });

  it('should include error details in error job response', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams('/non-existent-directory');
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
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
    expect(jobResult.job).toHaveProperty('status', JobStatus.ERROR);
    expect(jobResult.job).toHaveProperty('result');
    expect(jobResult.job?.result).toHaveProperty('isError', true);
    expect(jobResult.job?.result).toHaveProperty('errorDetails');
  });
});
