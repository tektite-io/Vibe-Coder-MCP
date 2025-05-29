#!/bin/bash
# Setup script for Vibe Coder MCP Server (Updated)
set -e # Exit immediately if a command exits with a non-zero status.

echo "Setting up Vibe Coder MCP Server..."
echo "=================================================="

# Check if npm is installed
echo "Checking if npm is installed..."
if ! command -v npm &> /dev/null; then
    echo "ERROR: npm is not installed. Please install Node.js and npm first."
    exit 1
fi
echo "npm is installed."

# Check Node.js version (require v18+)
echo "Checking Node.js version..."
node_version=$(node -v | cut -d "v" -f 2 | cut -d "." -f 1)
if [ "$node_version" -lt 18 ]; then
    echo "ERROR: Node.js v18+ is required (found v$(node -v)). Please upgrade Node.js."
    exit 1
fi
echo "Node.js version check passed (found v$(node -v))."

# Install dependencies
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: npm install failed. Check npm logs above."
    exit 1
fi
echo "Dependencies installed successfully."

# Create required VibeCoderOutput directories (for tools that save files)
echo "Creating required VibeCoderOutput directories..."
mkdir -p VibeCoderOutput # Ensure base dir exists
# Original tool output dirs:
mkdir -p VibeCoderOutput/research-manager
mkdir -p VibeCoderOutput/rules-generator
mkdir -p VibeCoderOutput/prd-generator
mkdir -p VibeCoderOutput/user-stories-generator
mkdir -p VibeCoderOutput/task-list-generator
mkdir -p VibeCoderOutput/fullstack-starter-kit-generator
# Additional tool output dirs:
mkdir -p VibeCoderOutput/workflow-runner
mkdir -p VibeCoderOutput/code-map-generator
mkdir -p VibeCoderOutput/vibe-task-manager
# New tools generally don't save files here by default.

# Build TypeScript
echo "Building TypeScript project..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: TypeScript build failed (npm run build). Check compiler output above."
    exit 1
fi
echo "TypeScript project built successfully."

# Ensure the built file is executable
echo "Setting executable permissions for build/index.js..."
chmod +x build/index.js
echo "Executable permissions set."

# Check if .env file exists, copy from .env.example if not
echo "Checking for .env file..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Creating .env file from template (.env.example)..."
        cp .env.example .env
        echo "IMPORTANT: .env file created from template. Please edit it now to add your required OPENROUTER_API_KEY."
    else
        echo "WARNING: .env file not found and .env.example template is missing. Cannot create .env. Please create it manually with your OPENROUTER_API_KEY."
    fi
else
     echo ".env file already exists. Skipping creation. (Ensure it contains OPENROUTER_API_KEY)"
fi

echo ""
echo "Setup script completed successfully!"
echo "=================================================="
echo "Vibe Coder MCP Server v1.1.0 is now set up with 10 core tools:"
echo ""
echo "📋 PLANNING & DOCUMENTATION TOOLS:"
echo "  - Research Manager (research-manager) - AI-powered research with multiple models"
echo "  - PRD Generator (generate-prd) - Product Requirements Documents"
echo "  - User Stories Generator (generate-user-stories) - Agile user stories with acceptance criteria"
echo "  - Task List Generator (generate-task-list) - Development task breakdown with dependencies"
echo "  - Rules Generator (generate-rules) - Development guidelines and coding standards"
echo ""
echo "🏗️ PROJECT SCAFFOLDING & CODE ANALYSIS:"
echo "  - Fullstack Starter Kit Generator (generate-fullstack-starter-kit) - Complete project scaffolding"
echo "  - Code Map Generator (map-codebase) - Semantic codebase analysis with Mermaid diagrams"
echo ""
echo "🤖 TASK MANAGEMENT & AUTOMATION:"
echo "  - Vibe Task Manager (vibe-task-manager) - AI-agent-native task management with RDD methodology"
echo "  - Workflow Runner (run-workflow) - Predefined development workflow execution"
echo "  - Job Result Retriever (get-job-result) - Asynchronous task result management"
echo ""
echo "🔧 ADVANCED FEATURES:"
echo "  - Semantic Routing & Sequential Thinking for intelligent tool selection"
echo "  - Asynchronous Job Handling with SSE notifications for long-running tasks"
echo "  - Multi-language support (30+ programming languages)"
echo "  - Agent coordination and autonomous development workflows"
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "1. **REQUIRED**: Edit the .env file to add your valid OPENROUTER_API_KEY"
echo "2. Review default models in .env (GEMINI_MODEL, PERPLEXITY_MODEL) for your OpenRouter plan"
echo "3. Review workflow definitions in workflows.json for the run-workflow tool"
echo "4. Start the server:"
echo "   - For Claude Desktop (stdio): npm start"
echo "   - For web clients (SSE): npm run start:sse"
echo "5. Configure Claude Desktop MCP settings using mcp-config.json"
echo "6. Use 'get-job-result' tool to retrieve outcomes from long-running tasks"
echo "7. Try the Vibe Task Manager: 'vibe-task-manager create project \"My Project\" \"Description\"'"
echo ""
