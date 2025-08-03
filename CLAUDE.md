# CLAUDE.md - Development Guidelines for Agentic Coding

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Development
- **Build project**: `npm run build` - Compiles TypeScript to build/ directory and copies assets
- **Development mode**: `npm run dev` - Watch mode with pretty logging via pino-pretty
- **Production start**: `npm start` - Start MCP server in production mode
- **Type checking**: `npm run type-check` - Validate TypeScript without emitting files

### Testing Commands
- **Run all tests**: `npm test` - Standard test run excluding e2e tests
- **Unit tests only**: `npm run test:unit` - Run unit tests excluding integration/e2e
- **Integration tests**: `npm run test:integration` - Run integration tests only
- **E2E tests**: `npm run test:e2e` - End-to-end tests with mock mode
- **Watch mode**: `npm run test:watch` - Run tests in watch mode
- **CI-safe tests**: `npm run test:ci-safe` - Excludes problematic CI tests
- **Test coverage**: `npm run coverage` - Generate test coverage report

### Linting and Quality
- **Lint code**: `npm run lint` - ESLint validation for TypeScript files
- **Clean build**: `npm run clean` - Remove build directory
- **Test single file**: `vitest run path/to/test.ts`

### MCP Server Modes
- **Stdio mode** (default): Standard MCP transport for AI assistants
- **SSE mode**: `npm run start:sse` or `npm run dev:sse` - HTTP/SSE transport for web clients

## Code Style & Conventions
- **ESM modules**: Use `.js` extensions in imports (TypeScript with NodeNext resolution)
- **Imports**: Relative imports with `.js` extension: `import { foo } from './bar.js'`
- **Types**: Strict TypeScript, explicit return types, use Zod for validation, zero tolerance for `any`
- **Naming**: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files
- **Error handling**: Use custom `AppError` class from `src/utils/errors.ts`, Result types over undefined returns
- **Logging**: Use `logger` from `src/logger.js` (Pino-based)
- **Singletons**: Use `getInstance()` pattern for services

## High-Level Architecture

### Core Architecture Pattern
This is a **TypeScript ESM MCP server** with a sophisticated tool registry pattern:

1. **Tool Registry System**: All tools self-register via imports in `src/tools/index.ts`
2. **Hybrid Routing**: Semantic matching + LLM fallback via sequential thinking
3. **Async Job Management**: Tools return job IDs, clients poll for results
4. **Multi-Transport Support**: stdio (primary) and SSE for different client types
5. **Session State Management**: Maintains context across tool calls

### Architecture Patterns
- **Tool registration**: Self-registering tools via `registerTool()` in `src/tools/index.ts`
- **Singleton services**: Use `getInstance()` pattern for services
- **Security boundaries**: Read from `*_READ_DIR`, write to `*_OUTPUT_DIR` env vars only
- **Job management**: Async operations return job IDs, clients poll for results
- **Config management**: Use `.env` for secrets, `llm_config.json` for LLM routing
- **Transport support**: stdio (primary), SSE, WebSocket for different client types

### Key Components

**Entry Points:**
- `src/index.ts` - Main server initialization with transport detection
- `src/server.ts` - MCP server creation and tool registration

**Core Services:**
- `src/services/routing/toolRegistry.ts` - Central tool management
- `src/services/routing/embeddingStore.ts` - Semantic routing via embeddings
- `src/services/job-manager/` - Asynchronous job processing
- `src/services/state/sessionState.ts` - Session management

**Tool Ecosystem (15 tools):**
- Research, planning, and documentation tools
- Code analysis and context curation
- AI-native task management with natural language CLI
- Full-stack project scaffolding
- Workflow automation and agent coordination

### Configuration System
- **Environment**: `.env` file with OpenRouter API configuration
- **LLM Mapping**: `llm_config.json` - Model routing configuration
- **MCP Config**: `mcp-config.json` - Tool-specific settings
- **Workflows**: `workflows.json` - Predefined tool sequences

### Build System Details
- **TypeScript Config**: NodeNext module resolution, strict typing
- **Build Output**: `build/` directory (git-ignored)
- **Asset Handling**: Copies YAML prompts and other assets during build
- **Test Framework**: Vitest with comprehensive coverage via @vitest/coverage-v8

