# Cross-Module Integration Tests

This directory contains integration tests that verify the interaction between multiple modules in the codebase.

## Purpose

Integration tests in this directory focus on testing the interaction between different components, such as:

- Job Manager and SSE Notifier
- Tools and Job Manager
- Tools and SSE Notifier
- Routing Service and Tools
- Request Processor and Tools
- Workflow Executor and Job Manager
- SSE Notifier and Transport Types

## Test Organization

Tests in this directory should follow these conventions:

1. **File Naming**: Use `<component1>-<component2>.test.ts` for test files
2. **Test Structure**: Group tests by the components being tested
3. **Test Fixtures**: Place test fixtures in the `fixtures` subdirectory

## Available Tests

- **job-polling-optimization.test.ts**: Tests the job polling optimization between Job Manager and SSE Notifier
- **routing-tools.test.ts**: Tests the interaction between the routing service and tools
- **job-manager-sse-notifier-request-processor.test.ts**: Tests the interaction between the job manager, SSE notifier, and request processor
- **job-manager-job-result-retriever.test.ts**: Tests the interaction between the job manager and the job result retriever tool
- **workflow-executor-job-manager.test.ts**: Tests the interaction between the workflow executor and the job manager
- **sse-notifier-transport-types.test.ts**: Tests the interaction between the SSE notifier and different transport types

## Running Tests

To run all integration tests:

```bash
npm run test:integration
```

To run specific integration tests:

```bash
npx vitest run src/__integration__/job-polling-optimization.test.ts
npx vitest run src/__integration__/routing-tools.test.ts
npx vitest run src/__integration__/job-manager-sse-notifier-request-processor.test.ts
npx vitest run src/__integration__/job-manager-job-result-retriever.test.ts
npx vitest run src/__integration__/workflow-executor-job-manager.test.ts
npx vitest run src/__integration__/sse-notifier-transport-types.test.ts
```

## Writing Integration Tests

When writing integration tests, follow these guidelines:

1. **Real Instances**: Use real instances of services when possible
2. **Mock External Dependencies**: Mock external dependencies
3. **Complete Flow**: Test the complete flow between components
4. **Data Verification**: Verify that data is correctly passed between components
5. **Success and Error Scenarios**: Test both success and error scenarios
6. **Transport Types**: Test with both stdio and SSE transport types
7. **Progress Reporting**: Verify progress reporting with percentage updates
8. **Rate Limiting**: Test rate limiting behavior
9. **Message Format**: Validate message format
10. **Polling Recommendations**: Verify adaptive polling recommendations

## Test Fixtures

The `fixtures` directory contains test fixtures for integration tests:

- **job-manager-sse-notifier-fixtures.ts**: Fixtures for job manager and SSE notifier tests
- **job-polling-optimization-fixtures.ts**: Fixtures for job polling optimization tests
