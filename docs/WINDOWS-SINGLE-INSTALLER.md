# Stery POS Windows Single Installer

This package installs:

- Stery POS Electron app
- Local print bridge

## Build order

1. Build the print bridge executable:
   ```bat
   cd print-bridge
   npm install
   npm run build:win
   ```
2. Build the Windows installer from the repo root:
   ```bat
   npm install
   npm run dist:win
   ```

## Installer output

The installer is written to the root `dist/` folder, for example:

- `dist\Stery POS Setup-1.0.0.exe`

## Installed layout

Typical install contents:

- `Stery POS.exe`
- Electron app resources
- bundled `print-bridge\stery-print-bridge.exe`
- bundled `print-bridge\bridge.config.json`

At runtime the bridge config/logs are mirrored into user data so they stay writable:

- `%APPDATA%\Stery POS\print-bridge\bridge.config.json`
- `%APPDATA%\Stery POS\print-bridge\logs\bridge.log`

## How the bridge starts

When Stery POS launches on Windows:

- the app checks `http://127.0.0.1:9777/health`
- if healthy, it leaves the bridge alone
- if not healthy, it starts the bundled bridge exe in the background
- the app keeps running if the bridge fails

## Editing printer settings

Edit the runtime config file:

- `%APPDATA%\Stery POS\print-bridge\bridge.config.json`

Important fields:

- `printerName`
- `paperWidth`
- `characterSet`

The bundled config file is copied there on first run if missing.

## Installation steps on cashier PC

1. Install the printer driver in Windows.
2. Run the installer.
3. Launch Stery POS.
4. Confirm the bridge health check succeeds:
   - `http://127.0.0.1:9777/health`
5. Print a receipt.
6. If required, adjust `printerName` in the runtime config and relaunch.

## Troubleshooting

- If port `9777` is already in use, the bridge logs a clear error and the POS still opens.
- If the printer is missing, the bridge logs a warning and uses the default printer behavior where possible.
- Browser fallback and Electron silent printing remain available if the local bridge is unavailable.
