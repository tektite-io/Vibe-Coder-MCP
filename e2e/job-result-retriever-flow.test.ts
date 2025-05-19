/**
 * End-to-end tests for the Job Result Retriever tool
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

(runTests ? describe : describe.skip)('Job Result Retriever E2E Tests', () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(() => {
    tempDir = createTempDir('job-result-retriever-e2e-');
    
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

  it('should retrieve job results for a completed job', async () => {
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
    expect(jobResult.job.result).toHaveProperty('markdown');
    
    // Verify the polling interval
    expect(jobResult).toHaveProperty('pollInterval');
    expect(jobResult.pollInterval).toBe(0);
  });

  it('should retrieve job results for an in-progress job', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockCodeMapGeneratorParams(projectDir);
    
    // Execute the code map generator
    const result = await executeCodeMapGenerator(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Retrieve the job result immediately (should be in progress)
    const jobResultParams = createMockJobResultRetrieverParams(jobId);
    const jobResult = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('status');
    expect([JobStatus.PENDING, JobStatus.IN_PROGRESS]).toContain(jobResult.job?.status);
    
    // Verify the polling interval
    expect(jobResult).toHaveProperty('pollInterval');
    expect(jobResult.pollInterval).toBeGreaterThan(0);
  });

  it('should handle non-existent jobs', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const jobResultParams = createMockJobResultRetrieverParams('non-existent-job');
    
    // Retrieve the job result
    const jobResult = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the job result
    expect(jobResult).toHaveProperty('error');
    expect(jobResult.error).toContain('not found');
  });

  it('should handle rate limiting for job status polling', async () => {
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
    const jobResult1 = await executeJobResultRetriever(jobResultParams, context);
    
    // Retrieve the job result again immediately
    const jobResult2 = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the polling interval
    expect(jobResult2).toHaveProperty('pollInterval');
    expect(jobResult2.pollInterval).toBeGreaterThan(0);
  });

  it('should work with both stdio and SSE transports', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('e2e-test-stdio', 'stdio');
    const stdioParams = createMockCodeMapGeneratorParams(projectDir);
    
    const stdioResult = await executeCodeMapGenerator(stdioParams, stdioContext);
    expect(stdioResult).toHaveProperty('jobId');
    
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
    
    const sseResult = await executeCodeMapGenerator(sseParams, sseContext);
    expect(sseResult).toHaveProperty('jobId');
    
    // Wait for the job to complete
    await wait(2000);
    
    // Retrieve the job result
    const sseJobResultParams = createMockJobResultRetrieverParams(sseResult.jobId);
    const sseJobResult = await executeJobResultRetriever(sseJobResultParams, sseContext);
    
    expect(sseJobResult).toHaveProperty('job');
    expect(sseJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
  });
});
