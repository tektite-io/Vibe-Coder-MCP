/**
 * End-to-end tests for the Workflow Runner tool
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeWorkflowRunner } from '../src/tools/workflow-runner/index.js';
import { executeJobResultRetriever } from '../src/tools/job-result-retriever/index.js';
import { JobStatus } from '../src/services/job-manager/index.js';
import { 
  createMockContext,
  wait
} from '../src/__tests__/utils/job-polling-test-utils.js';
import { 
  createMockWorkflowRunnerParams,
  createMockJobResultRetrieverParams
} from '../src/__tests__/utils/mock-factories.js';
import { 
  createTempDir, 
  removeTempDir,
  waitForCondition
} from '../src/__tests__/utils/test-helpers.js';
import fs from 'fs-extra';
import path from 'path';

// Skip these tests in CI environment
const runTests = process.env.CI !== 'true';

(runTests ? describe : describe.skip)('Workflow Runner E2E Tests', () => {
  let tempDir: string;
  let workflowsDir: string;

  beforeEach(async () => {
    tempDir = createTempDir('workflow-runner-e2e-');
    workflowsDir = path.join(tempDir, 'workflows');
    
    // Create workflows directory
    await fs.ensureDir(workflowsDir);
    
    // Create a simple workflow definition
    const simpleWorkflow = {
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
    
    // Write workflow definition to file
    await fs.writeJson(path.join(workflowsDir, 'simple-workflow.json'), simpleWorkflow);
    
    // Create a mock tool for the workflow
    // Note: In a real test, we would register this tool with the tool registry
    // For this test, we'll assume the tool is already registered
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should execute a workflow and retrieve the result', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockWorkflowRunnerParams('simple-workflow');
    
    // Execute the workflow runner
    const result = await executeWorkflowRunner(params, context);
    
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
    expect(jobResult.job.result).toHaveProperty('content');
    
    // Verify the content
    const content = jobResult.job.result.content;
    expect(content).toHaveLength(1);
    expect(content[0]).toHaveProperty('text');
    
    // Verify the text content
    const text = content[0].text;
    expect(text).toContain('Workflow Execution: Completed');
  });

  it('should handle both stdio and SSE transports', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('e2e-test-stdio', 'stdio');
    const stdioParams = createMockWorkflowRunnerParams('simple-workflow');
    
    const stdioResult = await executeWorkflowRunner(stdioParams, stdioContext);
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
    const sseParams = createMockWorkflowRunnerParams('simple-workflow');
    
    const sseResult = await executeWorkflowRunner(sseParams, sseContext);
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
    // Create context and parameters with a non-existent workflow
    const context = createMockContext('e2e-test-error', 'stdio');
    const params = createMockWorkflowRunnerParams('non-existent-workflow');
    
    // Execute the workflow runner
    const result = await executeWorkflowRunner(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    // Wait for the job to complete
    await wait(2000);
    
    // Retrieve the job result
    const jobResultParams = createMockJobResultRetrieverParams(result.jobId);
    const jobResult = await executeJobResultRetriever(jobResultParams, context);
    
    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('status', JobStatus.ERROR);
    expect(jobResult.job).toHaveProperty('message');
    expect(jobResult.job.message).toContain('Error');
  });

  it('should report progress with percentage updates', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-progress', 'stdio');
    const params = createMockWorkflowRunnerParams('simple-workflow');
    
    // Execute the workflow runner
    const result = await executeWorkflowRunner(params, context);
    
    // Verify the response
    expect(result).toHaveProperty('jobId');
    
    const jobId = result.jobId;
    
    // Poll for the job result and track progress
    let jobResult;
    let progressValues: number[] = [];
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
