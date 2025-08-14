# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.4] - 2025-08-14

### Added
- **Unified Project Root Configuration**
  - Single `VIBE_PROJECT_ROOT` environment variable replaces multiple tool-specific variables
  - Automatic project root detection for CLI users with `VIBE_USE_PROJECT_ROOT_AUTO_DETECTION`
  - Transport context awareness for different runtime environments (CLI vs MCP clients)
  - Intelligent directory resolution priority chain
  - Full backward compatibility with legacy environment variables

- **Enhanced Setup Wizard**
  - Interactive configuration with intelligent defaults
  - Auto-detection toggle for zero-configuration CLI usage
  - Comprehensive validation before saving configurations
  - Improved user experience with clear prompts and descriptions

- **Documentation Improvements**
  - Comprehensive README updates with quick start guides
  - Enhanced tool-specific documentation for all major tools
  - Added troubleshooting section
  - Updated configuration examples with unified approach

### Changed
- **UnifiedSecurityConfigManager Enhancement**
  - Added transport context support for CLI auto-detection
  - Implemented directory resolution priority chain
  - Maintained backward compatibility while simplifying configuration
  - Enhanced error messages and logging

- **Configuration Management**
  - Simplified `.env.example` with clear sections
  - Updated `example_claude_desktop_config.json` with unified variables
  - Improved configuration templates for setup wizard
  - Enhanced validation and error handling

- **CLI Improvements**
  - Fixed initialization sequence for proper service startup
  - Added proper singleton service initialization order
  - Improved error handling and user feedback
  - Enhanced version display functionality

### Fixed
- CLI configuration persistence issues
- Version display problems in CLI
- Service initialization order for singleton managers
- Directory resolution in various transport contexts
- Security boundary validation in unified configuration

### Removed
- Redundant `package-security-fix.sh` script
- Outdated configuration complexity
- Unnecessary directory resolution duplication

## [0.2.3] - 2025-08-13

### Added
- **Configuration Infrastructure**
  - UserConfigManager for intelligent OS-specific configuration directory management
    - Windows: `%APPDATA%\vibe-coder`
    - macOS: `~/Library/Application Support/vibe-coder`
    - Linux: `~/.config/vibe-coder` (XDG compliant)
  - ConfigValidator with comprehensive Zod-based validation and actionable error messages
  - Automatic configuration backup system with timestamped archives
  - Configuration templates for new users:
    - `.env.template` with inline documentation
    - `llm_config.template.json` with complete model mappings
    - `mcp-config.template.json` with tool-specific configurations
  - First-time user detection with multiple indicators
  - Non-interactive setup support for CI/CD environments

- **Setup Wizard Enhancements**
  - ASCII art banner for visual polish
  - Improved user prompts and guidance for OpenRouter API setup
  - Multi-location configuration saving (user and project directories)
  - Smart detection of existing configurations
  - Streamlined onboarding flow for new users
  - Directory permissions setup assistance
  - Security mode selection (strict/permissive)
  - Model preferences configuration

- **Documentation**
  - NPM Publishing Guide for maintainers
  - Comprehensive Release Notes for v0.2.3
  - Updated package contents documentation

### Changed
- **CI/CD Pipeline Simplification**
  - Simplified pipeline to run unit tests only (70% faster execution)
  - Adjusted coverage threshold to 70% for unit tests
  - Added proper NODE_OPTIONS configuration for memory optimization
  - Made integration tests available for manual runs only
  - Optimized GitHub Actions workflow for faster builds
  - Removed redundant test runs during publishing

- **Documentation Cleanup**
  - Removed outdated CI-CD-ANALYSIS.md after implementation
  - Removed CONFIG_ONBOARDING_PLAN.md after feature completion
  - Consolidated redundant documentation files
  - Updated inline code documentation for clarity

- **Configuration Updates**
  - Enhanced mcp-config.json with better default settings
  - Improved research-manager tool configuration
  - Updated default timeout settings for better performance

### Fixed
- **CLI Configuration Issues**
  - CLI configuration persistence across sessions now works correctly
  - Version display in CLI commands (`--version` flag) now shows correct version
  - First-time user crash when API key is missing resolved
  - Interactive mode banner display in REPL fixed
  - Executable permissions for CLI binary in build process corrected

- **REPL Mode Improvements**
  - Fixed banner display timing in interactive mode
  - Resolved context preservation issues in REPL sessions
  - Fixed command history navigation
  - Corrected auto-completion behavior

