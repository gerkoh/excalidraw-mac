import { useState, useEffect, useRef } from "react";
import { parseInitialData, loadScene, serializeScene } from "../utils/sceneUtils";

const useFileOperations = ({ excalidrawAPI, sceneElementsRef, appStateRef }) => {
  // current file path is stored in this hook and passed to App.jsx -> useAutoSave
  const [currentFilePath, setCurrentFilePath] = useState(null);
  const currentFilePathRef = useRef(currentFilePath);

  // on first render: Don't render Excalidraw until we know whether there's saved data
  const [initialData, setInitialData] = useState(undefined);

  // keep ref in sync with state so IPC handlers always read the latest path
  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);

  // loading initial data on startup
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // check if a file was requested via OS (double-click / Open With)
        const pendingPath = await window.electronAPI.getPendingFile();
        // use the pending file if available, otherwise fall back to last opened
        const targetPath = pendingPath || (await window.electronAPI.getLastPath());

        if (targetPath) {
          const content = await window.electronAPI.readFile(targetPath);
          if (content) {
            setCurrentFilePath(targetPath);
            const initialData = parseInitialData(content);
            setInitialData(initialData);
          } else {
            console.error("[useFileOperations] Failed to read file on startup:", targetPath);
            setInitialData(null); // render empty canvas if file read fails
          }
        } else {
          setInitialData(null); // no file to open, render empty canvas
        }
      } catch (err) {
        console.error("[useFileOperations] Error loading initial file:", err);
        setInitialData(null); // render empty canvas on error
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!excalidrawAPI) return;

    // ⌘N - new file
    const handleNew = async () => {
      console.log("[useFileOperations] ⌘N New file operation triggered");
      excalidrawAPI.resetScene();
      sceneElementsRef.current = null;
      appStateRef.current = null;
      setCurrentFilePath(null);
      currentFilePathRef.current = null;
      console.log("[useFileOperations] State reset");
    };

    // ⌘O - open file
    const handleOpen = async () => {
      console.log("[useFileOperations] ⌘O Open file operation triggered");
      const result = await window.electronAPI.openFileDialog();
      if (!result) return; // user cancelled

      const initialData = parseInitialData(result.content);
      console.log("[useFileOperations] Opened file and loaded data:", result.path);

      loadScene(excalidrawAPI, initialData);
      setCurrentFilePath(result.path);
    };

    // ⇧⌘S - save as
    const handleSaveAs = async () => {
      console.log("[useFileOperations] ⇧⌘S Save As operation triggered");
      const content = serializeScene(sceneElementsRef, appStateRef, excalidrawAPI);
      const newPath = await window.electronAPI.saveFileDialog(content);
      if (newPath) {
        console.log("[useFileOperations] Saved in new file:", newPath);
        setCurrentFilePath(newPath);
      }
    };

    // ⌘S - save
    const handleSave = async () => {
      console.log("[useFileOperations] ⌘S Save operation triggered");
      // if no file is open yet, trigger "Save As"
      if (!currentFilePathRef.current) {
        console.log("[useFileOperations] No current file, triggering 'Save As'");
        return handleSaveAs();
      }
      const content = serializeScene(sceneElementsRef, appStateRef, excalidrawAPI);
      const success = await window.electronAPI.writeFile(currentFilePathRef.current, content);
      if (success) {
        console.log("[useFileOperations] Saved to existing file:", currentFilePathRef.current);
      }
    };

    // OS-level open-file (double-click / Open With)
    const handleOpenFileFromOS = async (_event, filePath) => {
      const content = await window.electronAPI.readFile(filePath);
      if (!content) {
        console.error("[useFileOperations] Failed to read file from OS:", filePath);
        return;
      }
      const initialData = parseInitialData(content);
      console.log("[useFileOperations] Opened file from OS and loaded data:", filePath);

      loadScene(excalidrawAPI, initialData);
      setCurrentFilePath(filePath);
    };

    window.electronAPI.onMenuNew(handleNew);
    window.electronAPI.onMenuOpen(handleOpen);
    window.electronAPI.onMenuSave(handleSave);
    window.electronAPI.onMenuSaveAs(handleSaveAs);
    window.electronAPI.onOpenFile(handleOpenFileFromOS);

    // cleanup: remove listeners when deps change or on unmount
    return () => {
      window.electronAPI.offMenuNew(handleNew);
      window.electronAPI.offMenuOpen(handleOpen);
      window.electronAPI.offMenuSave(handleSave);
      window.electronAPI.offMenuSaveAs(handleSaveAs);
      window.electronAPI.offOpenFile(handleOpenFileFromOS);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawAPI]);

  return { currentFilePath, initialData };
};

export default useFileOperations;
