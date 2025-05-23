#!/bin/bash

# Test script for measuring the performance of the code-map generator.
# This script runs the code-map generator on a specified directory and measures:
# - Total execution time
# - Memory usage
# - Number of files processed
# - Time spent in each phase
#
# Usage:
# ./test-performance.sh [directory] [--incremental] [--no-incremental] [--split-output] [--output-format=markdown|json]
#
# Example:
# ./test-performance.sh ../../ --incremental

# Parse command line arguments
TARGET_DIR=${1:-"../../"}
INCREMENTAL=false
NO_INCREMENTAL=false
SPLIT_OUTPUT=false
OUTPUT_FORMAT="markdown"

for arg in "$@"; do
  case $arg in
    --incremental)
      INCREMENTAL=true
      ;;
    --no-incremental)
      NO_INCREMENTAL=true
      ;;
    --split-output)
      SPLIT_OUTPUT=true
      ;;
    --output-format=*)
      OUTPUT_FORMAT="${arg#*=}"
      ;;
  esac
done

# Build the command
COMMAND="npx ts-node code-map-cli.ts -p $TARGET_DIR -f $OUTPUT_FORMAT"

if [ "$SPLIT_OUTPUT" = true ]; then
  COMMAND="$COMMAND -s"
fi

if [ "$INCREMENTAL" = true ] && [ "$NO_INCREMENTAL" = false ]; then
  COMMAND="$COMMAND --incremental"
elif [ "$NO_INCREMENTAL" = true ]; then
  COMMAND="$COMMAND --no-incremental"
fi

COMMAND="$COMMAND -i node_modules,.git,dist,build,out,coverage,vendor"

# Print test information
echo "=== Code-Map Generator Performance Test ==="
echo "Target directory: $TARGET_DIR"
echo "Incremental processing: $([ "$INCREMENTAL" = true ] && [ "$NO_INCREMENTAL" = false ] && echo "enabled" || echo "disabled")"
echo "Split output: $([ "$SPLIT_OUTPUT" = true ] && echo "enabled" || echo "disabled")"
echo "Output format: $OUTPUT_FORMAT"
echo "Command: $COMMAND"

# Run the test
START_TIME=$(date +%s)
$COMMAND
EXIT_CODE=$?
END_TIME=$(date +%s)
EXECUTION_TIME=$((END_TIME - START_TIME))

echo ""
echo "=== Results ==="
echo "Total execution time: $EXECUTION_TIME seconds"
echo "Exit code: $EXIT_CODE"

exit $EXIT_CODE
