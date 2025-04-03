# Vibe Coder MCP Server

Vibe Coder is an MCP (Model Context Protocol) server designed to supercharge your AI assistant (like Cursor, Cline AI, or Claude Desktop) with powerful tools for software development. It helps with research, planning, generating requirements, creating starter projects, and more!

## Overview & Features

Vibe Coder MCP integrates with MCP-compatible clients to provide the following capabilities:

*   **Semantic Request Routing**: Intelligently routes requests using embedding-based semantic matching with sequential thinking fallbacks.
*   **Tool Registry Architecture**: Centralized tool management with self-registering tools.
*   **Direct LLM Calls**: Generator tools now use direct LLM calls for improved reliability and structured output control.
*   **Workflow Execution**: Runs predefined sequences of tool calls defined in `workflows.json`.
*   **Code Generation**: Creates code stubs and boilerplate (`generate-code-stub`).
*   **Code Refactoring**: Improves and modifies existing code snippets (`refactor-code`).
*   **Dependency Analysis**: Lists dependencies from manifest files (`analyze-dependencies`).
*   **Git Integration**: Summarizes current Git changes (`git-summary`).
*   **Research & Planning**: Performs deep research (`research-manager`) and generates planning documents like PRDs (`generate-prd`), user stories (`generate-user-stories`), task lists (`generate-task-list`), and development rules (`generate-rules`).
*   **Project Scaffolding**: Generates full-stack starter kits (`generate-fullstack-starter-kit`).
*   **Session State Management**: Maintains basic state across requests within a session (in-memory).
*   **Standardized Error Handling**: Consistent error patterns across all tools.

*(See "Detailed Tool Documentation" and "Feature Details" sections below for more)*

## Setup Guide

Follow these micro-steps to get the Vibe Coder MCP server running and connected to your AI assistant.

### Step 1: Prerequisites

