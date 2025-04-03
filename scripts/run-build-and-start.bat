@echo off
echo Stopping any running server processes...
taskkill /f /im node.exe /t 2>nul
timeout /t 3
echo Rebuilding the project (in case updates are needed)...
cd %~dp0
call npm run build
if %errorlevel% neq 0 (
  echo Build failed!
  exit /b %errorlevel%
)

echo Starting the server...
call npm start > server-debug.log 2>&1
