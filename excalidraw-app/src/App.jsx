import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useState, useRef, useCallback, useEffect } from "react";
import useAutoSave from "./hooks/useAutoSave";
import useFileOperations from "./hooks/useFileOperations";

export default function App() {
  // on startup, we load config and check if there's a file to open (pending from OS or last opened)
  const [config, setConfig] = useState(null);
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await window.electronAPI.getConfig();
        setConfig(cfg);
        console.log("[App] Config loaded:", cfg);
      } catch (err) {
        console.error("[App] Failed to load config:", err);
      }
    };
    loadConfig();
  }, []);

  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const sceneElementsRef = useRef(null);
  const appStateRef = useRef(null);

  // handle menu events (New, Open, Save, Save As)
  // handle file open from finder
  const { currentFilePath, initialData } = useFileOperations({
    excalidrawAPI,
    sceneElementsRef,
    appStateRef,
  });

  // auto-save writes to the current file path (inactive until a file is opened/saved)
  useAutoSave({ sceneElementsRef, appStateRef, currentFilePath, config, excalidrawAPI });

  // Excalidraw fires onChange on every interaction
  // capture latest scene elements and app state for save operations
  const handleChange = useCallback((sceneElements, appState) => {
    appStateRef.current = appState;
    sceneElementsRef.current = sceneElements;
  }, []);

  // Block rendering until startup file check resolves:
  // undefined = still loading, null = no file, {...} = file data
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