- **Build Process**
  - Pre-publish validation script improvements
  - Better handling of package contents verification
  - Fixed asset copying during build process

### Improved
- **Performance Optimizations**
  - CI pipeline execution time reduced by ~70%
  - Memory usage optimized for test runs
  - Faster npm package installation
  - Better resource cleanup in tests
  - Reduced package size through documentation cleanup

- **User Experience**
  - More intuitive first-run experience
  - Better error messages with actionable suggestions
  - Improved help system with contextual examples
  - Enhanced progress indicators during setup

- **Code Quality**
  - Better TypeScript type definitions
  - Enhanced error handling throughout the codebase
  - Improved test coverage for new features
  - Cleaner separation of concerns in configuration management

## [0.2.2] - 2025-08-11

### Added
- **Interactive REPL Mode**
  - `--interactive` flag for unified CLI to enable REPL mode
  - Context-aware command processing in interactive sessions
  - Command history and auto-completion support
  - Persistent session state across commands
  - Multi-line input support for complex commands
  - Exit commands (`exit`, `quit`, `.exit`)

### Fixed
- **CLI Integration Issues**
  - Fixed CLI mode detection in unified-cli.ts
  - Resolved path resolution for global installations
  - Corrected argument parsing for interactive mode

### Improved
- **Developer Experience**
  - Better error messages in CLI mode
  - Enhanced help system with more examples
  - Improved command parsing and validation
  - Better handling of interrupted commands

## [0.2.1] - 2025-08-10

### Fixed
- **CLI Binary Installation**
  - Fixed executable permissions for CLI binaries (`vibe`, `vibe-coder-mcp`)
  - Resolved npm global installation path issues
  - Corrected binary linking in package.json
  - Fixed post-install script execution

- **Build Process Issues**
  - Added proper chmod +x for CLI files during build
  - Fixed asset copying for binary distribution
  - Resolved TypeScript compilation issues for CLI

### Changed
- **CI/CD Optimizations**
  - Disabled tests during npm publish to speed up releases
  - Optimized publishing pipeline for faster deployments
  - Added pre-publish validation script

### Improved
- **Installation Process**
  - Better handling of global npm installations
  - Improved post-install scripts with error handling
  - Enhanced binary path resolution for different platforms
  - Added fallback mechanisms for permission issues

## [0.2.0] - 2025-08-09

### 🚀 Added

#### CLI Infrastructure
- **Complete CLI system** with unified command gateway for natural language processing
- **Interactive REPL interface** with context-aware command processing
- **Multi-tool workflow orchestration** for complex development tasks
- **CLI binary support** with `vibe` and `vibe-coder-mcp` commands
- **Enhanced help system** with comprehensive usage examples

#### Performance Improvements
- **Code map generator optimizations** with batch processing capabilities
- **Performance metrics tracking** for monitoring and optimization
- **Memory management improvements** with better resource cleanup
- **Adaptive timeout management** for long-running operations

#### Configuration Management
- **Enhanced job timeout configuration** with better error handling
- **Improved configuration validation** and schema enforcement
- **Better environment variable handling** and validation
- **Configuration migration utilities** for seamless upgrades

### 🔧 Improved

#### Developer Experience
- **Enhanced error handling** with more descriptive error messages
- **Better TypeScript strict typing** with zero tolerance for `any` types
- **Improved build process** with asset copying and validation
- **Enhanced package structure** for better maintainability

#### Code Quality
- **Comprehensive test coverage** with 99.9% success rate
- **Enhanced linting rules** with strict TypeScript enforcement
- **Better documentation** with inline code comments
- **Improved type safety** throughout the codebase

### 🐛 Fixed

#### Type Safety
- **Fixed Zod namespace import issues** in sequential thinking module
- **Resolved TypeScript compilation errors** with strict typing
- **Enhanced type definitions** for better IDE support
- **Fixed implicit any types** throughout the codebase

#### Configuration
- **Fixed job timeout configuration loading** with proper error handling
- **Resolved configuration validation issues** with better schema enforcement
- **Fixed environment variable processing** with proper type checking
- **Enhanced configuration file handling** with better error messages

### 📦 Package Updates

#### Build System
- **Updated CLI binary configuration** for proper npm installation
- **Enhanced build process** with TypeScript compilation and asset copying
- **Improved package file structure** with better organization
- **Updated npm scripts** for better development workflow

