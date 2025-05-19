# End-to-End Tests

This directory contains end-to-end tests that verify the complete system behavior.

## Purpose

End-to-end tests in this directory focus on testing the complete flow of the application, including:

- Job creation to result retrieval
- Transport-specific flows (stdio vs SSE)
- Tool-specific end-to-end tests
- Rate limiting behavior
- Message format validation
- Progress reporting with percentage updates

## Test Organization

Tests in this directory should follow these conventions:

1. **File Naming**: Use `<feature>-flow.test.ts` for test files
2. **Test Structure**: Group tests by the feature being tested
3. **Test Fixtures**: Place test fixtures in the `fixtures` subdirectory

## Available Tests

- **job-status-polling-flow.test.ts**: Tests the job status polling flow
- **code-map-generator-flow.test.ts**: Tests the code map generator tool
- **workflow-runner-flow.test.ts**: Tests the workflow runner tool
- **transport-specific-flow.test.ts**: Tests transport-specific behavior
- **message-format-flow.test.ts**: Tests message format validation
- **rate-limiting-flow.test.ts**: Tests rate limiting behavior
- **job-result-retriever-flow.test.ts**: Tests the job result retriever tool
- **fullstack-starter-kit-generator-flow.test.ts**: Tests the fullstack starter kit generator tool

## Running Tests

To run all end-to-end tests:

```bash
npm run test:e2e
```

To run specific end-to-end tests:

```bash
npm run test:job-polling
npm run test:code-map
npm run test:workflow
npm run test:transport
npm run test:message-format
npm run test:rate-limiting
npm run test:job-result-retriever
```

## Writing End-to-End Tests

When writing end-to-end tests, follow these guidelines:

1. **Complete Flow**: Test the complete flow from start to finish
2. **Transport Types**: Test with both stdio and SSE transport types
3. **Behavior Verification**: Verify that the system behaves correctly in all scenarios
4. **Error Handling**: Test error handling and edge cases
5. **Realistic Data**: Use realistic test data
6. **Progress Reporting**: Verify progress reporting with percentage updates
7. **Rate Limiting**: Test rate limiting behavior
8. **Message Format**: Validate message format
9. **Polling Recommendations**: Verify adaptive polling recommendations

## Test Fixtures

The `fixtures` directory contains test fixtures for end-to-end tests:

- **code-map-generator-fixtures.ts**: Fixtures for code map generator tests
- **fullstack-starter-kit-generator-fixtures.ts**: Fixtures for fullstack starter kit generator tests
- **job-status-polling-fixtures.ts**: Fixtures for job status polling tests
- **message-format-fixtures.ts**: Fixtures for message format tests
- **workflow-runner-fixtures.ts**: Fixtures for workflow runner tests
