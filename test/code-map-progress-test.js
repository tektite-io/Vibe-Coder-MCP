#!/usr/bin/env node
/**
 * Test script for Code-Map Generator progress reporting
 * 
 * This script tests the progress reporting of the Code-Map Generator tool.
 * It starts a code-map-generator job and monitors the progress updates.
 * 
 * Usage:
 *   node test/code-map-progress-test.js [--path=<path>]
 * 
 * Options:
 *   --path=<path>: The path to map (default: '.')
 */

const axios = require('axios');
const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Configuration
const SERVER_URL = 'http://localhost:3000';
const SESSION_ID = `test-session-${Date.now()}`;
const TEST_TIMEOUT = 120000; // 2 minutes

// Parse command line arguments
const args = process.argv.slice(2);
const pathArg = args.find(arg => arg.startsWith('--path='));
const path = pathArg ? pathArg.split('=')[1] : '.';

// Main function
async function main() {
  console.log(`Testing Code-Map Generator progress reporting for path: ${path}`);
  
  try {
    // Start the server if not already running
    const server = await startServer();
    
    // Establish SSE connection
    const eventSource = await establishSseConnection();
    
    // Listen for job progress events
    const progressEvents = [];
    eventSource.addEventListener('jobProgress', (event) => {
      const data = JSON.parse(event.data);
      console.log(`Progress event: ${data.status} - ${data.message} (${data.progress || 'N/A'}%)`);
      progressEvents.push(data);
    });
    
    // Start the code-map-generator job
    const jobId = await startCodeMapJob(path);
    
    // Wait for the job to complete or timeout
    console.log('Waiting for job to complete...');
    const result = await waitForJobCompletion(jobId);
    
    // Analyze progress events
    analyzeProgressEvents(progressEvents);
    
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

// Start a code-map-generator job
async function startCodeMapJob(path) {
  console.log(`Starting code-map-generator job for path: ${path}...`);
  
  try {
    const response = await axios.post(`${SERVER_URL}/messages`, {
      session_id: SESSION_ID,
      message: {
        tool_name: 'map-codebase',
        arguments: {
          path
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
  
  // Check for key stages
  const stages = [
    'Starting code map generation',
    'Validating input parameters',
    'Searching for directory',
    'Validating target directory',
    'Initializing parser',
    'Scanning for source files',
    'Parsing',
    'Building dependency graphs',
    'Generating diagrams',
    'Formatting output',
    'Code map generation complete'
  ];
  
  const foundStages = stages.filter(stage => 
    events.some(event => event.message && event.message.includes(stage))
  );
  
  console.log(`\nDetected stages (${foundStages.length}/${stages.length}):`);
  foundStages.forEach(stage => console.log(`- ${stage}`));
  
  const missingStages = stages.filter(stage => 
    !events.some(event => event.message && event.message.includes(stage))
  );
  
  if (missingStages.length > 0) {
    console.log('\nMissing stages:');
    missingStages.forEach(stage => console.log(`- ${stage}`));
  }
  
  // Check for progress percentages
  const eventsWithProgress = events.filter(event => typeof event.progress === 'number');
  console.log(`\nEvents with progress percentage: ${eventsWithProgress.length}/${events.length}`);
  
  if (eventsWithProgress.length > 0) {
    const minProgress = Math.min(...eventsWithProgress.map(e => e.progress));
    const maxProgress = Math.max(...eventsWithProgress.map(e => e.progress));
    console.log(`Progress range: ${minProgress}% - ${maxProgress}%`);
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
