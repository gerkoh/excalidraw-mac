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

  // Current file (null = untitled): main updates the window title + proxy icon
  setCurrentFile: (filePath) => ipcRenderer.send("set-current-file", filePath),

  // Theme: effective "light" | "dark" (View -> Appearance preference resolved against macOS)
  getTheme: () => ipcRenderer.invoke("get-theme"),
  setThemePreference: (preference) => ipcRenderer.send("set-theme-preference", preference),
  onThemeChanged: subscribe("theme-changed"),

  // Before-close event (main process asks renderer to save before closing)
  onBeforeClose: subscribe("before-close"),
  acknowledgeClose: () => ipcRenderer.send("close-acknowledged"),

  // Document state ({ dirty, hasFilePath, hasContent }) for the edited dot and "Save changes?"
  setDocumentState: (state) => ipcRenderer.send("set-document-state", state),

  // Save As requested by main after the user picked "Save" in the unsaved-changes prompt
  onSaveAsRequest: subscribe("save-as-request"),
  sendSaveAsResult: (saved) => ipcRenderer.send("save-as-result", saved),
});
