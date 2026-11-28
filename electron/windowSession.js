const {
  DEFAULT_DOCUMENT_STATE,
  confirmUnsavedChanges,
  needsSavePrompt,
  UNSAVED_ACTIONS,
} = require("./unsavedChanges");
const { snapshotForQuit, snapshotForWindowClose } = require("./tabSession");

// covers only the renderer's final write, never user interaction (prompts, Save As dialog)
const CLOSE_ACK_TIMEOUT_MS = 3000;
// how long to wait for the renderer to show the tab we're about to ask about
const ACTIVATE_TIMEOUT_MS = 500;

const SOLO_TAB_ID = "solo";

const documentFlags = (tab) => ({
  dirty: tab?.dirty === true,
  hasFilePath: tab?.hasFilePath === true,
  hasContent: tab?.hasContent === true,
});

const filePathOf = (raw) =>
  typeof raw?.filePath === "string" && raw.filePath.trim() !== "" ? raw.filePath : null;

const normalizeTab = (raw, fallbackId) => ({
  id: typeof raw?.id === "string" && raw.id.trim() !== "" ? raw.id : fallbackId,
  filePath: filePathOf(raw),
  ...documentFlags(raw),
});

// A payload with `tabs` is the whole window. The older single-document shape is one tab,
// so existing callers keep working.
const normalizeSession = (raw) => {
  if (raw && typeof raw === "object" && Array.isArray(raw.tabs)) {
    const tabs = raw.tabs.map((tab, index) => normalizeTab(tab, `tab-${index}`));
    const activeTabId = tabs.some((tab) => tab.id === raw.activeTabId)
      ? raw.activeTabId
      : (tabs[0]?.id ?? null);
    return { activeTabId, tabs };
  }
  const tab = normalizeTab(raw && typeof raw === "object" ? raw : {}, SOLO_TAB_ID);
  return { activeTabId: tab.id, tabs: [tab] };
};

