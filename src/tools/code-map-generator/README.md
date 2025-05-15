# Code-Map Generator Tool

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
        *   Call-flows (optional).
    *   Nodes and edges in diagrams are annotated with their semantic text.
*   **Token-Efficient, Context-Dense Output:**
    *   Delivers a Markdown bundle.
    *   File entries clearly list symbols with their associated semantic blurbs.
    *   Excludes full code bodies to maintain token efficiency.
*   **Asynchronous Design:**
    *   Utilizes asynchronous file system operations, batched parsing, and potentially worker threads for high-speed analysis.
    *   Implements parse caches to skip unchanged files for faster subsequent runs.
*   **Seamless MCP Exposure:**
    *   Auto-registers with the Vibe-Coder-MCP server.
    *   Invokable via the command `map-codebase` or through natural language queries.

## Input Parameters

The tool accepts the following parameters:

*   `path` (optional, string): The path to the target directory to map. If not provided, it defaults to the current working directory of the Vibe-Coder-MCP server.
    *   Example: `map-codebase path="/path/to/your/project"`
*   `ignored_files_patterns` (optional, array of strings): Glob patterns for files/directories to ignore during scanning.
    *   Example: `map-codebase ignored_files_patterns=["**/node_modules/**", "**/*.log"]`
*   `output_format` (optional, string, enum: `markdown` | `json`): Specifies the desired output format. Defaults to `markdown`.
    *   Example: `map-codebase output_format="json"`

## Output Format (Markdown Example)

```markdown
**src/services/auth.py** — *Authentication helpers and middleware*
  class AuthManager  — "Central login/logout controller for user sessions."
    • login(user_credentials)    — "Validates user credentials and establishes a new session."
    • logout()                   — "Clears the current user's session and related cookies."
  function verify_token(token) — "Checks the validity and expiration of an authentication token."

**src/models/user.py** — *User data model and database interactions.*
  class User — "Represents a user in the system."
    • get_profile() — "Retrieves the user's profile information."
```

## Mermaid Diagram Example (Class Inheritance)

```mermaid
classDiagram
  BaseController <|-- AuthController : "AuthController — Manages authentication requests"
  BaseController <|-- UserController : "UserController — Manages user data operations"
  AuthController --> AuthService : "uses"
  UserController --> UserService : "uses"
  AuthService["AuthService — Handles authentication logic"]
  UserService["UserService — Handles user business logic"]
```

## Semantic Context Extraction Rules

1.  **Doc-strings First**: If a language has doc-string conventions (e.g., `"""Python"""`, `/** JSDoc */`), the first sentence is prioritized for concise meaning.
2.  **Inline Comments Second**: Preceding `//`, `#`, or `/* */` comments tightly bound to a symbol are captured.
3.  **Heuristic Fallback**: If no comment exists, a one-liner is auto-generated from the identifier (e.g., `calculate_total_cost` → "calculates total cost").
4.  **Diagram Labels**: Node/edge labels follow the pattern: `"SymbolName — comment text"`, truncated for token efficiency (≤ 80 chars).
5.  **Output Listing**: Semantic text is highlighted (e.g., *italics* or em-dash) for easy identification by humans and AI.

## Future Enhancements

*   Support for more languages via Tree-sitter grammars.
*   More sophisticated call-graph analysis.
*   Integration with version control for diff-based mapping.

---
This README will be updated as the tool is developed.
