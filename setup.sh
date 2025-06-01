#!/bin/bash
# Setup script for Vibe Coder MCP Server (Production Ready v2.0)
set -e # Exit immediately if a command exits with a non-zero status.

echo "Setting up Vibe Coder MCP Server v2.0..."
echo "=================================================="
echo "Production-ready MCP server with 15+ specialized tools"
echo "Agent coordination • Task management • Code analysis • Research"
echo "=================================================="

# Check if npm is installed
echo "Checking if npm is installed..."
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed. Please install Node.js and npm first."
    echo "Visit: https://nodejs.org/"
    exit 1
fi
echo "✓ npm is installed."

# Check Node.js version (require v18+)
echo "Checking Node.js version..."
node_version=$(node -v | cut -d "v" -f 2 | cut -d "." -f 1)
if [ "$node_version" -lt 18 ]; then
    echo "ERROR: Node.js v18+ is required (found v$(node -v)). Please upgrade Node.js."
    echo "Visit: https://nodejs.org/"
    exit 1
fi
echo "✓ Node.js version check passed (found v$(node -v))."

# Install dependencies
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed. Check npm logs above."
    echo "Try: npm cache clean --force && npm install"
    exit 1
fi
echo "✓ Dependencies installed successfully."

# Verify critical dependencies
echo "Verifying critical dependencies..."
if ! npm list @modelcontextprotocol/sdk &> /dev/null; then
    echo "WARNING: MCP SDK not found. This may cause issues."
fi
if ! npm list typescript &> /dev/null; then
    echo "WARNING: TypeScript not found. Build may fail."
fi
echo "✓ Dependency verification complete."

# Create required VibeCoderOutput directories (for tools that save files)
echo "Creating required VibeCoderOutput directories..."
mkdir -p VibeCoderOutput # Ensure base dir exists
# Core tool output directories:
mkdir -p VibeCoderOutput/research-manager
mkdir -p VibeCoderOutput/rules-generator
mkdir -p VibeCoderOutput/prd-generator
mkdir -p VibeCoderOutput/user-stories-generator
mkdir -p VibeCoderOutput/task-list-generator
mkdir -p VibeCoderOutput/fullstack-starter-kit-generator
mkdir -p VibeCoderOutput/workflow-runner
mkdir -p VibeCoderOutput/code-map-generator
mkdir -p VibeCoderOutput/vibe-task-manager
# Agent coordination directories:
mkdir -p VibeCoderOutput/agent-registry
mkdir -p VibeCoderOutput/agent-tasks
mkdir -p VibeCoderOutput/agent-response
echo "✓ Output directories created."

# Build TypeScript
echo "Building TypeScript project..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: TypeScript build failed (npm run build). Check compiler output above."
    echo "Common fixes:"
    echo "  - Check for TypeScript syntax errors"
    echo "  - Ensure all dependencies are installed"
    echo "  - Try: npm run lint to check for issues"
    exit 1
fi
echo "✓ TypeScript project built successfully."

# Verify build output
echo "Verifying build output..."
if [ ! -f "build/index.js" ]; then
    echo "ERROR: build/index.js not found after build. Build may have failed silently."
    exit 1
fi
echo "✓ Build verification complete."

# Ensure the built file is executable
echo "Setting executable permissions for build/index.js..."
chmod +x build/index.js
echo "✓ Executable permissions set."

# Verify configuration files
echo "Verifying configuration files..."
if [ ! -f "llm_config.json" ]; then
    echo "ERROR: llm_config.json not found. This file is required for LLM model mappings."
    exit 1
fi
if [ ! -f "mcp-config.json" ]; then
    echo "ERROR: mcp-config.json not found. This file is required for MCP tool configurations."
    exit 1
fi
echo "✓ Configuration files verified."

# Check if .env file exists, copy from .env.example if not
echo "Checking for .env file..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Creating .env file from template (.env.example)..."
        cp .env.example .env
        echo "IMPORTANT: .env file created from template."
        echo "You MUST edit .env to add your OPENROUTER_API_KEY before starting the server."
    else
        echo "ERROR: .env.example template is missing. Cannot create .env file."
        echo "Please create .env manually with your OPENROUTER_API_KEY."
        exit 1
    fi
else
     echo "✓ .env file already exists. (Ensure it contains OPENROUTER_API_KEY)"
fi

