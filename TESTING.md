# Testing Guidelines

This document describes the testing organization and practices for the Vibe Coder MCP project.

## Test Organization

Tests are organized into the following categories:

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test the interaction between components
3. **End-to-End Tests**: Test the complete system behavior

### Directory Structure

Tests are organized in the following directory structure:

```
src/
  __tests__/           # Shared test utilities
    utils/             # Test utilities and helpers
  __integration__/     # Cross-module integration tests
    fixtures/          # Test fixtures for integration tests
  services/
    service-name/
      __tests__/       # Unit tests for the service
      __integration__/ # Integration tests for the service
  tools/
    tool-name/
      __tests__/       # Unit tests for the tool
      __integration__/ # Integration tests for the tool
e2e/                   # End-to-end tests
  fixtures/            # Test fixtures for end-to-end tests
```

### File Naming Conventions

Test files should follow these naming conventions:

1. **Unit Tests**: `<component>.test.ts`
2. **Integration Tests**: `<feature>.test.ts`
3. **End-to-End Tests**: `<feature>-flow.test.ts`

## Running Tests

The following npm scripts are available for running tests:

```bash
# Run all tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run end-to-end tests
npm run test:e2e

# Run tests in watch mode
npm run test:watch
npm run test:unit:watch
npm run test:integration:watch
npm run test:e2e:watch

# Run tests with coverage
npm run coverage
```

## Writing Tests

### Unit Tests

Unit tests should:

1. Test one component at a time
2. Mock dependencies to isolate the component being tested
3. Test both success and error scenarios
4. Use descriptive test names
5. Keep tests simple and focused

### Integration Tests

Integration tests should:

1. Test the interaction between components
2. Test with both stdio and SSE transport types
3. Verify that data is correctly passed between components
4. Test error handling and edge cases
5. Use realistic test data

### End-to-End Tests

End-to-end tests should:

1. Test the complete flow from start to finish
2. Test with both stdio and SSE transport types
3. Verify that the system behaves correctly in all scenarios
4. Test error handling and edge cases
5. Use realistic test data

## Test Utilities

Test utilities are available in the `src/__tests__/utils` directory:

1. `job-polling-test-utils.ts`: Utilities for testing job status polling
2. `mock-factories.ts`: Factories for creating mock objects
3. `test-helpers.ts`: Common helper functions for tests

## Test Fixtures

Test fixtures are available in the following directories:

1. `src/__integration__/fixtures`: Fixtures for cross-module integration tests
2. `e2e/fixtures`: Fixtures for end-to-end tests

## Job Status Polling Testing

When testing job status polling, verify the following:

1. Job creation and tracking
2. Progress reporting with percentage updates
3. Transport-specific handling for both stdio and SSE transports
4. Adaptive polling recommendations
5. Error handling with proper job status updates
