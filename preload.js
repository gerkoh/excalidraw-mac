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

  // Tabs restored from the last quit (every tab) or the last window close (the active one).
  // { blank, openDialog, tabs: [{ filePath }], activeIndex }
  getOpenTabs: () => ipcRenderer.invoke("get-open-tabs"),

  // Pending file from OS open-file event (double-click / Open With at launch)
  getPendingFile: () => ipcRenderer.invoke("get-pending-file"),

  // File dialogs
  openFileDialog: () => ipcRenderer.invoke("open-file-dialog"),
  saveFileDialog: (content) => ipcRenderer.invoke("save-file-dialog", content),

  // Menu event listeners (main process → renderer)
  // Each returns an unsubscribe function for cleanup
  onMenuNew: subscribe("menu-new"),
  onMenuNewTab: subscribe("menu-new-tab"),
  onMenuCloseTab: subscribe("menu-close-tab"),
  onMenuOpen: subscribe("menu-open"),
  onMenuSave: subscribe("menu-save"),
  onMenuSaveAs: subscribe("menu-save-as"),

  // OS open-file event (double-click / Open With)
  onOpenFile: subscribe("open-file"),

  // Main asks the renderer to show a tab before the "Save changes?" sheet
  onActivateTab: subscribe("activate-tab"),

  // Close one tab (prompts when that drawing is an unsaved untitled). "remove" | "cancel" | "window"
  confirmCloseTab: (tabId) => ipcRenderer.invoke("confirm-close-tab", tabId),
  // At the tab cap, opening another file replaces the active drawing
  confirmReplaceActive: () => ipcRenderer.invoke("confirm-replace-active"),
  // Last tab's close button, and anything else that should run the window-close path
  closeWindow: () => ipcRenderer.send("close-window"),

  // Theme: effective "light" | "dark" (View -> Appearance preference resolved against macOS)
  getTheme: () => ipcRenderer.invoke("get-theme"),
  setThemePreference: (preference) => ipcRenderer.send("set-theme-preference", preference),
  onThemeChanged: subscribe("theme-changed"),

  // { fullScreen } so the tab strip can drop its traffic-light inset
  onWindowChrome: subscribe("window-chrome"),

  // Before-close event (main process asks renderer to save before closing)
  onBeforeClose: subscribe("before-close"),
  acknowledgeClose: () => ipcRenderer.send("close-acknowledged"),

  // Document state ({ filePath, dirty, hasFilePath, hasContent }) for the title,
  // proxy icon, edited dot and "Save changes?" prompt
  setDocumentState: (state) => ipcRenderer.send("set-document-state", state),

  // Save As requested by main after the user picked "Save" in the unsaved-changes prompt
  onSaveAsRequest: subscribe("save-as-request"),
  sendSaveAsResult: (saved) => ipcRenderer.send("save-as-result", saved),

  // Shape library, stored at a fixed path chosen by the main process
  getLibrary: () => ipcRenderer.invoke("get-library"),
  saveLibrary: (libraryItems) => ipcRenderer.invoke("save-library", libraryItems),

  // Library installs from libraries.excalidraw.com (excalidraw-mac:// URLs).
  // The event carries no data; call takePendingLibraryInstalls() to get the requests.
  takePendingLibraryInstalls: () => ipcRenderer.invoke("take-pending-library-installs"),
  onLibraryInstallRequested: subscribe("library-install-requested"),
});
