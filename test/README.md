# Job Status Polling Optimization Tests

This directory contains test scripts for the job status polling optimization implementation.

## Prerequisites

Before running the tests, make sure you have installed the required dependencies:

```bash
npm install
```

## Running the Tests

You can run all the tests at once:

```bash
npm run test:polling
```

Or run individual tests:

```bash
npm run test:job-polling
npm run test:code-map-progress
npm run test:workflow-polling
npm run test:transport
npm run test:message-format
npm run test:rate-limiting
```

## Test Descriptions

### Job Polling Test

Tests the basic job status polling functionality, including rate limiting and adaptive polling.

```bash
npm run test:job-polling
```

### Code-Map Progress Test

Tests the progress reporting of the Code-Map Generator tool.

```bash
npm run test:code-map-progress
```

### Workflow Polling Test

Tests the adaptive polling strategy of the Workflow Executor.

```bash
npm run test:workflow-polling
```

### Transport Test

Tests the behavior of different transports (stdio and SSE).

```bash
npm run test:transport
```

### Message Format Test

Tests the consistency of message formats across different transports.

```bash
npm run test:message-format
```

### Rate Limiting Test

Tests the rate limiting functionality of the job status retrieval.

```bash
npm run test:rate-limiting
```

## Test Structure

Each test script follows a similar structure:

1. Start the server if not already running
2. Establish an SSE connection (if needed)
3. Start a long-running job
4. Test the specific functionality
5. Analyze the results
6. Clean up and exit

## Expected Results

When all tests pass, you should see output similar to:

```
=== Test Summary ===

test/job-polling-test.js: PASSED
test/code-map-progress-test.js: PASSED
test/workflow-polling-test.js: PASSED
test/transport-test.js: PASSED
test/message-format-test.js: PASSED
test/rate-limiting-test.js: PASSED

All tests passed!
```

## Troubleshooting

If a test fails, check the following:

1. Make sure the server is running and accessible at http://localhost:3000
2. Check that the required dependencies are installed
3. Verify that the job status polling optimization implementation is complete
4. Look for specific error messages in the test output

## Adding New Tests

To add a new test:

1. Create a new test script in the `test` directory
2. Add a new script entry in `package.json`
3. Update the `run-all-tests.js` script to include the new test
