import { useState, useEffect, useRef } from "react";
import { parseInitialData, loadScene } from "../utils/sceneUtils";

const useFileOperations = ({
  excalidrawAPI,
  sceneElementsRef,
  appStateRef,
  getSerializedScene,
}) => {
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
            const data = parseInitialData(content);
            if (data) {
              setCurrentFilePath(targetPath);
              setInitialData(data);
            } else {
              console.error("[useFileOperations] Failed to parse file on startup:", targetPath);
              setInitialData(null);
            }
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

    // Save the current file before switching to a new one
    const saveCurrentFile = async () => {
      if (!currentFilePathRef.current) return;
      const content = getSerializedScene();
      await window.electronAPI.writeFile(currentFilePathRef.current, content);
      console.log("[useFileOperations] Saved before switching:", currentFilePathRef.current);
    };

    // ⌘N - new file
    const handleNew = async () => {
      console.log("[useFileOperations] ⌘N New file operation triggered");
      await saveCurrentFile();
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

      await saveCurrentFile();
      const data = parseInitialData(result.content);
      if (!data) return;
      console.log("[useFileOperations] Opened file and loaded data:", result.path);

      loadScene(excalidrawAPI, data);
      setCurrentFilePath(result.path);
    };

    // ⇧⌘S - save as
    const handleSaveAs = async () => {
      console.log("[useFileOperations] ⇧⌘S Save As operation triggered");
      const content = getSerializedScene();
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
      const content = getSerializedScene();
      const success = await window.electronAPI.writeFile(currentFilePathRef.current, content);
      if (success) {
        console.log("[useFileOperations] Saved to existing file:", currentFilePathRef.current);
      }
    };

    // OS-level open-file (double-click / Open With)
    const handleOpenFileFromOS = async (_event, filePath) => {
      await saveCurrentFile();
      const content = await window.electronAPI.readFile(filePath);
      if (!content) {
        console.error("[useFileOperations] Failed to read file from OS:", filePath);
        return;
      }
      const data = parseInitialData(content);
      if (!data) return;
      console.log("[useFileOperations] Opened file from OS and loaded data:", filePath);

      loadScene(excalidrawAPI, data);
      setCurrentFilePath(filePath);
    };

    // Final save before window closes (Cmd+Q, Cmd+W, close button)
    const handleBeforeClose = async () => {
      if (currentFilePathRef.current) {
        console.log("[useFileOperations] Before-close: saving to", currentFilePathRef.current);
        const content = getSerializedScene();
        await window.electronAPI.writeFile(currentFilePathRef.current, content);
      }
      window.electronAPI.acknowledgeClose();
    };

    const unsubs = [
      window.electronAPI.onMenuNew(handleNew),
      window.electronAPI.onMenuOpen(handleOpen),
      window.electronAPI.onMenuSave(handleSave),
      window.electronAPI.onMenuSaveAs(handleSaveAs),
      window.electronAPI.onOpenFile(handleOpenFileFromOS),
      window.electronAPI.onBeforeClose(handleBeforeClose),
    ];

    return () => unsubs.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawAPI]);

  return { currentFilePath, initialData };
};

export default useFileOperations;