### Tool Registration Pattern
Tools self-register by calling `registerTool()` with:
- Name, description, Zod schema for inputs
- Executor function that receives config and context
- Tools are imported in `src/tools/index.ts` to trigger registration

### Memory and Performance
- **Memory Optimization**: Code map tool achieves 95-97% token reduction
- **Caching Systems**: Multiple levels including file cache, metadata cache, and LRU cache
- **Resource Management**: Memory monitoring with leak detection
- **Performance Targets**: <200ms response times, <400MB memory usage

### Security Framework
- **Path Validation**: Separate security boundaries for read/write operations
- **Environment Variables**: Security-sensitive paths configurable via env vars
- **Data Sanitization**: Input validation and output sanitization
- **Concurrent Access Control**: Thread-safe operations with resource locking

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

### Development Patterns
- **Zero Mock Policy**: All tests use real integrations where possible
- **Error Recovery**: Advanced retry mechanisms with pattern analysis
- **Real-time Monitoring**: Performance tracking and health monitoring
- **Transport Coordination**: Unified agent communication across all transport types

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
  - Check security boundary compliance (REPOTOOLS_OUTPUT_DIR restrictions)
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

## Key Files to Understand

### Configuration Files
- `package.json` - Dependencies and npm scripts
- `tsconfig.json` - TypeScript configuration with NodeNext resolution
- `vitest.config.ts` - Test configuration with CI optimizations
- `.env.example` - Environment variable template

### Core Implementation
- `src/index.ts` - Server bootstrap and transport initialization
- `src/server.ts` - MCP server setup and dynamic tool registration
- `src/tools/index.ts` - Tool import orchestration
- `src/services/routing/toolRegistry.ts` - Tool management core

### Major Tools
- `src/tools/vibe-task-manager/` - AI-native task management system
- `src/tools/code-map-generator/` - Advanced code analysis tool
- `src/tools/context-curator/` - Intelligent context packaging
- `src/tools/fullstack-starter-kit-generator/` - Project scaffolding

### Testing Infrastructure
- `src/tools/vibe-task-manager/__tests__/setup.ts` - Vitest setup
- Test patterns: `**/__tests__/**/*.test.ts` for unit tests
- Integration: `**/integration/**/*.test.ts` and `**/__integration__/**/*.test.ts`
- E2E: `test/e2e/**/*.test.ts`

## Important Development Notes

### Build Requirements
- Node.js 18.0.0+ required
- TypeScript compilation must succeed before runtime
- Asset copying required for YAML prompt files

### Testing Strategy
- Comprehensive test coverage (99.9% success rate target)
- CI-aware test exclusions for infrastructure-dependent tests
- Memory optimization for CI environments
- Real LLM integration testing where possible

### MCP Integration
- Designed for AI assistant integration (Cursor, Claude Desktop, etc.)
- Requires proper MCP client configuration with absolute paths
- Session management maintains context across requests
- Job polling protocol mandatory for async operations

### Performance Considerations
- Memory-intensive operations use streaming and batching
- Caching strategies reduce redundant computations
- Dynamic port allocation prevents conflicts
- Resource cleanup on shutdown prevents leaks

This codebase implements a production-ready MCP server with sophisticated tool orchestration, making it essential to understand the registry pattern and async job management when making modifications.

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

### RepoTools Branding & Migration
- **Rebranding**: 'Vibe-Coder-MCP' → 'RepoTools' (CLI commands: vibe-coder → repotools)
- **Backward Compatibility**: Maintain zero downtime during migration
- **Multi-Language Support**: Solutions must support all languages in grammar directory

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

# User Guidelines

