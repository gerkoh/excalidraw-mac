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

        // Check if a file was requested via OS (double-click / Open With)
        const pendingPath = await window.electronAPI.getPendingFile();
        // Use the pending file if available, otherwise fall back to last opened
        const targetPath = pendingPath || (await window.electronAPI.getLastPath());

        if (targetPath) {
          const content = await window.electronAPI.readFile(targetPath);
          if (content) {
            const parsed = JSON.parse(content);
            console.log("[App] Loaded file:", targetPath);
            setCurrentFilePath(targetPath);
            await window.electronAPI.saveLastPath(targetPath);
            const appState = { ...(parsed.appState || {}) };
            delete appState.scrollX;
            delete appState.scrollY;
            setInitialData({
              elements: parsed.elements || [],
              appState,
              files: parsed.files || {},
              scrollToContent: true,
            });
            return;
          }
        }

        console.log("[App] No file to open, starting fresh");
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

    const handleNew = async () => {
      console.log("[App] New canvas");
      setCurrentFilePath(null);
      await window.electronAPI.saveLastPath(null);
      sceneElementsRef.current = null;
      appStateRef.current = null;
      excalidrawAPI.resetScene();
    };

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
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => excalidrawAPI.scrollToContent()),
      );
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

    // OS-level open-file (double-click / Open With)
    const handleOpenFile = async (_event, filePath) => {
      try {
        const content = await window.electronAPI.readFile(filePath);
        if (!content) return;
        const parsed = JSON.parse(content);
        console.log("[App] Opened file via OS:", filePath);
        setCurrentFilePath(filePath);
        await window.electronAPI.saveLastPath(filePath);
        excalidrawAPI.updateScene({
          elements: parsed.elements || [],
          appState: parsed.appState || {},
        });
        if (parsed.files && Object.keys(parsed.files).length > 0) {
          excalidrawAPI.addFiles(
            Object.entries(parsed.files).map(([id, file]) => ({ ...file, id })),
          );
        }
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(() => excalidrawAPI.scrollToContent()),
        );
      } catch (err) {
        console.error("[App] Failed to open file via OS:", err);
      }
    };

    window.electronAPI.onMenuNew(handleNew);
    window.electronAPI.onMenuOpen(handleOpen);
    window.electronAPI.onMenuSave(handleSave);
    window.electronAPI.onMenuSaveAs(handleSaveAs);
    window.electronAPI.onOpenFile(handleOpenFile);

    // cleanup: remove listeners when deps change or on unmount
    return () => {
      window.electronAPI.offMenuNew(handleNew);
      window.electronAPI.offMenuOpen(handleOpen);
      window.electronAPI.offMenuSave(handleSave);
      window.electronAPI.offMenuSaveAs(handleSaveAs);
      window.electronAPI.offOpenFile(handleOpenFile);
    };
  }, [excalidrawAPI]);

  // intercept drag-drop of .excalidraw files so we update currentFilePath
  useEffect(() => {
    if (!excalidrawAPI) return;

    const handleDrop = async (e) => {
      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      if (!file.name.endsWith(".excalidraw")) {
        console.warn("[App] Dropped file is not an .excalidraw file, ignoring:", file.name);
        return;
      }

      // Electron exposes the full filesystem path on dropped files
      const filePath = file.path;
      if (!filePath) return;

      // prevent excalidraw's built-in drop handler from processing this file
      e.preventDefault();
      e.stopImmediatePropagation();

      try {
        const content = await window.electronAPI.readFile(filePath);
        if (!content) return;

        const parsed = JSON.parse(content);
        console.log("[App] Dropped file (overwriting current scene):", filePath);
        setCurrentFilePath(filePath);
        const dropAppState = { ...(parsed.appState || {}) };
        delete dropAppState.scrollX;
        delete dropAppState.scrollY;
        excalidrawAPI.updateScene({
          elements: parsed.elements || [],
          appState: dropAppState,
        });
        if (parsed.files && Object.keys(parsed.files).length > 0) {
          excalidrawAPI.addFiles(Object.entries(parsed.files).map(([id, f]) => ({ ...f, id })));
        }
        setTimeout(() => excalidrawAPI.scrollToContent(), 100);
      } catch (err) {
        console.error("[App] Failed to load dropped file:", err);
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
