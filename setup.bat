@echo off
REM Setup script for Vibe Coder MCP Server (Updated)

echo Setting up Vibe Coder MCP Server...
echo ==================================================

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed. Please install Node.js and npm first.
    exit /b 1
)
echo npm is installed.

REM Check Node.js version (require v18+)
echo Checking Node.js version...
SET MAJOR_NODE_VERSION=
FOR /F "tokens=1 delims=v." %%a IN ('node -v') DO SET MAJOR_NODE_VERSION=%%a

powershell -Command "if ($env:MAJOR_NODE_VERSION -eq $null -or $env:MAJOR_NODE_VERSION -eq '') { Write-Warning 'Could not determine Node.js major version. Proceeding anyway...'; exit 0 } elseif ([int]$env:MAJOR_NODE_VERSION -lt 18) { Write-Error 'Node.js v18+ is required (found v$env:MAJOR_NODE_VERSION). Please upgrade Node.js.'; exit 1 } else { Write-Host \"Node.js version $env:MAJOR_NODE_VERSION detected (v18+ required) - OK.\"; exit 0 }"
if %ERRORLEVEL% neq 0 (
    exit /b 1
)

REM Install dependencies
echo Installing dependencies...
call npm install
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm install failed. Check npm logs above.
    exit /b 1
)
echo Dependencies installed successfully.

REM Create required VibeCoderOutput directories (for tools that save files)
echo Creating required VibeCoderOutput directories...
if not exist "VibeCoderOutput" mkdir "VibeCoderOutput"
REM Original tool output dirs:
if not exist "VibeCoderOutput\research-manager" mkdir "VibeCoderOutput\research-manager"
if not exist "VibeCoderOutput\rules-generator" mkdir "VibeCoderOutput\rules-generator"
if not exist "VibeCoderOutput\prd-generator" mkdir "VibeCoderOutput\prd-generator"
if not exist "VibeCoderOutput\user-stories-generator" mkdir "VibeCoderOutput\user-stories-generator"
if not exist "VibeCoderOutput\task-list-generator" mkdir "VibeCoderOutput\task-list-generator"
if not exist "VibeCoderOutput\fullstack-starter-kit-generator" mkdir "VibeCoderOutput\fullstack-starter-kit-generator"
REM Additional tool output dirs:
if not exist "VibeCoderOutput\workflow-runner" mkdir "VibeCoderOutput\workflow-runner"
if not exist "VibeCoderOutput\code-map-generator" mkdir "VibeCoderOutput\code-map-generator"
if not exist "VibeCoderOutput\vibe-task-manager" mkdir "VibeCoderOutput\vibe-task-manager"
REM New tools generally don't save files here by default.

REM Build TypeScript project
echo Building TypeScript project...
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: TypeScript build failed (npm run build). Check compiler output above.
    exit /b 1
)
echo TypeScript project built successfully.

REM Check if .env file exists, copy from .env.example if not
echo Checking for .env file...
if not exist ".env" (
    if exist ".env.example" (
        echo Creating .env file from template (.env.example)...
        copy ".env.example" ".env" > nul
        echo IMPORTANT: .env file created from template. Please edit it now to add your required OPENROUTER_API_KEY.
    ) else (
        echo WARNING: .env file not found and .env.example template is missing. Cannot create .env. Please create it manually with your OPENROUTER_API_KEY.
    )
) else (
    echo .env file already exists. Skipping creation. (Ensure it contains OPENROUTER_API_KEY)
)

echo.
echo Setup script completed successfully!
echo ==================================================
echo Vibe Coder MCP Server v1.1.0 is now set up with 13+ specialized tools:
echo.
echo 📋 PLANNING ^& DOCUMENTATION TOOLS:
echo   - Research Manager (research-manager) - AI-powered research with multiple models
echo   - PRD Generator (generate-prd) - Product Requirements Documents
echo   - User Stories Generator (generate-user-stories) - Agile user stories with acceptance criteria
echo   - Task List Generator (generate-task-list) - Development task breakdown with dependencies
echo   - Rules Generator (generate-rules) - Development guidelines and coding standards
echo.
echo 🏗️ PROJECT SCAFFOLDING ^& CODE ANALYSIS:
echo   - Fullstack Starter Kit Generator (generate-fullstack-starter-kit) - Complete project scaffolding
echo   - Code Map Generator (map-codebase) - Semantic codebase analysis with Mermaid diagrams
echo.
echo 🤖 TASK MANAGEMENT ^& AUTOMATION:
echo   - Vibe Task Manager (vibe-task-manager) - AI-agent-native task management with RDD methodology
echo   - Workflow Runner (run-workflow) - Predefined development workflow execution
echo   - Job Result Retriever (get-job-result) - Asynchronous task result management
echo.
echo 🔗 AGENT COORDINATION ^& COMMUNICATION:
echo   - Agent Registry (register-agent) - Register AI agents for task coordination
echo   - Agent Tasks (get-agent-tasks) - Retrieve assigned tasks for agents
echo   - Agent Response (submit-task-response) - Submit completed task results
echo.
echo 🔧 ADVANCED FEATURES:
echo   - Semantic Routing ^& Sequential Thinking for intelligent tool selection
echo   - Asynchronous Job Handling with SSE notifications for long-running tasks
echo   - Multi-language support (30+ programming languages)
echo   - Agent coordination and autonomous development workflows
echo   - Unified communication protocol (stdio/SSE/WebSocket/HTTP)
echo   - Production-ready task management with zero mock code
echo   - Real-time agent orchestration and task assignment
echo.
echo IMPORTANT NEXT STEPS:
echo 1. **REQUIRED**: Edit the .env file to add your valid OPENROUTER_API_KEY
echo 2. Review default models in .env (GEMINI_MODEL, PERPLEXITY_MODEL) for your OpenRouter plan
echo 3. Review workflow definitions in workflows.json for the run-workflow tool
echo 4. Start the server:
echo    - For Claude Desktop (stdio): npm start
echo    - For web clients (SSE): npm run start:sse
echo 5. Configure Claude Desktop MCP settings using mcp-config.json
echo 6. Use 'get-job-result' tool to retrieve outcomes from long-running tasks
echo 7. Try the Vibe Task Manager: 'vibe-task-manager create project "My Project" "Description"'
echo 8. Register agents for coordination: 'register-agent' with capabilities and transport type
echo 9. Use agent tools for distributed task execution and coordination
echo.
