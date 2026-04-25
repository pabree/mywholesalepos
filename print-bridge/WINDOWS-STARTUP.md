# Print Bridge Windows Startup

## Requirements
- Windows 10/11
- Node.js installed and on PATH
- Printer configured in Windows

## Bridge config
Edit `bridge.config.json`:

```json
{
  "port": 9777,
  "printMode": "escpos",
  "printerName": "TM-T20III",
  "paperWidth": "80",
  "characterSet": "SLOVENIA"
}
```

Environment variables override config values:
- `PRINT_BRIDGE_PORT`
- `BRIDGE_PRINT_MODE`
- `BRIDGE_PRINTER_NAME`
- `BRIDGE_PAPER_WIDTH`
- `BRIDGE_CHARACTER_SET`
- `POS_ORIGIN`

## Install
1. Open Command Prompt in `print-bridge/`.
2. Install dependencies:
   ```bat
   npm install
   ```
3. Test the bridge manually:
   ```bat
   npm start
   ```
4. Check health:
   ```bat
   check-print-bridge.bat
   ```
5. Install auto-start shortcut:
   ```bat
   install-print-bridge-startup.bat
   ```
6. Restart Windows and confirm the bridge starts automatically.

## Uninstall
Remove the startup shortcut:
```bat
remove-print-bridge-startup.bat
```

## Test print
```bat
curl -X POST http://127.0.0.1:9777/test-print -H "Content-Type: application/json" -d "{\"mode\":\"escpos\"}"
```

## Logs
The bridge writes logs to:
- `logs/bridge.log`

## Notes
- If port `9777` is already in use, the bridge exits with a clear error.
- If no printer is configured, the bridge logs a warning and uses the system default printer where possible.
- Linux usage is unchanged.
