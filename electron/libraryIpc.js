const { readLibrary, writeLibrary } = require("./libraryStore");

// preload.js can't require local modules (sandbox), so it repeats these names;
// preload.test.js keeps the two in sync
const LIBRARY_CHANNELS = {
  get: "get-library",
  save: "save-library",
  takePendingInstalls: "take-pending-library-installs",
  installRequested: "library-install-requested",
};

// The library path is fixed by the main process; the renderer only ever sends items.
const registerLibraryIpcHandlers = ({ ipcMain, libraryPath, installQueue }) => {
  // resolves to { libraryItems } or null; rejects if an existing file can't be read
  ipcMain.handle(LIBRARY_CHANNELS.get, () => readLibrary(libraryPath));

  // resolves to true on success, false if the items are invalid or the write fails
  ipcMain.handle(LIBRARY_CHANNELS.save, async (_event, libraryItems) => {
    try {
      await writeLibrary(libraryPath, libraryItems);
      return true;
    } catch (err) {
      console.error("[main] Failed to save library:", libraryPath, err);
      return false;
    }
  });

  ipcMain.handle(LIBRARY_CHANNELS.takePendingInstalls, () => installQueue.takeAll());
};

module.exports = { LIBRARY_CHANNELS, registerLibraryIpcHandlers };
