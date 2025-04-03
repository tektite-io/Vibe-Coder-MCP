# Git Summary Generator Tool (`git-summary`)

## Overview

This tool uses the `simple-git` library to retrieve a summary of the current Git repository's status, specifically focusing on the changes (diff). It can show either unstaged changes (default) or staged changes.

## Inputs

| Parameter | Type      | Description                                                                               | Required |
| :-------- | :-------- | :---------------------------------------------------------------------------------------- | :------- |
| `staged`  | `boolean` | Optional. If true, get the summary for staged changes only. Defaults to false (unstaged). | No       |

## Outputs

*   **Primary Output:** A formatted string containing the Git diff summary. This string is returned within the `CallToolResult.content` array (type `text`).
*   **File Storage:** This tool does not save any files.

## Workflow

```mermaid
flowchart TD
    A[Start git-summary] --> B{Validate Input Schema};
    B --> |Invalid| Z[Return Error];
    B --> |Valid| C{Initialize Git Helper};
    C --> |Error| Z;
    C --> |Success| D{Staged Changes Requested?};
    D --> |Yes| E[Call git.diff(['--staged'])];
    D --> |No| F[Call git.diff()];
    E --> G{Git Command Successful?};
    F --> G;
    G --> |No| Z;
    G --> |Yes| H[Get Diff Output String];
    H --> I{Diff Empty?};
    I --> |Yes| J[Return 'No changes found' message];
    I --> |No| K[Return Success with Diff String];
    J --> X[End];
    K --> X;
    Z --> X;
```

1.  **Validate Input:** The optional `staged` parameter is validated.
2.  **Initialize Git Helper:** An instance of the `GitHelper` utility is created, which internally initializes `simple-git`.
3.  **Execute Git Diff:**
    *   If `staged` is true, `git.diff(['--staged'])` is called.
    *   Otherwise (default), `git.diff()` is called to get unstaged changes.
4.  **Process Output:** The raw diff string returned by `simple-git` is retrieved.
5.  **Format Result:**
    *   If the diff string is empty or indicates no changes, a message like "No staged/unstaged changes found." is prepared.
    *   Otherwise, the raw diff string is used as the result.
6.  **Return Result:** A successful `CallToolResult` containing the formatted diff summary string (or the "no changes" message) is returned.

## Usage Example

```json
{
  "tool_name": "git-summary",
  "arguments": {
    "staged": true 
  }
}
```

Invoked via AI Assistant:
`"Show staged git changes"` or `"git summary"` (defaults to unstaged)

## Error Handling

*   **Input Validation Errors:** Returns an error if `staged` is not a boolean (though unlikely due to schema validation).
*   **Git Initialization Errors:** Returns an error if `simple-git` fails to initialize (e.g., not in a Git repository).
*   **Git Command Errors:** Returns an error if the underlying `git diff` command fails for any reason (e.g., `git` not installed or not in PATH).
