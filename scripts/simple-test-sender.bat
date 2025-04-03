@echo off
rem Clear the log file
echo. > task-test-log.txt

rem Sending the test message to the server (already running)
echo {"id": "test123", "type": "request", "request": {"name": "generate-task-list", "params": {"productDescription": "A simple todo list app", "userStories": "US-1: As a user, I want to create todo items\nUS-2: As a user, I want to complete tasks\nUS-3: As a user, I want to sync across devices"}}} > message.txt

rem Display the message for reference
echo Sending test message:
type message.txt
echo.

rem Send the message to stdin of the running server
type message.txt >> server-debug.log

echo Test message sent. Check server-debug.log for results.
