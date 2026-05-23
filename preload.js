const { contextBridge, ipcRenderer } = require("electron");

// --- IPC listener helpers ---

/**
 * Create a listener factory that forwards the raw IPC arguments (including event).
 * Used for menu and system events where the handler signature includes the event.
 */
const onIpc = (channel) => (callback) => {
  ipcRenderer.on(channel, callback);
  return () => ipcRenderer.removeListener(channel, callback);
};

/**
 * Create a listener factory that strips the IPC event object and forwards only
 * the first payload argument. Used for copilot events where the renderer
 * doesn't need the Electron event.
 */
const onIpcPayload = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld("electronAPI", {
  // Config (read-only - edit config.json directly)
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
  onMenuNew: onIpc("menu-new"),
  onMenuOpen: onIpc("menu-open"),
  onMenuSave: onIpc("menu-save"),
  onMenuSaveAs: onIpc("menu-save-as"),

  // OS open-file event (double-click / Open With)
  onOpenFile: onIpc("open-file"),

  // Before-close event (main process asks renderer to save before closing)
  onBeforeClose: onIpc("before-close"),
  acknowledgeClose: () => ipcRenderer.send("close-acknowledged"),

  // Copilot agent session (owned by the main process)
  copilotStart: () => ipcRenderer.invoke("copilot:start"),
  copilotSend: (text) => ipcRenderer.invoke("copilot:send", text),
  copilotAbort: () => ipcRenderer.invoke("copilot:abort"),
  copilotReset: () => ipcRenderer.invoke("copilot:reset"),
  onCopilotEvent: onIpcPayload("copilot:event"),

  // Streaming diagram IPC - elements arrive one at a time
  onCopilotDiagramStart: onIpcPayload("copilot:diagram-start"),
  onCopilotDiagramElement: onIpcPayload("copilot:diagram-element"),
  onCopilotDiagramCamera: onIpcPayload("copilot:diagram-camera"),
  onCopilotDiagramEnd: onIpcPayload("copilot:diagram-end"),
  onCopilotDiagramAbort: onIpcPayload("copilot:diagram-abort"),
});
