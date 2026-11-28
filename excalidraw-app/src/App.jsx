import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useState, useRef, useCallback, useEffect } from "react";
import useAutoSave from "./hooks/useAutoSave";
import useFileOperations from "./hooks/useFileOperations";
import useReportCurrentFile from "./hooks/useReportCurrentFile";
import useTheme from "./hooks/useTheme";
import { serializeScene } from "./utils/sceneUtils";

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

  const getSerializedScene = useCallback(
    () => serializeScene(sceneElementsRef, appStateRef, excalidrawAPI),
    [excalidrawAPI],
  );

  // handle menu events (New, Open, Save, Save As)
  // handle file open from finder
  const { currentFilePath, initialData } = useFileOperations({
    excalidrawAPI,
    sceneElementsRef,
    appStateRef,
    getSerializedScene,
  });

  // auto-save writes to the current file path (inactive until a file is opened/saved)
  useAutoSave({ sceneElementsRef, currentFilePath, config, excalidrawAPI, getSerializedScene });

  // window title + proxy icon follow the current file
  useReportCurrentFile({ currentFilePath, isReady: initialData !== undefined });

  // effective theme from View -> Appearance; the in-app toggle sets an explicit Light/Dark preference
  const { theme, handleAppThemeChange } = useTheme();

  // Excalidraw fires onChange on every interaction
  // capture latest scene elements and app state for save operations
  const handleChange = useCallback(
    (sceneElements, appState) => {
      appStateRef.current = appState;
      sceneElementsRef.current = sceneElements;
      handleAppThemeChange(appState.theme);
    },
    [handleAppThemeChange],
  );

  // Block rendering until startup file check and theme resolve:
  // initialData: undefined = still loading, null = no file, {...} = file data
  if (initialData === undefined || theme === undefined) {
    return null;
  }

  return (
    <div style={{ height: "100vh" }}>
      <Excalidraw
        excalidrawAPI={setExcalidrawAPI}
        onChange={handleChange}
        initialData={initialData}
        theme={theme}
        UIOptions={{
          canvasActions: {
            // passing `theme` hides Excalidraw's toggle unless explicitly enabled
            toggleTheme: true,
            loadScene: false,
            saveToActiveFile: false,
            export: false,
          },
        }}
      />
    </div>
  );
}
