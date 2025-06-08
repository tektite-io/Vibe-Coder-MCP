#!/usr/bin/env node

/**
 * Live Test Script for Schema-Aware Fullstack Starter Kit Generator
 * 
 * This script tests the new schema-aware LLM functionality with real API calls
 * to verify production readiness.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_CASES = [
  {
    name: "React + Node.js E-commerce",
    input: {
      use_case: "Create a React + Node.js e-commerce application with authentication, payment processing, and admin dashboard",
      tech_stack_preferences: {
        frontend: "React with TypeScript",
        backend: "Node.js with Express",
        database: "PostgreSQL",
        authentication: "JWT",
        payment: "Stripe",
        styling: "Tailwind CSS"
      }
    }
  },
  {
    name: "Vue + Python API",
    input: {
      use_case: "Build a Vue.js frontend with Python FastAPI backend for a task management system",
      tech_stack_preferences: {
        frontend: "Vue 3 with Composition API",
        backend: "Python FastAPI",
        database: "MongoDB",
        authentication: "OAuth2"
      }
    }
  }
];

async function testFullstackGenerator(testCase) {
  console.log(`\n🧪 Testing: ${testCase.name}`);
  console.log(`📝 Use Case: ${testCase.input.use_case}`);
  
  const startTime = Date.now();
  
  return new Promise((resolve, reject) => {
    const child = spawn('node', ['build/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, NODE_ENV: 'production', LOG_LEVEL: 'debug' }
    });

    let stdout = '';
    let stderr = '';
    let jobId = null;

    child.stdout.on('data', (data) => {
      stdout += data.toString();
      
      // Extract job ID from initial response
      const jobMatch = data.toString().match(/"jobId":"([^"]+)"/);
      if (jobMatch && !jobId) {
        jobId = jobMatch[1];
        console.log(`📋 Job ID: ${jobId}`);
      }
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
      
      // Look for schema-aware logging
      const logLine = data.toString();
      if (logLine.includes('Schema-aware')) {
        console.log(`🔍 Schema-aware activity: ${logLine.trim()}`);
      }
      if (logLine.includes('attempts')) {
        console.log(`🔄 Retry activity: ${logLine.trim()}`);
      }
      if (logLine.includes('processingTimeMs')) {
        console.log(`⏱️ Performance: ${logLine.trim()}`);
      }
    });

    // Send the MCP request
    const mcpRequest = {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "generate-fullstack-starter-kit",
        arguments: testCase.input
      }
    };

    child.stdin.write(JSON.stringify(mcpRequest) + '\n');

    // Wait for initial response
    setTimeout(() => {
      if (jobId) {
        // Poll for results
        const pollInterval = setInterval(() => {
          const pollRequest = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "get-job-result",
              arguments: { jobId }
            }
          };
          child.stdin.write(JSON.stringify(pollRequest) + '\n');
        }, 2000);

        // Stop polling after 2 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          child.kill();
          
          const endTime = Date.now();
          const totalTime = endTime - startTime;
          
          resolve({
            testCase: testCase.name,
            jobId,
            totalTime,
            stdout,
            stderr,
            success: stderr.includes('Schema-aware') || stdout.includes('COMPLETED')
          });
        }, 120000); // 2 minutes timeout
      } else {
        child.kill();
        reject(new Error('No job ID received'));
      }
    }, 5000);

    child.on('error', (error) => {
      reject(error);
    });
  });
}

async function runTests() {
  console.log('🚀 Starting Live Testing of Schema-Aware Fullstack Generator');
  console.log('=' .repeat(80));
  
  const results = [];
  
  for (const testCase of TEST_CASES) {
    try {
      const result = await testFullstackGenerator(testCase);
      results.push(result);
      
      console.log(`✅ Test completed: ${result.testCase}`);
      console.log(`⏱️ Total time: ${result.totalTime}ms`);
      console.log(`🎯 Success: ${result.success}`);
      
    } catch (error) {
      console.error(`❌ Test failed: ${testCase.name}`, error.message);
      results.push({
        testCase: testCase.name,
        error: error.message,
        success: false
      });
    }
    
    // Wait between tests
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  // Generate test report
  console.log('\n📊 Test Results Summary');
  console.log('=' .repeat(80));
  
  results.forEach(result => {
    console.log(`${result.success ? '✅' : '❌'} ${result.testCase}`);
    if (result.totalTime) {
      console.log(`   Time: ${result.totalTime}ms`);
    }
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n🎯 Overall Success Rate: ${successCount}/${results.length} (${Math.round(successCount/results.length*100)}%)`);
  
  // Save detailed results
  fs.writeFileSync('test_results.json', JSON.stringify(results, null, 2));
  console.log('📄 Detailed results saved to test_results.json');
}

// Run the tests
runTests().catch(console.error);
