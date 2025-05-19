#!/usr/bin/env node
/**
 * Test runner script for job status polling optimization
 * 
 * This script runs all the test scripts for job status polling optimization.
 * 
 * Usage:
 *   node test/run-all-tests.js [--test=<test-name>]
 * 
 * Options:
 *   --test=<test-name>: The test to run (default: all)
 *   Available tests:
 *     - job-polling: Test job status polling
 *     - code-map-progress: Test code-map-generator progress reporting
 *     - workflow-polling: Test workflow executor adaptive polling
 *     - transport: Test transport-specific behavior
 *     - message-format: Test message format consistency
 *     - rate-limiting: Test rate limiting functionality
 *     - all: Run all tests
 */

const { spawn } = require('child_process');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

// Parse command line arguments
const args = process.argv.slice(2);
const testArg = args.find(arg => arg.startsWith('--test='));
const testName = testArg ? testArg.split('=')[1] : 'all';

// Main function
async function main() {
  console.log(`Running tests: ${testName}`);
  
  const tests = {
    'job-polling': 'test/job-polling-test.js',
    'code-map-progress': 'test/code-map-progress-test.js',
    'workflow-polling': 'test/workflow-polling-test.js',
    'transport': 'test/transport-test.js',
    'message-format': 'test/message-format-test.js',
    'rate-limiting': 'test/rate-limiting-test.js'
  };
  
  const testsToRun = testName === 'all' ? Object.values(tests) : [tests[testName]];
  
  if (testName !== 'all' && !tests[testName]) {
    console.error(`Unknown test: ${testName}`);
    console.error(`Available tests: ${Object.keys(tests).join(', ')}, all`);
    process.exit(1);
  }
  
  const results = {};
  
  for (const testScript of testsToRun) {
    console.log(`\n=== Running ${testScript} ===\n`);
    
    try {
      await runTest(testScript);
      results[testScript] = 'PASSED';
    } catch (error) {
      results[testScript] = 'FAILED';
    }
    
    // Wait a bit between tests
    await sleep(2000);
  }
  
  // Print summary
  console.log('\n=== Test Summary ===\n');
  
  let allPassed = true;
  
  for (const [testScript, result] of Object.entries(results)) {
    console.log(`${testScript}: ${result}`);
    if (result === 'FAILED') {
      allPassed = false;
    }
  }
  
  if (allPassed) {
    console.log('\nAll tests passed!');
    process.exit(0);
  } else {
    console.error('\nSome tests failed!');
    process.exit(1);
  }
}

// Run a test script
async function runTest(testScript) {
  return new Promise((resolve, reject) => {
    const test = spawn('node', [testScript], {
      stdio: 'inherit'
    });
    
    test.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Test ${testScript} failed with code ${code}`));
      }
    });
    
    test.on('error', (error) => {
      reject(error);
    });
  });
}

// Run the main function
main().catch(error => {
  console.error('Test runner failed:', error);
  process.exit(1);
});
