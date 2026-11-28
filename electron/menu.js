const { buildOpenRecentMenuItem } = require("./document");
const { buildAppearanceMenuItem } = require("./theme");

// --- Application Menu ---

// builds the Menu template; electron calls are injected so this stays unit-testable.
// confirmReplaceDocument(win) resolves true once any unsaved changes of the window's drawing
// have been dealt with (saved or discarded), false if the user cancelled.
const buildMenuTemplate = ({
  appName,
  getFocusedWindow,
  clearLastOpenedPath,
  confirmReplaceDocument,
  themePreference,
  setThemePreference,
}) => {
  const sendToFocusedWindow = (channel) => {
    const win = getFocusedWindow();
    if (win) win.webContents.send(channel);
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
          click: async () => {
            const win = getFocusedWindow();
            if (win && !(await confirmReplaceDocument(win))) return;
            // auto clear last opened path on triggering new file with electron-store
            clearLastOpenedPath();
            if (win) win.webContents.send("menu-new");
          },
        },
        { type: "separator" },
        {
          label: "Open…",
          accelerator: "Cmd+O",
          click: async () => {
            const win = getFocusedWindow();
            if (!win || !(await confirmReplaceDocument(win))) return;
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
        buildAppearanceMenuItem({ themePreference, setThemePreference }),
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { label: "Window", submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }] },
  ];
};

module.exports = { buildMenuTemplate };
