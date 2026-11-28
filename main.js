const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme, shell } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
// electron-store v12 is ESM-only. Electron 45's Node can require() it;
// the class is the default export.
const { default: Store } = require("electron-store");
const { isAllowedPath, readConfig, readDrawing, writeDrawing } = require("./electron/fileService");
const { buildMenuTemplate } = require("./electron/menu");
const {
  createCurrentFileRecorder,
  createOpenFileHandler,
  applyReportedFile,
  isReadableFile,
} = require("./electron/document");
const { backgroundColorFor, createThemeController } = require("./electron/theme");
const { attachNavigationGuard } = require("./electron/navigationGuard");
const { createWindowSession } = require("./electron/windowSession");

// stores last opened file path + theme preference (initialized after app is initialized)
let store;
// "file became current": persists lastOpenedPath + adds to Open Recent (initialized with store)
let recordCurrentFile;
// View -> Appearance preference + effective theme (initialized with store)
let theme;

// config file path — in dev, config.json is in project root (__dirname);
// in production, electron-builder copies it to Contents/Resources/
const configPath = app.isPackaged
  ? path.join(process.resourcesPath, "config.json")
  : path.join(__dirname, "config.json");

const indexPath = path.join(__dirname, "excalidraw-app/dist/index.html");
const appUrl = pathToFileURL(indexPath).href;

// --- Window sessions (document state + close handshake), keyed by webContents id ---

const sessions = new Map();
let isQuitting = false;

const sessionFor = (webContents) => sessions.get(webContents.id);

// resolves true when the window's drawing may be replaced (prompting for unsaved changes if needed)
const confirmReplaceDocument = async (win) => {
  const session = sessionFor(win.webContents);
  return session ? session.confirmReplaceDocument() : true;
};

// --- IPC Handlers (registered inside app.whenReady) ---

const registerIpcHandlers = () => {
  ipcMain.handle("get-config", () => readConfig(configPath));

  ipcMain.handle("read-file", (_event, filePath) => readDrawing(filePath));

  ipcMain.handle("write-file", (_event, filePath, content) => writeDrawing(filePath, content));

  // Get last opened file path
  ipcMain.handle("get-last-path", () => {
    return store.get("lastOpenedPath") ?? null;
  });

  // Returns and clears the pending file path from OS open-file event
  ipcMain.handle("get-pending-file", () => {
    const p = pendingFilePath;
    pendingFilePath = null;
    if (!p) return null;
    // file vanished since open-file was queued: fall back to the last opened drawing
    if (!isReadableFile(p)) return null;
    recordCurrentFile(p);
    return p;
  });

  ipcMain.handle("open-file-dialog", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const config = await readConfig(configPath);
    const result = await dialog.showOpenDialog(win, {
      defaultPath: config?.defaultOpenDir || undefined,
      filters: [{ name: "Excalidraw", extensions: ["excalidraw"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const content = await readDrawing(filePath);
    if (content === null) return null;
    recordCurrentFile(filePath);
    return { path: filePath, content };
  });

  ipcMain.handle("save-file-dialog", async (event, content) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const config = await readConfig(configPath);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: config?.defaultOpenDir || undefined,
      filters: [{ name: "Excalidraw", extensions: ["excalidraw"] }],
    });
    if (result.canceled || !result.filePath) return null;

    const filePath = result.filePath;
    if (!(await writeDrawing(filePath, content))) return null;
    recordCurrentFile(filePath);
    return filePath;
  });

  // one report from the renderer covers the window title + proxy icon and the
  // dirty / untitled / empty state used for the edited dot and "Save changes?" prompt
  ipcMain.on("set-document-state", (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && state && typeof state === "object" && "filePath" in state) {
      applyReportedFile(win, state.filePath, isAllowedPath);
    }
    sessionFor(event.sender)?.setDocumentState(state);
  });

  ipcMain.on("save-as-result", (event, saved) => {
    sessionFor(event.sender)?.handleSaveAsResult(saved);
  });

  ipcMain.on("close-acknowledged", (event) => {
    sessionFor(event.sender)?.handleCloseAcknowledged();
  });

  ipcMain.handle("get-theme", () => theme.getEffectiveTheme());

  // Excalidraw's in-app theme toggle maps onto an explicit Light/Dark preference
  ipcMain.on("set-theme-preference", (_event, preference) => theme.setPreference(preference));
};

