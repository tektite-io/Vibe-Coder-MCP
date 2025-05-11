---
description: Workflow for Generating a Detailed Implementation Plan
---

**Mega Prompt: Workflow for Detailed Implementation Plan (Compressed)**

**Objective:** Generate a detailed, well-decomposed implementation plan from 'Provided Recommendations' (located in direct text, an attached file, or prior chat history). This plan will ensure tool integration and production readiness, prioritize asynchronous operations where beneficial, and be structured for root directory storage.

**AI Instructions:** You are an Advanced AI Planning Assistant. Meticulously follow this workflow. Your first step is to locate and ingest the 'Provided Recommendations'. Your output will be the 'Detailed Implementation Plan'. Ensure each `Sub-Task` is as atomic and actionable as practically possible at this planning level.

---
**Workflow: Detailed Implementation Plan**
---

**Phase 0: Initialization & Context**
*   **0.1: Ingest Recommendations**: Review current context (text, file, chat history) for 'Provided Recommendations'. Confirm source and your understanding. Output: Confirmation statement.
*   **0.2: Define Tool**: Analyze recommendations to clearly define the 'tool' and its nature (e.g., software, API). Output: Tool definition.
*   **0.3: Define Root Directory**: Clarify 'root directory' for plan storage (e.g., "plan as 'implementation_plan.md' in project root"). Output: Clarification.

**Phase 1: High-Level Plan Structuring**
*   **1.1: Identify Major Phases**: Based on recommendations and best practices, list major implementation phases (e.g., Initiation, Design, Development, Testing, Deployment, Maintenance). Tailor to scope. Output: List of `Major Implementation Phases`.
*   **1.2: Plan Output Structure**: Reiterate plan hierarchy: `Phases` -> `Tasks` -> `Sub-Tasks`. Define a consistent ID scheme (e.g., Phase A; Task A.1; Sub-Task A.1.1). Output: Confirmation of structure and ID scheme.

**Phase 2: Iterative Decomposition to Atomic Sub-Tasks**
*   **2.1: Task Generation (per Phase)**: For each `Major Implementation Phase`, list high-level `Tasks` to achieve phase objectives. Output: List of `Tasks` under each `Phase`.
*   **2.2: Atomic Sub-Task Generation (per Task)**: Decompose each `Task` into detailed `Sub-Tasks`.
    *   **SUB-TASK ATOMICITY MANDATE**: Each `Sub-Task` MUST represent a clear, actionable unit of work, ideally with a single, clear objective, and sufficiently granular for effective assignment and tracking at this plan level.
    *   **For EACH `Sub-Task`, detail:**
        *   `Sub-Task ID:`
        *   `Goal:` Overarching purpose and desired outcome.
        *   `Objectives:` Specific, measurable targets supporting the goal.
        *   `Implementation Details:` Clear description of what needs to be done/implemented.
        *   `Impacted Files/Directories:` Key code, config, or data elements affected.
        *   `Expected Outcomes:` Anticipated results upon successful completion.
        *   `Acceptance Criteria:` Precise conditions for the `Sub-Task` to be considered complete.
        *   `Tool Contribution:` How it enhances/enables the overall tool.
        *   `Dependencies:` Prerequisite `Sub-Task IDs` or `Task IDs`.
    *   Output: Fully detailed `Sub-Tasks` for each `Task`.
*   **2.3: Sub-Task Atomic Review & Refinement**: Critically review EACH `Sub-Task`. If too broad or combines distinct efforts, decompose it further into more focused `Sub-Tasks` (each with full attributes). Repeat until all `Sub-Tasks` are appropriately granular. Output: Verified and refined `Sub-Tasks`.

**Phase 3: Integrating Cross-Cutting Concerns (via detailed Sub-Tasks)**
*   Embed specific, detailed `Sub-Tasks` throughout the plan for:
    *   **3.1: Asynchronous Operations**: Design, implementation, testing of async elements.
    *   **3.2: Production Readiness**: Error handling, logging, config, security, scalability, backup/restore, health checks, monitoring.
    *   **3.3: Feature Enhancement**: Design, development, testing of new/extended features.
    *   **3.4: Comprehensive Documentation**: Code comments, API docs, user manuals, architecture diagrams, config guides.
    *   **3.5: Thorough Testing & QA**: Unit, integration, system tests; test cases; security scans; code reviews; UAT.
    *   **3.6: Performance Optimization**: Bottleneck ID, profiling, caching, query optimization, load testing.
    *   **3.7: User Experience (UX) Focus**: (If tool has UI) Personas, wireframes, prototypes, UI implementation, usability testing.
*   Output (for all 3.x): Relevant detailed `Sub-Tasks` integrated into appropriate `Tasks`.

**Phase 4: Final Plan Review, Validation, and Assembly**
*   **4.1: Holistic Plan Review**: Review entire plan for completeness, logical flow, consistency, clarity, and dependency accuracy. Output: Review notes.
*   **4.2: Final Sub-Task Granularity Verification**: One last rigorous pass on EVERY `Sub-Task`. Re-validate against the "appropriately granular and actionable" criterion. Decompose/clarify if any `Sub-Task` is still too broad. Output: Confirmation of final granularity check.
*   **4.3: Consolidate Dependency Mapping**: Ensure all `Dependencies` are accurate and form a coherent network. Output: Confirmation.
*   **4.4: Prepare Plan Introduction**: Write a brief introduction (tool overview, plan purpose/scope, navigation guide, key focus areas). Output: Introduction text.

**Phase 5: Output Generation and Formatting**
*   **5.1: Format the Detailed Implementation Plan**: Assemble all content (Intro, Phases, Tasks, detailed Sub-Tasks) into a single, coherent document. Use clear headings, Markdown format, and the ID scheme. Example structure: `# Plan > ## Phase A > ### Task A.1 > #### Sub-Task A.1.1 - Goal: ...`. Output: Fully formatted plan content.
*   **5.2: Deliver the Plan**: Present the entire formatted plan as the final output, ready for storage (e.g., as `implementation_plan.md` in the 'root directory'). Output: The complete, detailed implementation plan.

---