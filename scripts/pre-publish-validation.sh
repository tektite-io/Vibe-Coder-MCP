#!/bin/bash

# Pre-publish validation script
# This script performs comprehensive validation before npm publication

set -e

echo "🔍 Starting pre-publish validation..."

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

# Validation functions
validate_environment() {
    print_status "Validating environment..."
    
    # Check Node.js version
    NODE_VERSION=$(node --version)
    print_status "Node.js version: $NODE_VERSION"
    
    # Check npm version
    NPM_VERSION=$(npm --version)
    print_status "npm version: $NPM_VERSION"
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ]; then
        print_error "package.json not found. Are you in the project root?"
        exit 1
    fi
    
    # Check if build directory exists
    if [ ! -d "build" ]; then
        print_error "Build directory not found. Run 'npm run build' first."
        exit 1
    fi
    
    print_success "Environment validation passed"
}

validate_package_json() {
    print_status "Validating package.json..."
    
    # Check required fields
    REQUIRED_FIELDS=("name" "version" "description" "main" "author" "license")
    
    for field in "${REQUIRED_FIELDS[@]}"; do
        if ! jq -e ".$field" package.json > /dev/null; then
            print_error "Missing required field in package.json: $field"
            exit 1
        fi
    done
    
    # Check version format
    VERSION=$(jq -r '.version' package.json)
    if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9]+(\.[0-9]+)?)?$ ]]; then
        print_error "Invalid version format: $VERSION"
        exit 1
    fi
    
    # Check if version already exists on npm
    if npm view "vibe-coder-mcp@$VERSION" version 2>/dev/null; then
        print_error "Version $VERSION already exists on npm"
        exit 1
    fi
    
    print_success "package.json validation passed"
}

validate_build() {
    print_status "Validating build artifacts..."
    
    # Check if main entry point exists
    MAIN_FILE=$(jq -r '.main' package.json)
    if [ ! -f "$MAIN_FILE" ]; then
        print_error "Main entry point not found: $MAIN_FILE"
        exit 1
    fi
    
    # Check if CLI binaries exist
    if jq -e '.bin' package.json > /dev/null; then
        jq -r '.bin | to_entries[] | .value' package.json | while read -r bin_file; do
            if [ ! -f "$bin_file" ]; then
                print_error "Binary file not found: $bin_file"
                exit 1
            fi
            
            # Check if binary is executable
            if [ ! -x "$bin_file" ]; then
                print_warning "Binary file is not executable: $bin_file"
                chmod +x "$bin_file"
                print_status "Made $bin_file executable"
            fi
        done
    fi
    
    # Check TypeScript declaration files
    if [ -d "build" ]; then
        DECLARATION_COUNT=$(find build -name "*.d.ts" | wc -l)
        print_status "Found $DECLARATION_COUNT TypeScript declaration files"
    fi
    
    print_success "Build validation passed"
}

validate_tests() {
    print_status "Running test validation..."
    
    # Run CI-safe tests
    if ! npm run test:ci-safe; then
        print_error "Tests failed"
        exit 1
    fi
    
    print_success "Test validation passed"
}

validate_linting() {
    print_status "Running linting validation..."
    
    # Run ESLint
    if ! npm run lint; then
        print_error "Linting failed"
        exit 1
    fi
    
    # Run TypeScript type checking
    if ! npm run type-check; then
        print_error "TypeScript type checking failed"
        exit 1
    fi
    
    print_success "Linting validation passed"
}

validate_security() {
    print_status "Running security validation..."
    
    # Run npm audit
    if ! npm audit --audit-level=moderate; then
        print_error "Security audit failed"
        exit 1
    fi
    
    print_success "Security validation passed"
}

validate_package_contents() {
    print_status "Validating package contents..."
    
    # Create a dry-run package
    npm pack --dry-run > package-contents.txt
    
    # Check package size
    PACKAGE_SIZE=$(npm run package:size --silent | grep -o '[0-9.]*')
    print_status "Package size: ${PACKAGE_SIZE}MB"
    
    # Warn if package is too large
    if (( $(echo "$PACKAGE_SIZE > 5" | bc -l) )); then
        print_warning "Package size is large: ${PACKAGE_SIZE}MB"
    fi
    
    # Check if essential files are included
    ESSENTIAL_FILES=("README.md" "LICENSE" "package.json")
    for file in "${ESSENTIAL_FILES[@]}"; do
        if ! grep -q "$file" package-contents.txt; then
            print_error "Essential file missing from package: $file"
            exit 1
        fi
    done
    
    # Check if build directory is included
    if ! grep -q "build/" package-contents.txt; then
        print_error "Build directory missing from package"
        exit 1
    fi
    
    # Clean up
    rm -f package-contents.txt
    
    print_success "Package contents validation passed"
}

validate_cli_functionality() {
    print_status "Validating CLI functionality..."
    
    # Test CLI help
    if ! node build/unified-cli.js --help > /dev/null; then
        print_error "CLI help command failed"
        exit 1
    fi
    
    # Test CLI version
    CLI_VERSION=$(node build/unified-cli.js --version 2>/dev/null | grep -o '[0-9]\+\.[0-9]\+\.[0-9]\+')
    PACKAGE_VERSION=$(jq -r '.version' package.json)
    
    if [ "$CLI_VERSION" != "$PACKAGE_VERSION" ]; then
        print_error "CLI version ($CLI_VERSION) doesn't match package.json version ($PACKAGE_VERSION)"
        exit 1
    fi
    
    print_success "CLI functionality validation passed"
}

validate_mcp_server() {
    print_status "Validating MCP server functionality..."
    
    # Test MCP server startup (with timeout)
    timeout 10s node build/index.js > /dev/null 2>&1 || {
        if [ $? -eq 124 ]; then
            print_success "MCP server started successfully (timed out as expected)"
        else
            print_error "MCP server failed to start"
            exit 1
        fi
    }
}

validate_documentation() {
    print_status "Validating documentation..."
    
    # Check if README exists and is not empty
    if [ ! -f "README.md" ] || [ ! -s "README.md" ]; then
        print_error "README.md is missing or empty"
        exit 1
    fi
    
    # Check if LICENSE exists
    if [ ! -f "LICENSE" ]; then
        print_error "LICENSE file is missing"
        exit 1
    fi
    
    # Check if README contains essential sections
    ESSENTIAL_SECTIONS=("Installation" "Usage" "License")
    for section in "${ESSENTIAL_SECTIONS[@]}"; do
        if ! grep -qi "$section" README.md; then
            print_warning "README.md missing section: $section"
        fi
    done
    
    print_success "Documentation validation passed"
}

# Main validation sequence
main() {
    print_status "Starting comprehensive pre-publish validation"
    
    validate_environment
    validate_package_json
    validate_build
    validate_linting
    validate_tests
    validate_security
    validate_package_contents
    validate_cli_functionality
    validate_mcp_server
    validate_documentation
    
    print_success "🎉 All validations passed! Package is ready for publication."
    
    # Final confirmation
    VERSION=$(jq -r '.version' package.json)
    print_status "Ready to publish vibe-coder-mcp@$VERSION"
    
    # Show what will be published
    print_status "Package contents preview:"
    npm pack --dry-run | tail -20
}

# Run main function
main "$@"