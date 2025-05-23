# Testing the Code-Map Generator Optimizations

This document describes how to test the performance and memory optimizations implemented in the code-map generator.

## Test Environment Setup

1. Create a test codebase with a few files:
   ```bash
   mkdir -p test-codebase/src test-codebase/lib
   ```

2. Create some test files:
   - `test-codebase/src/index.js`: Main entry point
   - `test-codebase/src/user.js`: User class
   - `test-codebase/src/product.js`: Product class
   - `test-codebase/src/order.js`: Order class
   - `test-codebase/lib/database.js`: Database class

3. Set environment variables:
   ```bash
   export CODE_MAP_ALLOWED_DIR="$(pwd)/test-codebase"
   export VIBE_CODER_OUTPUT_DIR="$(pwd)/vibecoderoutput"
   ```

## Test Cases

### Test Case 1: Baseline (No Optimizations)

Run the code-map generator with default settings:
```bash
node code-map-cli.js -p test-codebase --no-incremental
```

### Test Case 2: Incremental Processing

Run the code-map generator with incremental processing enabled:
```bash
node code-map-cli.js -p test-codebase --incremental
```

### Test Case 3: Single File Output

Run the code-map generator with single file output (default):
```bash
node code-map-cli.js -p test-codebase
```

### Test Case 4: Split Output

Run the code-map generator with split output:
```bash
node code-map-cli.js -p test-codebase -s
```

## Expected Results

### Incremental Processing

1. First run: All files are processed
2. Second run (no changes): No files are processed
3. After modifying a file: Only the modified file and its dependencies are processed

### Memory Usage

1. With in-memory caching disabled: Lower memory usage
2. With file-based caching: Slightly higher disk usage

### Output Format

1. Single file output (default): One file with all the information
2. Split output: Multiple files with different sections

## Manual Testing

Due to the complexity of the codebase and the dependencies, manual testing is recommended:

1. Run the code-map generator with different configurations
2. Check the output files
3. Monitor memory usage with tools like `top` or `htop`
4. Measure execution time with `time`

## Example Manual Test

```bash
# Baseline
time node code-map-cli.js -p test-codebase --no-incremental

# Incremental (first run)
time node code-map-cli.js -p test-codebase --incremental

# Modify a file
echo "// Modified" >> test-codebase/src/user.js

# Incremental (second run)
time node code-map-cli.js -p test-codebase --incremental
```

## Memory Optimization Testing

### Test Case 5: Memory-Aware Grammar Loading

Run the code-map generator with memory-aware grammar loading:

```bash
node code-map-cli.js -p test-codebase --memory-aware-grammar-loading
```

### Test Case 6: Batch Processing

Run the code-map generator with batch processing:

```bash
node code-map-cli.js -p test-codebase --batch-size 10
```

### Test Case 7: Language-Based Batching

Run the code-map generator with language-based batching:

```bash
node code-map-cli.js -p test-codebase --language-batching
```

### Test Case 8: Metadata-Focused Caching

Run the code-map generator with metadata-focused caching:

```bash
node code-map-cli.js -p test-codebase --metadata-cache
```

### Test Case 9: Memory Monitoring

Run the code-map generator with memory monitoring:

```bash
node code-map-cli.js -p test-codebase --memory-monitoring
```

### Test Case 10: Combined Memory Optimizations

Run the code-map generator with all memory optimizations enabled:

```bash
node code-map-cli.js -p test-codebase --memory-aware-grammar-loading --batch-size 10 --language-batching --metadata-cache --memory-monitoring
```

## Memory Usage Monitoring

To monitor memory usage during testing:

1. Enable memory monitoring:

```bash
node code-map-cli.js -p test-codebase --memory-monitoring
```

2. View the memory usage report:

```bash
cat memory-usage-report.json
```

## Conclusion

The optimizations should result in:

1. Faster execution time for incremental processing
2. Lower memory usage with memory optimizations enabled
3. More convenient output with single file output as default
4. Ability to process larger codebases without running out of memory
5. Detailed memory usage statistics for performance tuning
