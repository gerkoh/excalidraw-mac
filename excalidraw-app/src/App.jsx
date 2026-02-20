import { Excalidraw, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useState, useRef, useCallback, useEffect } from "react";
import useAutoSave from "./hooks/useAutoSave";

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [currentFilePath, setCurrentFilePath] = useState(null);
  const [initialData, setInitialData] = useState(undefined); // undefined = not loaded yet
  const [config, setConfig] = useState(null);

  const appStateRef = useRef(null);
  const sceneElementsRef = useRef(null);
  const currentFilePathRef = useRef(null);

  // keep ref in sync with state so IPC handlers always read the latest path
  useEffect(() => {
    currentFilePathRef.current = currentFilePath;
  }, [currentFilePath]);

  // auto-save writes to the current file path (inactive until a file is opened/saved)
  useAutoSave({ sceneElementsRef, appStateRef, currentFilePath, config, excalidrawAPI });

  // load config + last opened file on mount
  useEffect(() => {
    const loadStartup = async () => {
      try {
        const cfg = await window.electronAPI.getConfig();
        setConfig(cfg);
        console.log("[App] Config loaded:", cfg);

        // try to reopen the last used file
        const lastPath = await window.electronAPI.getLastPath();
        if (lastPath) {
          const content = await window.electronAPI.readFile(lastPath);
          if (content) {
            const parsed = JSON.parse(content);
            console.log("[App] Loaded last file:", lastPath);
            setCurrentFilePath(lastPath);
            setInitialData({
              elements: parsed.elements || [],
              appState: parsed.appState || {},
              files: parsed.files || {},
            });
            return;
          }
        }

        console.log("[App] No last opened file found, starting fresh");
        setInitialData(null);
      } catch (err) {
        console.error("[App] Failed to load startup file:", err);
        setInitialData(null);
      }
    };
    loadStartup();
  }, []);

  // handle menu events (Open, Save, Save As) — with proper cleanup
  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleOpen = async () => {
      const result = await window.electronAPI.openFileDialog();
      if (!result) return;

      const parsed = JSON.parse(result.content);
      console.log("[App] Opened file:", result.path);
      setCurrentFilePath(result.path);
      excalidrawAPI.updateScene({
        elements: parsed.elements || [],
        appState: parsed.appState || {},
      });
      // restore embedded images/files if present
      if (parsed.files && Object.keys(parsed.files).length > 0) {
        excalidrawAPI.addFiles(Object.entries(parsed.files).map(([id, file]) => ({ ...file, id })));
      }
      excalidrawAPI.scrollToContent();
    };

    const handleSaveAs = async () => {
      if (!sceneElementsRef.current) return;
      const content = serializeAsJSON(
        sceneElementsRef.current,
        appStateRef.current,
        excalidrawAPI.getFiles(),
        "local",
      );
      const newPath = await window.electronAPI.saveFileDialog(content);
      if (newPath) {
        console.log("[App] ✅ Saved As:", newPath);
        setCurrentFilePath(newPath);
      }
    };

    const handleSave = async () => {
      if (!sceneElementsRef.current) return;
      // If no file is open yet, delegate to Save As
      if (!currentFilePathRef.current) {
        return handleSaveAs();
      }
      const content = serializeAsJSON(
        sceneElementsRef.current,
        appStateRef.current,
        excalidrawAPI.getFiles(),
        "local",
      );
      const success = await window.electronAPI.writeFile(currentFilePathRef.current, content);
      if (success) {
        console.log("[App] ✅ Saved to:", currentFilePathRef.current);
      }
    };

    window.electronAPI.onMenuOpen(handleOpen);
    window.electronAPI.onMenuSave(handleSave);
    window.electronAPI.onMenuSaveAs(handleSaveAs);

    // cleanup: remove listeners when deps change or on unmount
    return () => {
      window.electronAPI.offMenuOpen(handleOpen);
      window.electronAPI.offMenuSave(handleSave);
      window.electronAPI.offMenuSaveAs(handleSaveAs);
    };
  }, [excalidrawAPI]);

  // intercept drag-drop of .excalidraw files so we update currentFilePath
  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleDrop = async (e) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.name.endsWith(".excalidraw")) return;

      // Electron exposes the full filesystem path on dropped files
      const filePath = file.path;
      if (!filePath) return;

      // prevent excalidraw's built-in drop handler from processing this file
      e.preventDefault();
      e.stopPropagation();

      try {
        const content = await window.electronAPI.readFile(filePath);
        if (!content) return;

        const parsed = JSON.parse(content);
        console.log("[App] Opened dropped file:", filePath);
        setCurrentFilePath(filePath);
        excalidrawAPI.updateScene({
          elements: parsed.elements || [],
          appState: parsed.appState || {},
        });
        if (parsed.files && Object.keys(parsed.files).length > 0) {
          excalidrawAPI.addFiles(Object.entries(parsed.files).map(([id, f]) => ({ ...f, id })));
        }
        excalidrawAPI.scrollToContent();
      } catch (err) {
        console.error("[App] Failed to open dropped file:", err);
      }
    };

    // Use capture phase so we run before Excalidraw's handler
    document.addEventListener("drop", handleDrop, true);
    return () => document.removeEventListener("drop", handleDrop, true);
  }, [excalidrawAPI]);

  const handleChange = useCallback((sceneElements, appState) => {
    appStateRef.current = appState;
    sceneElementsRef.current = sceneElements;
  }, []);

  // on first render: Don't render Excalidraw until we know whether there's saved data
  if (initialData === undefined) {
    return null;
  }

  return (
    <div style={{ height: "100vh" }}>
      <Excalidraw
        excalidrawAPI={setExcalidrawAPI}
        onChange={handleChange}
        initialData={initialData}
        UIOptions={{
          canvasActions: {
            loadScene: false,
            saveToActiveFile: false,
            export: false,
          },
        }}
      />
    </div>
  );
}
