@echo off
echo Running MCP server with debug output for config...
SET NODE_ENV=development
SET LOG_LEVEL=debug
SET DEBUG_CONFIG=true

echo Building TypeScript...
call npm run build

echo Starting server...
node build/index.js