# RepoTools Architecture & Branding
- Project has been rebranded from 'Vibe-Coder-MCP' to 'RepoTools' requiring updates to all package names, CLI commands (vibe-coder → repotools), documentation, and code references while maintaining zero downtime and backward compatibility.
- Uses TypeScript with ESM modules (requiring .js extensions in imports), configured via environment variables separating read/write access for security.
- Supports multiple transport mechanisms (stdio, SSE, WebSocket, HTTP) with a message-based protocol requiring session establishment.
- Security architecture enforces strict boundaries where tools must only read from VIBE_TASK_MANAGER_READ_DIR/CODE_MAP_ALLOWED_DIR and write to VIBE_CODER_OUTPUT_DIR.
- User prefers centralized configuration and security boundary implementation across all services following DRY principles, using code-map-generator's security system as the template pattern.
- User prefers dynamic port allocation with port range variables (e.g., WEBSOCKET_PORT_RANGE=8080-8090), system port exclusion (1-1024), IPv6/IPv4 binding support, graceful degradation, and detailed logging.
- User requires maintaining existing successful systems (port allocation, transport services, tool registration).
- User requires comprehensive plan validation against existing codebase patterns including singleton/ESM/event-driven architecture, security boundaries (REPOTOOLS_OUTPUT_DIR restrictions), Vitest testing framework compatibility, dependency management constraints, build system integration, environment variable migration patterns, tool integration accuracy, atomic task validation (5-10 min, single file impact), zero downstream impact verification, and DRY principle adherence - this validation methodology should be applied to all future architectural changes.

# LLM Response Handling
- Implements a 6-strategy enhanced progressive parsing pipeline in llmHelper.ts with Strategy 5 (extractPartialJson) as the aggressive extraction fallback.
- Uses latest OpenRouter model versions (specifically Gemini 2.5 Flash Preview 05-20) for LLM operations.
- Requires format-aware LLM calls across all tools to ensure consistent response handling.
- User prefers using llm_config JSON for LLM configuration management instead of hardcoded configurations.
- User requires comprehensive investigation of all LLM calls and impact analysis before implementing centralized configuration changes to ensure no downstream tools are broken.
- User requires strict separation between LLM/OpenRouter configurations and RepoTools client configurations - centralized configuration management should only handle LLM configurations and must not affect or couple with existing MCP configuration loading mechanisms.
- User requires comprehensive LLM task coverage analysis ensuring all LLM calls have proper task name mappings in llm_config.json, proper default_generation fallback mechanisms, and elimination of hardcoded model fallbacks to maintain 100% configuration coverage.

# Vibe Task Manager & Task Decomposition
- Evolving into a SaaS platform for agent orchestration with multiple workflow types, maintaining backward compatibility.
- Follows singleton pattern with getInstance(), ESM modules, event-driven architecture in src/services/.
- Implementation issues include integration gaps, placeholder scheduler algorithms, and configuration problems.
- Atomic task requirements: 5-10 minute duration, single-step with one acceptance criterion, impacting exactly ONE file, following PHASE-CATEGORY-SEQUENCE ID format.
- User expects the system to create project-specific epics rather than defaulting to a generic 'default-epic' for all tasks.
- User prefers comprehensive investigation workflow for issues: cross-reference server logs against codebase implementation, focus on service integration gaps, analyze workflow logic, and provide prioritized recommendations.
- User prefers converting recommendations into actionable atomic tasks and adding them to the task management system for systematic execution.
- User prefers task sequencing optimized by dependency requirements with priority order: critical fixes first, foundation components second, integration tasks third, migration tasks fourth, testing last, while maintaining atomic task integrity and enabling parallel work where possible.

# Code Map Generator & Context Curator
- Code Map Generator recursively scans codebases for 30+ languages, generating token-efficient Markdown index and Mermaid diagrams.
- Context Curator implements 8-phase workflow using full codemap content with 250,000 token budget default.
- Should implement intelligent codemap caching with configurable time threshold to check for recent codemaps before triggering new generation.

