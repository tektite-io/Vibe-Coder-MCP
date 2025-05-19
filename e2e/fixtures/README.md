# End-to-End Test Fixtures

This directory contains fixtures for end-to-end tests.

## Purpose

Fixtures in this directory are used to set up the test environment for end-to-end tests, including:

- Mock data
- Test configurations
- Helper functions

## Fixture Organization

Fixtures should be organized by the features they are used to test:

1. **File Naming**: Use `<feature>-fixtures.ts` for fixture files
2. **Fixture Structure**: Group fixtures by the feature being tested
3. **Fixture Exports**: Export fixtures as named exports

## Creating Fixtures

When creating fixtures, follow these guidelines:

1. Make fixtures reusable across multiple tests
2. Document the purpose and usage of each fixture
3. Keep fixtures simple and focused
4. Use realistic data when possible
