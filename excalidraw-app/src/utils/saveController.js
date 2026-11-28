const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 2000;

// a missing or malformed config must not disable auto-save
const resolveDebounceMs = (config) => {
  const value = config?.autoSaveDebounceMs;
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AUTOSAVE_DEBOUNCE_MS;
};

// Owns everything about saving the current drawing:
// - which file it belongs to (null = untitled)
// - whether it has edits since the last successful save/load (dirty)
// - debounced auto-save, driven by observe() from Excalidraw's onChange
// - coalescing: a save requested while one is in flight runs exactly once more afterwards,
//   with the scene as it is then, so no save is ever dropped
// Every renderer write of the current file (auto-save, ⌘S, before switching, before close)
// goes through save(), so writes to one file never overlap.
const createSaveController = ({ writeFile, saveFileDialog, onStateChange }) => {
  // set by the owner once config / the Excalidraw API are available
  let debounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS;
  let serialize = () => {
    throw new Error("Scene serializer not set yet");
  };
  let filePath = null;
  let dirty = false;
  let hasContent = false;
  let lastSnapshotKey = null;
  // the next observed snapshot is the freshly loaded scene, not an edit
  let awaitingBaseline = true;
  // bumped on every edit and document switch; a save only clears dirty if nothing happened meanwhile
  let changeCount = 0;
  let debounceTimer = null;
  let inFlight = null;
  let saveRequestedDuringFlight = false;
  let lastReported = null;

  const getState = () => ({ filePath, hasFilePath: filePath !== null, dirty, hasContent });

  const notify = () => {
    const state = getState();
    const unchanged =
      lastReported !== null &&
      lastReported.filePath === state.filePath &&
      lastReported.dirty === state.dirty &&
      lastReported.hasContent === state.hasContent;
    if (unchanged) return;
    lastReported = state;
    onStateChange(state);
  };

  const cancelDebounce = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  };

  // one write of the latest scene to the current file; never throws
  const saveOnce = async () => {
    const targetPath = filePath;
    if (targetPath === null) return false;
    const changeCountAtStart = changeCount;
    let saved = false;
    try {
      saved = (await writeFile(targetPath, serialize())) === true;
      if (!saved) console.error("[saveController] ❌ Save returned failure:", targetPath);
    } catch (err) {
      console.error("[saveController] ❌ Save failed:", targetPath, err);
    }
    if (saved && changeCount === changeCountAtStart && filePath === targetPath) {
      dirty = false;
      notify();
    }
    return saved;
  };

  const drainSaves = async () => {
    let saved;
    do {
      saveRequestedDuringFlight = false;
      saved = await saveOnce();
    } while (saveRequestedDuringFlight);
    return saved;
  };

  // saves now (cancelling any pending debounce); resolves true if the latest scene was written.
  // Untitled drawings resolve false without writing.
  const save = async () => {
    cancelDebounce();
    if (inFlight) {
      saveRequestedDuringFlight = true;
      return inFlight;
    }
    inFlight = drainSaves();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  };

  const scheduleSave = () => {
    cancelDebounce();
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      save();
    }, debounceMs);
  };

  // takes effect from the next edit; a pending debounce keeps its delay
  const setDebounceMs = (ms) => {
    debounceMs = ms;
  };

  const setSerializer = (nextSerialize) => {
    serialize = nextSerialize;
  };

  // call before replacing the scene (startup load, ⌘N, ⌘O, OS open-file)
  const startDocument = (nextFilePath) => {
    cancelDebounce();
    saveRequestedDuringFlight = false;
    filePath = nextFilePath ?? null;
    dirty = false;
    awaitingBaseline = true;
    changeCount += 1;
    notify();
  };

  // call from Excalidraw's onChange with getSceneSnapshot(elements, appState)
  const observe = (snapshot) => {
    hasContent = snapshot.hasContent;
    if (awaitingBaseline) {
      awaitingBaseline = false;
      lastSnapshotKey = snapshot.key;
      notify();
      return;
    }
    if (snapshot.key === lastSnapshotKey) {
      notify();
      return;
    }
    lastSnapshotKey = snapshot.key;
    changeCount += 1;
    dirty = true;
    notify();
    if (filePath !== null) scheduleSave();
  };

  // Save As dialog; on success the drawing now belongs to the new file. Resolves the path or null.
  const saveAs = async () => {
    const changeCountAtStart = changeCount;
    let newPath;
    try {
      newPath = await saveFileDialog(serialize());
    } catch (err) {
      console.error("[saveController] ❌ Save As failed:", err);
      return null;
    }
    if (!newPath) return null;

    filePath = newPath;
    if (changeCount === changeCountAtStart) {
      cancelDebounce();
      dirty = false;
    } else {
      scheduleSave(); // edited while the dialog was open
    }
    notify();
    return newPath;
  };

  const dispose = () => cancelDebounce();

  return {
    getState,
    setDebounceMs,
    setSerializer,
    startDocument,
    observe,
    save,
    saveAs,
    dispose,
  };
};

export { createSaveController, resolveDebounceMs, DEFAULT_AUTOSAVE_DEBOUNCE_MS };
