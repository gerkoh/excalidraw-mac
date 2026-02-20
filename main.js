const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const Store = require("electron-store");

// stores last opened file path (initialized after app is initialized)
let store;

// config file path
const configPath = path.join(__dirname, "config.json");

// read config from file
const readConfig = () => {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("[main] Failed to read config:", err);
    return null;
  }
};

// --- Path Validation ---

const isAllowedPath = (filePath) => {
  return typeof filePath === "string" && filePath.endsWith(".excalidraw");
};

// --- IPC Handlers (registered inside app.whenReady) ---

const registerIpcHandlers = () => {
  ipcMain.handle("get-config", () => readConfig());

  ipcMain.handle("read-file", (_event, filePath) => {
    try {
      if (!isAllowedPath(filePath)) {
        console.error("[main] Rejected read for disallowed path:", filePath);
        return null;
      }
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, "utf-8");
    } catch (err) {
      console.error("[main] Failed to read file:", filePath, err);
      return null;
    }
  });

  ipcMain.handle("write-file", (_event, filePath, content) => {
    try {
      if (!isAllowedPath(filePath)) {
        console.error("[main] Rejected write for disallowed path:", filePath);
        return false;
      }
      fs.writeFileSync(filePath, content, "utf-8");
      return true;
    } catch (err) {
      console.error("[main] Failed to write file:", filePath, err);
      return false;
    }
  });

  // Use electron-store to store last opened file path
  ipcMain.handle("save-last-path", (_event, filePath) => {
    store.set("lastOpenedPath", filePath);
    return true;
  });

  // Get last opened file path
  ipcMain.handle("get-last-path", () => {
    return store.get("lastOpenedPath") ?? null;
  });

  // Returns and clears the pending file path from OS open-file event
  ipcMain.handle("get-pending-file", () => {
    const p = pendingFilePath;
    pendingFilePath = null;
    return p;
  });

  ipcMain.handle("open-file-dialog", async () => {
    const win = BrowserWindow.getFocusedWindow();
    const config = readConfig();
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
    const config = readConfig();
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
  const config = readConfig();
  const win = new BrowserWindow({
    width: config?.windowWidth ?? 1512,
    height: config?.windowHeight ?? 982,
    icon: path.join(__dirname, "excalidraw-app/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.loadFile("./excalidraw-app/dist/index.html");
  return win;
};

// --- Application Menu ---

const buildMenu = () => {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "Cmd+N",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send("menu-new");
          },
        },
        { type: "separator" },
        {
          label: "Open…",
          accelerator: "Cmd+O",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send("menu-open");
          },
        },
        {
          label: "Save",
          accelerator: "Cmd+S",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send("menu-save");
          },
        },
        {
          label: "Save As…",
          accelerator: "Cmd+Shift+S",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) win.webContents.send("menu-save-as");
          },
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }] },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

// --- App Lifecycle ---

// Track file path requested via OS open-file (e.g. double-click / Open With)
let pendingFilePath = null;

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (!isAllowedPath(filePath)) return;

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
