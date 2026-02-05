import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

import { useState, useRef, useCallback } from "react";
import useAutoSave from "./hooks/useAutoSave";

export default function App() {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const [fileHandle, setFileHandle] = useState(null);

  const appStateRef = useRef(null);
  const sceneElementsRef = useRef(null);

  useAutoSave({ sceneElementsRef, appStateRef, fileHandle });

  const handleChange = useCallback(async (sceneElements, appState) => {
    appStateRef.current = appState;
    sceneElementsRef.current = sceneElements;
    if (appState.fileHandle && appState.fileHandle !== fileHandle) {
      // write permission required for auto-save
      const permission = await appState.fileHandle.requestPermission({ mode: "readwrite" });
      if (permission === "granted") {
        console.log("[App] Write permission granted for:", appState.fileHandle.name);
        setFileHandle(appState.fileHandle);
        excalidrawAPI?.scrollToContent();
      } else {
        console.warn("[App] Write permission denied");
      }
    }
  }, [fileHandle, excalidrawAPI]);

  return (
    <div style={{ height: "100vh" }}>
      <Excalidraw
        excalidrawAPI={(api) => setExcalidrawAPI(api)}
        onChange={handleChange}
      />
    </div>
  );
}
