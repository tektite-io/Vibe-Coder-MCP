#!/bin/bash

# Package Security and Dependency Update Script
# Run this script to fix security vulnerabilities and update dependencies

echo "🔒 Fixing security vulnerabilities and updating dependencies..."

# Fix security vulnerabilities
echo "📦 Running npm audit fix..."
npm audit fix

# Update critical dependencies
echo "🔄 Updating critical dependencies..."

# Update MCP SDK (major update)
npm install @modelcontextprotocol/sdk@^1.17.2

# Update security-critical packages
npm install axios@^1.11.0

# Update TypeScript and build tools
npm install --save-dev typescript@^5.9.2
npm install --save-dev vitest@^3.2.4
npm install --save-dev @vitest/coverage-v8@^3.2.4
npm install --save-dev @vitest/ui@^3.2.4

# Update other important packages
npm install chalk@^5.5.0
npm install ora@^8.2.0
npm install pino@^9.8.0
npm install simple-git@^3.28.0
npm install ws@^8.18.3
npm install yaml@^2.8.1
npm install glob@^11.0.3
npm install inquirer@^12.9.1

# Move type dependencies to devDependencies
echo "📝 Moving type packages to devDependencies..."
npm uninstall @types/figlet @types/inquirer @types/uuid @types/ws
npm install --save-dev @types/figlet@^1.7.0 @types/inquirer@^9.0.9 @types/uuid@^10.0.0 @types/ws@^8.18.1

# Update other dev dependencies
npm install --save-dev @types/node@^22.17.1
npm install --save-dev @typescript-eslint/eslint-plugin@^8.39.0
npm install --save-dev nodemon@^3.1.10
npm install --save-dev pino-pretty@^13.1.1

echo "✅ Security fixes and dependency updates completed!"
echo "🔍 Running final security audit..."
npm audit

echo "🧪 Running type check to ensure compatibility..."
npm run type-check

echo "🏗️ Testing build process..."
npm run build

echo "✨ All updates completed successfully!"