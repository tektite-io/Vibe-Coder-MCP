# Test Structure

This document outlines the test structure for the Vibe Coder MCP project.

## Directory Structure

The test structure follows a standardized approach with the following directory organization:

```
src/
├── __tests__/                  # Global test utilities and helpers
├── __integration__/            # Cross-module integration tests
├── components/
│   ├── __tests__/              # Unit tests for components
│   └── __integration__/        # Integration tests for components
├── services/
│   ├── __tests__/              # Unit tests for services
│   └── __integration__/        # Integration tests for services
├── tools/
│   ├── tool-name/
│   │   ├── __tests__/          # Unit tests for tools
│   │   └── __integration__/    # Integration tests for tools
│   └── ...
└── utils/
    └── __tests__/              # Unit tests for utilities
e2e/                            # End-to-end tests
```

## Test Types

### Unit Tests

Unit tests focus on testing individual functions, classes, or components in isolation. They are located in `__tests__` directories adjacent to the code they test.

### Integration Tests

Integration tests focus on testing the interaction between different components or modules. They are located in `__integration__` directories adjacent to the code they test, or in the global `src/__integration__` directory for cross-module integration tests.

### End-to-End Tests

End-to-end tests focus on testing the complete system behavior from a user's perspective. They are located in the `e2e` directory at the root of the project.

## Running Tests

### All Tests

```bash
npm test
```

### Unit Tests

```bash
npm run test:unit
```

### Integration Tests

```bash
npm run test:integration
```

### End-to-End Tests

```bash
npm run test:e2e
```

### Watch Mode

```bash
npm run test:watch
npm run test:unit:watch
npm run test:integration:watch
npm run test:e2e:watch
```

### Coverage

```bash
npm run coverage
npm run coverage:unit
npm run coverage:integration
npm run coverage:e2e
```

### Specific Tests

```bash
npm run test:job-polling
npm run test:code-map
npm run test:workflow
npm run test:transport
npm run test:message-format
npm run test:rate-limiting
npm run test:job-result-retriever
```

## Test Configuration

The test configuration is defined in `vitest.config.ts` at the root of the project. It includes settings for test discovery, coverage, and timeouts.

## Best Practices

1. **Test Naming**: Use descriptive names for test files and test cases.
2. **Test Organization**: Group related tests together in describe blocks.
3. **Test Independence**: Each test should be independent of other tests.
4. **Test Coverage**: Aim for high test coverage, especially for critical code paths.
5. **Test Fixtures**: Use fixtures for test data to keep tests clean and maintainable.
6. **Test Mocking**: Use mocks for external dependencies to isolate the code being tested.
7. **Test Assertions**: Use specific assertions to make test failures more informative.
8. **Test Documentation**: Document complex test setups and test strategies.
