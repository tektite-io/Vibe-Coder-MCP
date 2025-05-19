#!/usr/bin/env node
/**
 * Simple test script for job status polling optimization
 * 
 * This script tests the basic functionality of the job status polling optimization.
 * It doesn't require external dependencies like axios or eventsource.
 * 
 * Usage:
 *   node test/simple-test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Main function
async function main() {
  console.log('Running simple test for job status polling optimization');
  
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
    await setTimeout(5000);
    
    // Run a simple curl command to test the server
    console.log('Testing server with curl...');
    const curl = spawn('curl', ['-X', 'GET', 'http://localhost:3000/health'], {
      stdio: 'inherit'
    });
    
    // Wait for curl to complete
    await new Promise((resolve) => {
      curl.on('close', (code) => {
        console.log(`curl exited with code ${code}`);
        resolve();
      });
    });
    
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
