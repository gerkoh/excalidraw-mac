import { useRef, useEffect } from "react";
import { serializeScene } from "../utils/sceneUtils";

const isElementsChanged = (prev, next) => {
  if (!Array.isArray(prev) || !Array.isArray(next)) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].version !== next[i].version) {
      return true;
    }
  }
  return false;
};

const useAutoSave = ({ sceneElementsRef, appStateRef, currentFilePath, config, excalidrawAPI }) => {
  const prevElementsRef = useRef();
  const debounceTimerRef = useRef(null);
  const isSavingRef = useRef(false); // mutex to prevent overlapping saves

  useEffect(() => {
    if (!config) {
      console.log("[useAutoSave] Config missing, auto-save disabled");
      return;
    }
    if (!currentFilePath) {
      console.log("[useAutoSave] No file open, auto-save disabled");
      return;
    }
    if (!excalidrawAPI) {
      console.log("[useAutoSave] Excalidraw API not ready, auto-save disabled");
      return;
    }

    const AUTOSAVE_DEBOUNCE_MS = config.autoSaveDebounceMs;
    const AUTOSAVE_CHECK_INTERVAL_MS = config.autoSaveCheckIntervalMs;

    console.log("[useAutoSave] Start auto-saving to:", currentFilePath);

    // debounce auto-saves after an interval from last change
    const intervalCheck = setInterval(() => {
      const currentElements = sceneElementsRef.current;
      const prev = prevElementsRef.current;

      const changed = isElementsChanged(prev, currentElements);

      if (changed) {
        prevElementsRef.current = currentElements; // set prev to current to prevent re-trigger

        // reset debounce timer on change
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // after interval from last change, perform save
        debounceTimerRef.current = setTimeout(() => {
          console.log("[useAutoSave] Changes settled, saving to:", currentFilePath);

          const content = serializeScene(sceneElementsRef, appStateRef, excalidrawAPI);

          const saveToFile = async () => {
            if (isSavingRef.current) {
              console.log("[useAutoSave] Save already in progress, skipping");
              return;
            }
            isSavingRef.current = true; // acquire lock
            try {
              const success = await window.electronAPI.writeFile(currentFilePath, content);
              if (success) {
                console.log("[useAutoSave] ✅ Auto-saved successfully to:", currentFilePath);
              } else {
                console.error("[useAutoSave] ❌ Auto-save returned failure");
              }
            } catch (err) {
              console.error("[useAutoSave] ❌ Auto-save failed:", err);
            } finally {
              isSavingRef.current = false; // release lock
            }
          };

          saveToFile();
        }, AUTOSAVE_DEBOUNCE_MS); // how often to save after last change
      }
    }, AUTOSAVE_CHECK_INTERVAL_MS); // how often to check for changes

    // clear interval on path change or unmount
    return () => {
      console.log("[useAutoSave] Clearing auto-save interval");
      clearInterval(intervalCheck);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFilePath, config, excalidrawAPI]);
};

export default useAutoSave;
