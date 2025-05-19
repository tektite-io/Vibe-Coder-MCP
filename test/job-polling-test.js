#!/usr/bin/env node
/**
 * Test script for job status polling optimization
 *
 * This script tests the following:
 * 1. Rate limiting for job status retrieval
 * 2. Adaptive polling strategy
 * 3. Progress reporting
 * 4. Transport-specific behavior
 *
 * Usage:
 *   node test/job-polling-test.js [--test=<test-name>]
 *
 * Available tests:
 *   - rate-limiting: Test rate limiting for job status retrieval
 *   - adaptive-polling: Test adaptive polling strategy
 *   - progress-reporting: Test progress reporting
 *   - transport-specific: Test transport-specific behavior
 *   - all: Run all tests (default)
 */

import axios from 'axios';
import { spawn } from 'child_process';
import { promisify } from 'util';
import EventSource from 'eventsource';
const sleep = promisify(setTimeout);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SESSION_ID = `test-session-${Date.now()}`;
const TEST_TIMEOUT = 60000; // 60 seconds

// Parse command line arguments
const args = process.argv.slice(2);
const testArg = args.find(arg => arg.startsWith('--test='));
const testName = testArg ? testArg.split('=')[1] : 'all';

// Main function
async function main() {
  console.log(`Running job polling test: ${testName}`);

  try {
    // Start the server if not already running
    const server = await startServer();

    // Run the selected test
    switch (testName) {
      case 'rate-limiting':
        await testRateLimiting();
        break;
      case 'adaptive-polling':
        await testAdaptivePolling();
        break;
      case 'progress-reporting':
        await testProgressReporting();
        break;
      case 'transport-specific':
        await testTransportSpecific();
        break;
      case 'all':
        await testRateLimiting();
        await testAdaptivePolling();
        await testProgressReporting();
        await testTransportSpecific();
        break;
      default:
        console.error(`Unknown test: ${testName}`);
        process.exit(1);
    }

    // Stop the server
    if (server) {
      server.kill();
    }

    console.log('All tests completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Start the server
async function startServer() {
  // Check if the server is already running
  try {
    await axios.get(`${SERVER_URL}/health`);
    console.log('Server is already running');
    return null;
  } catch (error) {
    // Server is not running, start it
    console.log('Starting server...');

    const server = spawn('npm', ['start'], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: '3000',
        DEBUG: 'vibe-coder-mcp:*',
        NODE_ENV: 'development'
      }
    });

    // Wait for the server to start
    let attempts = 0;
    while (attempts < 10) {
      try {
        await axios.get(`${SERVER_URL}/health`);
        console.log('Server started successfully');
        return server;
      } catch (error) {
        attempts++;
        await sleep(1000);
      }
    }

    throw new Error('Failed to start server');
  }
}

// Establish SSE connection
async function establishSseConnection() {
  console.log('Establishing SSE connection...');

  // Create EventSource for SSE connection
  const eventSource = new EventSource(`${SERVER_URL}/sse?sessionId=${SESSION_ID}`);

  return new Promise((resolve, reject) => {
    eventSource.onopen = () => {
      console.log('SSE connection established');
      resolve(eventSource);
    };

    eventSource.onerror = (error) => {
      console.error('SSE connection error:', error);
      reject(error);
    };

    // Set a timeout
    setTimeout(() => {
      reject(new Error('Timeout establishing SSE connection'));
    }, 5000);
  });
}

// Start a long-running job
async function startLongRunningJob() {
  console.log('Starting a long-running job...');

  try {
    const response = await axios.post(`${SERVER_URL}/messages`, {
      session_id: SESSION_ID,
      message: {
        tool_name: 'map-codebase',
        arguments: {
          path: '.'
        }
      }
    });

    const jobId = response.data.jobId;
    console.log(`Job started with ID: ${jobId}`);
    return jobId;
  } catch (error) {
    console.error('Failed to start job:', error.response?.data || error.message);
    throw error;
  }
}

// Get job result
async function getJobResult(jobId) {
  console.log(`Getting result for job ${jobId}...`);

  try {
    const response = await axios.post(`${SERVER_URL}/messages`, {
      session_id: SESSION_ID,
      message: {
        tool_name: 'get-job-result',
        arguments: {
          jobId
        }
      }
    });

    return response.data;
  } catch (error) {
    console.error('Failed to get job result:', error.response?.data || error.message);
    throw error;
  }
}

// Test rate limiting
async function testRateLimiting() {
  console.log('=== Testing Rate Limiting ===');

  // Establish SSE connection
  const eventSource = await establishSseConnection();

  // Start a long-running job
  const jobId = await startLongRunningJob();

  // Poll the job status rapidly to trigger rate limiting
  console.log('Polling job status rapidly to trigger rate limiting...');

  let rateLimited = false;
  for (let i = 0; i < 10; i++) {
    const result = await getJobResult(jobId);

    if (result.rateLimit) {
      console.log(`Rate limited: Wait time = ${result.rateLimit.waitTime}ms`);
      rateLimited = true;
      break;
    }

    // No delay between requests to trigger rate limiting
  }

  if (!rateLimited) {
    throw new Error('Rate limiting test failed: No rate limiting detected');
  }

  console.log('Rate limiting test passed!');

  // Close the SSE connection
  eventSource.close();
}

// Test adaptive polling
async function testAdaptivePolling() {
  console.log('=== Testing Adaptive Polling ===');

  // Establish SSE connection
  const eventSource = await establishSseConnection();

  // Start a long-running job
  const jobId = await startLongRunningJob();

  // Poll the job status and check for polling recommendations
  console.log('Polling job status to check for polling recommendations...');

  let hasPollingRecommendation = false;
  for (let i = 0; i < 5; i++) {
    const result = await getJobResult(jobId);

    if (result.pollingRecommendation) {
      console.log(`Polling recommendation: Interval = ${result.pollingRecommendation.interval}ms`);
      hasPollingRecommendation = true;
      break;
    }

    // Wait a bit between requests
    await sleep(1000);
  }

  if (!hasPollingRecommendation) {
    throw new Error('Adaptive polling test failed: No polling recommendation detected');
  }

  console.log('Adaptive polling test passed!');

  // Close the SSE connection
  eventSource.close();
}

// Test progress reporting
async function testProgressReporting() {
  console.log('=== Testing Progress Reporting ===');

  // Establish SSE connection
  const eventSource = await establishSseConnection();

  // Listen for job progress events
  let progressEvents = [];
  eventSource.addEventListener('jobProgress', (event) => {
    const data = JSON.parse(event.data);
    console.log(`Progress event: ${data.status} - ${data.message}`);
    progressEvents.push(data);
  });

  // Start a long-running job
  const jobId = await startLongRunningJob();

  // Wait for progress events
  console.log('Waiting for progress events...');
  await sleep(10000);

  if (progressEvents.length === 0) {
    throw new Error('Progress reporting test failed: No progress events received');
  }

  console.log(`Received ${progressEvents.length} progress events`);
  console.log('Progress reporting test passed!');

  // Close the SSE connection
  eventSource.close();
}

// Test transport-specific behavior
async function testTransportSpecific() {
  console.log('=== Testing Transport-Specific Behavior ===');

  // This test would require simulating both stdio and SSE transports
  // For simplicity, we'll just test the SSE transport here

  // Establish SSE connection
  const eventSource = await establishSseConnection();

  // Start a long-running job
  const jobId = await startLongRunningJob();

  // Poll the job status
  console.log('Polling job status...');
  const result = await getJobResult(jobId);

  // Check if the response includes transport-specific information
  if (!result.jobStatus || !result.jobStatus.toolName) {
    throw new Error('Transport-specific test failed: No job status information in response');
  }

  console.log('Transport-specific test passed!');

  // Close the SSE connection
  eventSource.close();
}

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