1. **Check Node.js Version:**
   * Open a terminal or command prompt.
   * Run `node -v`
   * Ensure the output shows v18.0.0 or higher (required).
   * If not installed or outdated: Download from [nodejs.org](https://nodejs.org/).

2. **Check Git Installation:**
   * Open a terminal or command prompt.
   * Run `git --version`
   * If not installed: Download from [git-scm.com](https://git-scm.com/).

3. **Get OpenRouter API Key:**
   * Visit [openrouter.ai](https://openrouter.ai/)
   * Create an account if you don't have one.
   * Navigate to API Keys section.
   * Create a new API key and copy it.
   * Keep this key handy for Step 4.

### Step 2: Get the Code

1. **Create a Project Directory** (optional):
   * Open a terminal or command prompt.
   * Navigate to where you want to store the project:
     ```bash
     cd ~/Documents     # Example: Change to your preferred location
     ```

2. **Clone the Repository:**
   * Run:
     ```bash
     git clone https://github.com/freshtechbro/vibe-coder-mcp.git
     ```
     (Or use your fork's URL if applicable)

3. **Navigate to Project Directory:**
   * Run:
     ```bash
     cd vibe-coder-mcp
     ```

### Step 3: Run the Setup Script

Choose the appropriate script for your operating system:

**For Windows:**
1. In your terminal (still in the vibe-coder-mcp directory), run:
   ```batch
   setup.bat
   ```
2. Wait for the script to complete (it will install dependencies, build the project, and create necessary directories).
3. If you see any error messages, refer to the Troubleshooting section below.

**For macOS or Linux:**
1. Make the script executable:
   ```bash
   chmod +x setup.sh
   ```
2. Run the script:
   ```bash
   ./setup.sh
   ```
3. Wait for the script to complete.
4. If you see any error messages, refer to the Troubleshooting section below.

The script performs these actions:
* Checks Node.js version (v18+)
* Installs all dependencies via npm
* Creates necessary workflow-agent-files directories
* Builds the TypeScript project
* Creates a default `.env` file if one doesn't exist (you will populate this next).
* Sets executable permissions (on Unix systems)

### Step 4: Configure Environment Variables (`.env`)

1.  **Locate the `.env` File:**
    *   Find the `.env` file created by the setup script in the main `vibe-coder-mcp` directory.
    *   Open it with any text editor.

2.  **Add Your OpenRouter API Key:**
    *   Find the line: `OPENROUTER_API_KEY=your_openrouter_api_key_here`
    *   Replace `your_openrouter_api_key_here` with your actual OpenRouter API key.
    *   Do not add quotes around the key.

3.  **Configure Output Directory (Optional):**
    *   To change where generated files are saved (default is `workflow-agent-files/` inside the project), add this line:
        ```
        VIBE_CODER_OUTPUT_DIR=/path/to/your/desired/output/directory
        ```
    *   Replace the path with your preferred absolute path. Use forward slashes (`/`). If this variable is not set, the default directory will be used.

4.  **Review Other Settings (Optional):**
    *   Review model names (`GEMINI_MODEL`, `PERPLEXITY_MODEL`) to ensure they're available on your OpenRouter plan. The `llm_config.json` file provides more granular control per task if needed.
    *   Check `LOG_LEVEL` (default: info) - options include: 'fatal', 'error', 'warn', 'info', 'debug', 'trace'.

5.  **Save the `.env` File.**

### Step 5: Integrate with Your AI Assistant

This crucial step connects Vibe Coder to your AI assistant. Each environment requires slightly different configuration.

#### 5.1: Find Your Project's Absolute Path

You need the full, absolute path to the `build/index.js` file:

**For Windows:**
1. In your terminal, navigate to the build directory:
   ```batch
   cd build
   ```
2. Get the absolute path:
   ```batch
   echo %cd%\index.js
   ```
3. Copy the output (e.g., `C:\Users\YourName\Projects\vibe-coder-mcp\build\index.js`)

**For macOS/Linux:**
1. In your terminal, navigate to the build directory:
   ```bash
   cd build
   ```
2. Get the absolute path:
   ```bash
   pwd
   ```
3. Append `/index.js` to the output and copy the result (e.g., `/Users/YourName/Projects/vibe-coder-mcp/build/index.js`)

#### 5.2: Prepare the Configuration Block

Create a configuration block by:

1. Copy this JSON template:
   ```json
   "vibe-coder-mcp": {
     "command": "node",
     "args": ["PATH_PLACEHOLDER"],
     "env": {
       "NODE_ENV": "production"
       // API Keys and other sensitive config are now loaded via the .env file
       // You can optionally set VIBE_CODER_OUTPUT_DIR here if you prefer it over .env
       // "VIBE_CODER_OUTPUT_DIR": "/absolute/path/to/output"
     },
     "disabled": false,
     "autoApprove": [
       "research", 
       "generate-rules", 
       "generate-prd", 
       "generate-user-stories", 
       "generate-task-list",
       "generate-fullstack-starter-kit",
       "generate-code-stub",
       "refactor-code",
       "analyze-dependencies",
       "git-summary",
       "run-workflow"
     ]
   }
   ```

2. Replace `PATH_PLACEHOLDER` with the absolute path you obtained in Step 5.1.
   * Important: Use forward slashes `/` even on Windows (e.g., `C:/Users/...`)

3. **Important:** Do NOT put your `OPENROUTER_API_KEY` directly in this configuration block anymore. It should only be in your `.env` file.

#### 5.3: Configure Your Specific AI Assistant

##### A. Cursor AI / Windsurf (VS Code-based)

1. Open Cursor or Windsurf application.
2. Open Command Palette:
   * Windows/Linux: Press `Ctrl+Shift+P`
   * macOS: Press `Cmd+Shift+P`
3. Type and select: `Preferences: Open User Settings (JSON)`
4. In the JSON file, find or add the `mcpServers` object:
   * If it doesn't exist, add it: `"mcpServers": {}`
   * If it exists, locate the closing brace of this object
5. Add your configuration block inside the `mcpServers` object:
   * If other servers are listed, add a comma after the last one
   * Paste your configuration block from step 5.2
6. Save the file (`Ctrl+S` or `Cmd+S`)
7. Completely close and restart Cursor/Windsurf

Example of a complete settings.json section:
```json
"mcpServers": {
  "some-existing-server": {
    // existing configuration...
  },
  "vibe-coder-mcp": {
    "command": "node",
    "args": ["C:/Users/YourName/Projects/vibe-coder-mcp/build/index.js"],
    // Rest of your configuration...
  }
}
```

##### B. Cline AI (VS Code Extension)

1. Locate the Cline settings file:
   * **Windows**: `C:\Users\[YourUsername]\AppData\Roaming\Cursor\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json`
   * **macOS**: `~/Library/Application Support/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`
   * **Linux**: `~/.config/Cursor/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`

2. Open this file with a text editor.

3. Find or add the `mcpServers` object:
   * If the file is empty, add: `{"mcpServers": {}}`
   * If it exists but has no `mcpServers`, add it at the root level

4. Add your configuration block inside the `mcpServers` object:
   * If other servers are listed, add a comma after the last one
   * Paste your configuration block from step 5.2

5. Save the file.

6. Restart VS Code completely.

##### C. RooCode (VS Code Fork)

1. Open RooCode.
2. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).
3. Search for and select `Preferences: Open User Settings (JSON)`.
4. Follow the same steps as for Cursor AI (section A above).
5. Save and restart RooCode.

##### D. Claude Desktop

1. Locate the Claude Desktop settings file:
   * **Windows**: `C:\Users\[YourUsername]\AppData\Roaming\Claude\claude_desktop_config.json`
   * **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   * **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Open this file with a text editor.

3. Find or add the `mcpServers` object at the root level:
   * If file has other content, find where to add `mcpServers`
   * If it already has `mcpServers`, locate it

4. Add your configuration block inside the `mcpServers` object:
   * If other servers exist, add a comma after the last one
   * Paste your configuration block from step 5.2

5. Save the file.

6. Close and reopen Claude Desktop.

Example of a complete claude_desktop_config.json:
```json
{
  "theme": "system",
  "mcpServers": {
    "vibe-coder-mcp": {
      "command": "node",
      "args": ["/Users/YourName/Projects/vibe-coder-mcp/build/index.js"],
      "env": {
        "NODE_ENV": "production",
        "OPENROUTER_API_KEY": "your-openrouter-api-key",
        // Rest of your configuration...
      },
      "disabled": false,
      "autoApprove": [
        // Your auto-approve tools...
      ]
    }
  }
}
```

### Step 6: Test Your Configuration

1. **Start Your AI Assistant:**
   * Completely restart your AI assistant application.

2. **Test a Simple Command:**
   * Type a test command like: `Research modern JavaScript frameworks`

3. **Check for Proper Response:**
   * If working correctly, you should receive a research response.
   * If not, check the Troubleshooting section below.

## Project Architecture

The Vibe Coder MCP server follows a modular architecture centered around a tool registry pattern:

```mermaid
flowchart TD
    subgraph Initialization
        Init[index.ts] --> Config[Load Configuration]
        Config --> Server[Create MCP Server]
        Server --> ToolReg[Register Tools]
        ToolReg --> InitEmbed[Initialize Embeddings]
        InitEmbed --> Ready[Server Ready]
    end

    subgraph Request_Flow
        Req[Client Request] --> ReqProc[Request Processor]
        ReqProc --> Route[Routing System]
        Route --> Execute[Tool Execution]
        Execute --> Response[Response to Client]
    end

    subgraph Routing_System ["Routing System (Hybrid Matcher)"]
        Route --> Semantic[Semantic Matcher]
        Semantic --> |High Confidence| Registry[Tool Registry]
        Semantic --> |Low Confidence| SeqThink[Sequential Thinking]
        SeqThink --> Registry
    end

    subgraph Tool_Execution
        Registry --> |Get Definition| Definition[Tool Definition]
        Definition --> |Validate Input| ZodSchema[Zod Validation]
        ZodSchema --> |Execute| Executor[Tool Executor]
        Executor --> |May Use| Helper[Utility Helpers]
        Helper --> |Research| Research[Research Helper]
        Helper --> |File Ops| File[File I/O]
        Helper --> |Embeddings| Embed[Embedding Helper]
        Helper --> |Git| Git[Git Helper]
        Executor --> ReturnResult[Return Result]
    end

    subgraph Error_Handling
        ReturnResult --> |Success| Success[Success Response]
        ReturnResult --> |Error| ErrorHandler[Error Handler]
        ErrorHandler --> CustomErr[Custom Error Types]
        CustomErr --> FormattedErr[Formatted Error Response]
    end

    Execute --> |Session State| State[Session State]
    State --> |Persists Between Calls| ReqProc
```

## Directory Structure

```
vibe-coder-mcp/
├── .env                  # Environment configuration
├── mcp-config.json       # Example MCP configuration
├── package.json          # Project dependencies
├── README.md             # This documentation
├── setup.bat             # Windows setup script
├── setup.sh              # macOS/Linux setup script
├── tsconfig.json         # TypeScript configuration
├── vitest.config.ts      # Vitest (testing) configuration
├── workflows.json        # Workflow definitions
├── build/                # Compiled JavaScript (after build)
├── docs/                 # Additional documentation
├── VibeCoderOutput/      # Tool output directory
│   ├── research-manager/
│   ├── rules-generator/
│   ├── prd-generator/
│   ├── user-stories-generator/
│   ├── task-list-generator/
│   ├── fullstack-starter-kit-generator/
│   └── workflow-runner/
└── src/                  # Source code
    ├── index.ts          # Entry point
    ├── logger.ts         # Logging configuration (Pino)
    ├── server.ts         # MCP server setup
    ├── services/         # Core services
    │   ├── hybrid-matcher/    # Request routing orchestration
    │   ├── request-processor/ # Handles incoming requests
    │   ├── routing/           # Semantic routing & registry
    │   │   ├── embeddingStore.ts    # Tool embedding storage
    │   │   ├── semanticMatcher.ts   # Semantic matching
    │   │   └── toolRegistry.ts      # Tool registration/execution
    │   ├── state/               # Session state management
    │   │   └── sessionState.ts  # In-memory state storage
    │   └── workflows/           # Workflow execution
    │       └── workflowExecutor.ts  # Workflow engine
    ├── testUtils/        # Testing utilities
    │   └── mockLLM.ts    # Mock LLM for tests
    ├── tools/            # Tool implementations
    │   ├── index.ts      # Tool registration
    │   ├── sequential-thinking.ts  # Fallback routing
    │   ├── code-refactor-generator/  # Code refactoring
    │   ├── code-stub-generator/      # Code stub creation
    │   ├── dependency-analyzer/      # Dependency analysis
    │   ├── fullstack-starter-kit-generator/  # Project gen
    │   ├── git-summary-generator/    # Git integration
    │   ├── prd-generator/            # PRD creation
    │   ├── research-manager/         # Research tool
    │   ├── rules-generator/          # Rules creation
    │   ├── task-list-generator/      # Task lists
    │   ├── user-stories-generator/   # User stories
    │   └── workflow-runner/          # Workflow execution
    ├── types/            # TypeScript definitions
    │   ├── globals.d.ts
    │   ├── sequentialThought.ts
    │   ├── tools.ts
    │   └── workflow.ts
    └── utils/            # Shared utilities
        ├── embeddingHelper.ts  # Embedding generation
        ├── errors.ts           # Custom error classes
        ├── fileReader.ts       # File I/O
        ├── gitHelper.ts        # Git operations
        └── researchHelper.ts   # Research functionality
```

## Semantic Routing System

Vibe Coder uses a sophisticated routing approach to select the right tool for each request:

```mermaid
flowchart TD
    Start[Client Request] --> Process[Process Request]
    Process --> Hybrid[Hybrid Matcher]
    
    subgraph "Primary: Semantic Routing"
        Hybrid --> Semantic[Semantic Matcher]
        Semantic --> Embeddings[Query Embeddings]
        Embeddings --> Tools[Tool Embeddings]
        Tools --> Compare[Compare via Cosine Similarity]
        Compare --> Score[Score & Rank Tools]
        Score --> Confidence{High Confidence?}
    end
    
    Confidence -->|Yes| Registry[Tool Registry]
    
    subgraph "Fallback: Sequential Thinking"
        Confidence -->|No| Sequential[Sequential Thinking]
        Sequential --> LLM[LLM Analysis]
        LLM --> ThoughtChain[Thought Chain]
        ThoughtChain --> Extraction[Extract Tool Name]
        Extraction --> Registry
    end
    
    Registry --> Executor[Execute Tool]
    Executor --> Response[Return Response]
```

## Tool Registry Pattern

The Tool Registry is a central component for managing tool definitions and execution:

```mermaid
flowchart TD
    subgraph "Tool Registration (at import)"
        Import[Import Tool] --> Register[Call registerTool]
        Register --> Store[Store in Registry Map]
    end
    
    subgraph "Tool Definition"
        Def[ToolDefinition] --> Name[Tool Name]
        Def --> Desc[Description]
        Def --> Schema[Zod Schema]
        Def --> Exec[Executor Function]
    end
    
    subgraph "Server Initialization"
        Init[server.ts] --> Import
        Init --> GetAll[getAllTools]
        GetAll --> Loop[Loop Through Tools]
        Loop --> McpReg[Register with MCP Server]
    end
    
    subgraph "Tool Execution"
        McpReg --> ExecTool[executeTool Function]
        ExecTool --> GetTool[Get Tool from Registry]
        GetTool --> Validate[Validate Input]
        Validate -->|Valid| ExecFunc[Run Executor Function]
        Validate -->|Invalid| ValidErr[Return Validation Error]
        ExecFunc -->|Success| SuccessResp[Return Success Response]
        ExecFunc -->|Error| HandleErr[Catch & Format Error]
        HandleErr --> ErrResp[Return Error Response]
    end
```

## Sequential Thinking Process

The Sequential Thinking mechanism provides LLM-based fallback routing:

```mermaid
flowchart TD
    Start[Start] --> Estimate[Estimate Number of Steps]
    Estimate --> Init[Initialize with System Prompt]
    Init --> First[Generate First Thought]
    First --> Context[Add to Context]
    Context --> Loop{Needs More Thoughts?}
    
    Loop -->|Yes| Next[Generate Next Thought]
    Next -->|Standard| AddStd[Add to Context]
    Next -->|Revision| Rev[Mark as Revision]
    Next -->|New Branch| Branch[Mark as Branch]
    Rev --> AddRev[Add to Context]
    Branch --> AddBranch[Add to Context]
    AddStd --> Loop
    AddRev --> Loop
    AddBranch --> Loop
    
    Loop -->|No| Extract[Extract Final Solution]
    Extract --> End[End With Tool Selection]
    
    subgraph "Error Handling"
        Next -->|Error| Retry[Retry with Simplified Request]
        Retry -->|Success| AddRetry[Add to Context]
        Retry -->|Failure| FallbackEx[Extract Partial Solution]
        AddRetry --> Loop
        FallbackEx --> End
    end
```

## Session State Management

```mermaid
flowchart TD
    Start[Client Request] --> SessionID[Extract Session ID]
    SessionID --> Store{State Exists?}
    
    Store -->|Yes| Retrieve[Retrieve Previous State]
    Store -->|No| Create[Create New State]
    
    Retrieve --> Context[Add Context to Tool]
    Create --> NoContext[Execute Without Context]
    
    Context --> Execute[Execute Tool]
    NoContext --> Execute
    
    Execute --> SaveState[Update Session State]
    SaveState --> Response[Return Response to Client]
    
    subgraph "Session State Structure"
        State[SessionState] --> PrevCall[Previous Tool Call]
        State --> PrevResp[Previous Response]
        State --> Timestamp[Timestamp]
    end
```

## Workflow Execution Engine

The Workflow system enables multi-step sequences:

```mermaid
flowchart TD
    Start[Client Request] --> Parse[Parse Workflow Request]
    Parse --> FindFlow[Find Workflow in workflows.json]
    FindFlow --> Steps[Extract Steps]
    
    Steps --> Loop[Process Each Step]
    Loop --> PrepInput[Prepare Step Input]
    PrepInput --> ExecuteTool[Execute Tool via Registry]
    ExecuteTool --> SaveOutput[Save Step Output]
    SaveOutput --> NextStep{More Steps?}
    
    NextStep -->|Yes| MapOutput[Map Output to Next Input]
    MapOutput --> Loop
    
    NextStep -->|No| FinalOutput[Prepare Final Output]
    FinalOutput --> End[Return Workflow Result]
    
    subgraph "Input/Output Mapping"
        MapOutput --> Direct[Direct Value]
        MapOutput --> Extract[Extract From Previous]
        MapOutput --> Transform[Transform Values]
    end
```

## Workflow Configuration

Workflows are defined in the `workflows.json` file located in the root directory of the project. This file contains predefined sequences of tool calls that can be executed with a single command.

### File Location and Structure

- The `workflows.json` file must be placed in the project root directory (same level as package.json)
- The file follows this structure:
  ```json
  {
    "workflows": {
      "workflowName1": {
        "description": "Description of what this workflow does",
        "inputSchema": {
          "param1": "string",
          "param2": "string"
        },
        "steps": [
          {
            "id": "step1_id",
            "toolName": "tool-name",
            "params": {
              "param1": "{workflow.input.param1}"
            }
          },
          {
            "id": "step2_id",
            "toolName": "another-tool",
            "params": {
              "paramA": "{workflow.input.param2}",
              "paramB": "{steps.step1_id.output.content[0].text}"
            }
          }
        ],
        "output": {
          "summary": "Workflow completed message",
          "details": ["Output line 1", "Output line 2"]
        }
      }
    }
  }
  ```

### Parameter Templates

Workflow step parameters support template strings that can reference:
- Workflow inputs: `{workflow.input.paramName}`
- Previous step outputs: `{steps.stepId.output.content[0].text}`

### Triggering Workflows

Use the `run-workflow` tool with:
```
Run the newProjectSetup workflow with input {"productDescription": "A task manager app"}
```

## Detailed Tool Documentation

Each tool in the `src/tools/` directory includes comprehensive documentation in its own README.md file. These files cover:

*   Tool overview and purpose
*   Input/output specifications
*   Workflow diagrams (Mermaid)
*   Usage examples
*   System prompts used
*   Error handling details

Refer to these individual READMEs for in-depth information:

*   `src/tools/code-refactor-generator/README.md`
*   `src/tools/code-stub-generator/README.md`
*   `src/tools/dependency-analyzer/README.md`
*   `src/tools/fullstack-starter-kit-generator/README.md`
*   `src/tools/git-summary-generator/README.md`
*   `src/tools/prd-generator/README.md`
*   `src/tools/research-manager/README.md`
*   `src/tools/rules-generator/README.md`
*   `src/tools/task-list-generator/README.md`
*   `src/tools/user-stories-generator/README.md`
*   `src/tools/workflow-runner/README.md`

## Tool Categories

### Code Generation & Refactoring Tools

*   **Code Stub Generator (`generate-code-stub`)**: Creates boilerplate code (functions, classes, etc.) based on a description and target language. Useful for quickly scaffolding new components.
*   **Code Refactor Generator (`refactor-code`)**: Takes an existing code snippet and refactoring instructions (e.g., "convert to async/await", "improve readability", "add error handling") and returns the modified code.

### Analysis & Information Tools

*   **Dependency Analyzer (`analyze-dependencies`)**: Parses manifest files like `package.json` or `requirements.txt` to list project dependencies.
*   **Git Summary Generator (`git-summary`)**: Provides a summary of the current Git status, showing staged or unstaged changes (diff). Useful for quick checks before committing.
*   **Research Manager (`research-manager`)**: Performs deep research on technical topics using Perplexity Sonar, providing summaries and sources.

### Planning & Documentation Tools

*   **Rules Generator (`generate-rules`):** Creates project-specific development rules and guidelines.
*   **PRD Generator (`generate-prd`):** Generates comprehensive product requirements documents.
*   **User Stories Generator (`generate-user-stories`):** Creates detailed user stories with acceptance criteria.
*   **Task List Generator (`generate-task-list`):** Builds structured development task lists with dependencies.

### Project Scaffolding Tool

*   **Fullstack Starter Kit Generator (`generate-fullstack-starter-kit`):** Creates customized project starter kits with specified frontend/backend technologies, including basic setup scripts and configuration.

### Workflow & Orchestration

*   **Workflow Runner (`run-workflow`):** Executes predefined sequences of tool calls for common development tasks.

## Generated File Storage

By default, outputs from the generator tools are stored for historical reference in the `VibeCoderOutput/` directory within the project. This location can be overridden by setting the `VIBE_CODER_OUTPUT_DIR` environment variable in your `.env` file or AI assistant configuration.

Example structure (default location):
```
VibeCoderOutput/
  ├── research-manager/         # Research reports
  │   └── TIMESTAMP-QUERY-research.md
  ├── rules-generator/          # Development rules
  │   └── TIMESTAMP-PROJECT-rules.md
  ├── prd-generator/            # PRDs
  │   └── TIMESTAMP-PROJECT-prd.md
  ├── user-stories-generator/   # User stories
  │   └── TIMESTAMP-PROJECT-user-stories.md
  ├── task-list-generator/      # Task lists
  │   └── TIMESTAMP-PROJECT-task-list.md
  ├── fullstack-starter-kit-generator/  # Project templates
  │   └── TIMESTAMP-PROJECT/
  └── workflow-runner/          # Workflow outputs
      └── TIMESTAMP-WORKFLOW/
```

## Usage Examples

Interact with the tools via your connected AI assistant:

*   **Research:** `Research modern JavaScript frameworks`
*   **Generate Rules:** `Create development rules for a mobile banking application`
*   **Generate PRD:** `Generate a PRD for a task management application`
*   **Generate User Stories:** `Generate user stories for an e-commerce website`
*   **Generate Task List:** `Create a task list for a weather app based on [user stories]`
*   **Sequential Thinking:** `Think through the architecture for a microservices-based e-commerce platform`
*   **Fullstack Starter Kit:** `Create a starter kit for a React/Node.js blog application with user authentication`
*   **Generate Code Stub:** `Generate a python function stub named 'calculate_discount' that takes price and percentage`
*   **Refactor Code:** `Refactor this code to use async/await: [paste code snippet]`
*   **Analyze Dependencies:** `Analyze dependencies in package.json`
*   **Git Summary:** `Show unstaged git changes`
*   **Run Workflow:** `Run workflow newProjectSetup with input { "projectName": "my-new-app", "description": "A simple task manager" }`

## Running Locally (Optional)

While the primary use is integration with an AI assistant (using stdio), you can run the server directly for testing:

### Running Modes

*   **Production Mode (Stdio):** 
    ```bash
    npm start
    ```
    * Logs go to stderr (mimics AI assistant launch)
    * Use NODE_ENV=production

*   **Development Mode (Stdio, Pretty Logs):** 
    ```bash
    npm run dev
    ```
    * Logs go to stdout with pretty formatting
    * Requires `nodemon` and `pino-pretty`
    * Use NODE_ENV=development

*   **SSE Mode (HTTP Interface):** 
    ```bash
    # Production mode over HTTP
    npm run start:sse
    
    # Development mode over HTTP
    npm run dev:sse
    ```
    * Uses HTTP instead of stdio
    * Configured via PORT in .env (default: 3000)
    * Access at http://localhost:3000

## Detailed Troubleshooting

### Connection Issues

#### MCP Server Not Detected in AI Assistant

1. **Check Configuration Path:**
   * Verify the absolute path in the `args` array is correct
   * Ensure all slashes are forward slashes `/` even on Windows
   * Run `node <path-to-build/index.js>` directly to test if Node can find it

2. **Check Configuration Format:**
   * Make sure JSON is valid without syntax errors
   * Check that commas between properties are correct
   * Verify that the `mcpServers` object contains your server

3. **Restart the Assistant:**
   * Completely close (not just minimize) the application
   * Reopen and try again

#### Server Starts But Tools Don't Work

1. **Check Disabled Flag:**
   * Ensure `"disabled": false` is set
   * Remove any `//` comments as JSON doesn't support them

2. **Verify autoApprove Array:**
   * Check that tool names in the `autoApprove` array match exactly
   * Try adding `"process-request"` to the array if using hybrid routing

### API Key Issues

1. **OpenRouter Key Problems:**
   * Double-check that the key is correctly copied
   * Verify the key is active in your OpenRouter dashboard
   * Check if you have sufficient credits

2. **Environment Variable Issues:**
   * Verify the key is correct in both:
     * The `.env` file (for local runs)
     * Your AI assistant's configuration env block

### Path & Permission Issues

1. **Build Directory Not Found:**
   * Run `npm run build` to ensure the build directory exists
   * Check if build output is going to a different directory (check tsconfig.json)

2. **File Permission Errors:**
   * Ensure your user has write access to the workflow-agent-files directory
   * On Unix systems, check if build/index.js has execute permission

### Log Debugging

1. **For Local Runs:**
   * Check the console output for error messages
   * Try running with `LOG_LEVEL=debug` in your `.env` file

2. **For AI Assistant Runs:**
   * Set `"NODE_ENV": "production"` in the env configuration
   * Check if the assistant has a logging console or output window

### Tool-Specific Issues

1. **Semantic Routing Not Working:**
   * First run may download embedding model - check for download messages
   * Try a more explicit request that mentions the tool name

2. **Git Summary Tool
