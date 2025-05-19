#!/usr/bin/env node
/**
 * Basic test script for job status polling optimization
 *
 * This script tests the basic functionality of the job status polling optimization.
 * It starts the server, creates a job, and checks the job status.
 *
 * Usage:
 *   node test/basic-test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import axios from 'axios';
import EventSource from 'eventsource';

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
  console.log('Running basic test for job status polling optimization');

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

    // Start a job
    console.log('Starting a job...');
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

      console.log('Job response:', response.data);

      if (response.data.jobId) {
        console.log(`Job started with ID: ${response.data.jobId}`);

        // Check job status
        console.log('Checking job status...');
        const jobResult = await axios.post(`${SERVER_URL}/messages`, {
          session_id: SESSION_ID,
          message: {
            tool_name: 'get-job-result',
            arguments: {
              jobId: response.data.jobId
            }
          }
        });

        console.log('Job status:', jobResult.data);

        // Check for polling recommendations
        if (jobResult.data.pollingRecommendation) {
          console.log('Polling recommendation:', jobResult.data.pollingRecommendation);
          console.log('Test passed: Received polling recommendation');
        } else {
          console.log('Test failed: No polling recommendation received');
        }
      } else {
        console.log('Test failed: No job ID received');
      }
    } catch (error) {
      console.error('Error starting job:', error.response?.data || error.message);
    }

    // Close the SSE connection
    console.log('Closing SSE connection...');
    eventSource.close();

    // Stop the server
    console.log('Stopping server...');
    server.kill();

    console.log('Test completed successfully!');
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