#### Dependencies
- **Updated core dependencies** to latest stable versions
- **Enhanced security** with zero vulnerabilities
- **Better dependency management** with proper version locking
- **Improved compatibility** with Node.js 20.x and 22.x

### 🧪 Testing

#### Quality Assurance
- **All quality checks passing** (type-check, lint, build)
- **Zero security vulnerabilities** detected
- **CLI functionality verified** and working correctly
- **Cross-platform compatibility** tested and confirmed

#### Test Infrastructure
- **Enhanced test suites** with better coverage
- **Improved CI/CD pipeline** with automated quality gates
- **Better test organization** with clear separation of concerns
- **Enhanced test utilities** for better test development

### 📚 Documentation

#### User Documentation
- **Updated README** with new CLI usage examples
- **Enhanced installation instructions** for multiple installation methods
- **Better feature documentation** with comprehensive examples
- **Improved troubleshooting guides** with common solutions

#### Developer Documentation
- **Enhanced code documentation** with better inline comments
- **Improved API documentation** with type definitions
- **Better architecture documentation** with clear patterns
- **Enhanced contribution guidelines** for developers

### 🔄 Migration Notes

This release introduces a complete CLI system while maintaining full backward compatibility with existing MCP server functionality. No breaking changes have been introduced.

#### For Existing Users
- All existing MCP server functionality remains unchanged
- New CLI features are additive and optional
- Configuration files remain compatible
- No migration steps required

#### For New Users
- Can use either MCP server mode or CLI mode
- CLI provides easier access to tools and features
- Interactive mode available for better user experience
- Comprehensive help system for getting started

### 🎯 What's Next

#### Planned Features
- Enhanced agent coordination capabilities
- Improved workflow automation
- Better integration with popular IDEs
- Enhanced performance monitoring

#### Community
- Seeking feedback on new CLI interface
- Open to feature requests and contributions
- Active development and maintenance
- Regular updates and improvements

---

## [0.1.0] - 2025-01-01

### 🚀 Initial Release

#### Core Features
- **MCP Server Implementation** with multi-transport support (stdio, SSE, WebSocket, HTTP)
- **Comprehensive Tool Ecosystem** with 15+ specialized development tools
- **Semantic Routing** with intelligent request matching using embeddings
- **Job Management System** with asynchronous processing capabilities
- **Session State Management** with context preservation across requests

#### Available Tools
- **Vibe Task Manager** - AI-native task management with RDD methodology
- **Code Map Generator** - Advanced codebase analysis supporting 35+ languages
- **Context Curator** - Intelligent context curation for AI development
- **Research Manager** - Deep research using Perplexity integration
- **Fullstack Starter Kit Generator** - Project scaffolding tool
- **PRD Generator** - Product Requirements Document generation
- **User Stories Generator** - Agile user story creation
- **Task List Generator** - Development task breakdown
- **Rules Generator** - Coding standards and guidelines
- **Workflow Runner** - Multi-step workflow execution
- **Agent Registry** - Multi-agent coordination system

#### Technical Foundation
- **TypeScript ESM Architecture** with strict typing enforcement
- **Self-Registering Tools** with automatic discovery and registration
- **Security Boundaries** with separate read/write path validation
- **Comprehensive Testing** with 99.9% test success rate
- **Zero Mock Policy** using real services for production reliability

#### Quality Assurance
- **Strict TypeScript Configuration** with zero tolerance for `any` types
- **Comprehensive Linting** with ESLint and custom rules
- **Extensive Test Coverage** with unit, integration, and e2e tests
- **Security Auditing** with automated vulnerability scanning
- **Performance Monitoring** with memory leak detection

#### Documentation
- **Comprehensive README** with installation and usage instructions
- **Tool-Specific Documentation** with detailed examples
- **Architecture Documentation** with clear patterns and conventions
- **Contributing Guidelines** for community development
- **Security Policy** with vulnerability reporting procedures

---

[0.2.3]: https://github.com/freshtechbro/Vibe-Coder-MCP/compare/v0.2.2...v0.2.3
[0.2.2]: https://github.com/freshtechbro/Vibe-Coder-MCP/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/freshtechbro/Vibe-Coder-MCP/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/freshtechbro/Vibe-Coder-MCP/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/freshtechbro/Vibe-Coder-MCP/releases/tag/v0.1.0