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
echo "Installing dependencies (including simple-git, @xenova/transformers)..."
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
# New tools (code-gen, git, etc.) generally don't save files here by default.

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

# Check if .env file exists, create if not
echo "Checking for .env file..."
if [ ! -f .env ]; then
    echo "Creating default .env file..."
    cat > .env << EOF
# OpenRouter Configuration (REQUIRED)
OPENROUTER_API_KEY=your_openrouter_api_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
# Model Selection (Defaults - check OpenRouter for availability/alternatives)
GEMINI_MODEL=google/gemini-pro # Or another suitable generation model
PERPLEXITY_MODEL=perplexity/sonar-small-online # Or another suitable research model

# Server Configuration
PORT=3000
NODE_ENV=production
# Log level: 'fatal', 'error', 'warn', 'info', 'debug', 'trace'
LOG_LEVEL=info
EOF
    echo "IMPORTANT: Default .env file created. Please edit it now to add your required OPENROUTER_API_KEY."
else
     echo ".env file already exists. Skipping creation. (Ensure it contains OPENROUTER_API_KEY)"
fi

echo ""
echo "Setup script completed successfully!"
echo "=================================================="
echo "Vibe Coder MCP Server is now set up with core features:"
echo "  - Planning & Documentation Tools (PRD, User Stories, Tasks, Rules)"
echo "  - Project Scaffolding (Fullstack Starter Kit)"
echo "  - Code Generation & Refactoring Tools"
echo "  - Analysis Tools (Dependencies, Git Summary)"
echo "  - Research Manager (using configured models)"
echo "  - Workflow Runner (using workflows.json)"
echo "  - Semantic Routing & Sequential Thinking"
echo "  - Asynchronous Job Handling Infrastructure (partially implemented)"
echo ""
echo "IMPORTANT NEXT STEPS:"
echo "1. If you haven't already, **edit the .env file** to add your valid OPENROUTER_API_KEY."
echo "2. Review the default models in \`.env\` (GEMINI_MODEL, PERPLEXITY_MODEL) and ensure they fit your needs/OpenRouter plan."
echo "3. Review workflow definitions in \`workflows.json\` if you plan to use the \`run-workflow\` tool."
echo "4. To run the server (using stdio for Claude Desktop): npm start"
echo "5. To run the server (using SSE on http://localhost:3000): npm run start:sse"
echo "6. For Claude Desktop integration, update its MCP settings using the current \`mcp-config.json\` and ensure the path in Claude's config points to \`build/index.js\`."
echo ""
