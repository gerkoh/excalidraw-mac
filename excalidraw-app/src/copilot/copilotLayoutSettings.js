const STORAGE_KEY = "excalidraw-mac.copilot.applySimpleLayout";

/** Sidebar "Apply simple layout" (dagre). Default off — model positions only. */
let applySimpleLayout = false;

function readStoredValue() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

applySimpleLayout = readStoredValue();

export function getApplySimpleLayout() {
  return applySimpleLayout;
}

export function setApplySimpleLayout(value) {
  applySimpleLayout = Boolean(value);
  try {
    localStorage.setItem(STORAGE_KEY, applySimpleLayout ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

/** Reset module state (for tests). */
export function resetApplySimpleLayoutForTests(value = false) {
  applySimpleLayout = value;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
