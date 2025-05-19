# Code-Map Generator Tool (`map-codebase`)

## Overview

The "Code-Map Generator" (invoked as `map-codebase`) is a high-performance, language-agnostic tool designed to recursively scan a target codebase, extract structural and semantic information, and produce a context-rich map. This map is intended for consumption by downstream AI agents, enabling them to understand the codebase's architecture and intent, not just its symbols.

**Core Value Proposition:** Contextual intelligence at speed.

## Features

*   **Full-Project Indexing with Semantic Capture:**
    *   Recursively scans the target repository.
    *   Parses files using Tree-sitter.
    *   Harvests classes, functions, methods, imports, and inheritance relationships.
    *   Crucially, captures associated **doc-strings and inline comments**.
    *   Infers one-liner summaries if no comment exists (using name heuristics).
*   **Rich Metadata Injection:**
    *   Embeds semantic text tags (extracted comments/doc-strings or auto-generated summaries) for every symbol, file, and diagram node.
*   **Relationship Diagrams:**
    *   Auto-generates **Mermaid** graphs for:
        *   File dependencies.
        *   Class inheritance hierarchies.
        *   Function call-flows (heuristic).
        *   Method call sequences.
    *   Nodes and edges in diagrams are annotated with their semantic text.
*   **Token-Efficient, Context-Dense Output:**
    *   Delivers a Markdown bundle.
    *   File entries clearly list symbols with their associated semantic blurbs.
    *   Excludes full code bodies to maintain token efficiency.
*   **Asynchronous Design & Performance:**
    *   Utilizes asynchronous file system operations and batched parsing.
    *   Implements parse caches (based on file modification time and size) to skip unchanged files for faster subsequent runs.
*   **Seamless MCP Exposure:**
    *   Auto-registers with the Vibe-Coder-MCP server.
    *   Invokable via the command `map-codebase` or through natural language queries like "Generate a semantic code map for /path/to/project".

## Configuration

The tool has been designed with simplicity in mind, requiring minimal configuration:

### Required Configuration

You can specify the allowed mapping directory in one of two ways:

1. **In the Claude Desktop config file**:
```javascript
{
  "tools": {
    "vibe-coder-mcp": {
      "config": {
        "map-codebase": {
          "allowedMappingDirectory": "/absolute/path/to/directory"
        }
      }
    }
  }
}
```

2. **Using environment variables**:
```javascript
{
  "tools": {
    "vibe-coder-mcp": {
      "env": {
        "CODE_MAP_ALLOWED_DIR": "/absolute/path/to/directory",
        "VIBE_CODER_OUTPUT_DIR": "/path/to/output/directory"
      }
    }
  }
}
```

### Configuration Details

* `allowedMappingDirectory` or `CODE_MAP_ALLOWED_DIR` (required): The absolute path to the directory that the code-map generator is allowed to scan. This is a security boundary - the tool will not access files outside this directory.

* `VIBE_CODER_OUTPUT_DIR` (optional): The base directory for all Vibe Coder MCP outputs. If not specified, defaults to `./VibeCoderOutput` in the current working directory.

### Directory Structure

The tool automatically creates the following directory structure:

* **Output Directory**: `${VIBE_CODER_OUTPUT_DIR}/code-map-generator`
* **Cache Directory**: `${VIBE_CODER_OUTPUT_DIR}/code-map-generator/.cache`

### Advanced Configuration

The tool still supports the following advanced configuration options, but they are now optional and have sensible defaults:

* `cache.enabled`: Whether the cache is enabled. Default is true.
* `processing.batchSize`: Number of files to process in each batch. Default is 100.
* `processing.maxMemoryUsage`: Maximum memory usage in MB before triggering garbage collection. Default is 1024 (1GB).

## Input Parameters

The tool accepts the following parameters within the `arguments` object when called:

*   `ignored_files_patterns` (optional, array of strings): An array of regular expression patterns for file or directory names/paths to ignore during scanning. Paths are matched relative to the project root.
    *   Default ignored patterns include common folders like `node_modules`, `.git`, `dist`, `build`, test folders, and various binary/log file extensions.
    *   Example: `"ignored_files_patterns": ["specific_folder_to_ignore", "\\\\.test\\\\.js$"]` (Note: regex strings need to be JSON escaped, so backslashes are doubled)
*   `output_format` (optional, string, enum: `markdown`): Specifies the desired output format. Currently, only `markdown` is supported. Defaults to `markdown`.
    *   Example: `"output_format": "markdown"`

## Output Format (Markdown)

The tool generates a single Markdown string containing:
1.  A summary of the codebase scan.
2.  Mermaid diagrams for:
    *   File Dependencies
    *   Class Inheritance
    *   Function Call Graph (Heuristic)
    *   Method Call Sequence
3.  A detailed, file-by-file breakdown of extracted symbols (classes, functions, imports) with their associated semantic comments.

**Example Snippet from Detailed Code Structure:**

```markdown
## File: src/services/auth.py
*Authentication helpers and middleware*

### Imports
- `flask` (current_user, login_required)
- `.models` (User)

### Classes
- **AuthManager** — *Central login/logout controller for user sessions.*
  - `login(user_credentials)` — *Validates user credentials and establishes a new session.*
  - `logout()` — *Clears the current user's session and related cookies.*

### Functions
- `verify_token(token)` — *Checks the validity and expiration of an authentication token.*
```

