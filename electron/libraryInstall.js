const path = require("path");
const { LIBRARY_PROTOCOL, parseLibraryInstallUrl } = require("../shared/libraryUrl.mjs");
const { LIBRARY_CHANNELS } = require("./libraryIpc");

// Registers this app as the handler for excalidraw-mac:// URLs.
// In dev (`electron .`, process.defaultApp) the OS must launch the Electron
// binary with this app's entry script, so pass both explicitly.
// The packaged app also declares the scheme in Info.plist (build.protocols).
const registerLibraryProtocolClient = ({ app, defaultApp, execPath, argv }) => {
  if (defaultApp) {
    if (argv.length < 2) {
      console.warn("[main] Can't register protocol client: no app path in argv");
      return false;
    }
    return app.setAsDefaultProtocolClient(LIBRARY_PROTOCOL, execPath, [path.resolve(argv[1])]);
  }
  return app.setAsDefaultProtocolClient(LIBRARY_PROTOCOL);
};

// Install requests wait here until the renderer takes them. The renderer drains
// the queue when its editor mounts and whenever it's notified, so a request is
// never lost to a window that is still loading or not created yet.
const createLibraryInstallQueue = () => {
  let pending = [];
  return {
    enqueue: (request) => {
      pending.push(request);
    },
    takeAll: () => {
      const taken = pending;
      pending = [];
      return taken;
    },
  };
};

// Handles an `excalidraw-mac://` URL from the OS (app.on("open-url")).
// Returns true if it was an allowed install request and was queued.
const handleLibraryInstallUrl = (
  installUrl,
  { installQueue, getWindow, isAppReady, createWindow },
) => {
  const request = parseLibraryInstallUrl(installUrl);
  if (!request) {
    console.error("[main] Rejected library install URL:", installUrl);
    return false;
  }
  installQueue.enqueue(request);

  const win = getWindow();
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
    win.webContents.send(LIBRARY_CHANNELS.installRequested);
  } else if (isAppReady()) {
    // all windows closed (e.g. ⌘W); the new window drains the queue on load
    createWindow();
  }
  // otherwise the app is still launching and whenReady creates the window
  return true;
};

module.exports = {
  registerLibraryProtocolClient,
  createLibraryInstallQueue,
  handleLibraryInstallUrl,
};
