/**
 * End-to-end tests for the Fullstack Starter Kit Generator tool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { generateFullstackStarterKit } from '../src/tools/fullstack-starter-kit-generator/index.js';
import { getJobResult } from '../src/tools/job-result-retriever/index.js';
import { JobStatus } from '../src/services/job-manager/index.js';
import {
  createMockContext,
  wait
} from '../src/__tests__/utils/job-polling-test-utils.js';
import {
  createMockFullstackStarterKitGeneratorParams
} from '../src/__tests__/utils/mock-factories.js';
import {
  createTempDir,
  removeTempDir
} from '../src/__tests__/utils/test-helpers.js';
import fs from 'fs-extra';
import path from 'path';
import { OpenRouterConfig } from '../src/types/workflow.js';

// Skip these tests in CI environment
const runTests = process.env.CI !== 'true';

(runTests ? describe : describe.skip)('Fullstack Starter Kit Generator E2E Tests', () => {
  let tempDir: string;
  let outputDir: string;

  let mockOpenRouterConfig: OpenRouterConfig;

  beforeEach(() => {
    tempDir = createTempDir('fullstack-starter-kit-e2e-');
    outputDir = path.join(tempDir, 'output');
    fs.ensureDirSync(outputDir);

    // Create mock OpenRouterConfig
    mockOpenRouterConfig = {
      baseUrl: 'https://mock-openrouter.ai/api',
      apiKey: 'mock-api-key',
      geminiModel: 'gemini-pro',
      perplexityModel: 'perplexity-pro'
    };
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it('should generate a fullstack starter kit and retrieve the result', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-session', 'stdio');
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node', outputDir);

    // Execute the fullstack starter kit generator
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');
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
      const jobResultParams = { jobId };
      jobResult = await getJobResult(jobResultParams, mockOpenRouterConfig, context);

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
    expect(content[0]).toHaveProperty('type', 'text');
    expect(content[0]).toHaveProperty('text');

    // Verify the text content
    const text = content[0].text;
    expect(text).toContain('Project:');
    expect(text).toContain('Tech Stack:');

    // Verify the output files
    const files = fs.readdirSync(outputDir);
    expect(files.length).toBeGreaterThan(0);

    // Verify the definition file
    const definitionFile = files.find(file => file.endsWith('-definition.json'));
    expect(definitionFile).toBeDefined();

    // Verify the setup scripts
    const shScript = files.find(file => file.endsWith('-setup.sh'));
    expect(shScript).toBeDefined();

    const batScript = files.find(file => file.endsWith('-setup.bat'));
    expect(batScript).toBeDefined();
  });

  it('should handle both stdio and SSE transports', async () => {
    // Test with stdio transport
    const stdioContext = createMockContext('e2e-test-stdio', 'stdio');
    const stdioParams = createMockFullstackStarterKitGeneratorParams('test-project-stdio', 'react-node', outputDir);

    const stdioResult = await generateFullstackStarterKit(stdioParams, mockOpenRouterConfig, stdioContext);
    expect(stdioResult).toHaveProperty('jobId');
    expect(stdioResult).toHaveProperty('pollInterval');
    expect(stdioResult.pollInterval).toBeGreaterThan(0);

    // Wait for the job to complete
    await wait(2000);

    // Retrieve the job result
    const stdioJobResultParams = { jobId: stdioResult.jobId };
    const stdioJobResult = await getJobResult(stdioJobResultParams, mockOpenRouterConfig, stdioContext);

    expect(stdioJobResult).toHaveProperty('job');
    expect(stdioJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);

    // Test with SSE transport
    const sseContext = createMockContext('e2e-test-sse', 'sse');
    const sseParams = createMockFullstackStarterKitGeneratorParams('test-project-sse', 'react-node', outputDir);

    const sseResult = await generateFullstackStarterKit(sseParams, mockOpenRouterConfig, sseContext);
    expect(sseResult).toHaveProperty('jobId');
    expect(sseResult).toHaveProperty('pollInterval');
    expect(sseResult.pollInterval).toBe(1000);

    // Wait for the job to complete
    await wait(2000);

    // Retrieve the job result
    const sseJobResultParams = { jobId: sseResult.jobId };
    const sseJobResult = await getJobResult(sseJobResultParams, mockOpenRouterConfig, sseContext);

    expect(sseJobResult).toHaveProperty('job');
    expect(sseJobResult.job).toHaveProperty('status', JobStatus.COMPLETED);
  });

  it('should handle errors gracefully', async () => {
    // Create context and parameters with an invalid output directory
    const context = createMockContext('e2e-test-error', 'stdio');
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'invalid-stack', outputDir);

    // Execute the fullstack starter kit generator
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, context);

    // Verify the response
    expect(result).toHaveProperty('jobId');

    // Wait for the job to complete
    await wait(2000);

    // Retrieve the job result
    const jobResultParams = { jobId: result.jobId };
    const jobResult = await getJobResult(jobResultParams, mockOpenRouterConfig, context);

    // Verify the job result
    expect(jobResult).toHaveProperty('job');
    expect(jobResult.job).toHaveProperty('status', JobStatus.FAILED);
    expect(jobResult.job).toHaveProperty('message');
    expect(jobResult.job.message).toContain('Error');
  });

  it('should report progress with percentage updates', async () => {
    // Create context and parameters
    const context = createMockContext('e2e-test-progress', 'stdio');
    const params = createMockFullstackStarterKitGeneratorParams('test-project', 'react-node', outputDir);

    // Execute the fullstack starter kit generator
    const result = await generateFullstackStarterKit(params, mockOpenRouterConfig, context);

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
      const jobResultParams = { jobId };
      jobResult = await getJobResult(jobResultParams, mockOpenRouterConfig, context);

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
