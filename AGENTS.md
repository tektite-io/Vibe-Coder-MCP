# AGENTS.md - Development Guidelines for Agentic Coding

## Build & Test Commands
- **Build**: `npm run build` (compiles TypeScript + copies assets)
- **Lint**: `npm run lint` (ESLint validation) 
- **Type check**: `npm run type-check` (TypeScript validation without emit)
- **Test single file**: `vitest run path/to/test.ts`
- **Unit tests**: `npm run test:unit` (excludes integration/e2e)
- **Integration tests**: `npm run test:integration`
- **Watch mode**: `npm run test:watch`
- **CI-safe tests**: `npm run test:ci-safe` (excludes problematic CI tests)
- **Coverage**: `npm run coverage` (generates test coverage report)

## Architecture & Structure
- **TypeScript ESM MCP Server**: Production-ready with 15+ tools, multi-transport support (stdio/SSE/WebSocket)
- **Core services**: `src/services/` (routing, job management, notifications)  
- **Tools**: `src/tools/` with self-registering pattern via `src/tools/index.ts`
- **Security boundaries**: Read from `*_READ_DIR`, write to `*_OUTPUT_DIR` env vars only
- **Job management**: Async operations return job IDs, clients poll for results
- **Configuration**: `.env` for secrets, `llm_config.json` for LLM routing, `workflows.json` for sequences

## Code Style & Conventions  
- **ESM modules**: Use `.js` extensions in imports (TypeScript with NodeNext resolution)
- **Imports**: Relative imports with `.js` extension: `import { foo } from './bar.js'`
- **Types**: Strict TypeScript, explicit return types, use Zod for validation, zero tolerance for `any`
- **Naming**: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files
- **Error handling**: Use custom `AppError` class from `src/utils/errors.ts`, Result types over undefined returns
- **Logging**: Use `logger` from `src/logger.js` (Pino-based)
- **Singletons**: Use `getInstance()` pattern for services

## Architecture Patterns
- **Tool registration**: Self-registering tools via `registerTool()` in `src/tools/index.ts`
- **Singleton services**: Use `getInstance()` pattern for services
- **Security boundaries**: Read from `*_READ_DIR`, write to `*_OUTPUT_DIR` env vars only
- **Job management**: Async operations return job IDs, clients poll for results
- **Config management**: Use `.env` for secrets, `llm_config.json` for LLM routing
- **Transport support**: stdio (primary), SSE, WebSocket for different client types

## Security & Configuration Management

### File Read/Write Security
- **Centralized Security**: `UnifiedSecurityConfigManager` singleton in `src/tools/vibe-task-manager/security/unified-security-config.ts`
- **Environment Variables**: 
  - `VIBE_TASK_MANAGER_READ_DIR` - Project analysis boundary
  - `VIBE_CODER_OUTPUT_DIR` - Write operations boundary  
  - `CODE_MAP_ALLOWED_DIR` - Source code scanning boundary
- **Security Features**: Path traversal protection, boundary enforcement, cross-platform compatibility
- **MCP Integration**: Security boundaries configured via MCP client environment variables

### LLM Configuration Management
- **Centralized LLM Config**: `OpenRouterConfigManager` singleton in `src/utils/openrouter-config-manager.ts`
- **Task-Specific Routing**: `llm_config.json` maps task names to specific models
- **Fallback Hierarchy**: Task mapping → default_generation → environment vars → hardcoded defaults
- **Model Examples**: 
  - `research_query` → `perplexity/sonar`
  - `task_decomposition` → `google/gemini-2.5-flash-preview-05-20`
  - `default_generation` → `google/gemini-2.5-flash-preview-05-20`
- **Configuration Flow**: `index.ts` → `OpenRouterConfigManager.initialize()` → `ToolRegistry.getInstance(config)`

### Recently Updated Centralized Configurations (2025)
- **Configuration Provider Pattern**: `src/utils/config-provider.ts` - Testable configuration management with dependency injection
- **Enhanced Security Manager**: `UnifiedSecurityConfigManager` with strict path validation and boundary enforcement
- **Job Manager Improvements**: Deduplication, cleanup, and performance monitoring capabilities
- **Path Validation**: Enhanced security boundaries with cross-platform compatibility
- **CI-Aware Configuration**: Automatic detection and optimization for CI/CD environments
- **Lazy Config Loading**: Performance optimization through lazy initialization patterns
- **Model Updates**: Updated Perplexity model to `perplexity/sonar` across all configurations

## Development Standards & Quality Assurance

### Zero-Tolerance Type Safety Policy
- **Absolutely Forbid**: `any`, `unknown`, `undefined` as loose types
- **Require**: Explicit return types and parameter types for all functions
- **Use**: Branded types for domain safety: `type UserId = string & { readonly __brand: 'UserId' }`
- **Implement**: Runtime validation functions for external data input
- **Error Handling**: Use Result types instead of undefined returns
- **Validation**: Template literal types and exhaustive type checking

