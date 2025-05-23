#!/bin/bash

# Manual test script for the code-map generator.
# This script runs the code-map generator on the test codebase with different configurations.

# Set environment variables
export CODE_MAP_ALLOWED_DIR="$(pwd)/test-codebase"
export VIBE_CODER_OUTPUT_DIR="$(pwd)/vibecoderoutput"

# Create output directory if it doesn't exist
mkdir -p "$VIBE_CODER_OUTPUT_DIR"

# Function to run a test
run_test() {
  local test_name=$1
  local incremental=$2
  local split_output=$3

  echo "=== Running test: $test_name ==="
  echo "Incremental: $incremental"
  echo "Split output: $split_output"

  # Build the command
  local cmd="node dist/code-map-cli.js -p $CODE_MAP_ALLOWED_DIR"

  if [ "$incremental" = "true" ]; then
    cmd="$cmd --incremental"
  else
    cmd="$cmd --no-incremental"
  fi

  if [ "$split_output" = "true" ]; then
    cmd="$cmd -s"
  fi

  # Run the command and time it
  echo "Command: $cmd"
  time $cmd

  echo "=== Test completed ==="
  echo ""
}

# Run tests
echo "=== Code-Map Generator Manual Tests ==="
echo "Test codebase: $CODE_MAP_ALLOWED_DIR"
echo "Output directory: $VIBE_CODER_OUTPUT_DIR"
echo ""

# Test 1: No incremental, no split output
run_test "Baseline" "false" "false"

# Test 2: Incremental, no split output
run_test "Incremental" "true" "false"

# Test 3: No incremental, split output
run_test "Split Output" "false" "true"

# Test 4: Incremental, split output
run_test "Incremental + Split Output" "true" "true"

echo "=== All tests completed ==="