echo ""
echo "🎉 Setup completed successfully!"
echo "=================================================="
echo "Vibe Coder MCP Server v2.0 (Production Ready) is now set up with 15+ specialized tools:"
echo ""
echo "📋 PLANNING & DOCUMENTATION TOOLS:"
echo "  - Research Manager (research-manager) - AI-powered research with Perplexity Sonar"
echo "  - PRD Generator (generate-prd) - Comprehensive Product Requirements Documents"
echo "  - User Stories Generator (generate-user-stories) - Agile user stories with acceptance criteria"
echo "  - Task List Generator (generate-task-list) - Development task breakdown with dependencies"
echo "  - Rules Generator (generate-rules) - Development guidelines and coding standards"
echo ""
echo "🏗️ PROJECT SCAFFOLDING & CODE ANALYSIS:"
echo "  - Fullstack Starter Kit Generator (generate-fullstack-starter-kit) - Complete project scaffolding"
echo "  - Code Map Generator (map-codebase) - Semantic codebase analysis (30+ languages, 95% token reduction)"
echo ""
echo "🤖 TASK MANAGEMENT & AUTOMATION:"
echo "  - Vibe Task Manager (vibe-task-manager) - AI-agent-native task management with RDD methodology"
echo "  - Workflow Runner (run-workflow) - Predefined development workflow execution"
echo "  - Job Result Retriever (get-job-result) - Asynchronous task result management with real-time polling"
echo ""
echo "🔗 AGENT COORDINATION & COMMUNICATION:"
echo "  - Agent Registry (register-agent) - Register AI agents for task coordination"
echo "  - Agent Tasks (get-agent-tasks) - Retrieve assigned tasks for agents"
echo "  - Agent Response (submit-task-response) - Submit completed task results"
echo "  - Process Request (process-request) - Unified request processing with semantic routing"
echo ""
echo "🔧 ADVANCED FEATURES:"
echo "  - Semantic Routing & Sequential Thinking for intelligent tool selection"
echo "  - Asynchronous Job Handling with SSE notifications for long-running tasks"
echo "  - Multi-language support (30+ programming languages)"
echo "  - Agent coordination and autonomous development workflows"
echo "  - Unified communication protocol (stdio/SSE/WebSocket/HTTP)"
echo "  - Production-ready task management with zero mock code (99.8% test success rate)"
echo "  - Real-time agent orchestration and task assignment"
echo "  - Enhanced JSON parsing with 6-strategy progressive pipeline"
echo "  - Memory optimization with sophisticated caching"
echo "  - Security boundaries with separate read/write path validation"
echo ""
echo "⚠️  CRITICAL NEXT STEPS:"
echo "1. **REQUIRED**: Edit the .env file to add your valid OPENROUTER_API_KEY"
echo "   - Open .env in a text editor"
echo "   - Replace 'YOUR_OPENROUTER_API_KEY_HERE' with your actual API key"
echo "   - Save the file"
echo ""
echo "2. **OPTIONAL**: Review configuration files:"
echo "   - llm_config.json: LLM model mappings for different tasks"
echo "   - mcp-config.json: MCP tool configurations and routing patterns"
echo "   - workflows.json: Predefined workflow definitions"
echo ""
echo "3. **START THE SERVER**:"
echo "   - For Claude Desktop (stdio): npm start"
echo "   - For web clients (SSE): npm run start:sse"
echo "   - For development: npm run dev"
echo ""
echo "4. **CONFIGURE YOUR MCP CLIENT**:"
echo "   - Add server configuration to your MCP client settings"
echo "   - Use the paths shown in README.md for your specific client"
echo "   - Restart your MCP client after configuration"
echo ""
echo "5. **TEST THE SETUP**:"
echo "   - Try: 'Research modern JavaScript frameworks'"
echo "   - Try: 'vibe-task-manager create project \"Test Project\" \"Testing setup\"'"
echo "   - Try: 'map-codebase ./src'"
echo ""
echo "6. **ADVANCED USAGE**:"
echo "   - Use 'get-job-result <jobId>' to retrieve outcomes from long-running tasks"
echo "   - Register agents for coordination: 'register-agent' with capabilities"
echo "   - Use agent tools for distributed task execution and coordination"
echo ""
echo "📚 DOCUMENTATION:"
echo "   - README.md: Complete setup and usage guide"
echo "   - VIBE_CODER_MCP_SYSTEM_INSTRUCTIONS.md: System prompt documentation"
echo "   - docs/: Additional documentation and examples"
echo ""
echo "🧪 TESTING:"
echo "   - Run tests: npm test"
echo "   - Run E2E tests: npm run test:e2e"
echo "   - Check coverage: npm run coverage"
echo ""
