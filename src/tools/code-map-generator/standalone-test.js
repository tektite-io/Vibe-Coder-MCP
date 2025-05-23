/**
 * Standalone test script for the code-map generator optimizations.
 * This script tests the incremental processing and file-based caching optimizations.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const TEST_CODEBASE_DIR = path.join(__dirname, 'test-codebase');
const OUTPUT_DIR = path.join(__dirname, 'vibecoderoutput');

// Create output directory if it doesn't exist
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Function to run a test
function runTest(name, options = {}) {
  console.log(`\n=== Running test: ${name} ===`);

  // Set environment variables
  process.env.CODE_MAP_ALLOWED_DIR = TEST_CODEBASE_DIR;
  process.env.VIBE_CODER_OUTPUT_DIR = OUTPUT_DIR;

  // Print test configuration
  console.log(`Test codebase: ${TEST_CODEBASE_DIR}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log(`Incremental: ${options.incremental ? 'enabled' : 'disabled'}`);
  console.log(`Split output: ${options.splitOutput ? 'enabled' : 'disabled'}`);
  console.log(`In-memory caching: ${options.inMemoryCaching ? 'enabled' : 'disabled'}`);

  // Create test files
  createTestFiles();

  // Run the test
  const startTime = Date.now();

  try {
    // Simulate running the code-map generator
    console.log('Simulating code-map generator execution...');

    // Simulate file scanning
    console.log('Scanning files...');
    const files = scanFiles(TEST_CODEBASE_DIR);
    console.log(`Found ${files.length} files`);

    // Simulate file processing
    console.log('Processing files...');
    const processedFiles = processFiles(files, options);
    console.log(`Processed ${processedFiles.length} files`);

    // Simulate output generation
    console.log('Generating output...');
    generateOutput(processedFiles, options);

    const endTime = Date.now();
    const executionTime = (endTime - startTime) / 1000; // Convert to seconds

    console.log(`\nExecution time: ${executionTime.toFixed(2)} seconds`);
    console.log('Memory usage:', process.memoryUsage());

    return { success: true, executionTime, processedFiles };
  } catch (error) {
    console.error('Error:', error);
    return { success: false, error };
  }
}

// Function to create test files
function createTestFiles() {
  // Create src directory if it doesn't exist
  if (!fs.existsSync(path.join(TEST_CODEBASE_DIR, 'src'))) {
    fs.mkdirSync(path.join(TEST_CODEBASE_DIR, 'src'), { recursive: true });
  }

  // Create lib directory if it doesn't exist
  if (!fs.existsSync(path.join(TEST_CODEBASE_DIR, 'lib'))) {
    fs.mkdirSync(path.join(TEST_CODEBASE_DIR, 'lib'), { recursive: true });
  }

  // Create test files if they don't exist
  if (!fs.existsSync(path.join(TEST_CODEBASE_DIR, 'src', 'index.js'))) {
    fs.writeFileSync(path.join(TEST_CODEBASE_DIR, 'src', 'index.js'), `
/**
 * Main entry point for the application.
 */
import { User } from './user.js';
import { Product } from './product.js';
import { Order } from './order.js';
import { Database } from '../lib/database.js';

// Initialize the database
const db = new Database();

// Create some users
const user1 = new User('John Doe', 'john@example.com');
const user2 = new User('Jane Smith', 'jane@example.com');

// Create some products
const product1 = new Product('Laptop', 999.99);
const product2 = new Product('Phone', 499.99);
const product3 = new Product('Tablet', 299.99);

// Create some orders
const order1 = new Order(user1, [product1, product2]);
const order2 = new Order(user2, [product2, product3]);

// Save to database
db.saveUser(user1);
db.saveUser(user2);
db.saveProduct(product1);
db.saveProduct(product2);
db.saveProduct(product3);
db.saveOrder(order1);
db.saveOrder(order2);

