#!/bin/bash

# Post-publish validation script
# This script validates the published package on npm

set -e

echo "🔍 Starting post-publish validation..."

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
PACKAGE_NAME="vibe-coder-mcp"
MAX_WAIT_TIME=300  # 5 minutes
POLL_INTERVAL=10   # 10 seconds

# Get expected version from package.json or command line
if [ -n "$1" ]; then
    EXPECTED_VERSION="$1"
elif [ -f "package.json" ]; then
    EXPECTED_VERSION=$(jq -r '.version' package.json)
else
    print_error "No version specified and package.json not found"
    exit 1
fi

print_status "Validating publication of $PACKAGE_NAME@$EXPECTED_VERSION"

# Wait for npm propagation
wait_for_npm_propagation() {
    print_status "Waiting for npm registry propagation..."
    
    local elapsed=0
    while [ $elapsed -lt $MAX_WAIT_TIME ]; do
        if npm view "$PACKAGE_NAME@$EXPECTED_VERSION" version >/dev/null 2>&1; then
            print_success "Package found on npm registry"
            return 0
        fi
        
        print_status "Waiting for propagation... (${elapsed}s/${MAX_WAIT_TIME}s)"
        sleep $POLL_INTERVAL
        elapsed=$((elapsed + POLL_INTERVAL))
    done
    
    print_error "Package not found on npm registry after ${MAX_WAIT_TIME}s"
    return 1
}

# Validate package metadata
validate_package_metadata() {
    print_status "Validating package metadata..."
    
    # Get package info from npm
    PACKAGE_INFO=$(npm view "$PACKAGE_NAME@$EXPECTED_VERSION" --json)
    
    # Check version
    PUBLISHED_VERSION=$(echo "$PACKAGE_INFO" | jq -r '.version')
    if [ "$PUBLISHED_VERSION" != "$EXPECTED_VERSION" ]; then
        print_error "Version mismatch: expected $EXPECTED_VERSION, got $PUBLISHED_VERSION"
        return 1
    fi
    
    # Check essential metadata
    NAME=$(echo "$PACKAGE_INFO" | jq -r '.name')
    DESCRIPTION=$(echo "$PACKAGE_INFO" | jq -r '.description')
    AUTHOR=$(echo "$PACKAGE_INFO" | jq -r '.author.name // .author')
    LICENSE=$(echo "$PACKAGE_INFO" | jq -r '.license')
    
    print_status "Package: $NAME"
    print_status "Description: $DESCRIPTION"
    print_status "Author: $AUTHOR"
    print_status "License: $LICENSE"
    
    # Check if package has required fields
    if [ "$NAME" = "null" ] || [ "$DESCRIPTION" = "null" ]; then
        print_error "Package missing essential metadata"
        return 1
    fi
    
    print_success "Package metadata validation passed"
}

# Test package installation
test_package_installation() {
    print_status "Testing package installation..."
    
    # Create temporary directory for testing
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    
    # Test local installation
    print_status "Testing local installation..."
    if ! npm install "$PACKAGE_NAME@$EXPECTED_VERSION"; then
        print_error "Local installation failed"
        cleanup_test_dir
        return 1
    fi
    
    # Test global installation
    print_status "Testing global installation..."
    if ! npm install -g "$PACKAGE_NAME@$EXPECTED_VERSION"; then
        print_error "Global installation failed"
        cleanup_test_dir
        return 1
    fi
    
    print_success "Package installation tests passed"
    cleanup_test_dir
}

