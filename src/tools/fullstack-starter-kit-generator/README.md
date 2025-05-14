# Fullstack Starter Kit Generator (`generate-fullstack-starter-kit`)

## Overview

Generates full-stack project starter kits by composing YAML modules based on user requirements and tech stack preferences. This tool leverages Large Language Models (LLMs) via OpenRouter to select appropriate modules and parameters, and then assembles them into a final JSON definition.

**New Feature: Dynamic YAML Module Generation**
If a specified YAML module template (e.g., `frontend/react-vite.yaml`) is not found in the `src/tools/fullstack-starter-kit-generator/templates/` directory, the system will attempt to dynamically generate it using an LLM. The generated module will then be saved to the templates directory for future use and cached in memory for the current session.

## Inputs

This tool accepts the following parameters via the MCP call:

| Parameter                  | Type                                     | Description                                                                      | Required |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- | -------- |
| `use_case`                 | `string`                                 | The specific use case for the starter kit (e.g., 'E-commerce site')              | Yes      |
| `tech_stack_preferences`   | `Record<string, string \| undefined>`    | Optional tech stack preferences (e.g., { frontend: 'React', backend: 'Node.js' }) | No       |
| `request_recommendation`   | `boolean`                                | Whether to request LLM recommendations for tech stack components via research      | No       |
| `include_optional_features`| `string[]`                               | Optional features to include (e.g., ['Docker', 'Authentication with JWT'])       | No       |

## Outputs

* **Primary Output (MCP Response):** A formatted report summarizing the generated starter kit, including paths to the definition file and setup scripts.
* **File Storage:** Artifacts are saved to the configured output directory (default: `workflow-agent-files/`, override with `VIBE_CODER_OUTPUT_DIR` env var):
  * **JSON Definition:** `[output_dir]/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-definition.json`
    * This JSON file contains the complete, assembled starter kit definition.
  * **Shell Script:** `[output_dir]/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-setup.sh`
  * **Batch Script:** `[output_dir]/fullstack-starter-kit-generator/[timestamp]-[sanitized-name]-setup.bat`
    * These scripts are designed to unpack the accompanying JSON definition file.
  * **Dynamically Generated YAML Templates:** Saved to `src/tools/fullstack-starter-kit-generator/templates/[category]/[template-name].yaml` if generated.

## Asynchronous Execution

This tool executes asynchronously.
1.  An initial call returns a **Job ID**.
2.  The generation process runs in the background.
3.  Use the `get-job-result` tool with the Job ID to retrieve the final outcome.

## Workflow

1.  **Input Validation & Job Creation:** Validates inputs and creates a background job.
2.  **Research (Optional):** If `request_recommendation` is true, performs research to inform module selection.
3.  **YAML Module Selection (LLM):**
    *   Prompts an LLM with the user's request and research context.
    *   The LLM returns a JSON object specifying:
        *   `globalParams`: Project-wide parameters (e.g., `projectName`, `frontendPath`, `backendPort`).
        *   `moduleSelections`: An array of YAML module templates to use (e.g., `frontend/react-vite`, `backend/nodejs-express`) and any specific parameters for them.
4.  **YAML Composition (`YAMLComposer`):**
    *   For each selected module:
        *   The `YAMLComposer` first checks its cache for the module.
        *   If not cached, it attempts to load the YAML module file from `src/tools/fullstack-starter-kit-generator/templates/`.
        *   **If the file does not exist, `YAMLComposer` calls an LLM to dynamically generate the YAML module content (as JSON), validates it, saves it as a `.yaml` file in the templates directory, and caches it.**
        *   The (loaded or generated) module's content is parsed.
    *   Placeholders in the YAML content are substituted with the provided global and module-specific parameters.
    *   The `techStack`, `directoryStructure`, `dependencies`, and `setupCommands` from all chosen modules are merged into a single `StarterKitDefinition` object.
5.  **JSON Validation:** The composed `StarterKitDefinition` is validated against a Zod schema (`schema.ts`).
6.  **Artifact Generation:**
    *   The validated definition is saved as a `.json` file.
    *   `setup.sh` and `setup.bat` scripts are generated. These scripts now expect the `.json` definition file to be in the same directory when they are executed. They will read this JSON to create the project structure.
7.  **Response:** The job result includes a summary and paths to the generated files.

### YAML Templates

Modular components (frontend, backend, database, auth, etc.) are defined in YAML files located in `src/tools/fullstack-starter-kit-generator/templates/`. If a template is missing, it will be dynamically generated and saved here. Each YAML file (or dynamically generated module) should specify:
*   `moduleName`, `description`, `type`
*   `placeholders`: Variables to be filled in (e.g., `{projectName}`).
*   `provides`:
    *   `techStack`: Entries for the technology stack.
    *   `directoryStructure`: A snippet of the file/folder structure for this module. Paths should be relative to the module's own root (e.g., `src/index.js`). Content for files can be included directly.
    *   `dependencies`: NPM (or other package manager) dependencies. Keys for dependency groups (e.g. `"{frontendPath}"` or `"root"`) can use placeholders.
    *   `setupCommands`: Shell commands relevant to setting up the module. Contexts for commands (e.g. `"{backendPath}"`) can use placeholders.

### Script Usage Change

The generated `.sh` and `.bat` scripts now require the corresponding `[timestamp]-[sanitized-name]-definition.json` file to be present in the same directory from which they are run. The scripts parse this JSON file to perform the setup.

Bash scripts will attempt to use `jq` for parsing (recommended). Windows batch scripts will attempt to use PowerShell.

## Error Handling

*   Handles invalid input.
*   Manages errors during research, LLM calls (for module selection and dynamic generation), YAML parsing/composition, and file operations.
*   Provides detailed error messages via MCP response, including if dynamic template generation fails.