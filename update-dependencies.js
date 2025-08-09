#!/usr/bin/env node

/**
 * Comprehensive Dependency Update Script
 * Safely updates dependencies while maintaining compatibility
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

console.log('🔄 Starting comprehensive dependency update...\n');

// Critical security updates
const securityUpdates = {
  '@modelcontextprotocol/sdk': '^1.17.2',
  'axios': '^1.11.0',
  'ws': '^8.18.3'
};

// Development tool updates
const devUpdates = {
  'typescript': '^5.9.2',
  'vitest': '^3.2.4',
  '@vitest/coverage-v8': '^3.2.4',
  '@vitest/ui': '^3.2.4',
  '@typescript-eslint/eslint-plugin': '^8.39.0',
  '@types/node': '^22.17.1',
  'nodemon': '^3.1.10',
  'pino-pretty': '^13.1.1'
};

// Production dependency updates
const prodUpdates = {
  'chalk': '^5.5.0',
  'ora': '^8.2.0',
  'pino': '^9.8.0',
  'simple-git': '^3.28.0',
  'yaml': '^2.8.1',
  'glob': '^11.0.3',
  'inquirer': '^12.9.1',
  'fs-extra': '^11.3.1',
  'dotenv': '^16.6.1'
};

// Type dependencies to move to devDependencies
const typePackagesToMove = [
  '@types/figlet',
  '@types/inquirer', 
  '@types/uuid',
  '@types/ws'
];

function runCommand(command, description) {
  console.log(`📦 ${description}...`);
  try {
    execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed\n`);
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    process.exit(1);
  }
}

function updateDependencies(updates, isDev = false) {
  const flag = isDev ? '--save-dev' : '--save';
  for (const [pkg, version] of Object.entries(updates)) {
    runCommand(`npm install ${flag} ${pkg}@${version}`, `Updating ${pkg} to ${version}`);
  }
}

// Step 1: Fix security vulnerabilities
runCommand('npm audit fix', 'Fixing security vulnerabilities');

// Step 2: Update critical security packages
console.log('🔒 Updating security-critical packages...');
updateDependencies(securityUpdates);

// Step 3: Update development dependencies
console.log('🛠️ Updating development dependencies...');
updateDependencies(devUpdates, true);

// Step 4: Update production dependencies
console.log('📦 Updating production dependencies...');
updateDependencies(prodUpdates);

// Step 5: Move type packages to devDependencies
console.log('📝 Moving type packages to devDependencies...');
for (const pkg of typePackagesToMove) {
  const currentVersion = packageJson.dependencies?.[pkg] || packageJson.devDependencies?.[pkg];
  if (currentVersion) {
    runCommand(`npm uninstall ${pkg}`, `Removing ${pkg} from dependencies`);
    runCommand(`npm install --save-dev ${pkg}@${currentVersion}`, `Installing ${pkg} as devDependency`);
  }
}

// Step 6: Clean up and verify
runCommand('npm dedupe', 'Deduplicating dependencies');
runCommand('npm run type-check', 'Running type check');
runCommand('npm run lint', 'Running linter');
runCommand('npm run build', 'Testing build process');

// Step 7: Final security audit
runCommand('npm audit', 'Running final security audit');

console.log('✨ Dependency update completed successfully!');
console.log('\n📋 Summary:');
console.log('- Security vulnerabilities fixed');
console.log('- Critical packages updated');
console.log('- Type packages moved to devDependencies');
console.log('- Build and type checking verified');
console.log('\n🚀 Your package is now up to date and secure!');