# Development Practices & Testing
- Follows testing-first development with Red-Green-Refactor cycle, requiring >98% test coverage and zero mock implementations.
- User requires >98% test coverage with zero-mock policy exceptions specifically allowed for external services like LLM API calls, and prioritizes test performance optimization for CI/CD pipeline efficiency.
- Requires comprehensive testing strategy with unit, integration, e2e, and performance tests plus build validation at each implementation phase.
- Code edits should be made in the src directory where the source files live, not in the build directory which contains only compiled files.
- All tasks require 4-step verification: npm test, npm run build, integration verification, and status reporting.
- User prefers systematic test optimization approach: use queueMockResponses() for multiple LLM calls, mockOpenRouterResponse() for single calls, target <2 second execution time for all LLM tests, and expand enhanced mock system coverage beyond integration tests to achieve 100% test performance optimization.
- User requires test performance standards: unit tests <5 seconds, integration tests <60 seconds, with comprehensive mocking for unit tests to eliminate real service calls while allowing legitimate LLM calls in integration tests with proper timeouts.
- User prefers achieving 100% test pass rates through focused fixes that prevent regression.
- User requires systematic three-phase test fixing approach: Phase 1 unit tests (100% pass, <5s, comprehensive mocking), Phase 2 integration tests (100% pass, <60s, zero live LLM calls), Phase 3 E2E tests (focused workflows, fail-fast, realistic user simulation), following Red-Green-Refactor TDD with 4-step verification process.
- For 100% test pass rates, implement proper test isolation with cleanup and state reset between tests, ensure consistent mocking strategy across all tests, and maintain proper cache clearing and state management.
- User requires systematic test analysis workflow: comprehensive test suite execution (unit/integration/e2e), detailed failure documentation with categorization by root cause, prioritized remediation planning with atomic task breakdown, and strict success criteria (100% pass rate, performance targets unit <5s/integration <60s, proper test isolation).

# Git Workflow & Documentation
- Commit messages use past tense with format 'type(scope): description', branches named as 'type/descriptive-name'.
- User prefers logical commit grouping, detailed concise messages, and systematic process of commit -> push -> check conflicts -> create PR.
- User prefers systematic GitHub PR workflow: pre-commit validation (build + tests with 100% pass rate), logical commit organization using 'type(scope): description' format in past tense, closing failed PRs with explanatory comments before creating new ones, and comprehensive PR validation including conflict checks and CI/CD verification.
- User prefers systematic Git workflow: group commits by similarities following conventions, build and validate everything works, check for merge conflicts with master before creating PRs.
- Requires comprehensive documentation with Mermaid diagrams for project architecture and individual tool architectures.
- Documentation should include natural language commands and CLI syntax for agent registration, task orchestration, and workflow management.

# General Preferences & Implementation Approach
- User prefers to discuss and evaluate multiple solution approaches before implementing fixes.
- User prefers atomic task breakdown with task management system integration, following DRY principles.
- Implementation should avoid creating new files, ensure no downstream tool impact, and focus only on identified issues without improvisation.
- When modifying shared components, must ensure zero impact on downstream tools.
- User prefers investigation-focused approach before implementation, requiring alignment with existing codebase patterns.
- User prefers thorough root cause analysis approach: deep dive into codebase to understand file generation mechanisms and trace corruption sources before presenting recommendations.
- User prefers fixing root causes of file generation issues rather than just correcting corrupted files - focus on preventing JSON corruption during file generation processes.
- User prefers comprehensive deep-dive analysis of issues against codebase patterns, systematic implementation planning following DRY principles.
- User prefers implementation workflow: investigate recommendations against user guidelines, generate atomic tasks for implementations, and add atomic tasks to task management system.
- User requires atomic task breakdown with dependency ordering.
- Implementation should follow established patterns (singleton, ESM, event-driven architecture).
- Code edits should be made in the src directory where the source files live.

# Debugging & Error Handling Prioritization
- User prefers to prioritize port allocation conflicts as the next debugging step after fixing JSON corruption, followed by test mock fixes for 100% coverage, then full test suite assessment.
- User prefers systematic prioritized approach to fixing TypeScript build errors, completing ProjectContext interfaces with all required fields (core, technical, context, structure, metadata) using appropriate defaults when actual values unavailable.
- User prefers incremental TypeScript error fixing approach (5-10 errors per batch) with validation after each batch (npm run build + lint count monitoring), prioritizing type mismatches and interface issues while maintaining existing patterns and ensuring zero downstream impact.

