#!/usr/bin/env node
/**
 * Test script for Workflow Executor adaptive polling
 * 
 * This script tests the adaptive polling strategy of the Workflow Executor.
 * It starts a workflow with a long-running step and monitors the polling behavior.
 * 
 * Usage:
 *   node test/workflow-polling-test.js
 */

const axios = require('axios');
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const fs = require('fs');
const path = require('path');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SESSION_ID = `test-session-${Date.now()}`;
const TEST_TIMEOUT = 120000; // 2 minutes

// Main function
async function main() {
  console.log('Testing Workflow Executor adaptive polling');
  
  try {
    // Start the server if not already running
    const server = await startServer();
    
    // Create a test workflow file
    const workflowPath = await createTestWorkflow();
    
    // Establish SSE connection
    const eventSource = await establishSseConnection();
    
    // Listen for job progress events
    const progressEvents = [];
    eventSource.addEventListener('jobProgress', (event) => {
      const data = JSON.parse(event.data);
      console.log(`Progress event: ${data.status} - ${data.message}`);
      progressEvents.push(data);
    });
    
    // Start the workflow
    const jobId = await startWorkflow(workflowPath);
    
    // Wait for the workflow to complete or timeout
    console.log('Waiting for workflow to complete...');
    const result = await waitForJobCompletion(jobId);
    
    // Analyze progress events
    analyzeProgressEvents(progressEvents);
    
    // Clean up the test workflow file
    fs.unlinkSync(workflowPath);
    
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

// Create a test workflow file
async function createTestWorkflow() {
  console.log('Creating test workflow file...');
  
  const workflowContent = {
    name: 'Test Workflow',
    description: 'A test workflow for testing adaptive polling',
    steps: [
      {
        id: 'step1',
        name: 'Long-running step',
        tool: 'map-codebase',
        params: {
          path: '.'
        }
      }
    ]
  };
  
  const workflowPath = path.join(process.cwd(), 'test-workflow.json');
  fs.writeFileSync(workflowPath, JSON.stringify(workflowContent, null, 2));
  
  console.log(`Test workflow file created at: ${workflowPath}`);
  return workflowPath;
}

// Establish SSE connection
async function establishSseConnection() {
  console.log('Establishing SSE connection...');
  
  // Create EventSource for SSE connection
  const EventSource = require('eventsource');
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

// Start a workflow
async function startWorkflow(workflowPath) {
  console.log(`Starting workflow from file: ${workflowPath}...`);
  
  try {
    const response = await axios.post(`${SERVER_URL}/messages`, {
      session_id: SESSION_ID,
      message: {
        tool_name: 'run-workflow',
        arguments: {
          workflow_file: workflowPath
        }
      }
    });
    
    const jobId = response.data.jobId;
    console.log(`Workflow started with job ID: ${jobId}`);
    return jobId;
  } catch (error) {
    console.error('Failed to start workflow:', error.response?.data || error.message);
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

// Wait for job completion
async function waitForJobCompletion(jobId) {
  console.log(`Waiting for job ${jobId} to complete...`);
  
  const startTime = Date.now();
  let interval = 1000; // Start with 1 second
  const pollingIntervals = [];
  
  while (Date.now() - startTime < TEST_TIMEOUT) {
    const pollStartTime = Date.now();
    const result = await getJobResult(jobId);
    
    // Check if the job is completed or failed
    if (result.jobStatus && (result.jobStatus.status === 'COMPLETED' || result.jobStatus.status === 'FAILED')) {
      console.log(`Job ${jobId} ${result.jobStatus.status.toLowerCase()}`);
      
      // Log the polling intervals
      console.log('\nPolling intervals:');
      pollingIntervals.forEach((interval, i) => {
        console.log(`Poll ${i + 1}: ${interval}ms`);
      });
      
      return result;
    }
    
    // Use recommended polling interval if provided
    if (result.pollingRecommendation) {
      interval = result.pollingRecommendation.interval;
    } else {
      // Otherwise, implement exponential backoff
      interval = Math.min(interval * 1.5, 5000); // Max 5 seconds
    }
    
    pollingIntervals.push(interval);
    console.log(`Waiting ${interval / 1000} seconds before next check...`);
    await sleep(interval);
  }
  
  throw new Error(`Timeout waiting for job ${jobId} to complete`);
}

// Analyze progress events
function analyzeProgressEvents(events) {
  console.log('\n=== Progress Events Analysis ===');
  console.log(`Total events: ${events.length}`);
  
  if (events.length === 0) {
    console.error('No progress events received!');
    return;
  }
  
  // Check for polling information in messages
  const pollingMessages = events.filter(event => 
    event.message && event.message.includes('Polling')
  );
  
  console.log(`\nPolling-related messages: ${pollingMessages.length}`);
  
  if (pollingMessages.length > 0) {
    console.log('\nSample polling messages:');
    pollingMessages.slice(0, 5).forEach(event => {
      console.log(`- ${event.message}`);
    });
    
    // Check for adaptive polling pattern
    const pollingTimes = pollingMessages
      .map(event => {
        const match = event.message.match(/next check in (\d+(\.\d+)?)s/);
        return match ? parseFloat(match[1]) : null;
      })
      .filter(time => time !== null);
    
    if (pollingTimes.length > 1) {
      console.log('\nPolling interval pattern:');
      pollingTimes.forEach((time, i) => {
        console.log(`- Poll ${i + 1}: ${time}s`);
      });
      
      // Check if intervals are increasing (adaptive)
      const isAdaptive = pollingTimes.slice(1).some((time, i) => time > pollingTimes[i]);
      console.log(`\nAdaptive polling detected: ${isAdaptive ? 'Yes' : 'No'}`);
    }
  }
  
  // Check for final status
  const finalEvent = events[events.length - 1];
  console.log(`\nFinal status: ${finalEvent.status}`);
  console.log(`Final message: ${finalEvent.message}`);
}

// Run the main function
main().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
