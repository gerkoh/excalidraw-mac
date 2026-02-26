const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Config (read-only — edit config.json directly)
  getConfig: () => ipcRenderer.invoke("get-config"),

  // File I/O: read and write .excalidraw files
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke("write-file", filePath, content),

  // Last opened path persistence
  getLastPath: () => ipcRenderer.invoke("get-last-path"),

  // Pending file from OS open-file event (double-click / Open With at launch)
  getPendingFile: () => ipcRenderer.invoke("get-pending-file"),

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  saveFileDialog: (content) => ipcRenderer.invoke("save-file-dialog", content),

  // Menu event listeners (main process → renderer)
  // Each returns an unsubscribe function for cleanup
  onMenuNew: (callback) => {
    ipcRenderer.on("menu-new", callback);
    return () => ipcRenderer.removeListener("menu-new", callback);
  },
  onMenuOpen: (callback) => {
    ipcRenderer.on("menu-open", callback);
    return () => ipcRenderer.removeListener("menu-open", callback);
  },
  onMenuSave: (callback) => {
    ipcRenderer.on("menu-save", callback);
    return () => ipcRenderer.removeListener("menu-save", callback);
  },
  onMenuSaveAs: (callback) => {
    ipcRenderer.on("menu-save-as", callback);
    return () => ipcRenderer.removeListener("menu-save-as", callback);
  },

  // OS open-file event (double-click / Open With)
  onOpenFile: (callback) => {
    ipcRenderer.on("open-file", callback);
    return () => ipcRenderer.removeListener("open-file", callback);
  },

  // Before-close event (main process asks renderer to save before closing)
  onBeforeClose: (callback) => {
    ipcRenderer.on("before-close", callback);
    return () => ipcRenderer.removeListener("before-close", callback);
  },
  acknowledgeClose: () => ipcRenderer.send("close-acknowledged"),
});