## Mermaid Diagram Examples

### Class Inheritance Diagram

```mermaid
classDiagram
  BaseController["BaseController — Base class for all controllers"] <|-- AuthController["AuthController — Manages authentication requests"]
  AuthService["AuthService — Handles authentication logic"]
  AuthController --> AuthService : uses
```*(Node and edge labels include semantic comments, truncated for brevity in diagrams)*

### Method Call Sequence Diagram

```mermaid
sequenceDiagram
  participant UserController as "UserController"
  participant UserService as "UserService"
  participant Database as "Database"

  UserController->>UserService: getUser(id)
  UserService->>Database: query(id)
  Database-->>UserService: userData
  UserService-->>UserController: userObject
```*(Sequence diagrams show the flow of method calls between components)*

## Semantic Context Extraction Rules

1.  **Doc-strings First**: If a language has doc-string conventions (e.g., Python's `"""docstring"""`, JSDoc's `/** ... */`), the first sentence/line is prioritized.
2.  **Inline Comments Second**: Preceding single-line (`//`, `#`) or block (`/* ... */`) comments tightly bound to a symbol are captured.
3.  **Heuristic Fallback**: If no comment exists, a one-liner is auto-generated from the identifier (e.g., `calculate_total_cost` → "calculates total cost").
4.  **Diagram Labels**: Node/edge labels follow the pattern: `"SymbolName — comment text"`, truncated to ~80 chars.
5.  **Output Listing**: Semantic text is typically shown in *italics* or after an em-dash (—).

## Sequence Diagram Feature

The sequence diagram feature visualizes the flow of method calls between different components of the codebase. It helps understand the interaction patterns and control flow within the application.

### How It Works

1. The tool analyzes the function call graph to extract method call sequences
2. It identifies unique participants (functions, methods, classes) in the call sequences
3. It generates a Mermaid sequence diagram showing the interactions between participants
4. The diagram is optimized for readability, limiting the number of participants if necessary

### Limitations

- The sequence diagram is based on static analysis and may not capture all dynamic method calls
- For large codebases, the diagram is limited to a reasonable number of participants and calls
- The accuracy depends on the quality of the parsed code and the heuristics used to detect method calls

## Performance Notes

*   **File-Based Caching:** The tool uses a file-based cache system to store parsed file information. This significantly reduces memory usage and allows for persistent caching between runs. Subsequent runs on the same codebase will be faster if files haven't changed.
*   **Batch Processing:** Files are processed in batches with configurable batch sizes to manage memory usage and improve responsiveness on large codebases.
*   **Intermediate Storage:** For large repositories, the tool uses intermediate file storage during graph building to avoid keeping all data in memory at once.
*   **Memory Optimization:** The tool is designed to minimize memory usage by releasing resources as soon as they're no longer needed and using file-based storage instead of in-memory caches.
*   **Large Repositories:** For very large repositories (many thousands of files), initial parsing can take some time, but memory usage remains controlled. The output is split into multiple files for better organization and to avoid token limits.

## Error Handling

*   If a file cannot be parsed (e.g., due to syntax errors), it will be noted in the summary and skipped. The tool will attempt to process other files.
*   If the target path is invalid or no supported files are found, an appropriate message is returned.
*   Errors during grammar loading are logged, and affected languages may not be fully analyzed.

## Supported Languages (via Tree-sitter grammars)

The tool supports a wide range of languages for which Tree-sitter WASM grammars are provided in `src/tools/code-map-generator/grammars/`. This includes (but is not limited to): JavaScript, TypeScript, Python, Java, C#, Go, Ruby, Rust, PHP, HTML, CSS, JSON, YAML, and more. Refer to `src/tools/code-map-generator/parser.ts` for the full list of configured extensions and their grammars.

The grammar files are loaded from the following directory:
- `src/tools/code-map-generator/grammars/` (relative to the tool's code)

The tool dynamically loads the appropriate grammar files based on the file extensions encountered during scanning. If a grammar file is missing, the tool will log a warning and continue processing other files.

## Security Considerations

The Code-Map Generator tool implements several security measures:

* **Explicit Directory Authorization**: The tool only scans directories that are explicitly configured in the `allowedMappingDirectory` setting. This creates a clear security boundary and prevents unauthorized access to files outside the allowed directory.

* **Separate Read/Write Path Validation**: The tool uses separate security boundaries for read and write operations:
  * Read operations (scanning source code) are restricted to the `allowedMappingDirectory`.
  * Write operations (generating output files) are restricted to the `VIBE_CODER_OUTPUT_DIR` directory.
  * This separation ensures that the tool can only read from the source code directory and write to the output directory.

* **Path Validation**: All file paths are validated to ensure they are within the allowed directories. Any attempt to access files outside these boundaries (e.g., using path traversal techniques) will be blocked.

* **Resource Management**: The tool implements memory usage limits and file-based caching to prevent resource exhaustion attacks.

* **Error Handling**: Comprehensive error handling ensures that the tool fails safely and does not expose sensitive information in error messages.

* **Output Isolation**: Generated output is stored in a dedicated directory, separate from the source code being analyzed.

For maximum security, always configure the `allowedMappingDirectory` setting to point to the specific directory you want to analyze, rather than using a parent directory that contains other sensitive files.
