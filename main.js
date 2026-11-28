const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
// electron-store v12 is ESM-only. Electron 45's Node can require() it;
// the class is the default export.
const { default: Store } = require("electron-store");
const { isAllowedPath, readConfig, readDrawing, writeDrawing } = require("./electron/fileService");
const { buildMenuTemplate } = require("./electron/menu");

// stores last opened file path (initialized after app is initialized)
let store;

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
    if (p && fs.existsSync(p)) {
      store.set("lastOpenedPath", p);
    }
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
      store.set("lastOpenedPath", filePath);
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
      store.set("lastOpenedPath", filePath);
      return filePath;
    } catch (err) {
      console.error("[main] Failed to save file:", err);
      return null;
    }
  });
};
// --- Window ---

const createWindow = () => {
  const config = readConfig(configPath);
  const win = new BrowserWindow({
    width: config?.windowWidth ?? 1512,
    height: config?.windowHeight ?? 982,
    icon: path.join(__dirname, "excalidraw-app/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

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
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

// --- App Lifecycle ---

// Track file path requested via OS open-file (e.g. double-click / Open With)
let pendingFilePath = null;

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (!isAllowedPath(filePath)) return;

  // Store may not be ready if this fires before app.whenReady() completes
  if (!store) {
    console.warn("[main] Store not ready, queuing pending file:", filePath);
    pendingFilePath = filePath;
    return;
  }
  store.set("lastOpenedPath", filePath);

  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    // App is already running – send to renderer
    win.webContents.send("open-file", filePath);
  } else if (app.isReady()) {
    // App is running but all windows are closed (e.g. Cmd+W) – reopen
    pendingFilePath = filePath;
    createWindow();
  } else {
    // App is still launching – store for later
    pendingFilePath = filePath;
  }
});

app.whenReady().then(() => {
  // saves to ~/Library/Application Support/excalidraw-mac/excalidraw-mac.json
  store = new Store({ name: "excalidraw-mac" });

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
