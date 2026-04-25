@echo off
setlocal EnableExtensions
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP_DIR%\Stery POS Print Bridge.lnk"
if exist "%SHORTCUT%" (
  del /f /q "%SHORTCUT%"
  echo [bridge] Startup shortcut removed.
) else (
  echo [bridge] Startup shortcut was not found.
)
exit /b 0
