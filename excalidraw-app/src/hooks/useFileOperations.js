import { useState, useEffect } from "react";
import { parseInitialData, loadScene } from "../utils/sceneUtils";

// saver is the save controller from useAutoSave; it owns the current file path and dirty state,
// and saver.save() is the one way this hook writes the current file.
// startupPath: undefined looks up the OS pending file / last path (single-document callers);
// null is a blank tab; a string loads that file. subscribeToMenu is false when the shell
// owns the menu, so several tabs don't each answer the same shortcut.
const useFileOperations = ({
  excalidrawAPI,
  sceneElementsRef,
  appStateRef,
  saver,
  startupPath,
  subscribeToMenu = true,
  onReady,
}) => {
  // on first render: Don't render Excalidraw until we know whether there's saved data
  const [initialData, setInitialData] = useState(undefined);

  // loading initial data on startup
  useEffect(() => {
    // startDocument before Excalidraw renders the data, so the initial load isn't an edit
    const showInitialData = (filePath, data) => {
      saver.startDocument(filePath);
      setInitialData(data);
    };

    const loadInitialData = async () => {
      try {
        let targetPath = startupPath;
        if (targetPath === undefined) {
          // check if a file was requested via OS (double-click / Open With)
          const pendingPath = await window.electronAPI.getPendingFile();
          // use the pending file if available, otherwise fall back to last opened
          targetPath = pendingPath || (await window.electronAPI.getLastPath());
        }

        if (targetPath) {
          const content = await window.electronAPI.readFile(targetPath);
          if (content) {
            const data = parseInitialData(content);
            if (data) {
              showInitialData(targetPath, data);
            } else {
              console.error("[useFileOperations] Failed to parse file on startup:", targetPath);
              showInitialData(null, null);
            }
          } else {
            console.error("[useFileOperations] Failed to read file on startup:", targetPath);
            showInitialData(null, null); // render empty canvas if file read fails
          }
        } else {
          showInitialData(null, null); // no file to open, render empty canvas
        }
      } catch (err) {
        console.error("[useFileOperations] Error loading initial file:", err);
        showInitialData(null, null); // render empty canvas on error
      }
    };
    loadInitialData();
  }, [saver, startupPath]);

  useEffect(() => {
    if (!excalidrawAPI) return undefined;

    // parse file content and swap it into the canvas; returns false if content is malformed.
    // startDocument first so the load itself isn't seen as an edit
    const loadFileContent = (filePath, content) => {
      const data = parseInitialData(content);
      if (!data) return false;
      saver.startDocument(filePath);
      loadScene(excalidrawAPI, data);
      return true;
    };

    // ⌘N - new file (main has already handled unsaved changes of an untitled drawing)
    const handleNew = async () => {
      console.log("[useFileOperations] ⌘N New file operation triggered");
      await saver.save();
      saver.startDocument(null);
      // cleared before resetScene so its onChange repopulates them with the empty scene
      sceneElementsRef.current = null;
      appStateRef.current = null;
      excalidrawAPI.resetScene();
      console.log("[useFileOperations] State reset");
    };

    // ⌘O - open file
    const handleOpen = async () => {
      console.log("[useFileOperations] ⌘O Open file operation triggered");
      const result = await window.electronAPI.openFileDialog();
      if (!result) return; // user cancelled

      await saver.save();
      if (!loadFileContent(result.path, result.content)) return;
      console.log("[useFileOperations] Opened file and loaded data:", result.path);
    };

    // ⇧⌘S - save as; resolves the new path, or null if cancelled / failed
    const handleSaveAs = async () => {
      console.log("[useFileOperations] ⇧⌘S Save As operation triggered");
      const newPath = await saver.saveAs();
      if (newPath) console.log("[useFileOperations] Saved in new file:", newPath);
      return newPath;
    };

    // ⌘S - save
    const handleSave = async () => {
      console.log("[useFileOperations] ⌘S Save operation triggered");
      // if no file is open yet, trigger "Save As"
      if (!saver.getState().hasFilePath) {
        console.log("[useFileOperations] No current file, triggering 'Save As'");
        return handleSaveAs();
      }
      if (await saver.save()) {
        console.log("[useFileOperations] Saved to existing file:", saver.getState().filePath);
      }
    };

    // OS-level open-file (double-click / Open With)
    const handleOpenFileFromOS = async (_event, filePath) => {
      await saver.save();
      const content = await window.electronAPI.readFile(filePath);
      if (!content) {
        console.error("[useFileOperations] Failed to read file from OS:", filePath);
        return;
      }
      if (!loadFileContent(filePath, content)) return;
      console.log("[useFileOperations] Opened file from OS and loaded data:", filePath);
    };

    // main asks for Save As after the user chose "Save" in the unsaved-changes prompt;
    // it always gets an answer, or the close / switch would wait forever
    const handleSaveAsRequest = async () => {
      let saved = false;
      try {
        saved = (await handleSaveAs()) !== null;
      } finally {
        window.electronAPI.sendSaveAsResult(saved);
      }
    };

    // Final save before window closes (Cmd+Q, Cmd+W, close button); persists the viewport too
    const handleBeforeClose = async () => {
      try {
        await saver.save();
      } finally {
        window.electronAPI.acknowledgeClose();
      }
    };

    const actions = {
      save: () => saver.save(),
      saveAs: () => saver.saveAs(),
      getState: () => saver.getState(),
    };
    onReady?.(actions);
    if (!subscribeToMenu) return () => onReady?.(null);

    const unsubs = [
      window.electronAPI.onMenuNew(handleNew),
      window.electronAPI.onMenuOpen(handleOpen),
      window.electronAPI.onMenuSave(handleSave),
      window.electronAPI.onMenuSaveAs(handleSaveAs),
      window.electronAPI.onOpenFile(handleOpenFileFromOS),
      window.electronAPI.onSaveAsRequest(handleSaveAsRequest),
      window.electronAPI.onBeforeClose(handleBeforeClose),
    ];

    return () => {
      unsubs.forEach((unsub) => unsub());
      onReady?.(null);
    };
    // handlers close over the latest saver; the menu subscription itself is per canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawAPI, saver, subscribeToMenu, onReady]);

  return { initialData };
};

export default useFileOperations;