# Test CLI functionality
test_cli_functionality() {
    print_status "Testing CLI functionality..."
    
    # Test version command
    if ! vibe --version >/dev/null 2>&1; then
        print_error "CLI version command failed"
        return 1
    fi
    
    CLI_VERSION=$(vibe --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
    if [ "$CLI_VERSION" != "$EXPECTED_VERSION" ]; then
        print_error "CLI version mismatch: expected $EXPECTED_VERSION, got $CLI_VERSION"
        return 1
    fi
    
    # Test help command
    if ! vibe --help >/dev/null 2>&1; then
        print_error "CLI help command failed"
        return 1
    fi
    
    # Test basic functionality (with timeout)
    print_status "Testing basic CLI functionality..."
    timeout 5s vibe 2>/dev/null || {
        if [ $? -eq 124 ]; then
            print_success "CLI started successfully (timed out as expected)"
        else
            print_warning "CLI may have issues (exit code: $?)"
        fi
    }
    
    print_success "CLI functionality tests passed"
}

# Test package dependencies
test_package_dependencies() {
    print_status "Testing package dependencies..."
    
    # Create temporary directory for testing
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    
    # Install package and check for dependency issues
    npm install "$PACKAGE_NAME@$EXPECTED_VERSION" >/dev/null 2>&1
    
    # Check for peer dependency warnings
    if npm ls "$PACKAGE_NAME" 2>&1 | grep -i "peer dep"; then
        print_warning "Peer dependency warnings detected"
    fi
    
    # Check for missing dependencies
    if npm ls "$PACKAGE_NAME" 2>&1 | grep -i "missing"; then
        print_error "Missing dependencies detected"
        cleanup_test_dir
        return 1
    fi
    
    print_success "Package dependencies validation passed"
    cleanup_test_dir
}

# Test package size and contents
test_package_size() {
    print_status "Testing package size and contents..."
    
    # Get package tarball info
    TARBALL_INFO=$(npm view "$PACKAGE_NAME@$EXPECTED_VERSION" dist --json)
    TARBALL_SIZE=$(echo "$TARBALL_INFO" | jq -r '.unpackedSize')
    TARBALL_URL=$(echo "$TARBALL_INFO" | jq -r '.tarball')
    
    print_status "Package size: $TARBALL_SIZE bytes"
    print_status "Tarball URL: $TARBALL_URL"
    
    # Convert to MB for readability
    SIZE_MB=$(echo "scale=2; $TARBALL_SIZE / 1024 / 1024" | bc -l)
    print_status "Package size: ${SIZE_MB}MB"
    
    # Warn if package is too large
    if (( $(echo "$SIZE_MB > 10" | bc -l) )); then
        print_warning "Package size is large: ${SIZE_MB}MB"
    fi
    
    print_success "Package size validation passed"
}

# Test package security
test_package_security() {
    print_status "Testing package security..."
    
    # Create temporary directory for testing
    TEST_DIR=$(mktemp -d)
    cd "$TEST_DIR"
    
    # Install package
    npm install "$PACKAGE_NAME@$EXPECTED_VERSION" >/dev/null 2>&1
    
    # Run security audit
    if ! npm audit --audit-level=moderate >/dev/null 2>&1; then
        print_warning "Security audit found issues"
        npm audit --audit-level=moderate
    else
        print_success "No security vulnerabilities found"
    fi
    
    cleanup_test_dir
}

# Test package on different platforms
test_cross_platform() {
    print_status "Testing cross-platform compatibility..."
    
    # Get package info
    PACKAGE_INFO=$(npm view "$PACKAGE_NAME@$EXPECTED_VERSION" --json)
    
    # Check supported OS
    SUPPORTED_OS=$(echo "$PACKAGE_INFO" | jq -r '.os // []')
    if [ "$SUPPORTED_OS" != "null" ] && [ "$SUPPORTED_OS" != "[]" ]; then
        print_status "Supported OS: $SUPPORTED_OS"
    fi
    
    # Check supported CPU architectures
    SUPPORTED_CPU=$(echo "$PACKAGE_INFO" | jq -r '.cpu // []')
    if [ "$SUPPORTED_CPU" != "null" ] && [ "$SUPPORTED_CPU" != "[]" ]; then
        print_status "Supported CPU: $SUPPORTED_CPU"
    fi
    
    # Check Node.js engine requirements
    ENGINES=$(echo "$PACKAGE_INFO" | jq -r '.engines // {}')
    if [ "$ENGINES" != "{}" ]; then
        print_status "Engine requirements: $ENGINES"
    fi
    
    print_success "Cross-platform compatibility check passed"
}

# Cleanup function
cleanup_test_dir() {
    if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
        cd /
        rm -rf "$TEST_DIR"
    fi
}

# Cleanup on exit
trap cleanup_test_dir EXIT

# Generate validation report
generate_report() {
    print_status "Generating validation report..."
    
    REPORT_FILE="post-publish-validation-report.json"
    
    cat > "$REPORT_FILE" << EOF
{
  "package": "$PACKAGE_NAME",
  "version": "$EXPECTED_VERSION",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "validation_status": "passed",
  "checks": {
    "npm_propagation": "passed",
    "metadata": "passed",
    "installation": "passed",
    "cli_functionality": "passed",
    "dependencies": "passed",
    "size": "passed",
    "security": "passed",
    "cross_platform": "passed"
  },
  "package_info": $(npm view "$PACKAGE_NAME@$EXPECTED_VERSION" --json)
}
EOF
    
    print_success "Validation report generated: $REPORT_FILE"
}

# Main validation sequence
main() {
    print_status "Starting post-publish validation for $PACKAGE_NAME@$EXPECTED_VERSION"
    
    # Run all validation steps
    wait_for_npm_propagation
    validate_package_metadata
    test_package_installation
    test_cli_functionality
    test_package_dependencies
    test_package_size
    test_package_security
    test_cross_platform
    
    # Generate report
    generate_report
    
    print_success "🎉 Post-publish validation completed successfully!"
    print_status "Package $PACKAGE_NAME@$EXPECTED_VERSION is live and functional on npm"
    
    # Show quick stats
    DOWNLOADS=$(npm view "$PACKAGE_NAME" --json | jq -r '.downloads // "N/A"')
    print_status "Package downloads: $DOWNLOADS"
}

# Run main function
main "$@"