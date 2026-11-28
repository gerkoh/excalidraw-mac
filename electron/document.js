const fs = require("fs");
const path = require("path");
const { openModeFor } = require("./tabSession");

// --- Window title + proxy icon ---

const UNTITLED = "Untitled";

// "/a/b/diagram.excalidraw" -> "diagram"; only the last extension is dropped ("a.b.excalidraw" -> "a.b")
const formatWindowTitle = (filePath) => {
  if (typeof filePath !== "string" || filePath.trim() === "") return UNTITLED;
  const base = path.basename(filePath);
  const title = path.basename(base, path.extname(base));
  return title === "" ? UNTITLED : title;
};

// title + macOS proxy icon (Cmd-click path menu); "" clears the proxy icon for untitled drawings
const applyCurrentFileToWindow = (win, filePath) => {
  if (!win || win.isDestroyed()) return;
  win.setTitle(formatWindowTitle(filePath));
  // setRepresentedFilename only exists on macOS
  if (typeof win.setRepresentedFilename === "function") {
    win.setRepresentedFilename(filePath || "");
  }
};

// the file path carried by a "set-document-state" report (null = untitled).
// a disallowed path is rejected and the window is left untouched
const applyReportedFile = (win, filePath, isAllowedPath) => {
  if (!win) return false;
  if (filePath !== null && !isAllowedPath(filePath)) {
    console.error("[main] Rejected document state for disallowed path:", filePath);
    return false;
  }
  applyCurrentFileToWindow(win, filePath);
  return true;
};

// --- "File became current" bookkeeping ---

// one place that persists the last opened path and feeds File -> Open Recent
const createCurrentFileRecorder = ({ store, addRecentDocument, isAllowedPath }) => {
  return (filePath) => {
    if (!isAllowedPath(filePath)) {
      console.error("[main] Not recording disallowed path:", filePath);
      return false;
    }
    store.set("lastOpenedPath", filePath);
    addRecentDocument(filePath);
    return true;
  };
};

// --- OS open-file (Finder double-click, Open With, Dock / File -> Open Recent) ---

const isReadableFile = (filePath) => {
  try {
    if (!fs.statSync(filePath).isFile()) return false;
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const missingFileError = (filePath) => ({
  title: `"${path.basename(filePath)}" can't be opened`,
  content: `The file may have been moved, renamed or deleted.\n\n${filePath}`,
});

// electron calls are injected so every branch is unit-testable.
// describeWindow(win) reports { tabCount, hasPath(filePath) } so a file opens in a new tab,
// focuses the tab that already has it, or — only at the cap — replaces the active drawing.
// confirmReplaceDocument(win) resolves false if the user cancelled the "Save changes?" prompt.
const createOpenFileHandler = ({
  isAllowedPath,
  isReadable,
  showError,
  isStoreReady,
  recordCurrentFile,
  getWindow,
  describeWindow,
  confirmReplaceDocument,
  isAppReady,
  setPendingFile,
  createWindow,
}) => {
  return async (filePath) => {
    if (!isAllowedPath(filePath)) return "ignored";

    // a recent item can point at a moved/deleted file: tell the user and leave the current drawing alone
    if (!isReadable(filePath)) {
      console.error("[main] open-file target is missing or unreadable:", filePath);
      const { title, content } = missingFileError(filePath);
      showError(title, content);
      return "missing";
    }

    // store isn't created until app.whenReady(); get-pending-file records it later
    if (!isStoreReady()) {
      console.warn("[main] Store not ready, queuing pending file:", filePath);
      setPendingFile(filePath);
      return "queued";
    }

    const win = getWindow();
    if (win) {
      // app is running with a window: hand the file to the renderer. Replacing the active
      // tab (only when the window is already at the cap) is the one path that can discard a drawing.
      if (win.isMinimized()) win.restore();
      win.focus();
      const { tabCount, hasPath } = describeWindow(win);
      const mode = openModeFor({ tabCount, alreadyOpen: hasPath(filePath) });
      if (mode === "replace" && !(await confirmReplaceDocument(win))) return "cancelled";
      recordCurrentFile(filePath);
      win.webContents.send("open-file", filePath, mode);
      return "sent";
    }
    recordCurrentFile(filePath);
    setPendingFile(filePath);
    if (isAppReady()) {
      // app is running but all windows are closed (e.g. Cmd+W): reopen, renderer picks up the pending file
      createWindow();
      return "reopened";
    }
    // app is still launching
    return "queued";
  };
};

// --- Menu ---

// macOS fills this submenu with recent documents and fires app "open-file" when one is chosen
const buildOpenRecentMenuItem = () => ({
  label: "Open Recent",
  role: "recentDocuments",
  submenu: [{ label: "Clear Menu", role: "clearRecentDocuments" }],
});

module.exports = {
  UNTITLED,
  formatWindowTitle,
  applyCurrentFileToWindow,
  applyReportedFile,
  createCurrentFileRecorder,
  isReadableFile,
  missingFileError,
  createOpenFileHandler,
  buildOpenRecentMenuItem,
};
