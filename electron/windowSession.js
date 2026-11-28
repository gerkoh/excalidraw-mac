const {
  DEFAULT_DOCUMENT_STATE,
  normalizeDocumentState,
  confirmUnsavedChanges,
  UNSAVED_ACTIONS,
} = require("./unsavedChanges");

// covers only the renderer's final write, never user interaction (prompts, Save As dialog)
const CLOSE_ACK_TIMEOUT_MS = 3000;

// Per-window state: the last document state the renderer reported, the "Save changes?" guard
// used before the drawing is replaced or closed, and the close handshake.
// Electron objects are injected so the flow can be unit-tested with fakes.
const createWindowSession = ({
  win,
  showMessageBox,
  isQuitting,
  onCloseCancelled,
  quit,
  closeAckTimeoutMs = CLOSE_ACK_TIMEOUT_MS,
}) => {
  const { webContents } = win;
  let documentState = DEFAULT_DOCUMENT_STATE;
  let isClosing = false; // close flow running (prompt, Save As or final save)
  let isReplacing = false; // ⌘N / ⌘O / open-file prompt running
  let allowClose = false;
  let resolveSaveAs = null;
  let resolveCloseAck = null;

  const isRendererAlive = () => !webContents.isDestroyed() && !webContents.isCrashed();

  const getDocumentState = () => documentState;

  const setDocumentState = (raw) => {
    documentState = normalizeDocumentState(raw);
    if (!win.isDestroyed()) win.setDocumentEdited(documentState.dirty);
  };

  // a sheet on a minimized or hidden window would be invisible and block the flow
  const showPrompt = (options) => {
    if (win.isMinimized()) win.restore();
    win.show();
    return showMessageBox(win, options);
  };

  // the renderer runs its normal Save As (it owns the scene) and reports whether a file was written
  const requestSaveAs = () =>
    new Promise((resolve) => {
      resolveSaveAs = resolve;
      webContents.send("save-as-request");
    });

  const handleSaveAsResult = (saved) => {
    const resolve = resolveSaveAs;
    resolveSaveAs = null;
    resolve?.(saved === true);
  };

  // true when the current drawing may be replaced or closed
  const resolveUnsavedChanges = async () => {
    if (!isRendererAlive()) return true;
    const action = await confirmUnsavedChanges(documentState, showPrompt);
    if (action === UNSAVED_ACTIONS.CANCEL) return false;
    if (action === UNSAVED_ACTIONS.SAVE_AS) return requestSaveAs();
    return true;
  };

  // ⌘N, ⌘O and OS open-file call this before telling the renderer to switch drawings
  const confirmReplaceDocument = async () => {
    if (isClosing || isReplacing) return false;
    isReplacing = true;
    try {
      return await resolveUnsavedChanges();
    } catch (err) {
      console.error("[main] Unsaved-changes prompt failed, keeping current drawing:", err);
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

  // registered as win.on("close"); preventDefault must happen synchronously
  const handleClose = async (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (isClosing) return; // repeated ⌘W / ⌘Q while the close flow is running
    if (isReplacing) {
      // a ⌘N / ⌘O prompt is open; Electron has already cancelled any quit
      onCloseCancelled();
      return;
    }

    isClosing = true;
    try {
      const mayClose = await resolveUnsavedChanges();
      if (!mayClose) {
        onCloseCancelled();
        return;
      }
      await waitForFinalSave();
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
    handleSaveAsResult(false);
    handleCloseAcknowledged();
  };

  return {
    getDocumentState,
    setDocumentState,
    confirmReplaceDocument,
    handleSaveAsResult,
    handleCloseAcknowledged,
    handleClose,
    handleRendererGone,
  };
};

module.exports = { createWindowSession, CLOSE_ACK_TIMEOUT_MS };