// --- Window ---

// read once at startup; createWindow stays synchronous so `activate` can't race into two windows
let windowConfig = null;

const createWindow = () => {
  const win = new BrowserWindow({
    width: windowConfig?.windowWidth ?? 1512,
    height: windowConfig?.windowHeight ?? 982,
    icon: path.join(__dirname, "excalidraw-app/icon.png"),
    // replaced by the file name once the renderer reports its current file
    title: app.name,
    // paint the effective theme's background before the renderer loads (no white flash in dark mode)
    backgroundColor: backgroundColorFor(theme.getEffectiveTheme()),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // the title tracks the current file, so ignore index.html's <title>
  win.on("page-title-updated", (e) => e.preventDefault());

  // the id is unavailable once the window is destroyed, so capture it for cleanup
  const webContentsId = win.webContents.id;
  const session = createWindowSession({
    win,
    showMessageBox: (parent, options) => dialog.showMessageBox(parent, options),
    isQuitting: () => isQuitting,
    onCloseCancelled: () => {
      isQuitting = false;
    },
    quit: () => app.quit(),
  });
  sessions.set(webContentsId, session);

  win.on("close", (event) => {
    session.handleClose(event);
  });
  win.on("closed", () => {
    sessions.delete(webContentsId);
  });
  win.webContents.on("render-process-gone", () => session.handleRendererGone());

  attachNavigationGuard(win.webContents, {
    appUrl,
    openExternal: (url) => shell.openExternal(url),
  });

  win.loadFile(indexPath);
  return win;
};

// --- Application Menu ---

const buildMenu = () => {
  const template = buildMenuTemplate({
    appName: app.name,
    getFocusedWindow: () => BrowserWindow.getFocusedWindow(),
    clearLastOpenedPath: () => store.set("lastOpenedPath", null),
    confirmReplaceDocument,
    themePreference: theme.getPreference(),
    setThemePreference: (preference) => theme.setPreference(preference),
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

// --- App Lifecycle ---

// Track file path requested via OS open-file (e.g. double-click / Open With)
let pendingFilePath = null;

const handleOpenFile = createOpenFileHandler({
  isAllowedPath,
  isReadable: isReadableFile,
  // safe before app "ready" and without a window
  showError: (title, content) => dialog.showErrorBox(title, content),
  // store may not be ready if this fires before app.whenReady() completes
  isStoreReady: () => store != null,
  recordCurrentFile: (filePath) => recordCurrentFile(filePath),
  getWindow: () => BrowserWindow.getAllWindows()[0] ?? null,
  confirmReplaceDocument,
  isAppReady: () => app.isReady(),
  setPendingFile: (filePath) => {
    pendingFilePath = filePath;
  },
  createWindow: () => createWindow(),
});

// Finder double-click, Open With, and File -> Open Recent / Dock recent items all arrive here
app.on("open-file", (event, filePath) => {
  event.preventDefault();
  handleOpenFile(filePath);
});

// registered once for the app; each window session reads it through isQuitting()
app.on("before-quit", () => {
  isQuitting = true;
});

app.whenReady().then(async () => {
  // loaded before the store so that, once `store` is set, createWindow has its config
  windowConfig = await readConfig(configPath);
  // saves to ~/Library/Application Support/excalidraw-mac/excalidraw-mac.json
  store = new Store({ name: "excalidraw-mac" });
  recordCurrentFile = createCurrentFileRecorder({
    store,
    addRecentDocument: (filePath) => app.addRecentDocument(filePath),
    isAllowedPath,
  });
  theme = createThemeController({
    store,
    nativeTheme,
    getAllWindows: () => BrowserWindow.getAllWindows(),
    rebuildMenu: () => buildMenu(),
  });
  theme.init();

  registerIpcHandlers();
  buildMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
