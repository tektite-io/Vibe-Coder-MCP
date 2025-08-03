# AGENT.md - Development Guidelines for Agentic Coding

## Build/Lint/Test Commands
- **Build**: `npm run build` (compiles TypeScript + copies YAML assets)
- **Lint**: `npm run lint` (ESLint validation)
- **Type check**: `npm run type-check` (TypeScript validation without emit)
- **Test single file**: `vitest run path/to/test.ts`
- **Unit tests**: `npm run test:unit` (excludes integration/e2e)
- **Integration tests**: `npm run test:integration`
- **CI-safe tests**: `npm run test:ci-safe` (excludes problematic CI tests)
- **Coverage**: `npm run coverage` (generates test coverage report)

## Architecture & Structure
- **TypeScript ESM MCP Server**: Production-ready with 15+ tools, multi-transport support (stdio/SSE/WebSocket)
- **Core services**: `src/services/` (routing, job management, notifications)
- **Tools**: `src/tools/` with self-registering pattern via `src/tools/index.ts`
- **Security boundaries**: Read from `*_READ_DIR`, write to `*_OUTPUT_DIR` env vars only
- **Job management**: Async operations return job IDs, clients poll for results
- **Configuration**: `.env` for secrets, `llm_config.json` for LLM routing, `mcp-config.json` for tools

## Code Style & Conventions
- **ESM modules**: Use `.js` extensions in imports (TypeScript with NodeNext resolution)
- **Imports**: Relative imports with `.js` extension: `import { foo } from './bar.js'`
- **Types**: Strict TypeScript, explicit return types, use Zod for validation, zero tolerance for `any`
- **Naming**: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files
- **Error handling**: Use custom `AppError` class from `src/utils/errors.ts`, Result types over undefined returns
- **Logging**: Use `logger` from `src/logger.js` (Pino-based)
- **Singletons**: Use `getInstance()` pattern for services
