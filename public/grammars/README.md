# Tree-sitter Grammar WASM Files

This directory is where the Code-Map Generator tool expects to find compiled Tree-sitter grammar WASM files.

## Required Files

For the Code-Map Generator tool to work properly, you need to place the compiled WebAssembly (`.wasm`) files for each language you want to support in this directory. The expected filenames are:

- `tree-sitter-javascript.wasm` - For JavaScript files
- `tree-sitter-typescript.wasm` - For TypeScript files
- `tree-sitter-tsx.wasm` - For TSX files
- `tree-sitter-python.wasm` - For Python files
- `tree-sitter-java.wasm` - For Java files
- `tree-sitter-c-sharp.wasm` - For C# files
- `tree-sitter-go.wasm` - For Go files
- `tree-sitter-ruby.wasm` - For Ruby files
- `tree-sitter-rust.wasm` - For Rust files
- `tree-sitter-php.wasm` - For PHP files
- `tree-sitter-html.wasm` - For HTML files
- `tree-sitter-css.wasm` - For CSS files

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

## Configuration

The mapping between file extensions and grammar WASM files is defined in `src/tools/code-map-generator/parser.ts`. If you add support for additional languages, make sure to update the `languageConfigurations` object in that file.

## Note

These WASM files are not included in the repository by default due to their binary nature and size. Each developer needs to obtain or compile them separately.
