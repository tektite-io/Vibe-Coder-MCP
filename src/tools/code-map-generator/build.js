/**
 * Build script for the code-map-generator tool.
 * This script handles the build process for the code-map-generator tool.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create the dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Create the stubs directory if it doesn't exist
const stubsDir = path.join(__dirname, 'stubs');
if (!fs.existsSync(stubsDir)) {
  fs.mkdirSync(stubsDir, { recursive: true });
}

// Copy the stub files to the dist directory
const stubFiles = fs.readdirSync(stubsDir);
for (const file of stubFiles) {
  // Skip TypeScript declaration files as they'll be handled by the TypeScript compiler
  if (file.endsWith('.d.ts')) {
    continue;
  }

  const srcPath = path.join(stubsDir, file);
  const destPath = path.join(distDir, 'stubs', file);

  // Create the dist/stubs directory if it doesn't exist
  if (!fs.existsSync(path.join(distDir, 'stubs'))) {
    fs.mkdirSync(path.join(distDir, 'stubs'), { recursive: true });
  }

  fs.copyFileSync(srcPath, destPath);
  console.log(`Copied ${srcPath} to ${destPath}`);
}

// Compile the TypeScript files
try {
  console.log('Compiling TypeScript files...');
  execSync('tsc --skipLibCheck --noEmit false', { stdio: 'inherit' });
  console.log('TypeScript compilation successful.');
} catch (error) {
  console.error('TypeScript compilation failed:', error.message);
  process.exit(1);
}

console.log('Build completed successfully.');
