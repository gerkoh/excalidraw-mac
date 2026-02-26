import { serializeAsJSON } from "@excalidraw/excalidraw";

const parseInitialData = (content) => {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error(
      "[sceneUtils] Likely malformed content in file, failed to parse scene data:",
      err,
    );
    return null;
  }

  const appState = parsed.appState || {};
  // check if file has viewport info; if not, trigger scrollToContent on load
  const hasViewport = appState.scrollX != null && appState.scrollY != null;

  return {
    elements: parsed.elements,
    appState,
    files: parsed.files || {},
    ...(!hasViewport && { scrollToContent: true }),
  };
};

const loadScene = (excalidrawAPI, parsed) => {
  excalidrawAPI.updateScene({
    elements: parsed.elements || [],
    appState: parsed.appState || {},
  });
  if (parsed.files && Object.keys(parsed.files).length > 0) {
    excalidrawAPI.addFiles(Object.entries(parsed.files).map(([id, file]) => ({ ...file, id })));
  }
};

const serializeScene = (sceneElementsRef, appStateRef, excalidrawAPI) => {
  const serialized = serializeAsJSON(
    sceneElementsRef.current || [],
    appStateRef.current || {},
    excalidrawAPI.getFiles(),
    "local",
  );

  // serializeAsJSON strips scrollX, scrollY, and zoom (export: false in excalidraw config)
  // Re-inject them so viewport state is persisted across sessions
  const appState = appStateRef.current || {};
  const data = JSON.parse(serialized);
  data.appState.scrollX = appState.scrollX ?? 0;
  data.appState.scrollY = appState.scrollY ?? 0;
  data.appState.zoom = appState.zoom ?? { value: 1 };
  return JSON.stringify(data, null, 2);
};

export { parseInitialData, loadScene, serializeScene };
