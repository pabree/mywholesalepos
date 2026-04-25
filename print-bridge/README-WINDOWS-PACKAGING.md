# Stery POS Print Bridge Packaging

This bridge can run as a normal Node.js service during development or as a standalone Windows executable in production.

## Build the executable

From `print-bridge/`:

```bat
npm install
npm run build:win
```

Output:

```text
print-bridge\dist\stery-print-bridge.exe
```

## Deploy to cashier PC

Copy these files/folders to the cashier PC:

- `dist\stery-print-bridge.exe`
- `bridge.config.json`
- `start-print-bridge.bat`
- `install-print-bridge-startup.bat`
- `remove-print-bridge-startup.bat`
- `check-print-bridge.bat`

Put `bridge.config.json` next to the `.exe` inside `dist\`.

The executable looks for config and logs next to itself:

- `dist\bridge.config.json`
- `dist\logs\bridge.log`

## Startup

Run:

```bat
install-print-bridge-startup.bat
```

This creates a Startup folder shortcut that launches the `.exe` when present, or the Node script during development.

## Test

Manual run:

```bat
start-print-bridge.bat
```

Health check:

```bat
check-print-bridge.bat
```

Test print:

```bat
curl -X POST http://127.0.0.1:9777/test-print -H "Content-Type: application/json" -d "{\"mode\":\"escpos\"}"
```

## Uninstall startup

```bat
remove-print-bridge-startup.bat
```

## Notes

- Linux/dev usage is unchanged.
- The bridge exits with a clear message if port `9777` is already in use.
- If no printer name is set, it logs a warning and uses the system default where possible.