// Per-window state: every open tab, the "Save changes?" guard, and the close handshake.
// Electron objects are injected so the flow can be unit-tested with fakes.
const createWindowSession = ({
  win,
  showMessageBox,
  isQuitting,
  onCloseCancelled,
  quit,
  persistOpenTabs = () => {},
  closeAckTimeoutMs = CLOSE_ACK_TIMEOUT_MS,
  activateTimeoutMs = ACTIVATE_TIMEOUT_MS,
}) => {
  const { webContents } = win;
  let sessionState = { activeTabId: null, tabs: [] };
  let isClosing = false; // close flow running (prompt, Save As or final save)
  let isReplacing = false; // a prompt is open (replace, close-tab, or reload)
  let allowClose = false;
  let resolveSaveAs = null;
  let resolveCloseAck = null;
  let pendingActivation = null;

  const isRendererAlive = () => !webContents.isDestroyed() && !webContents.isCrashed();

  const activeTab = () =>
    sessionState.tabs.find((tab) => tab.id === sessionState.activeTabId) ?? null;

  const getDocumentState = () => {
    const active = activeTab();
    return active ? documentFlags(active) : DEFAULT_DOCUMENT_STATE;
  };

  const getSessionState = () => ({
    activeTabId: sessionState.activeTabId,
    tabs: sessionState.tabs.map((tab) => ({ ...tab })),
  });

  const getTabCount = () => sessionState.tabs.length;

  const getActiveFilePath = () => activeTab()?.filePath ?? null;

  const hasPath = (filePath) => sessionState.tabs.some((tab) => tab.filePath === filePath);

  const applyEditedDot = () => {
    if (win.isDestroyed()) return;
    win.setDocumentEdited(sessionState.tabs.some((tab) => tab.dirty));
  };

  const setDocumentState = (raw) => {
    sessionState = normalizeSession(raw);
    applyEditedDot();
    if (pendingActivation && sessionState.activeTabId === pendingActivation.tabId) {
      pendingActivation.done();
    }
  };

  // a sheet on a minimized or hidden window would be invisible and block the flow
  const showPrompt = (options) => {
    if (win.isMinimized()) win.restore();
    win.show();
    return showMessageBox(win, options);
  };

  // the renderer runs Save As for that tab (it owns the scene) and reports whether a file was written
  const requestSaveAs = (tabId) =>
    new Promise((resolve) => {
      resolveSaveAs = resolve;
      webContents.send("save-as-request", tabId);
    });

  const handleSaveAsResult = (saved) => {
    const resolve = resolveSaveAs;
    resolveSaveAs = null;
    resolve?.(saved === true);
  };

  const activateTab = (tabId) =>
    new Promise((resolve) => {
      if (!isRendererAlive() || sessionState.activeTabId === tabId) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        if (pendingActivation?.tabId === tabId) pendingActivation = null;
        resolve();
      }, activateTimeoutMs);
      pendingActivation = {
        tabId,
        done: () => {
          clearTimeout(timer);
          pendingActivation = null;
          resolve();
        },
      };
      webContents.send("activate-tab", tabId);
    });

  // true when this one tab may be replaced or closed. Activates it first so the sheet
  // matches the drawing the user is looking at.
  const resolveOne = async (tab) => {
    if (!tab || !isRendererAlive()) return true;
    if (tab.id !== sessionState.activeTabId) await activateTab(tab.id);
    if (!isRendererAlive()) return true;
    const current = sessionState.tabs.find((item) => item.id === tab.id) ?? tab;
    const action = await confirmUnsavedChanges(current, showPrompt);
    if (action === UNSAVED_ACTIONS.CANCEL) return false;
    if (action === UNSAVED_ACTIONS.SAVE_AS) return requestSaveAs(current.id);
    return true;
  };

  const resolveAllUnsaved = async () => {
    if (!isRendererAlive()) return true;
    const ids = sessionState.tabs.filter((tab) => needsSavePrompt(tab)).map((tab) => tab.id);
    for (const id of ids) {
      const tab = sessionState.tabs.find((item) => item.id === id);
      if (!tab || !needsSavePrompt(tab)) continue;
      if (!(await resolveOne(tab))) return false;
      if (!isRendererAlive()) return true;
    }
    return true;
  };

  // ⌘O at the tab cap, and anything else that replaces only the active drawing
  const confirmReplaceDocument = async () => {
    if (isClosing || isReplacing) return false;
    isReplacing = true;
    try {
      return await resolveOne(activeTab());
    } catch (err) {
      console.error("[main] Unsaved-changes prompt failed, keeping current drawing:", err);
      return false;
    } finally {
      isReplacing = false;
    }
  };

  // Close button on one tab. "window" means this is the last tab, so the caller closes the window.
  const confirmCloseTab = async (tabId) => {
    if (isClosing || isReplacing) return false;
    if (sessionState.tabs.length <= 1) return "window";
    const tab = sessionState.tabs.find((item) => item.id === tabId);
    if (!tab) return false;
    isReplacing = true;
    try {
      return (await resolveOne(tab)) ? true : false;
    } catch (err) {
      console.error("[main] Close-tab prompt failed, keeping the tab:", err);
      return false;
    } finally {
      isReplacing = false;
    }
  };

  const waitForFinalSave = () =>
    new Promise((resolve) => {
      if (!isRendererAlive()) {
        resolve();
        return;
      }
      const finish = () => {
        clearTimeout(timer);
        resolveCloseAck = null;
        resolve();
      };
      // safety net: force close if the renderer doesn't acknowledge (e.g. hung, not yet loaded)
      const timer = setTimeout(() => {
        console.warn("[main] Close not acknowledged in time, forcing close");
        finish();
      }, closeAckTimeoutMs);
      resolveCloseAck = finish;
      webContents.send("before-close");
    });

  const handleCloseAcknowledged = () => resolveCloseAck?.();

  const persistCurrent = (mode) => {
    // no report yet (still loading): don't replace the stored session with an empty one
    if (sessionState.tabs.length === 0) return;
    const snapshot =
      mode === "quit"
        ? snapshotForQuit(sessionState.tabs, sessionState.activeTabId)
        : snapshotForWindowClose(sessionState.tabs, sessionState.activeTabId);
    if (snapshot) persistOpenTabs(snapshot);
  };

  // View -> Reload throws the renderer away, so every dirty untitled tab is asked first
  // and the open set is written the way a quit would, for the reloaded window to restore.
  const prepareToDiscardContents = async () => {
    if (isClosing || isReplacing) return false;
    isReplacing = true;
    try {
      if (!(await resolveAllUnsaved())) return false;
      await waitForFinalSave();
      persistCurrent("quit");
      return true;
    } catch (err) {
      console.error("[main] Reload prompt failed, keeping the window:", err);
      return false;
    } finally {
      isReplacing = false;
    }
  };

  // registered as win.on("close"); preventDefault must happen synchronously
  const handleClose = async (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (isClosing) return; // repeated ⌘W / ⌘Q while the close flow is running
    if (isReplacing) {
      // a prompt is open; Electron has already cancelled any quit
      onCloseCancelled();
      return;
    }

    isClosing = true;
    try {
      const mayClose = await resolveAllUnsaved();
      if (!mayClose) {
        onCloseCancelled();
        return;
      }
      await waitForFinalSave();
      persistCurrent(isQuitting() ? "quit" : "window-close");
      allowClose = true;
    } catch (err) {
      console.error("[main] Close flow failed, keeping window open:", err);
      onCloseCancelled();
      return;
    } finally {
      isClosing = false;
    }

    win.close();
    // preventDefault on "close" cancelled the quit, so restart it
    if (isQuitting()) quit();
  };

  // a crashed renderer can never answer; release anything waiting on it
  const handleRendererGone = () => {
    pendingActivation?.done();
    handleSaveAsResult(false);
    handleCloseAcknowledged();
  };

  return {
    getDocumentState,
    getSessionState,
    getTabCount,
    getActiveFilePath,
    hasPath,
    setDocumentState,
    confirmReplaceDocument,
    confirmCloseTab,
    prepareToDiscardContents,
    handleSaveAsResult,
    handleCloseAcknowledged,
    handleClose,
    handleRendererGone,
  };
};

module.exports = { createWindowSession, CLOSE_ACK_TIMEOUT_MS, ACTIVATE_TIMEOUT_MS };
