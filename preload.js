const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  printReceipt: (url) => ipcRenderer.invoke("print-receipt", url),
});
