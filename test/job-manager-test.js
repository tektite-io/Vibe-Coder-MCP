#!/usr/bin/env node
/**
 * Test script for job manager and polling recommendations
 *
 * This script directly tests the job manager functionality and polling recommendations.
 *
 * Usage:
 *   node test/job-manager-test.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import { jobManager, JobStatus } from '../build/services/job-manager/index.js';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Main function
async function main() {
  console.log('Running job manager test');

  try {
    // Test 1: Create a job and check its status
    console.log('\n=== Test 1: Create a job and check its status ===');
    const jobId = jobManager.createJob('test-tool', { param1: 'test' });
    console.log(`Created job with ID: ${jobId}`);

    const job = jobManager.getJob(jobId);
    console.log('Job:', job);

    if (job && job.status === JobStatus.PENDING) {
      console.log('Test 1 passed: Job created with PENDING status');
    } else {
      console.log('Test 1 failed: Job not created with PENDING status');
    }

    // Test 2: Update job status and check rate limiting
    console.log('\n=== Test 2: Update job status and check rate limiting ===');
    jobManager.updateJobStatus(jobId, JobStatus.RUNNING, 'Job is running');

    // Get job with rate limiting
    const jobWithRateLimit = jobManager.getJobWithRateLimit(jobId, true);
    console.log('Job with rate limit:', jobWithRateLimit);

    if (jobWithRateLimit && jobWithRateLimit.job) {
      console.log('Test 2 passed: Job retrieved with rate limit information');
      console.log('Wait time:', jobWithRateLimit.waitTime);
      console.log('Should wait:', jobWithRateLimit.shouldWait);
    } else {
      console.log('Test 2 failed: Job not retrieved with rate limit information');
    }

    // Test 3: Test rate limiting
    console.log('\n=== Test 3: Test rate limiting ===');

    // Make multiple rapid requests
    console.log('Making multiple rapid requests...');
    const results = [];

    for (let i = 0; i < 5; i++) {
      const result = jobManager.getJobWithRateLimit(jobId, true);
      results.push(result);
      console.log(`Request ${i + 1} result:`, result.shouldWait ? 'Rate limited' : 'Not rate limited');

      // No delay to trigger rate limiting
      await setTimeout(10);
    }

    // Check if rate limiting was triggered
    const rateLimited = results.some(result => result.shouldWait);

    if (rateLimited) {
      console.log('Test 3 passed: Rate limiting was triggered');

      // Find the first rate-limited result
      const rateLimitedResult = results.find(result => result.shouldWait);
      console.log('Rate limit wait time:', rateLimitedResult.waitTime);
      console.log('Rate limit next check time:', new Date(Date.now() + rateLimitedResult.waitTime).toISOString());
    } else {
      console.log('Test 3 failed: Rate limiting was not triggered');
    }

    // Test 4: Test exponential backoff
    console.log('\n=== Test 4: Test exponential backoff ===');

    // Make multiple rapid requests to trigger exponential backoff
    console.log('Making multiple rapid requests to trigger exponential backoff...');
    const backoffResults = [];

    for (let i = 0; i < 10; i++) {
      const result = jobManager.getJobWithRateLimit(jobId, true);
      backoffResults.push(result);

      if (result.shouldWait) {
        console.log(`Request ${i + 1} rate limit wait time: ${result.waitTime}ms`);
      } else {
        console.log(`Request ${i + 1} not rate limited`);
      }

      // No delay to trigger rate limiting
      await setTimeout(10);
    }

    // Check if exponential backoff was applied
    const waitTimes = backoffResults
      .filter(result => result.shouldWait)
      .map(result => result.waitTime);

    if (waitTimes.length >= 2) {
      let exponentialBackoff = true;

      for (let i = 1; i < waitTimes.length; i++) {
        if (waitTimes[i] <= waitTimes[i - 1]) {
          exponentialBackoff = false;
          break;
        }
      }

      if (exponentialBackoff) {
        console.log('Test 4 passed: Exponential backoff was applied');
        console.log('Wait times:', waitTimes);
      } else {
        console.log('Test 4 failed: Exponential backoff was not applied');
        console.log('Wait times:', waitTimes);
      }
    } else {
      console.log('Test 4 failed: Not enough rate-limited requests to test exponential backoff');
    }

    // Test 5: Complete a job and retrieve the result
    console.log('\n=== Test 5: Complete a job and retrieve the result ===');

    const jobResult = {
      content: [{ type: 'text', text: 'Job completed successfully' }],
      isError: false
    };

    jobManager.setJobResult(jobId, jobResult);

    const completedJob = jobManager.getJob(jobId);
    console.log('Completed job:', completedJob);

    if (completedJob &&
        completedJob.status === JobStatus.COMPLETED &&
        completedJob.result &&
        completedJob.result.content[0].text === 'Job completed successfully') {
      console.log('Test 5 passed: Job completed and result set successfully');
    } else {
      console.log('Test 5 failed: Job completion or result setting failed');
    }

    console.log('\nAll tests completed');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
