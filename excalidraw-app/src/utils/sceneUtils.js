import { serializeAsJSON } from "@excalidraw/excalidraw";

const parseInitialData = (content, scrollToContent = true) => {
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

  let initialData;
  if (scrollToContent) {
    const appState = { ...(parsed.appState || {}) };
    delete appState.scrollX;
    delete appState.scrollY;
    initialData = {
      elements: parsed.elements,
      appState,
      files: parsed.files || {},
      scrollToContent: true,
    };
  } else {
    initialData = {
      elements: parsed.elements,
      appState: parsed.appState,
      files: parsed.files || {},
    };
  }

  return initialData;
};

const loadScene = async (excalidrawAPI, parsed, scrollToContent = true) => {
  excalidrawAPI.updateScene({
    elements: parsed.elements || [],
    appState: parsed.appState || {},
  });
  if (parsed.files && Object.keys(parsed.files).length > 0) {
    excalidrawAPI.addFiles(Object.entries(parsed.files).map(([id, file]) => ({ ...file, id })));
  }
  if (scrollToContent) {
    // scroll to content after scene is loaded
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => excalidrawAPI.scrollToContent()),
    );
  }
};

const serializeScene = (sceneElementsRef, appStateRef, excalidrawAPI) => {
  return serializeAsJSON(
    sceneElementsRef.current || [],
    appStateRef.current || {},
    excalidrawAPI.getFiles(),
    "local",
  );
};

export { parseInitialData, loadScene, serializeScene };
