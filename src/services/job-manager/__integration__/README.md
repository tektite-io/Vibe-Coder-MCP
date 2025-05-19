# Job Manager Integration Tests

This directory contains integration tests for the Job Manager service.

## Purpose

Integration tests in this directory focus on testing the interaction between the Job Manager and other components, including:

- Interaction with SSE Notifier
- Interaction with tools
- Job status updates propagation
- Rate limiting behavior

## Test Organization

Tests in this directory should follow these conventions:

1. **File Naming**: Use `<feature>.test.ts` for test files
2. **Test Structure**: Group tests by the feature being tested
3. **Test Fixtures**: Use realistic test data to test integration points

## Running Tests

To run the integration tests, use the following command:

```bash
npm run test:integration
```

## Writing Integration Tests

When writing integration tests, follow these guidelines:

1. Test the interaction between components
2. Test with both stdio and SSE transport types
3. Verify that job status updates are properly propagated
4. Test error handling and edge cases
5. Use realistic test data
