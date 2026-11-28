import { serializeAsJSON, hashElementsVersion } from "@excalidraw/excalidraw";

// app-level settings a drawing must not override when loaded
// (.excalidraw files carry appState.theme, but the theme follows View -> Appearance)
const APP_LEVEL_APP_STATE_KEYS = ["theme"];

const stripAppLevelAppState = (appState) => {
  const stripped = { ...appState };
  for (const key of APP_LEVEL_APP_STATE_KEYS) {
    delete stripped[key];
  }
  return stripped;
};

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

  const appState = stripAppLevelAppState(parsed.appState || {});
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
  // updateScene keeps the previous drawing's undo stack; undo must not bring it back
  excalidrawAPI.history.clear();
};

// --- Change detection ---

// the parts of appState that serializeAsJSON writes to the file (export: true in excalidraw)
const PERSISTED_APP_STATE_KEYS = ["viewBackgroundColor", "gridSize", "gridStep", "gridModeEnabled"];

// cheap per-onChange fingerprint of everything a save would persist, except the viewport;
// every element edit (including delete/undo) gets a new versionNonce
const getSceneSnapshot = (elements, appState) => {
  const sceneElements = elements || [];
  const persistedAppState = PERSISTED_APP_STATE_KEYS.map((key) => String(appState?.[key]));
  return {
    key: [hashElementsVersion(sceneElements), ...persistedAppState].join("|"),
    hasContent: sceneElements.some((element) => !element.isDeleted),
  };
};

// --- Serialization ---

// serializeAsJSON pretty-prints with 2 spaces, so the top-level appState key always starts a line
// with exactly 2 spaces; JSON strings can't contain raw newlines, so element text can't match it
const APP_STATE_MARKER = '\n  "appState": {';

const getViewport = (appState) => ({
  scrollX: appState.scrollX ?? 0,
  scrollY: appState.scrollY ?? 0,
  zoom: appState.zoom ?? { value: 1 },
});

// viewport fields as `"key": value` lines indented for a 2nd-level object, without braces
const viewportLines = (viewport) =>
  JSON.stringify(viewport, null, 2)
    .slice(2, -2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

// slow path, only if the library's output format ever changes
const injectViewportByReparse = (serialized, viewport) => {
  const data = JSON.parse(serialized);
  data.appState = { ...data.appState, ...viewport };
  return JSON.stringify(data, null, 2);
};

const injectViewport = (serialized, viewport) => {
  const markerIndex = serialized.indexOf(APP_STATE_MARKER);
  if (markerIndex === -1) {
    console.warn("[sceneUtils] Unexpected serializeAsJSON format, re-parsing to add viewport");
    return injectViewportByReparse(serialized, viewport);
  }
  const insertAt = markerIndex + APP_STATE_MARKER.length;
  const isEmptyAppState = serialized[insertAt] === "}";
  const separator = isEmptyAppState ? "\n  " : ",";
  return (
    serialized.slice(0, insertAt) +
    "\n" +
    viewportLines(viewport) +
    separator +
    serialized.slice(insertAt)
  );
};

// serializeAsJSON strips scrollX, scrollY, and zoom (export: false in excalidraw config).
// They are spliced into its output (no parse/re-stringify of large embedded images)
// so the viewport is persisted across sessions.
const serializeScene = (sceneElementsRef, appStateRef, excalidrawAPI) => {
  const appState = appStateRef.current || {};
  const serialized = serializeAsJSON(
    sceneElementsRef.current || [],
    appState,
    excalidrawAPI.getFiles(),
    "local",
  );
  return injectViewport(serialized, getViewport(appState));
};

export {
  stripAppLevelAppState,
  parseInitialData,
  loadScene,
  getSceneSnapshot,
  serializeScene,
  injectViewport,
};
