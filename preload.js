const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // Config (read-only — edit config.json directly)
  getConfig: () => ipcRenderer.invoke("get-config"),

  // File I/O: read and write .excalidraw files
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke("write-file", filePath, content),

  // Last opened path persistence
  saveLastPath: (filePath) => ipcRenderer.invoke("save-last-path", filePath),
  getLastPath: () => ipcRenderer.invoke("get-last-path"),

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  saveFileDialog: (content) => ipcRenderer.invoke("save-file-dialog", content),

  // Menu event listeners (main process → renderer)
  onMenuOpen: (callback) => ipcRenderer.on("menu-open", callback),
  onMenuSave: (callback) => ipcRenderer.on("menu-save", callback),
  onMenuSaveAs: (callback) => ipcRenderer.on("menu-save-as", callback),

  // Cleanup listeners
  offMenuOpen: (callback) => ipcRenderer.removeListener("menu-open", callback),
  offMenuSave: (callback) => ipcRenderer.removeListener("menu-save", callback),
  offMenuSaveAs: (callback) => ipcRenderer.removeListener("menu-save-as", callback),
});
