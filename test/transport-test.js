#!/usr/bin/env node
/**
 * Test script for transport-specific behavior
 * 
 * This script tests the behavior of different transports (stdio and SSE).
 * It simulates both transports and verifies that they handle job status updates correctly.
 * 
 * Usage:
 *   node test/transport-test.js [--transport=<transport>]
 * 
 * Options:
 *   --transport=<transport>: The transport to test (stdio, sse, or both) (default: both)
 */

const axios = require('axios');
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const fs = require('fs');
const path = require('path');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SSE_SESSION_ID = `sse-session-${Date.now()}`;
const STDIO_SESSION_ID = 'stdio-session';
const TEST_TIMEOUT = 60000; // 1 minute

// Parse command line arguments
const args = process.argv.slice(2);
const transportArg = args.find(arg => arg.startsWith('--transport='));
const transport = transportArg ? transportArg.split('=')[1] : 'both';

// Main function
async function main() {
  console.log(`Testing transport-specific behavior for: ${transport}`);
  
  try {
    // Start the server if not already running
    const server = await startServer();
    
    // Run the selected transport tests
    if (transport === 'stdio' || transport === 'both') {
      await testStdioTransport();
    }
    
    if (transport === 'sse' || transport === 'both') {
      await testSseTransport();
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

// Test stdio transport
async function testStdioTransport() {
  console.log('\n=== Testing stdio Transport ===');
  
  // Simulate stdio transport by using the stdio session ID
  console.log('Simulating stdio transport...');
  
  // Start a long-running job
  const jobId = await startJob(STDIO_SESSION_ID);
  
  // Poll for job status
  console.log('Polling for job status...');
  const result = await getJobResult(jobId, STDIO_SESSION_ID);
  
  // Verify that the response includes the expected fields for stdio transport
  if (!result.jobId) {
    throw new Error('stdio transport test failed: No jobId in response');
  }
  
  // Check if the response includes polling recommendations
  if (!result.pollingRecommendation) {
    console.warn('stdio transport test warning: No polling recommendation in response');
  } else {
    console.log(`Polling recommendation: ${result.pollingRecommendation.interval}ms`);
  }
  
  console.log('stdio transport test passed!');
}

// Test SSE transport
async function testSseTransport() {
  console.log('\n=== Testing SSE Transport ===');
  
  // Establish SSE connection
  const eventSource = await establishSseConnection();
  
  // Listen for job progress events
  const progressEvents = [];
  eventSource.addEventListener('jobProgress', (event) => {
    const data = JSON.parse(event.data);
    console.log(`Progress event: ${data.status} - ${data.message}`);
    progressEvents.push(data);
  });
  
  // Start a long-running job
  const jobId = await startJob(SSE_SESSION_ID);
  
  // Wait for progress events
  console.log('Waiting for progress events...');
  await sleep(10000);
  
  if (progressEvents.length === 0) {
    throw new Error('SSE transport test failed: No progress events received');
  }
  
  console.log(`Received ${progressEvents.length} progress events`);
  
  // Verify that the progress events include the expected fields for SSE transport
  const firstEvent = progressEvents[0];
  if (!firstEvent.jobId || !firstEvent.status || !firstEvent.timestamp) {
    throw new Error('SSE transport test failed: Missing required fields in progress event');
  }
  
  console.log('SSE transport test passed!');
  
  // Close the SSE connection
  eventSource.close();
}

// Establish SSE connection
async function establishSseConnection() {
  console.log('Establishing SSE connection...');
  
  // Create EventSource for SSE connection
  const EventSource = require('eventsource');
  const eventSource = new EventSource(`${SERVER_URL}/sse?sessionId=${SSE_SESSION_ID}`);
  
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
async function startJob(sessionId) {
  console.log(`Starting a long-running job with session ID: ${sessionId}...`);
  
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
    
    const jobId = response.data.jobId;
    console.log(`Job started with ID: ${jobId}`);
    return jobId;
  } catch (error) {
    console.error('Failed to start job:', error.response?.data || error.message);
    throw error;
  }
}

// Get job result
async function getJobResult(jobId, sessionId) {
  console.log(`Getting result for job ${jobId} with session ID: ${sessionId}...`);
  
  try {
    const response = await axios.post(`${SERVER_URL}/messages`, {
      session_id: sessionId,
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

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
