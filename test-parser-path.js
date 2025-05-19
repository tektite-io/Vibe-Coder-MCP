// Simple test script to verify the path resolution in the parser module
import path from 'path';
import fs from 'fs';

// Simulate the path resolution logic from parser.ts
const processDir = process.cwd();
console.log(`Current working directory: ${processDir}`);

// Test path.join
const joinPath = path.join(processDir, 'public', 'grammars');
console.log(`Path using path.join: ${joinPath}`);

// Test path.resolve
const resolvePath = path.resolve(processDir, 'public', 'grammars');
console.log(`Path using path.resolve: ${resolvePath}`);

// Check if the directory exists
if (fs.existsSync(joinPath)) {
  console.log(`Directory exists using path.join: ${joinPath}`);
  // List files in the directory
  const files = fs.readdirSync(joinPath);
  console.log(`Files in directory (${files.length}): ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
} else {
  console.log(`Directory does NOT exist using path.join: ${joinPath}`);
}

if (fs.existsSync(resolvePath)) {
  console.log(`Directory exists using path.resolve: ${resolvePath}`);
  // List files in the directory
  const files = fs.readdirSync(resolvePath);
  console.log(`Files in directory (${files.length}): ${files.slice(0, 5).join(', ')}${files.length > 5 ? '...' : ''}`);
} else {
  console.log(`Directory does NOT exist using path.resolve: ${resolvePath}`);
}

// Test with absolute path
const absolutePath = '/public/grammars';
console.log(`Absolute path: ${absolutePath}`);
if (fs.existsSync(absolutePath)) {
  console.log(`Directory exists using absolute path: ${absolutePath}`);
} else {
  console.log(`Directory does NOT exist using absolute path: ${absolutePath}`);
}