### Configuration Validation & Testing
- **Config Validation**: `ConfigValidationResult` interface for comprehensive validation reporting
- **Environment Validation**: Automatic validation of required environment variables
- **Test Coverage**: Comprehensive test suites for all configuration managers
- **Mock Support**: `MockConfigProvider` for isolated testing without external dependencies
- **CI Detection**: Automatic CI environment detection for optimized test execution
- **Security Testing**: Dedicated security test suites for path validation and boundary enforcement

### Strict Development Process
- **Investigation Phase**: 
  - Deep-dive analysis of existing codebase patterns
  - Cross-reference implementation against user guidelines
  - Validate against singleton/ESM/event-driven architecture
  - Check security boundary compliance (VIBE_CODER_OUTPUT_DIR restrictions)
- **Planning Phase**:
  - Break down into atomic tasks (5-10 min duration, single file impact)
  - Follow PHASE-CATEGORY-SEQUENCE ID format
  - Order tasks by dependency requirements
  - Group tasks into logical phases (4-8 tasks per phase)
- **Implementation Phase**:
  - Follow Test Driven Development (Red-Green-Refactor)
  - Implement one atomic task at a time
  - Maintain >98% test coverage
  - Ensure zero downstream tool impact

### Quality Assurance (After Every Task)
- **Lint**: `npm run lint` - fix ALL issues before proceeding
- **Build**: `npm run build` - resolve ALL build errors
- **Test**: `npm test` - maintain 100% pass rate, >98% coverage
- **Type Check**: `npm run type-check` - resolve ALL type errors
- **Performance**: Unit tests <5s, integration tests <60s
- **Test Standards**: Comprehensive mocking, proper isolation, state cleanup

### Modern ESLint Configuration (2024)
- **Flat Config**: Migrate to `eslint.config.mjs` from legacy `.eslintrc.json`
- **Strict Rules**: Enable `strictTypeChecked`, forbid unsafe operations
- **Security**: Add security-focused linting rules
- **MCP-Specific**: Enforce proper async patterns and tool registration
- **Integration**: Git hooks, CI/CD automation, VS Code configuration

## Project Architecture & Context

### Core System Overview
- **TypeScript ESM MCP Server**: Production-ready with sophisticated tool registry pattern
- **15 Tools**: Research, planning, code analysis, AI-native task management, full-stack scaffolding
- **Multi-Transport**: stdio (primary), SSE, WebSocket, HTTP with session management
- **Async Job Management**: Tools return job IDs, clients poll for results via get-job-result
- **Performance Targets**: <200ms response times, <400MB memory usage, 95-97% token reduction

### Tool Registration & Execution
- **Self-Registration**: Tools auto-register via imports in `src/tools/index.ts`
- **Hybrid Routing**: Semantic matching + LLM fallback via sequential thinking
- **Context Passing**: Session ID and transport type passed to all tool executors
- **Asset Handling**: YAML prompts and assets copied during build process

### Memory & Performance Optimization
- **Caching Systems**: Multi-level (file cache, metadata cache, LRU cache)
- **Resource Management**: Memory monitoring with leak detection
- **Streaming & Batching**: For memory-intensive operations
- **Dynamic Port Allocation**: Prevents conflicts, supports IPv6/IPv4

### Enhanced Error Handling & Monitoring (2025 Updates)
- **Error Context**: `createErrorContext()` utility for rich error information
- **Custom Error Classes**: `ConfigurationError`, `ValidationError` with proper inheritance
- **Performance Monitoring**: Job manager tracks execution times and resource usage
- **Audit Logging**: Security audit logger for compliance and debugging
- **Progress Tracking**: Enhanced workflow progress tracking with detailed status updates
- **Resource Cleanup**: Automatic cleanup of stale jobs and temporary resources

## Development Workflow & Standards

### Strict Task Execution Requirements
- **Think Hard**: Always think deeply before and during implementation of new features
- **Rule Compliance**: Follow all rules in linting-best-practices.md and CLAUDE.md
- **Pattern Adherence**: Ensure all changes align with existing codebase patterns
- **Investigation First**: Research, understand, and document proposed changes before implementation
- **Validation**: Verify no existing service duplicates the proposed solution
- **DRY Enforcement**: Prefer enhancing existing services over creating new ones

### Mandatory Approval Process
- **CRITICAL**: Request explicit approval before ANY implementation
- **Investigation First**: Deep-dive analysis of existing patterns required
- **Zero Downstream Impact**: Validate no breaking changes to existing tools
- **Pattern Alignment**: Ensure alignment with singleton/ESM/event-driven architecture

