const { app, BrowserWindow, ipcMain, dialog, Menu, nativeTheme } = require("electron");
const path = require("path");
const fs = require("fs");
// electron-store v12 is ESM-only. Electron 45's Node can require() it;
// the class is the default export.
const { default: Store } = require("electron-store");
const { isAllowedPath, readConfig, readDrawing, writeDrawing } = require("./electron/fileService");
const { buildMenuTemplate } = require("./electron/menu");
const {
  createCurrentFileRecorder,
  createOpenFileHandler,
  createSetCurrentFileHandler,
  isReadableFile,
} = require("./electron/document");
const { backgroundColorFor, createThemeController } = require("./electron/theme");

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

  ipcMain.handle("open-file-dialog", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const config = readConfig(configPath);
    const result = await dialog.showOpenDialog(win, {
      defaultPath: config?.defaultOpenDir || undefined,
      filters: [{ name: "Excalidraw", extensions: ["excalidraw"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      recordCurrentFile(filePath);
      return { path: filePath, content };
    } catch (err) {
      console.error("[main] Failed to read opened file:", err);
      return null;
    }
  });

  ipcMain.handle("save-file-dialog", async (_event, content) => {
    const win = BrowserWindow.getFocusedWindow();
    const config = readConfig(configPath);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: config?.defaultOpenDir || undefined,
      filters: [{ name: "Excalidraw", extensions: ["excalidraw"] }],
    });
    if (result.canceled) return null;

    const filePath = result.filePath;
    try {
      fs.writeFileSync(filePath, content, "utf-8");
      recordCurrentFile(filePath);
      return filePath;
    } catch (err) {
      console.error("[main] Failed to save file:", err);
      return null;
    }
  });

  // renderer's currentFilePath is the single source of truth for the window title + proxy icon
  ipcMain.on(
    "set-current-file",
    createSetCurrentFileHandler({
      isAllowedPath,
      getWindowFromWebContents: (webContents) => BrowserWindow.fromWebContents(webContents),
    }),
  );

  ipcMain.handle("get-theme", () => theme.getEffectiveTheme());

  // Excalidraw's in-app theme toggle maps onto an explicit Light/Dark preference
  ipcMain.on("set-theme-preference", (_event, preference) => theme.setPreference(preference));
};
// --- Window ---

const createWindow = () => {
  const config = readConfig(configPath);
  const win = new BrowserWindow({
    width: config?.windowWidth ?? 1512,
    height: config?.windowHeight ?? 982,
    icon: path.join(__dirname, "excalidraw-app/icon.png"),
    // replaced by the file name once the renderer reports its current file
    title: app.name,
    // paint the effective theme's background before the renderer loads (no white flash in dark mode)
    backgroundColor: backgroundColorFor(theme.getEffectiveTheme()),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // the title tracks the current file (set-current-file), so ignore index.html's <title>
  win.on("page-title-updated", (e) => e.preventDefault());

  // Intercept close to let the renderer do a final save before the window is destroyed
  let allowClose = false;
  let isQuitting = false;

  app.on("before-quit", () => {
    isQuitting = true;
  });

  const finishClose = () => {
    allowClose = true;
    win.close();
    if (isQuitting) {
      app.quit();
    }
  };

  const onCloseAcknowledged = () => finishClose();

  win.on("close", (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send("before-close");

    // Safety timeout: force close if renderer doesn't acknowledge (e.g. crash, not yet loaded)
    setTimeout(() => {
      if (!allowClose) {
        console.warn("[main] Close not acknowledged in time, forcing close");
        ipcMain.removeListener("close-acknowledged", onCloseAcknowledged);
        finishClose();
      }
    }, 3000);
  });

  ipcMain.once("close-acknowledged", onCloseAcknowledged);

  win.loadFile("./excalidraw-app/dist/index.html");
  return win;
};

// --- Application Menu ---

const buildMenu = () => {
  const template = buildMenuTemplate({
    appName: app.name,
    getFocusedWindow: () => BrowserWindow.getFocusedWindow(),
    clearLastOpenedPath: () => store.set("lastOpenedPath", null),
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

app.whenReady().then(() => {
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
