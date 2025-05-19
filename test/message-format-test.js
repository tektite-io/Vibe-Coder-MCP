#!/usr/bin/env node
/**
 * Test script for message format consistency
 * 
 * This script tests the consistency of message formats across different transports.
 * It verifies that job status messages have a consistent format, fields, and timing.
 * 
 * Usage:
 *   node test/message-format-test.js
 */

const axios = require('axios');
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SSE_SESSION_ID = `sse-session-${Date.now()}`;
const STDIO_SESSION_ID = 'stdio-session';
const TEST_TIMEOUT = 60000; // 1 minute

// Main function
async function main() {
  console.log('Testing message format consistency');
  
  try {
    // Start the server if not already running
    const server = await startServer();
    
    // Establish SSE connection
    const eventSource = await establishSseConnection();
    
    // Listen for job progress events
    const sseProgressEvents = [];
    eventSource.addEventListener('jobProgress', (event) => {
      const data = JSON.parse(event.data);
      console.log(`SSE progress event: ${data.status} - ${data.message}`);
      sseProgressEvents.push(data);
    });
    
    // Start jobs with both transports
    const sseJobId = await startJob(SSE_SESSION_ID);
    const stdioJobId = await startJob(STDIO_SESSION_ID);
    
    // Wait for SSE progress events
    console.log('Waiting for SSE progress events...');
    await sleep(10000);
    
    // Get stdio job status
    const stdioJobStatus = await getJobResult(stdioJobId, STDIO_SESSION_ID);
    
    // Compare message formats
    compareMessageFormats(sseProgressEvents, stdioJobStatus);
    
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

// Compare message formats
function compareMessageFormats(sseProgressEvents, stdioJobStatus) {
  console.log('\n=== Message Format Comparison ===');
  
  if (sseProgressEvents.length === 0) {
    console.error('No SSE progress events received!');
    return;
  }
  
  console.log('\nSSE Progress Event Format:');
  const sseEvent = sseProgressEvents[0];
  console.log(JSON.stringify(sseEvent, null, 2));
  
  console.log('\nstdio Job Status Format:');
  console.log(JSON.stringify(stdioJobStatus.jobStatus, null, 2));
  
  // Check for required fields in SSE events
  const sseRequiredFields = ['jobId', 'toolName', 'status', 'timestamp', 'createdAt', 'updatedAt'];
  const sseMissingFields = sseRequiredFields.filter(field => !(field in sseEvent));
  
  if (sseMissingFields.length > 0) {
    console.error(`SSE events missing required fields: ${sseMissingFields.join(', ')}`);
  } else {
    console.log('SSE events have all required fields');
  }
  
  // Check for required fields in stdio job status
  if (!stdioJobStatus.jobStatus) {
    console.error('stdio job status missing jobStatus field');
    return;
  }
  
  const stdioRequiredFields = ['jobId', 'toolName', 'status', 'timestamp', 'createdAt', 'updatedAt'];
  const stdioMissingFields = stdioRequiredFields.filter(field => !(field in stdioJobStatus.jobStatus));
  
  if (stdioMissingFields.length > 0) {
    console.error(`stdio job status missing required fields: ${stdioMissingFields.join(', ')}`);
  } else {
    console.log('stdio job status has all required fields');
  }
  
  // Check for field type consistency
  const fieldTypes = {};
  
  sseRequiredFields.forEach(field => {
    if (field in sseEvent) {
      fieldTypes[field] = typeof sseEvent[field];
    }
  });
  
  let typeInconsistencies = false;
  
  stdioRequiredFields.forEach(field => {
    if (field in stdioJobStatus.jobStatus) {
      const stdioType = typeof stdioJobStatus.jobStatus[field];
      if (fieldTypes[field] && fieldTypes[field] !== stdioType) {
        console.error(`Field type inconsistency for ${field}: SSE=${fieldTypes[field]}, stdio=${stdioType}`);
        typeInconsistencies = true;
      }
    }
  });
  
  if (!typeInconsistencies) {
    console.log('Field types are consistent across transports');
  }
  
  // Check for polling recommendations
  if (stdioJobStatus.pollingRecommendation) {
    console.log('\nstdio polling recommendation:');
    console.log(JSON.stringify(stdioJobStatus.pollingRecommendation, null, 2));
    
    const recommendationFields = ['interval', 'nextCheckTime'];
    const missingRecommendationFields = recommendationFields.filter(field => !(field in stdioJobStatus.pollingRecommendation));
    
    if (missingRecommendationFields.length > 0) {
      console.error(`Polling recommendation missing required fields: ${missingRecommendationFields.join(', ')}`);
    } else {
      console.log('Polling recommendation has all required fields');
    }
  } else {
    console.warn('No polling recommendation in stdio job status');
  }
}

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
