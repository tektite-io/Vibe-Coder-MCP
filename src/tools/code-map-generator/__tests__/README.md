# Code Map Generator Unit Tests

This directory contains unit tests for the Code Map Generator tool.

## Purpose

Unit tests in this directory focus on testing individual components of the Code Map Generator, including:

- Input validation
- Output formatting
- File scanning
- Graph building
- Diagram generation

## Test Organization

Tests in this directory should follow these conventions:

1. **File Naming**: Use `<component>.test.ts` for test files
2. **Test Structure**: Group tests by the component being tested
3. **Test Fixtures**: Use mock data and fixtures to isolate tests

## Running Tests

To run the unit tests, use the following command:

```bash
npm run test:unit
```

## Writing Unit Tests

When writing unit tests, follow these guidelines:

1. Test one component at a time
2. Mock dependencies to isolate the component being tested
3. Test both success and error scenarios
4. Use descriptive test names
5. Keep tests simple and focused
