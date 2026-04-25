@echo off
setlocal EnableExtensions
cd /d "%~dp0"
if not exist logs mkdir logs
set "BRIDGE_EXE=%~dp0dist\stery-print-bridge.exe"
if exist "%BRIDGE_EXE%" (
  echo [bridge] Starting packaged print bridge...
  echo [bridge] Logs: %~dp0logs\bridge.log
  start "Stery POS Print Bridge" /min "%BRIDGE_EXE%"
  exit /b 0
)
where node >nul 2>nul
if errorlevel 1 (
  echo [bridge] Node.js is not installed or not available on PATH.
  pause
  exit /b 1
)
echo [bridge] Starting print bridge...
echo [bridge] Logs: %~dp0logs\bridge.log
start "Stery POS Print Bridge" /min cmd /c "node server.js >> logs\bridge.log 2>&1"
exit /b 0
