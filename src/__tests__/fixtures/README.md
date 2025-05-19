# Test Fixtures

This directory contains fixtures for tests.

## Purpose

Fixtures in this directory are used to provide common test data, including:

- Sample code files
- Sample project structures
- Sample API responses
- Sample LLM responses
- Sample job data
- Sample workflow definitions

## Fixture Organization

Fixtures should be organized by their purpose:

1. **File Naming**: Use `<purpose>-fixtures.ts` for fixture files
2. **Fixture Structure**: Group fixtures by their purpose
3. **Fixture Exports**: Export fixtures as named exports

## Available Fixtures

- `code-fixtures.ts`: Sample code files for testing
- `project-fixtures.ts`: Sample project structures for testing
- `api-fixtures.ts`: Sample API responses for testing
- `llm-fixtures.ts`: Sample LLM responses for testing
- `job-fixtures.ts`: Sample job data for testing
- `workflow-fixtures.ts`: Sample workflow definitions for testing

## Using Fixtures

When using fixtures, follow these guidelines:

1. **Import Only What You Need**: Import only the fixtures you need
2. **Documentation**: Document how fixtures are used in your tests
3. **Immutability**: Treat fixtures as immutable to avoid test pollution
4. **Reusability**: Make fixtures reusable across multiple tests
5. **Consistency**: Use consistent patterns for fixtures

## Examples

### Using Code Fixtures

```typescript
import { sampleJavaScriptFile, sampleTypeScriptFile } from '../../__tests__/fixtures/code-fixtures';

// Use the fixtures in your tests
const result = await analyzeCode(sampleTypeScriptFile);
expect(result).toContain('TypeScript');
```

### Using Project Fixtures

```typescript
import { sampleNodeProject, sampleReactProject } from '../../__tests__/fixtures/project-fixtures';

// Use the fixtures in your tests
const result = await analyzeProject(sampleReactProject);
expect(result).toContain('React');
```

### Using API Fixtures

```typescript
import { sampleApiResponse, sampleApiError } from '../../__tests__/fixtures/api-fixtures';

// Use the fixtures in your tests
mockAxios._mockResponse('get', '/api/data', sampleApiResponse);
mockAxios._mockError('get', '/api/error', sampleApiError);
```
