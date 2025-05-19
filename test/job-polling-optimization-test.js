#!/usr/bin/env node
/**
 * Test script for job status polling optimization
 * 
 * This script tests the job status polling optimization implementation.
 * It starts a long-running job and tests the polling recommendations and rate limiting.
 * 
 * Usage:
 *   node test/job-polling-optimization-test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import EventSource from 'eventsource';
import axios from 'axios';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SESSION_ID = `test-session-${Date.now()}`;
const TEST_TIMEOUT = 60000; // 60 seconds

// Main function
async function main() {
  console.log('Running job status polling optimization test');
  
  try {
    // Start the server
    console.log('Starting server...');
    const server = spawn('node', ['build/index.js', '--sse'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: '3000',
        DEBUG: 'vibe-coder-mcp:*',
        NODE_ENV: 'development'
      }
    });
    
    // Wait for the server to start
    console.log('Waiting for server to start...');
    let serverStarted = false;
    for (let i = 0; i < 10; i++) {
      try {
        await axios.get(`${SERVER_URL}/health`);
        serverStarted = true;
        console.log('Server started successfully');
        break;
      } catch (error) {
        await setTimeout(1000);
      }
    }
    
    if (!serverStarted) {
      throw new Error('Failed to start server');
    }
    
    // Establish SSE connection
    console.log('Establishing SSE connection...');
    const eventSource = new EventSource(`${SERVER_URL}/sse?sessionId=${SESSION_ID}`);
    
    // Wait for SSE connection to be established
    await new Promise((resolve, reject) => {
      eventSource.onopen = () => {
        console.log('SSE connection established');
        resolve();
      };
      
      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        reject(error);
      };
      
      // Set a timeout
      setTimeout(5000).then(() => {
        reject(new Error('Timeout establishing SSE connection'));
      });
    });
    
    // Listen for job progress events
    const progressEvents = [];
    eventSource.addEventListener('jobProgress', (event) => {
      const data = JSON.parse(event.data);
      console.log(`Progress event: ${data.status} - ${data.message} (${data.progress || 'N/A'}%)`);
      progressEvents.push(data);
    });
    
    // Start a long-running job
    console.log('Starting a long-running job...');
    const jobId = await startJob(SESSION_ID);
    console.log(`Job started with ID: ${jobId}`);
    
    // Test polling recommendations
    console.log('\n=== Testing Polling Recommendations ===');
    const pollingRecommendations = await testPollingRecommendations(jobId);
    
    // Test rate limiting
    console.log('\n=== Testing Rate Limiting ===');
    const rateLimitingResults = await testRateLimiting(jobId);
    
    // Wait for job to complete
    console.log('\n=== Waiting for Job to Complete ===');
    const finalResult = await waitForJobCompletion(jobId);
    
    // Analyze results
    console.log('\n=== Test Results ===');
    console.log(`Progress events received: ${progressEvents.length}`);
    console.log(`Polling recommendations received: ${pollingRecommendations.length}`);
    console.log(`Rate limiting triggered: ${rateLimitingResults.rateLimited ? 'Yes' : 'No'}`);
    
    if (progressEvents.length > 0) {
      console.log('\nProgress events sample:');
      progressEvents.slice(0, 3).forEach((event, i) => {
        console.log(`${i + 1}. ${event.status} - ${event.message} (${event.progress || 'N/A'}%)`);
      });
    }
    
    if (pollingRecommendations.length > 0) {
      console.log('\nPolling recommendations sample:');
      pollingRecommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`${i + 1}. Interval: ${rec.interval}ms, Next check: ${new Date(rec.nextCheckTime).toISOString()}`);
      });
    }
    
    if (rateLimitingResults.rateLimited) {
      console.log('\nRate limiting details:');
      console.log(`Wait time: ${rateLimitingResults.waitTime}ms`);
      console.log(`Next check time: ${new Date(rateLimitingResults.nextCheckTime).toISOString()}`);
    }
    
    // Close the SSE connection
    eventSource.close();
    
    // Stop the server
    console.log('\nStopping server...');
    server.kill();
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Start a long-running job
async function startJob(sessionId) {
  try {
    const response = await axios.post(`${SERVER_URL}/messages`, {
      session_id: sessionId,
      message: {
        tool_name: 'map-codebase',
        arguments: {
          path: '.'
        }
      }
    });
    
    return response.data.jobId;
  } catch (error) {
    console.error('Failed to start job:', error.response?.data || error.message);
    throw error;
  }
}

// Get job result
async function getJobResult(jobId) {
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

// Test polling recommendations
async function testPollingRecommendations(jobId) {
  const pollingRecommendations = [];
  
  // Poll the job status a few times to check for polling recommendations
  for (let i = 0; i < 5; i++) {
    console.log(`Polling job status (${i + 1}/5)...`);
    const result = await getJobResult(jobId);
    
    if (result.pollingRecommendation) {
      console.log(`Received polling recommendation: ${result.pollingRecommendation.interval}ms`);
      pollingRecommendations.push(result.pollingRecommendation);
    } else {
      console.log('No polling recommendation received');
    }
    
    // Wait a bit between polls
    await setTimeout(1000);
  }
  
  return pollingRecommendations;
}

// Test rate limiting
async function testRateLimiting(jobId) {
  const result = {
    rateLimited: false,
    waitTime: 0,
    nextCheckTime: 0
  };
  
  // Poll the job status rapidly to trigger rate limiting
  console.log('Polling job status rapidly to trigger rate limiting...');
  
  for (let i = 0; i < 10; i++) {
    console.log(`Rapid poll ${i + 1}/10...`);
    const jobResult = await getJobResult(jobId);
    
    if (jobResult.rateLimit) {
      console.log(`Rate limited: Wait time = ${jobResult.rateLimit.waitTime}ms`);
      result.rateLimited = true;
      result.waitTime = jobResult.rateLimit.waitTime;
      result.nextCheckTime = jobResult.rateLimit.nextCheckTime;
      break;
    }
    
    // No delay between requests to trigger rate limiting
    await setTimeout(100);
  }
  
  return result;
}

// Wait for job completion
async function waitForJobCompletion(jobId) {
  console.log(`Waiting for job ${jobId} to complete...`);
  
  const startTime = Date.now();
  let interval = 1000; // Start with 1 second
  
  while (Date.now() - startTime < TEST_TIMEOUT) {
    const result = await getJobResult(jobId);
    
    // Check if the job is completed or failed
    if (result.jobStatus && (result.jobStatus.status === 'COMPLETED' || result.jobStatus.status === 'FAILED')) {
      console.log(`Job ${jobId} ${result.jobStatus.status.toLowerCase()}`);
      return result;
    }
    
    // Use recommended polling interval if provided
    if (result.pollingRecommendation) {
      interval = result.pollingRecommendation.interval;
    } else {
      // Otherwise, implement exponential backoff
      interval = Math.min(interval * 1.5, 5000); // Max 5 seconds
    }
    
    console.log(`Waiting ${interval / 1000} seconds before next check...`);
    await setTimeout(interval);
  }
  
  throw new Error(`Timeout waiting for job ${jobId} to complete`);
}

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
