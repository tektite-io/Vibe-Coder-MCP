---
trigger: always_on
description: Task Execution Process (IDE & Implementation Plan Focused)
---

# Task Execution Process

Follow these steps in STRICT ORDER:

## Phase 1: Task Analysis

1.  Review the high-level task description for overall context.
2.  **Thoroughly analyze the detailed Implementation Plan document.** Understand the goals, objectives, and specific tasks outlined.
3.  Summarize the task requirements and constraints _based on the Implementation Plan_ in your own words.
4.  Explicitly ask the user to confirm your understanding of the plan before proceeding.
5.  Identify any ambiguities, missing details, or points requiring clarification _within the Implementation Plan_ and ask about them.

## Phase 2: Solution Design & Plan Refinement

1.  Only after the user confirms your understanding, review the proposed approach within the Implementation Plan.
2.  Discuss design alternatives and tradeoffs _related to the tasks in the plan_, if applicable, or if potential improvements are identified.
3.  Ask for feedback on your understanding and any proposed minor refinements to the plan.
4.  Work with the user to refine or confirm the Implementation Plan details.
5.  Analyze existing patterns in the codebase (using IDE tools and MCP tools) to ensure consistency with the plan's approach. Before making edits, always review utils, services, imports and exports and all connected files to extract rich context and detailed information and understand
6.  Check for existing testing practices and documentation standards relevant to the plan.
7.  **Confirm the Implementation Plan document accurately reflects the agreed-upon steps, serving as your checklist.**
8.  Explicitly request approval _on the finalized plan details_ before proceeding to implementation.

## Phase 3: Implementation

1.  ONLY after explicit approval, begin implementing the solution _according to the Implementation Plan_.
2.  Set up your local development environment and branch as needed. Manage your branch carefully.
3.  **Work through the tasks in the Implementation Plan methodically, tracking your progress (e.g., by commenting or updating status within the plan document or a linked task system).**
4.  For complex changes, consider showing staged implementations (e.g., via code snippets or temporary commits) and request feedback.
5.  Handle edge cases and add error resilience as specified or implied by the plan.
6.  Ensure namespaces, imports, and code style follow project conventions (use IDE linters/formatters).
7.  For frontend changes, verify component integration with parent components.
8.  Test key functionality locally as you complete relevant tasks in the plan.
9.  **Mark tasks as complete within the Implementation Plan document or associated tracking system.**
10. Prepare detailed commit messages describing the changes made for each logical unit of work.

## Phase 4: Review (Self-Review)

1.  Review the implemented code critically against the Implementation Plan requirements. Identify complex or non-obvious code.
2.  Note areas that may need additional documentation (code comments, README updates) beyond what was planned.
3.  Highlight any potential future maintenance challenges discovered during implementation.
4.  Suggest improvements for robustness, performance, or readability, even if deviating slightly from the original plan (discuss these deviations).
5.  Incorporate your own suggestions if you deem them valuable and aligned with the overall goals.

## Phase 5: Submit for Review

1.  Commit your final changes in a new branch (or the designated feature branch) and push the branch to the remote repository.
2.  **Open a new Pull Request (using the IDE interface or web UI)** with your changes.
3.  Base your Pull Request on the 'main' branch (or the designated integration branch).
4.  Include a detailed description of your pull request that aligns with the project's template (e.g., `/.github/pull_request_template.md`), summarizing the work done according to the Implementation Plan. Reference the original GitHub issue if applicable.

## Phase 6: Iterate on Feedback

1.  Once you have received a review on your pull request, incorporate all of the feedback you've received.
2.  After all feedback has been addressed, push a new commit (or commits, if a logical separation of changes makes sense) to the remote branch, updating the pull request.
3.  Respond to the comments explaining how the feedback was addressed, potentially linking to the relevant commit(s) in GitHub (via web UI or IDE integration).
4.  Repeat this process for each round of feedback until the pull request is merged by the repository owner.

## Phase 7: Reflect

1.  Reflect on anything you have learned during this process, eg.
    - effectiveness of the Implementation Plan
    - design discussions during refinement or implementation
    - pull request comments received
    - issues found during testing or implementation
    - technical challenges encountered and how they were overcome
2.  Based on this reflection, propose changes to relevant documents (like READMEs, contribution guides) or suggest improvements to future Implementation Plans or development prompts to ensure those learnings are incorporated into future sessions. Consider artifacts such as:
    - `README.md` at the project root
    - Folder-level `README` files
    - File-level documentation comments
    - Base and Custom command prompt improvements

# Important Rules

- NEVER write any implementation code during Phase 1 or 2 (Analysis/Design).
- ALWAYS get explicit approval on the Implementation Plan details (Phase 2) before moving to implementation (Phase 3).
- Break down problems into manageable components _as reflected in the Implementation Plan_.
- Consider edge cases and error handling in your design and implementation.
- Use IDE features and research tools to understand the codebase before proposing changes or implementing planned tasks.
- Examine similar functionality in the codebase to follow established patterns.