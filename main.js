const path = require("path");
const { app, BrowserWindow, Menu, globalShortcut, ipcMain } = require("electron");

let mainWindow = null;

function resolvePosUrl() {
  const explicit = process.env.POS_URL && process.env.POS_URL.trim();
  if (explicit) return explicit;

  if (process.env.NODE_ENV === "development") {
    return process.env.DEV_POS_URL || "http://localhost:3000";
  }

  return process.env.PROD_POS_URL || "https://your-pos-domain.example";
}

async function printReceiptUrl(url) {
  if (!url) throw new Error("Receipt URL is required");

  const printWindow = new BrowserWindow({
    show: false,
    width: 420,
    height: 760,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  try {
    await printWindow.loadURL(url);
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
      };

      if (printWindow.webContents.isLoading()) {
        printWindow.webContents.once("did-finish-load", startPrint);
      } else {
        startPrint();
      }
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
      preload: path.join(__dirname, "preload.js"),
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

ipcMain.handle("print-receipt", async (_event, url) => {
  return printReceiptUrl(url);
});

app.whenReady().then(() => {
  createWindow();

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
