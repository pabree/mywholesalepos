@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
if not exist "%STARTUP_DIR%" mkdir "%STARTUP_DIR%"
set "BRIDGE_EXE=%~dp0dist\stery-print-bridge.exe"
if exist "%BRIDGE_EXE%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $shortcut = $ws.CreateShortcut($env:STARTUP_DIR + '\\Stery POS Print Bridge.lnk'); $shortcut.TargetPath = '%BRIDGE_EXE%'; $shortcut.WorkingDirectory = '%~dp0dist'; $shortcut.WindowStyle = 7; $shortcut.Description = 'Start Stery POS Print Bridge'; $shortcut.Save()"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $shortcut = $ws.CreateShortcut($env:STARTUP_DIR + '\\Stery POS Print Bridge.lnk'); $shortcut.TargetPath = '%~dp0start-print-bridge.bat'; $shortcut.WorkingDirectory = '%~dp0'; $shortcut.WindowStyle = 7; $shortcut.Description = 'Start Stery POS Print Bridge'; $shortcut.Save()"
)
if errorlevel 1 (
  echo [bridge] Failed to create startup shortcut.
  exit /b 1
)
echo [bridge] Startup shortcut installed in %STARTUP_DIR%
exit /b 0
