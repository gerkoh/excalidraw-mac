import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useState, useRef, useCallback, useEffect } from "react";
import useAutoSave from "./hooks/useAutoSave";
import useFileOperations from "./hooks/useFileOperations";
import useCopilotDiagram from "./hooks/useCopilotDiagram";
import { serializeScene } from "./utils/sceneUtils";
import Sidebar from "./copilot/SidebarContent";
import SidebarTrigger from "./copilot/SidebarTrigger";

export default function App() {
  // On startup, load config and check if there's a file to open (pending from OS or last opened)
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

  // Handle menu events (New, Open, Save, Save As) and OS file open
  const { currentFilePath, initialData } = useFileOperations({
    excalidrawAPI,
    sceneElementsRef,
    appStateRef,
    getSerializedScene,
  });

  // Auto-save to the current file path (inactive until a file is opened/saved)
  useAutoSave({
    sceneElementsRef,
    currentFilePath,
    config,
    excalidrawAPI,
    getSerializedScene,
  });

  // Streaming copilot diagram rendering (element-by-element with camera animation)
  useCopilotDiagram({ excalidrawAPI, sceneElementsRef });

  // Excalidraw fires onChange on every interaction -
  // capture latest scene elements and app state for save operations.
  const handleChange = useCallback((sceneElements, appState) => {
    appStateRef.current = appState;
    sceneElementsRef.current = sceneElements;
  }, []);

  // Block rendering until startup file check resolves:
  // undefined = still loading, null = no file, {...} = file data
  if (initialData === undefined) {
    return null;
  }

  const isCopilotEnabled = config?.copilot?.enabled !== false;

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
        renderTopRightUI={() =>
          isCopilotEnabled ? <SidebarTrigger /> : null
        }
      >
        {isCopilotEnabled ? <Sidebar /> : null}
      </Excalidraw>
    </div>
  );
}
