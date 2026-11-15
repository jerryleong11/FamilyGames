@echo off
title Family Town - DEV test server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed. Install Node.js LTS from nodejs.org, then try again.
  echo.
  pause
  exit /b 1
)
node tools/run.js dev %*
echo.
pause