### Task Management Integration
- **Always Use Todo Lists**: Add all tasks to management system for tracking
- **Phase Organization**: Group into 4-8 tasks per phase with logical sequencing
- **Atomic Tasks**: 5-10 min duration, single file impact, PHASE-CATEGORY-SEQUENCE format
- **Dependency Ordering**: Critical fixes → foundation → integration → migration → testing

### Error Handling Priority
- **Critical Fixes**: Address critical issues first
- **Foundation Components**: Handle base system components second
- **Integration Tasks**: Process integration requirements third
- **Migration Tasks**: Handle migration needs fourth
- **Testing**: Complete comprehensive testing last

### Quality Assurance Workflow (After Every Task)
1. **Lint**: `npm run lint` - Fix ALL issues, no exceptions
2. **Build**: `npm run build` - Resolve ALL build errors
3. **Test**: `npm test` - Maintain 100% pass rate, >98% coverage
4. **Type Check**: `npm run type-check` - Resolve ALL type errors
5. **Integration**: Verify no downstream tool impact
6. **Status**: Report completion and update task lists

### Testing Requirements & Standards
- **Zero Mock Policy**: Use real integrations where possible (except external LLM calls)
- **Performance Standards**: Unit tests <5s, integration tests <60s
- **Test Isolation**: Proper cleanup and state reset between tests
- **Coverage Target**: >98% test coverage maintained
- **CI/CD**: No live LLM calls in GitHub Actions/workflows
- **Mock Strategy**: queueMockResponses() for multiple calls, mockOpenRouterResponse() for single calls

## Project-Specific Requirements

### Multi-Language Support
- **Language Coverage**: Solutions must support all languages in grammar directory
- **Cross-Language Compatibility**: Ensure tools work across all supported programming languages

### Security & Configuration Boundaries
- **Read Operations**: VIBE_TASK_MANAGER_READ_DIR, CODE_MAP_ALLOWED_DIR
- **Write Operations**: VIBE_CODER_OUTPUT_DIR (strict boundary enforcement)
- **Path Validation**: Cross-platform compatibility with traversal protection
- **Environment Variables**: Security-sensitive paths via MCP client configuration

### LLM Configuration Management
- **Task-Specific Routing**: Use llm_config.json for model selection
- **Fallback Hierarchy**: Task mapping → default_generation → env vars → hardcoded
- **100% Coverage**: All LLM calls must have proper task name mappings
- **No Hardcoded Models**: Eliminate hardcoded fallbacks in favor of centralized config

### Code Quality & Architecture
- **ESM Modules**: Use .js extensions in imports (NodeNext resolution)
- **Singleton Pattern**: Use getInstance() for all services
- **Event-Driven**: Maintain event-driven architecture patterns
- **DRY Principles**: Enhance existing services rather than create new ones
- **Asset Management**: YAML prompts and configs copied during build

## Critical Development Rules

### Strict Task Execution Triggers
Use strict task execution standards for:
- Code modifications or additions
- Architecture changes
- New feature implementations
- Bug fixes or refactoring
- Testing or validation work

### Absolutely Forbidden
- **Any Implementation Without Approval**: Must request explicit approval first
- **Loose Types**: No `any`, `unknown`, `undefined` as loose types
- **Breaking Changes**: Zero impact on downstream tools required
- **New File Creation**: Avoid unless absolutely necessary
- **Live LLM in CI**: No live LLM calls in GitHub Actions
- **Test Failures**: All tests must pass before proceeding

### Required Practices
- **Investigation Before Implementation**: Deep analysis of existing patterns
- **Atomic Task Breakdown**: Single file impact, dependency-ordered
- **TDD Approach**: Red-Green-Refactor cycle with comprehensive testing
- **Multi-Language Consideration**: Support all grammar directory languages
- **Session Management**: Maintain context across tool calls
- **Resource Cleanup**: Prevent memory leaks and resource conflicts

## Centralized Configuration Integration Patterns

### Configuration Loading Flow
1. **Initialization**: `OpenRouterConfigManager.initialize()` at server startup
2. **Tool Registration**: Tools receive config via `ToolRegistry.getInstance(config)`
3. **Runtime Access**: Use `ConfigurationProvider` interface for dependency injection
4. **Validation**: Call `validateConfiguration()` before critical operations

### Security Configuration Integration
1. **Unified Manager**: `UnifiedSecurityConfigManager.getInstance()` for all security checks
2. **Path Validation**: `validatePath()` with operation type (read/write)
3. **Boundary Enforcement**: Automatic enforcement of `*_READ_DIR` and `*_OUTPUT_DIR`
4. **Audit Trail**: All security violations logged via audit logger

### Testing with Centralized Configs
1. **Mock Providers**: Use `MockConfigProvider` for unit tests
2. **Test Isolation**: Each test gets fresh configuration state
3. **CI Optimization**: Automatic mock activation in CI environments
4. **Coverage Requirements**: 100% coverage for configuration paths