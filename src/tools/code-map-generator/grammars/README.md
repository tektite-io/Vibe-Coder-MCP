# Tree-sitter Grammar WASM Files

This directory contains the compiled Tree-sitter grammar WASM files used by the Code-Map Generator tool.

## Purpose

These WASM files are used by the Tree-sitter parser to parse different programming languages. Each file contains the compiled grammar rules for a specific language.

## File Naming Convention

The files follow this naming convention:
- `tree-sitter-{language}.wasm`

For example:
- `tree-sitter-javascript.wasm` - For JavaScript files
- `tree-sitter-typescript.wasm` - For TypeScript files
- `tree-sitter-python.wasm` - For Python files

## Supported Languages

The Code-Map Generator tool supports a wide range of languages, including:
- JavaScript/TypeScript
- Python
- Java
- C#
- Go
- Ruby
- Rust
- PHP
- HTML/CSS
- JSON/YAML
- And many more

For the full list of supported languages, refer to the `languageConfigurations` object in `src/tools/code-map-generator/parser.ts`.

## How to Obtain WASM Files

There are several ways to obtain these WASM files:

### Option 1: Use Pre-compiled Files

Some Tree-sitter grammar packages provide pre-compiled WASM files. Check the respective package repositories or documentation.

### Option 2: Compile from Source

1. Install the Tree-sitter CLI:
   ```bash
   npm install -g tree-sitter-cli
   ```

2. Clone the grammar repository:
   ```bash
   git clone https://github.com/tree-sitter/tree-sitter-javascript
   cd tree-sitter-javascript
   ```

3. Compile the WASM file:
   ```bash
   tree-sitter build-wasm
   ```

4. Copy the resulting `.wasm` file to this directory.

### Option 3: Use the @tree-sitter Packages

The project includes several `@tree-sitter/*` packages as devDependencies. You can compile these to WASM:

```bash
npx tree-sitter build-wasm node_modules/@tree-sitter/javascript
```

Then copy the resulting WASM file to this directory.

## Note

These WASM files are not included in the repository by default due to their binary nature and size. Each developer needs to obtain or compile them separately.