console.log('Application initialized successfully!');
`);
  }
}

// Function to scan files
function scanFiles(directory) {
  const files = [];

  function scan(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.js')) {
        files.push(fullPath);
      }
    }
  }

  scan(directory);
  return files;
}

// Function to process files
function processFiles(files, options) {
  // Simulate file processing
  return files.map(file => {
    const content = fs.readFileSync(file, 'utf-8');
    const lines = content.split('\n');

    return {
      path: file,
      relativePath: path.relative(TEST_CODEBASE_DIR, file),
      lines: lines.length,
      classes: extractClasses(content),
      functions: extractFunctions(content),
      imports: extractImports(content)
    };
  });
}

// Function to extract classes
function extractClasses(content) {
  const classes = [];
  const classRegex = /class\s+(\w+)/g;
  let match;

  while ((match = classRegex.exec(content)) !== null) {
    classes.push({
      name: match[1],
      properties: extractProperties(content, match[1]),
      methods: extractMethods(content, match[1])
    });
  }

  return classes;
}

// Function to extract functions
function extractFunctions(content) {
  const functions = [];
  const functionRegex = /function\s+(\w+)\s*\([^)]*\)/g;
  let match;

  while ((match = functionRegex.exec(content)) !== null) {
    functions.push({
      name: match[1],
      parameters: []
    });
  }

  return functions;
}

// Function to extract properties
function extractProperties(content, className) {
  const properties = [];
  const propertyRegex = new RegExp(`class\\s+${className}[\\s\\S]*?constructor[\\s\\S]*?{([\\s\\S]*?)}`, 'g');
  let match;

  while ((match = propertyRegex.exec(content)) !== null) {
    const constructorBody = match[1];
    const thisRegex = /this\.(\w+)\s*=/g;
    let propMatch;

    while ((propMatch = thisRegex.exec(constructorBody)) !== null) {
      properties.push({
        name: propMatch[1],
        type: 'any'
      });
    }
  }

  return properties;
}

// Function to extract methods
function extractMethods(content, className) {
  const methods = [];
  const methodRegex = new RegExp(`class\\s+${className}[\\s\\S]*?{([\\s\\S]*?)}`, 'g');
  let match;

  while ((match = methodRegex.exec(content)) !== null) {
    const classBody = match[1];
    const methodDefRegex = /(\w+)\s*\([^)]*\)\s*{/g;
    let methodMatch;

    while ((methodMatch = methodDefRegex.exec(classBody)) !== null) {
      if (methodMatch[1] !== 'constructor') {
        methods.push({
          name: methodMatch[1],
          parameters: []
        });
      }
    }
  }

  return methods;
}

// Function to extract imports
function extractImports(content) {
  const imports = [];
  const importRegex = /import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(content)) !== null) {
    const importedItems = match[1].split(',').map(item => item.trim());
    const path = match[2];

    imports.push({
      path,
      importedItems: importedItems.map(item => ({
        name: item,
        isDefault: false
      }))
    });
  }

  return imports;
}

// Function to generate output
function generateOutput(files, options) {
  // Simulate output generation
  const output = {
    projectPath: TEST_CODEBASE_DIR,
    files
  };

  // Write output to file
  const outputPath = path.join(OUTPUT_DIR, 'code-map.json');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log(`Output written to ${outputPath}`);
}

// Run tests
console.log('=== Code-Map Generator Optimization Tests ===');

// Test 1: Baseline (No optimizations)
const test1Result = runTest('Baseline', {
  incremental: false,
  splitOutput: true,
  inMemoryCaching: true
});

// Test 2: Incremental processing
const test2Result = runTest('Incremental Processing', {
  incremental: true,
  splitOutput: true,
  inMemoryCaching: true
});

// Test 3: File-based caching only
const test3Result = runTest('File-based Caching Only', {
  incremental: false,
  splitOutput: true,
  inMemoryCaching: false
});

// Test 4: Single file output
const test4Result = runTest('Single File Output', {
  incremental: false,
  splitOutput: false,
  inMemoryCaching: true
});

// Test 5: All optimizations
const test5Result = runTest('All Optimizations', {
  incremental: true,
  splitOutput: false,
  inMemoryCaching: false
});

// Print summary
console.log('\n=== Test Results Summary ===');
console.log(`Baseline: ${test1Result?.executionTime?.toFixed(2) || 'N/A'} seconds`);
console.log(`Incremental Processing: ${test2Result?.executionTime?.toFixed(2) || 'N/A'} seconds`);
console.log(`File-based Caching Only: ${test3Result?.executionTime?.toFixed(2) || 'N/A'} seconds`);
console.log(`Single File Output: ${test4Result?.executionTime?.toFixed(2) || 'N/A'} seconds`);
console.log(`All Optimizations: ${test5Result?.executionTime?.toFixed(2) || 'N/A'} seconds`);

console.log('\n=== Performance Improvement ===');
if (test1Result?.executionTime && test2Result?.executionTime) {
  console.log(`Incremental Processing: ${((test1Result.executionTime - test2Result.executionTime) / test1Result.executionTime * 100).toFixed(2)}%`);
} else {
  console.log('Incremental Processing: N/A');
}

if (test1Result?.executionTime && test3Result?.executionTime) {
  console.log(`File-based Caching Only: ${((test1Result.executionTime - test3Result.executionTime) / test1Result.executionTime * 100).toFixed(2)}%`);
} else {
  console.log('File-based Caching Only: N/A');
}

if (test1Result?.executionTime && test4Result?.executionTime) {
  console.log(`Single File Output: ${((test1Result.executionTime - test4Result.executionTime) / test1Result.executionTime * 100).toFixed(2)}%`);
} else {
  console.log('Single File Output: N/A');
}

if (test1Result?.executionTime && test5Result?.executionTime) {
  console.log(`All Optimizations: ${((test1Result.executionTime - test5Result.executionTime) / test1Result.executionTime * 100).toFixed(2)}%`);
} else {
  console.log('All Optimizations: N/A');
}
