const { buildOpenRecentMenuItem } = require("./document");
const { buildAppearanceMenuItem } = require("./theme");
const { canAddTab } = require("./tabSession");

// --- Application Menu ---

// builds the Menu template; electron calls are injected so this stays unit-testable.
// getOpenTabCount() is null when no window is open, otherwise the number of tabs.
// prepareToDiscardContents(win) asks about every dirty untitled tab and flushes saves
// before a reload. createWindow({ blank, openDialog }) opens a window when none is focused.
const buildMenuTemplate = ({
  appName,
  getFocusedWindow,
  getOpenTabCount = () => null,
  createWindow = () => {},
  prepareToDiscardContents = async () => true,
  themePreference,
  setThemePreference,
}) => {
  const sendToFocusedWindow = (channel) => {
    const win = getFocusedWindow();
    if (win) win.webContents.send(channel);
  };

  const openTabCount = getOpenTabCount();
  const canCreateTab = openTabCount === null || canAddTab(openTabCount);

  // ⌘N and ⌘T. With no window, open a blank one; otherwise add a tab in this window.
  const openNewTab = () => {
    const win = getFocusedWindow();
    if (!win) {
      createWindow({ blank: true });
      return;
    }
    const count = getOpenTabCount();
    if (typeof count === "number" && !canAddTab(count)) return;
    win.webContents.send("menu-new-tab");
  };

  return [
    {
      label: appName,
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
          enabled: canCreateTab,
          click: () => openNewTab(),
        },
        {
          label: "New Tab",
          accelerator: "Cmd+T",
          enabled: canCreateTab,
          click: () => openNewTab(),
        },
        { type: "separator" },
        {
          label: "Open…",
          accelerator: "Cmd+O",
          click: () => {
            const win = getFocusedWindow();
            if (!win) {
              createWindow({ blank: true, openDialog: true });
              return;
            }
            win.webContents.send("menu-open");
          },
        },
        buildOpenRecentMenuItem(),
        { type: "separator" },
        {
          label: "Save",
          accelerator: "Cmd+S",
          click: () => sendToFocusedWindow("menu-save"),
        },
        {
          label: "Save As…",
          accelerator: "Cmd+Shift+S",
          click: () => sendToFocusedWindow("menu-save-as"),
        },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: "Cmd+W",
          click: () => {
            const win = getFocusedWindow();
            if (!win) return;
            const count = getOpenTabCount();
            // the last tab's ⌘W closes the window; the window-close path remembers that tab
            if (count === null || count <= 1) {
              win.close();
              return;
            }
            win.webContents.send("menu-close-tab");
          },
        },
        {
          label: "Close Window",
          accelerator: "Cmd+Shift+W",
          click: () => {
            const win = getFocusedWindow();
            if (win) win.close();
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
        {
          label: "Reload",
          accelerator: "CmdOrCtrl+R",
          click: async () => {
            const win = getFocusedWindow();
            // reloading throws away every tab, so each dirty untitled drawing is asked first
            if (!win || !(await prepareToDiscardContents(win))) return;
            win.webContents.reload();
          },
        },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { role: "resetZoom" },
        { type: "separator" },
        buildAppearanceMenuItem({ themePreference, setThemePreference }),
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }] },
  ];
};

module.exports = { buildMenuTemplate };
