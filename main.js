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
const { filterStoredTabs, normalizeStoredSession } = require("./electron/tabSession");
const { windowChromeOptions } = require("./electron/windowChrome");
const { getLibraryPath } = require("./electron/libraryStore");
const { registerLibraryIpcHandlers } = require("./electron/libraryIpc");
const {
  registerLibraryProtocolClient,
  createLibraryInstallQueue,
  handleLibraryInstallUrl,
} = require("./electron/libraryInstall");

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
// per-window launch flags (blank tab, or blank tab plus the open dialog). Consumed by get-open-tabs.
const windowStartup = new WeakMap();
// rebuilt when the tab count changes, so New / New Tab disable at the cap
let lastMenuTabCount;

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

  // one report from the renderer covers every tab: the active one drives the title and
  // proxy icon, and any dirty tab lights the edited dot
  ipcMain.on("set-document-state", (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const session = sessionFor(event.sender);
    if (!session) return;
    session.setDocumentState(state);
    if (win) applyReportedFile(win, session.getActiveFilePath(), isAllowedPath);
    syncMenu();
  });

  ipcMain.handle("get-open-tabs", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const startup = (win && windowStartup.get(win)) || { blank: false, openDialog: false };
    if (win) windowStartup.delete(win);
    if (startup.blank) {
      return { blank: true, openDialog: startup.openDialog === true, tabs: [], activeIndex: 0 };
    }
    return { blank: false, openDialog: false, ...readOpenTabs() };
  });

  ipcMain.handle("confirm-close-tab", async (event, tabId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const session = sessionFor(event.sender);
    if (!win || !session) return "cancel";
    const result = await session.confirmCloseTab(tabId);
    if (result === "window") {
      win.close();
      return "window";
    }
    return result ? "remove" : "cancel";
  });

  ipcMain.handle("confirm-replace-active", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return false;
    return confirmReplaceDocument(win);
  });

  ipcMain.on("close-window", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) win.close();
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

  // shape library: ~/Library/Application Support/excalidraw-mac/library.excalidrawlib
  registerLibraryIpcHandlers({
    ipcMain,
    libraryPath: getLibraryPath(app.getPath("userData")),
    installQueue: libraryInstallQueue,
  });
};

// --- Window ---

// read once at startup; createWindow stays synchronous so `activate` can't race into two windows
let windowConfig = null;

// openTabs is written on quit and window close. A build from before tabs only has lastOpenedPath.
const readOpenTabs = () => {
  const stored = store.get("openTabs");
  if (stored == null) {
    const last = store.get("lastOpenedPath");
    if (typeof last === "string" && isAllowedPath(last) && isReadableFile(last)) {
      return { tabs: [{ filePath: last }], activeIndex: 0 };
    }
    return { tabs: [], activeIndex: 0 };
  }
  return filterStoredTabs(normalizeStoredSession(stored), (tab) => {
    if (!isAllowedPath(tab.filePath) || !isReadableFile(tab.filePath)) {
      console.error("[main] Dropping a restored tab that can't be opened:", tab.filePath);
      return false;
    }
    return true;
  });
};

const persistOpenTabs = (snapshot) => {
  const checked = filterStoredTabs(snapshot, (tab) => isAllowedPath(tab.filePath));
  store.set("openTabs", checked);
  const active = checked.tabs[checked.activeIndex] ?? null;
  store.set("lastOpenedPath", active ? active.filePath : null);
  for (const tab of checked.tabs) app.addRecentDocument(tab.filePath);
};

const currentTabCount = () => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  if (!win) return null;
  const session = sessionFor(win.webContents);
  return session ? session.getTabCount() : null;
};

const syncMenu = () => {
  const count = currentTabCount();
  if (count === lastMenuTabCount) return;
  buildMenu();
};

const createWindow = ({ blank = false, openDialog = false } = {}) => {
  const win = new BrowserWindow({
    width: windowConfig?.windowWidth ?? 1512,
    height: windowConfig?.windowHeight ?? 982,
    icon: path.join(__dirname, "excalidraw-app/icon.png"),
    // replaced by the file name once the renderer reports its current file
    title: app.name,
    // paint the effective theme's background before the renderer loads (no white flash in dark mode)
    backgroundColor: backgroundColorFor(theme.getEffectiveTheme()),
    // The renderer draws the tabs in the title-bar row. hiddenInset keeps the
    // traffic lights and drops the centered window title, which would repeat the tab.
    ...windowChromeOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // the title tracks the current file, so ignore index.html's <title>
  win.on("page-title-updated", (e) => e.preventDefault());

  // Full screen hides the traffic lights, so the tab strip drops its left inset.
  const sendChrome = (fullScreen) => {
    if (!win.isDestroyed()) win.webContents.send("window-chrome", { fullScreen });
  };
  win.on("enter-full-screen", () => sendChrome(true));
  win.on("leave-full-screen", () => sendChrome(false));

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
    persistOpenTabs,
  });
  sessions.set(webContentsId, session);

  win.on("close", (event) => {
    session.handleClose(event);
  });
  windowStartup.set(win, { blank, openDialog });

  win.on("closed", () => {
    sessions.delete(webContentsId);
    syncMenu();
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
  lastMenuTabCount = currentTabCount();
  const template = buildMenuTemplate({
    appName: app.name,
    getFocusedWindow: () => BrowserWindow.getFocusedWindow(),
    getOpenTabCount: () => currentTabCount(),
    createWindow: (options) => createWindow(options),
    prepareToDiscardContents: async (win) => {
      const session = sessionFor(win.webContents);
      return session ? session.prepareToDiscardContents() : true;
    },
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
  describeWindow: (win) => {
    const session = sessionFor(win.webContents);
    if (!session) return { tabCount: 0, hasPath: () => false };
    return {
      tabCount: session.getTabCount(),
      hasPath: (filePath) => session.hasPath(filePath),
    };
  },
  confirmReplaceDocument,
  isAppReady: () => app.isReady(),
  setPendingFile: (filePath) => {
    pendingFilePath = filePath;
  },
  createWindow: () => createWindow(),
});

// Library installs from libraries.excalidraw.com arrive as excalidraw-mac:// URLs.
// open-url can fire before the app is ready, so requests are queued until the
// renderer takes them.
const libraryInstallQueue = createLibraryInstallQueue();

registerLibraryProtocolClient({
  app,
  defaultApp: process.defaultApp,
  execPath: process.execPath,
  argv: process.argv,
});

app.on("open-url", (event, url) => {
  event.preventDefault();
  handleLibraryInstallUrl(url, {
    installQueue: libraryInstallQueue,
    getWindow: () => BrowserWindow.getAllWindows()[0],
    isAppReady: () => app.isReady(),
    createWindow,
  });
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
