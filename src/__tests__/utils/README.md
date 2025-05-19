# Test Utilities

This directory contains utilities for tests.

## Purpose

Utilities in this directory are used to simplify testing, including:

- Mock factories
- Test helpers
- Common test setup and teardown functions
- Mock HTTP requests and responses
- Mock file system operations
- Mock API calls
- Mock LLM calls
- Mock job manager and SSE notifier
- Mock tools and routing

## Utility Organization

Utilities should be organized by their purpose:

1. **File Naming**: Use `<purpose>-test-utils.ts` for utility files
2. **Utility Structure**: Group utilities by their purpose
3. **Utility Exports**: Export utilities as named exports

## Available Utilities

- `job-polling-test-utils.ts`: Utilities for testing job status polling
- `mock-factories.ts`: Factories for creating mock objects
- `test-helpers.ts`: Common helper functions for tests
- `http-test-utils.ts`: Utilities for testing HTTP requests and responses
- `fs-test-utils.ts`: Utilities for testing file system operations
- `api-test-utils.ts`: Utilities for testing API calls
- `llm-test-utils.ts`: Utilities for testing LLM calls
- `job-manager-test-utils.ts`: Utilities for testing job manager and SSE notifier
- `tool-test-utils.ts`: Utilities for testing tools and routing

## Using Utilities

When using utilities, follow these guidelines:

1. **Import Only What You Need**: Import only the utilities you need
2. **Documentation**: Document how utilities are used in your tests
3. **Simplicity**: Keep utilities simple and focused
4. **Reusability**: Make utilities reusable across multiple tests
5. **Mocking**: Use mocks for external dependencies to isolate the code being tested
6. **Cleanup**: Clean up mocks after tests to avoid test pollution
7. **Consistency**: Use consistent patterns for mocking and testing

## Examples

### Mocking HTTP Requests

```typescript
import { createMockRequest, createMockResponse } from '../../__tests__/utils/http-test-utils';

const req = createMockRequest({
  method: 'POST',
  body: { name: 'test' },
  headers: { 'content-type': 'application/json' },
});

const res = createMockResponse();

// Call your handler
await handler(req as Request, res as Response);

// Verify response
expect(res._status).toBe(200);
expect(res._json).toEqual({ success: true });
```

### Mocking File System

```typescript
import { createMockFileSystem, mockFsExtra, restoreFsExtra } from '../../__tests__/utils/fs-test-utils';

const mockFs = createMockFileSystem();
mockFsExtra(mockFs);

// Add test files
mockFs._addFile('/test/file.txt', 'Test content');

// Call your function
const result = await readFile('/test/file.txt');

// Verify result
expect(result).toBe('Test content');

// Clean up
restoreFsExtra();
```

### Mocking LLM Calls

```typescript
import { mockLlmHelpers, restoreLlmHelpers } from '../../__tests__/utils/llm-test-utils';

const mockResponses = new Map([
  ['market analysis', 'Mock market analysis response'],
  ['user needs', 'Mock user needs response'],
]);

mockLlmHelpers(mockResponses);

// Call your function
const result = await generateContent('Analyze market and user needs');

// Verify result
expect(result).toContain('Mock market analysis response');
expect(result).toContain('Mock user needs response');

// Clean up
restoreLlmHelpers();
```