# Configuration Management
- User prefers comprehensive configuration management investigation covering llm_config.json/mcp-config.json/.env usage patterns, centralized configuration utility design with backward compatibility, security boundary compliance, and atomic task breakdown for zero downstream tool impact during implementation.

# System Analysis Approach
- User prefers structured 4-phase investigation approach for system analysis: Phase 1 server log analysis with error categorization and timestamp patterns, Phase 2 output quality assessment, Phase 3 correlation analysis between logs and outputs, Phase 4 structured findings with prioritized recommendations - focusing on investigation before implementation.
- User prefers comprehensive 6-phase server log investigation methodology: error categorization by type, pattern analysis with timestamp correlation, root cause investigation cross-referencing codebase implementation, impact assessment on system functionality, prioritized recommendations (critical fixes first), and atomic task conversion following PHASE-CATEGORY-SEQUENCE format with dependency ordering.

# CLI Architecture
- User prefers comprehensive CLI architecture with unified command structure (repotools <service> <action> [options]), modern terminal UI libraries (inquirer, chalk, ora, boxen), both interactive and scriptable modes, and pretty terminal interface design following existing patterns.

before you make any edit, you must seek approval

Always enforce type safety. At every step and after every task is completed, run lint and fix all issues, run build and fix all issues, run tests and fix all issues. Please ensure this is applied to all implementation plan tasks.

When working on tests or creating new tests, ensure all tests pass.
Don't get lazy by moving on to the next task because you believe a test is not important. All tests are important.
We must ensure that tests pass otherwise there is no point having the tests. We should not have tests that wont pass.
Tests are our line in the sand that our system is still working correctly.
Tests and implementations must be in sync always.

Remove tests that make live llm calls from our Github actions and Github workflows
We don't want live llm calls in our CI/CD pipeline
We must ensure that all tests pass before merging any changes to the main branch.
We must ensure that all tests pass before deploying any changes to the production environment.
We must ensure that all tests pass before releasing any changes to the public.

when given any task, always add them to your task management lists so you do not forget and can keep track. after every task is completed, update the task list. if during a task implementation you have additional recommendations or new tasks, update the task lists with the new recommended tasks and continue.

When implementing any solution or investigating any issues, always remember and consider the fact that we are working and implementing a solution that supports multiple programming languages. Hence your recommendations must recognize this fact. Ensure you are implementing and recommending solutions that support multiple languages supported in the grammar directory.

Always group tasks by phases. You create the high level phases first and later create tasks under each phase so that it's easy to track and monitor for implementation

When creating and adding tasks to task management, ensure the sequence are logical and aligned. Order tasks by dependency requirements. Each phase should have specific purpose and can be completed independently. Order tasks by priority where critical fixes come first, testing comes last. Each phase contains 4-8 tasks for focused implementation.

Incoporate Test Driven Development (Red Green Refactor) principles into the tasks so we can maintain test coverage. Incorporate regualr tests and build/run after major implementation or phase.


Always request for approval before you proceed with implementations. When I ask for you to investigate or evaluate or search for an error for the purpose of fixing issue, I expect you to do your investigations and provide recommendations. In addition you should present your proposal for approval first before proceeding with implementations. Dont ever proceed to implementation or make changes before seeking approval for your findings and proposal. All proposals and recommendations must be explicitly approved before you proceed with implementation.

When making proposed changes, ensure you investigate the proposal thoroughly. Ensure you make proposed changes that doesn't impact other downstream tools and does not break what's already working. You must investigate thoroughly and ensure that your proposal to make changes to one tool doe not negatively impact other downstraem toolsthat are potentially sharing the same tool or services, utils, functions e.t.c.


When debugging or investigating issues, do not implement anything.  Focus on the investigation and discussion.

Test and build as you proceed and fix issues. All issues and tests must be fixed. do not skip issues for any reason. do not be lazy.

Your final recommendation must not impact downstream tools 

Ensure your final recommendation align with existing patterns in the codebase

Follow DRY principles.

Follow existing patterns in the codebase.

Follow Test Driven Development (Red Green Refactor) principles

Avoid creating new files.

When working on tests or creating new tests, ensure all tests pass. 

We aim for 98% test coverage and 98% test passing rate
# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.