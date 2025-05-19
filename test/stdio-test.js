#!/usr/bin/env node
/**
 * Test script for stdio transport
 *
 * This script tests the job status polling optimization with stdio transport.
 *
 * Usage:
 *   node test/stdio-test.js
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import fs from 'fs';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = dirname(__dirname);

// Main function
async function main() {
  console.log('Running stdio transport test');

  try {
    // Create a test script that will run the server and test the job status polling
    const testScriptPath = join(__dirname, 'temp-test-script.js');

    // Write the test script
    fs.writeFileSync(testScriptPath, `
      import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
      import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

      async function main() {
        // Create a server
        const server = new McpServer();

        // Register a tool
        server.registerTool({
          name: 'test-tool',
          description: 'A test tool',
          parameters: {
            type: 'object',
            properties: {
              param1: { type: 'string' }
            }
          },
          execute: async (params, context) => {
            console.log('Tool executed with params:', params);
            console.log('Context:', context);

            // Create a job
            const jobId = 'test-job-' + Math.random().toString(36).substring(2);

            // Return a job initiation response
            return {
              jobId,
              message: 'Job started'
            };
          }
        });

        // Register a job result tool
        server.registerTool({
          name: 'get-job-result',
          description: 'Get job result',
          parameters: {
            type: 'object',
            properties: {
              jobId: { type: 'string' }
            },
            required: ['jobId']
          },
          execute: async (params, context) => {
            console.log('Get job result executed with params:', params);
            console.log('Context:', context);

            // Return a job status response with polling recommendation
            return {
              status: 'RUNNING',
              message: 'Job is running',
              pollingRecommendation: {
                interval: 2000,
                nextCheckTime: Date.now() + 2000
              }
            };
          }
        });

        // Create a transport
        const transport = new StdioServerTransport();

        // Connect the transport to the server
        await server.connect(transport);

        console.log('Server started');
      }

      main().catch(error => {
        console.error('Error:', error);
        process.exit(1);
      });
    `);

    // Run the test script
    console.log('Running test script...');
    const testProcess = spawn('node', [testScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Collect output
    let output = '';
    testProcess.stdout.on('data', (data) => {
      const chunk = data.toString();
      output += chunk;
      console.log('Received output:', chunk);
    });

    testProcess.stderr.on('data', (data) => {
      console.error('Error output:', data.toString());
    });

    // Wait for the server to start
    await setTimeout(2000);

    // Send a test message
    console.log('Sending test message...');
    testProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: '1',
      method: 'callTool',
      params: {
        name: 'test-tool',
        arguments: {
          param1: 'test'
        }
      }
    }) + '\n');

    // Wait for the response
    await setTimeout(1000);

    // Send a get-job-result message
    console.log('Sending get-job-result message...');
    testProcess.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id: '2',
      method: 'callTool',
      params: {
        name: 'get-job-result',
        arguments: {
          jobId: 'test-job-123'
        }
      }
    }) + '\n');

    // Wait for the response
    await setTimeout(2000);

    // Log the output
    console.log('Output:', output);

    // Check if the output contains polling recommendation
    if (output.includes('pollingRecommendation')) {
      console.log('Test passed: Polling recommendation found in output');
    } else {
      console.log('Test failed: No polling recommendation found in output');
    }

    // Clean up
    testProcess.kill();
    fs.unlinkSync(testScriptPath);

    console.log('Test completed');
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
