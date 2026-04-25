const path = require("path");
const fs = require("fs/promises");
const fsSync = require("fs");
const { spawn } = require("child_process");
const { app, BrowserWindow, Menu, globalShortcut, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let updateCheckStarted = false;
let bridgeProcess = null;
let bridgeStartPromise = null;

function bridgePaths() {
  const runtimeRoot = app.getPath("userData");
  const runtimeDir = path.join(runtimeRoot, "print-bridge");
  const bundledDir = process.resourcesPath ? path.join(process.resourcesPath, "print-bridge") : null;
  const bundledExe = bundledDir ? path.join(bundledDir, "stery-print-bridge.exe") : null;
  const runtimeConfig = path.join(runtimeDir, "bridge.config.json");
  const bundledConfig = bundledDir ? path.join(bundledDir, "bridge.config.json") : null;
  const runtimeLogDir = path.join(runtimeDir, "logs");
  return {
    runtimeDir,
    bundledDir,
    bundledExe,
    runtimeConfig,
    bundledConfig,
    runtimeLogDir,
    healthUrl: "http://127.0.0.1:9777/health",
  };
}

async function isBridgeHealthy() {
  try {
    const response = await fetch("http://127.0.0.1:9777/health", { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureBridgeRuntimeFiles() {
  const paths = bridgePaths();
  await fs.mkdir(paths.runtimeDir, { recursive: true });
  await fs.mkdir(paths.runtimeLogDir, { recursive: true });
  if (paths.bundledConfig && fsSync.existsSync(paths.bundledConfig) && !fsSync.existsSync(paths.runtimeConfig)) {
    await fs.copyFile(paths.bundledConfig, paths.runtimeConfig);
  }
  return paths;
}

async function startBundledPrintBridge() {
  const paths = bridgePaths();
  if (!paths.bundledExe || !fsSync.existsSync(paths.bundledExe)) {
    console.warn("[bridge] bundled print bridge not found", paths.bundledExe);
    return false;
  }
  if (bridgeProcess && !bridgeProcess.killed) {
    return true;
  }
  await ensureBridgeRuntimeFiles();
  bridgeProcess = spawn(paths.bundledExe, [], {
    cwd: paths.bundledDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: {
      ...process.env,
      BRIDGE_CONFIG_PATH: paths.runtimeConfig,
      BRIDGE_LOG_DIR: paths.runtimeLogDir,
      PRINT_BRIDGE_PORT: "9777",
    },
  });
  bridgeProcess.unref();
  console.info("[bridge] started bundled print bridge", {
    pid: bridgeProcess.pid,
    exe: paths.bundledExe,
    config: paths.runtimeConfig,
    logs: paths.runtimeLogDir,
  });
  return true;
}

async function ensurePrintBridgeRunning() {
  if (process.platform !== "win32") return;
  if (!app.isPackaged) {
    console.info("[bridge] packaged bridge startup skipped in development");
    return;
  }
  if (await isBridgeHealthy()) {
    console.info("[bridge] local print bridge already healthy");
    return;
  }
  if (bridgeStartPromise) return bridgeStartPromise;
  bridgeStartPromise = (async () => {
    try {
      const started = await startBundledPrintBridge();
      if (!started) return;
      for (let i = 0; i < 20; i += 1) {
        if (await isBridgeHealthy()) {
          console.info("[bridge] local print bridge is healthy");
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      console.warn("[bridge] local print bridge did not become healthy in time");
    } catch (err) {
      console.error("[bridge] failed to start local print bridge", err);
    }
  })().finally(() => {
    bridgeStartPromise = null;
  });
  return bridgeStartPromise;
}

function resolvePosUrl() {
  const explicit = process.env.POS_URL && process.env.POS_URL.trim();
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "development") {
    return process.env.DEV_POS_URL || "http://localhost:3000";
  }

  return process.env.PROD_POS_URL || "https://wholesale-pos.onrender.com";
}

async function printReceiptUrl(url) {
  if (!url) throw new Error("Receipt URL is required");
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error("Main window is not available");
  }

  const authToken = await mainWindow.webContents.executeJavaScript(
    'localStorage.getItem("pos_api_token") || ""',
    true
  );
  if (!authToken) {
    throw new Error("POS auth token is unavailable");
  }

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 760,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      session: mainWindow.webContents.session,
    },
  });

  try {
    const extraHeaders = `Authorization: Token ${authToken}\r\n`;
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Receipt print timed out"));
      }, 30000);

      const cleanup = () => clearTimeout(timeout);

      const done = (err) => {
        cleanup();
        if (err) reject(err);
        else resolve();
      };

      const startPrint = async () => {
        try {
          setTimeout(() => {
            try {
              printWindow.webContents.print(
                {
                  silent: true,
                  printBackground: true,
                },
                (success, failureReason) => {
                  if (!success) {
                    done(new Error(failureReason || "Receipt print failed"));
                    return;
                  }
                  done();
                }
              );
            } catch (err) {
              done(err);
            }
          }, 300);
        } catch (err) {
          done(err);
        }
      };

      printWindow.webContents.once("did-finish-load", startPrint);
      printWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        done(new Error(`Failed to load receipt page (${errorCode}): ${errorDescription} ${validatedURL || ""}`.trim()));
      });
      printWindow.loadURL(url, { extraHeaders }).catch((err) => done(err));
    });
  } finally {
    if (!printWindow.isDestroyed()) {
      printWindow.close();
    }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    kiosk: false,
    fullscreen: true,
    backgroundColor: "#111111",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.resolve(__dirname, "preload.js"),
      devTools: process.env.NODE_ENV === "development",
    },
  });

  Menu.setApplicationMenu(null);

  const posUrl = resolvePosUrl();
  mainWindow.loadURL(posUrl);

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.maximize();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = (input.key || "").toLowerCase();
    const isReload =
      (input.control || input.meta) && key === "r" ||
      input.key === "F5";
    const isDevTools =
      (input.control || input.meta) && input.shift && key === "i";

    if (isReload || isDevTools) {
      event.preventDefault();
    }
  });

  mainWindow.webContents.on("context-menu", (event) => {
    event.preventDefault();
  });
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    console.info("[updater] skipped in development");
    return;
  }
  if (updateCheckStarted) return;
  updateCheckStarted = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    console.info("[updater] checking for update");
  });
  autoUpdater.on("update-available", (info) => {
    console.info("[updater] update available", info?.version || info);
  });
  autoUpdater.on("update-not-available", (info) => {
    console.info("[updater] update not available", info?.version || info);
  });
  autoUpdater.on("download-progress", (progress) => {
    console.info("[updater] download progress", {
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred,
      total: progress.total,
    });
  });
  autoUpdater.on("update-downloaded", async (info) => {
    console.info("[updater] update downloaded", info?.version || info);
    try {
      const result = await dialog.showMessageBox({
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update ready",
        message: "A new version of Stery POS is ready to install.",
        detail: "Restart now to finish installing the update, or choose Later to continue working.",
      });
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    } catch (err) {
      console.warn("[updater] restart prompt failed", err);
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on("error", (err) => {
    console.error("[updater] error", err);
  });

  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn("[updater] check failed", err);
    });
  }, 5000);
}

ipcMain.handle("print-receipt", async (_event, url) => {
  return printReceiptUrl(url);
});

app.whenReady().then(() => {
  createWindow();
  ensurePrintBridgeRunning();
  setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  if (process.env.NODE_ENV !== "development") {
    globalShortcut.register("CommandOrControl+R", () => {});
    globalShortcut.register("F5", () => {});
    globalShortcut.register("CommandOrControl+Shift+I", () => {});
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
