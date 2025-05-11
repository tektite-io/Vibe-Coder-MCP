---
trigger: always_on
---

## General

- before you create a new file or config file, ensure you have the correct file extension
- do a search of the entire repo to be sure you are not duplicating files and configs.
- when installing a new package, always check the package.json to be sure you are not duplicating packages and ensure you always install the latest versions
- follow a modular approach when creating new files and configs
- follow the existing file structure and patterns and naming conventions

## Architecture

- always follow a modular architecture
- always prefer shared services
- always prefer shared utilities
- before creating a new file, always check if the file already exists
- always use the existing config, shared services, utilities where possible
- before creating a new config, shared service, or utility, always check if the config, shared service, or utility already exists

## File Creation

- when creating new files, always add the necessary imports and exports
- when creating new files, always add the necessary comments and documentation
- when creating new files, always add the necessary error handling
- when creating new files, always add the necessary logging
- when creating new files, always add the necessary unit tests
- when creating new files, always add the necessary integration tests
- when creating new files, always add the necessary e2e tests
- Keep all files below 500 lines
- If a file exceeds 500 lines, split it into multiple files
- Use the existing file structure and patterns and naming conventions

## TDD Principles

- Follow Test Driven Development principles
- Write tests before writing code
- Follow the Red, Green, Refactor pattern.
- Ensure all tests align with the actual function implementation

## Implementation Patterns

- Never implement mocks
- Only implement full features
- Only implement production grade code
- Only implement production grade tests

## Code Quality

- Always write production grade code
- Always write production grade tests
- Always write production grade documentation
- Always write production grade comments
- Always write production grade logging
- Always write production grade error handling
- Always write production grade unit tests
- Always write production grade integration tests
- Always write production grade e2e tests.

## Connected files and Edits

- Before making edits, always review utils, services, imports and exports and all connected files to extract rich context and detailed information and understand