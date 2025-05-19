#!/usr/bin/env node
/**
 * Test script for rate limiting functionality
 * 
 * This script tests the rate limiting functionality of the job status retrieval.
 * It makes rapid successive calls to the get-job-result tool to trigger rate limiting.
 * 
 * Usage:
 *   node test/rate-limiting-test.js
 */

const axios = require('axios');
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SESSION_ID = `test-session-${Date.now()}`;
const TEST_TIMEOUT = 60000; // 1 minute

// Main function
async function main() {
  console.log('Testing rate limiting functionality');
  
  try {
    // Start the server if not already running
    const server = await startServer();
    
    // Start a long-running job
    const jobId = await startJob();
    
    // Test rapid successive calls
    await testRapidSuccessiveCalls(jobId);
    
    // Test exponential backoff
    await testExponentialBackoff(jobId);
    
    // Stop the server
    if (server) {
      server.kill();
    }
    
    console.log('Test completed successfully!');
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

// Start a long-running job
async function startJob() {
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

// Test rapid successive calls
async function testRapidSuccessiveCalls(jobId) {
  console.log('\n=== Testing Rapid Successive Calls ===');
  
  console.log('Making rapid successive calls to get-job-result...');
  
  let rateLimited = false;
  let rateLimitWaitTime = 0;
  
  for (let i = 0; i < 10; i++) {
    console.log(`Call ${i + 1}...`);
    const result = await getJobResult(jobId);
    
    if (result.rateLimit) {
      console.log(`Rate limited: Wait time = ${result.rateLimit.waitTime}ms`);
      rateLimited = true;
      rateLimitWaitTime = result.rateLimit.waitTime;
      break;
    }
    
    // No delay between requests to trigger rate limiting
  }
  
  if (!rateLimited) {
    throw new Error('Rate limiting test failed: No rate limiting detected');
  }
  
  console.log(`Rate limiting triggered after ${rateLimited ? 'some' : '10'} calls`);
  console.log(`Wait time: ${rateLimitWaitTime}ms`);
  
  // Wait for the rate limit to expire
  console.log(`Waiting for rate limit to expire (${rateLimitWaitTime}ms)...`);
  await sleep(rateLimitWaitTime);
  
  // Try again after waiting
  console.log('Trying again after waiting...');
  const result = await getJobResult(jobId);
  
  if (result.rateLimit) {
    throw new Error('Rate limiting test failed: Still rate limited after waiting');
  }
  
  console.log('Rate limiting test passed!');
}

// Test exponential backoff
async function testExponentialBackoff(jobId) {
  console.log('\n=== Testing Exponential Backoff ===');
  
  console.log('Making rapid successive calls to test exponential backoff...');
  
  const waitTimes = [];
  
  for (let i = 0; i < 5; i++) {
    console.log(`Call ${i + 1}...`);
    const result = await getJobResult(jobId);
    
    if (result.rateLimit) {
      console.log(`Rate limited: Wait time = ${result.rateLimit.waitTime}ms`);
      waitTimes.push(result.rateLimit.waitTime);
    } else {
      console.log('Not rate limited');
    }
    
    // No delay between requests to trigger rate limiting
  }
  
  if (waitTimes.length < 2) {
    throw new Error('Exponential backoff test failed: Not enough rate limiting events');
  }
  
  console.log('\nWait times:');
  waitTimes.forEach((time, i) => {
    console.log(`- Call ${i + 1}: ${time}ms`);
  });
  
  // Check if wait times are increasing (exponential backoff)
  let isExponential = true;
  for (let i = 1; i < waitTimes.length; i++) {
    if (waitTimes[i] <= waitTimes[i - 1]) {
      isExponential = false;
      break;
    }
  }
  
  if (!isExponential) {
    throw new Error('Exponential backoff test failed: Wait times are not increasing');
  }
  
  console.log('Exponential backoff test passed!');
}

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
