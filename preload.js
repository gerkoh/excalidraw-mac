const { contextBridge, ipcRenderer } = require("electron");

// sandboxed preload can't require local modules, so this helper stays inline
const subscribe = (channel) => (callback) => {
  ipcRenderer.on(channel, callback);
  return () => ipcRenderer.removeListener(channel, callback);
};

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
  onMenuNew: subscribe("menu-new"),
  onMenuOpen: subscribe("menu-open"),
  onMenuSave: subscribe("menu-save"),
  onMenuSaveAs: subscribe("menu-save-as"),

  // OS open-file event (double-click / Open With)
  onOpenFile: subscribe("open-file"),

  // Before-close event (main process asks renderer to save before closing)
  onBeforeClose: subscribe("before-close"),
  acknowledgeClose: () => ipcRenderer.send("close-acknowledged"),
});
