import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import useAutoSave from "../hooks/useAutoSave";
import useFileOperations from "../hooks/useFileOperations";
import { useLibraryBinding } from "../hooks/useLibrary";
import { getSceneSnapshot, serializeScene } from "../utils/sceneUtils";
import { LIBRARY_RETURN_URL } from "../../../shared/libraryUrl.mjs";

// One drawing. It stays mounted while hidden so undo, selection and pasted images survive a switch.
const TabCanvas = ({
  tabKey,
  startupPath,
  config,
  theme,
  active,
  onState,
  onReady,
  onActiveApi,
  onThemeChange,
}) => {
  const [excalidrawAPI, setExcalidrawAPI] = useState(null);
  const sceneElementsRef = useRef(null);
  const appStateRef = useRef(null);
  const onReadyRef = useRef(onReady);
  const onStateRef = useRef(onState);

  useEffect(() => {
    onReadyRef.current = onReady;
    onStateRef.current = onState;
  });

  const handleReady = useCallback((actions) => {
    onReadyRef.current?.(actions);
  }, []);

  const getSerializedScene = useCallback(
    () => serializeScene(sceneElementsRef, appStateRef, excalidrawAPI),
    [excalidrawAPI],
  );

  const saver = useAutoSave({
    config,
    getSerializedScene,
    onStateChange: (state) => onStateRef.current?.(state),
  });

  const { initialData } = useFileOperations({
    excalidrawAPI,
    sceneElementsRef,
    appStateRef,
    saver,
    startupPath,
    subscribeToMenu: false,
    onReady: handleReady,
  });

  useLibraryBinding({ excalidrawAPI });

  useEffect(() => {
    if (active && excalidrawAPI) onActiveApi(excalidrawAPI);
  }, [active, excalidrawAPI, onActiveApi]);

  const handleChange = useCallback(
    (sceneElements, appState) => {
      appStateRef.current = appState;
      sceneElementsRef.current = sceneElements;
      saver.observe(getSceneSnapshot(sceneElements, appState));
      if (active) onThemeChange(appState.theme);
    },
    [saver, active, onThemeChange],
  );

  if (initialData === undefined || theme === undefined) return null;

  return (
    <Excalidraw
      tabKey={tabKey}
      excalidrawAPI={setExcalidrawAPI}
      onChange={handleChange}
      initialData={initialData}
      theme={theme}
      libraryReturnUrl={LIBRARY_RETURN_URL}
      UIOptions={{
        canvasActions: {
          toggleTheme: true,
          loadScene: false,
          saveToActiveFile: false,
          export: false,
        },
      }}
    />
  );
};

export default TabCanvas;
