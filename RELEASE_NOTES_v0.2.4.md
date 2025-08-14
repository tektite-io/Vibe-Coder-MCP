# Release Notes - v0.2.4

## 🎉 Highlights

This release introduces **Unified Project Root Configuration**, significantly simplifying the onboarding experience for both CLI and MCP users. The update brings intelligent auto-detection capabilities, enhanced documentation, and improved developer experience across all tools.

## 🚀 Major Features

### Unified Project Root Configuration
- **Single Configuration Point**: Replaced multiple tool-specific environment variables with a unified `VIBE_PROJECT_ROOT` variable
- **Auto-Detection for CLI Users**: Automatic project root detection when using the `vibe` command - zero configuration needed!
- **Transport Context Awareness**: Different behavior based on transport type (CLI vs MCP client)
- **Backward Compatibility**: All legacy environment variables continue to work as fallbacks

### Enhanced Setup Wizard
- **Interactive Configuration**: Step-by-step setup process with intelligent defaults
- **Auto-Detection Options**: Toggle automatic project root detection
- **Comprehensive Validation**: Ensures all configurations are valid before saving
- **Improved User Experience**: Clear prompts and helpful descriptions for all settings

## 🔧 Improvements

### Documentation Enhancements
- **Comprehensive README Updates**: 
  - Added quick start guides for different user types
  - Included detailed configuration examples
  - Updated tool descriptions with latest features
  - Added troubleshooting section

- **Tool-Specific Documentation**:
  - Enhanced README files for code-map-generator, context-curator, and vibe-task-manager
  - Added unified configuration examples
  - Clarified security boundaries and permissions

### Configuration Management
- **Environment Variables**:
  - Simplified `.env.example` with clear sections and descriptions
  - Added `.env.template` for setup wizard
  - Removed redundant configuration options
  - Added support for `VIBE_USE_PROJECT_ROOT_AUTO_DETECTION`

- **MCP Configuration**:
  - Updated `example_claude_desktop_config.json` with unified variables
  - Improved configuration validation
  - Enhanced error messages for misconfiguration

### Security and DRY Compliance
- **UnifiedSecurityConfigManager Enhancement**:
  - Added transport context support
  - Implemented directory resolution priority chain
  - Maintained backward compatibility
  - Followed DRY principles by enhancing existing services

### Developer Experience
- **CLI Improvements**:
  - Fixed CLI initialization sequence
  - Added proper service initialization order
  - Improved error handling and logging
  - Enhanced version display functionality

- **Logging Enhancements**:
  - Added structured logging with context
  - Improved error messages
  - Added debug logging for configuration resolution
  - Enhanced transport-specific logging

## 🐛 Bug Fixes

- Fixed CLI configuration persistence issues
- Resolved version display problems in CLI
- Fixed initialization sequence for singleton services
- Corrected directory resolution in various transport contexts
- Fixed security boundary validation in unified configuration

## 📦 Dependencies

- All dependencies remain stable
- No breaking changes in external APIs
- Maintained compatibility with all MCP clients

## 🔄 Migration Guide

### For MCP Users (Claude Desktop, Cline, etc.)

#### Option 1: Simplified Configuration (Recommended)
```json
{
  "mcpServers": {
    "vibe-coder-mcp": {
      "command": "npx",
      "args": ["vibe-coder-mcp"],
      "env": {
        "VIBE_PROJECT_ROOT": "/path/to/your/project",
        "OPENROUTER_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Option 2: Legacy Configuration (Still Supported)
Your existing configuration with multiple environment variables will continue to work.

### For CLI Users

#### New Simplified Usage
```bash
# Navigate to your project directory
cd /path/to/your/project

# Run with auto-detection (no configuration needed!)
npx vibe-coder-mcp --interactive

# Or use the shorthand
vibe
```

#### First-Time Setup
```bash
# Run the setup wizard
npx vibe-coder-mcp --setup

# Follow the prompts to configure:
# - Enable auto-detection (recommended)
# - Set your OpenRouter API key
# - Configure other optional settings
```

## 📝 Changelog Summary

### Added
- Unified project root configuration system
- Auto-detection for CLI users
- Transport context awareness
- Enhanced setup wizard
- Comprehensive documentation updates
- Improved logging and error messages

### Changed
- Simplified environment variable structure
- Enhanced UnifiedSecurityConfigManager
- Improved CLI initialization sequence
- Updated all tool READMEs
- Refined configuration templates

### Removed
- Redundant `package-security-fix.sh` script
- Outdated configuration examples
- Unnecessary complexity in directory resolution

### Fixed
- CLI configuration persistence
- Version display issues
- Service initialization order
- Directory resolution edge cases
- Security boundary validation

## 🎯 What's Next

- Further CLI enhancements
- Additional tool integrations
- Performance optimizations
- Extended documentation and tutorials

## 💡 Breaking Changes

None - This release maintains full backward compatibility.

## 🙏 Acknowledgments

Thanks to all contributors and users who provided feedback to improve the onboarding experience!

---

**Installation**: `npm install -g vibe-coder-mcp@0.2.4`
**NPX Usage**: `npx vibe-coder-mcp@0.2.4`
**Repository**: [GitHub - Vibe-Coder-MCP](https://github.com/freshtechbro/vibe-coder-mcp)