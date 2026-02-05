import { useRef, useEffect } from "react";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import config from "@config";

const AUTOSAVE_DEBOUNCE_MS = config.autoSaveDebounceMs;
const AUTOSAVE_CHECK_INTERVAL_MS = config.autoSaveCheckIntervalMs;

const elementsChanged = (prev, next) => {
  if (!Array.isArray(prev) || !Array.isArray(next)) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].id !== next[i].id || prev[i].version !== next[i].version) {
      return true;
    }
  }
  return false;
};

function useAutoSave({ sceneElementsRef, appStateRef, fileHandle }) {
  const prevElementsRef = useRef();
  const prevFileHandleRef = useRef();

  const debounceTimerRef = useRef(null);
  const isSavingRef = useRef(false); // mutex to prevent overlapping saves

  useEffect(() => {
    // no file to save to
    if (!fileHandle) {
      console.log("[useAutoSave] No fileHandle, auto-save disabled");
      return;
    }

    console.log("[useAutoSave] Start auto-saving for:", fileHandle.name);

    // load elements when file changes
    if (fileHandle !== prevFileHandleRef.current) {
      console.log("[useAutoSave] File changed!", {
        from: prevFileHandleRef.current?.name || "(none)",
        to: fileHandle.name,
      });
      prevElementsRef.current = sceneElementsRef.current;
      prevFileHandleRef.current = fileHandle;
    }

    // debounce auto-saves after an interval from last change
    const intervalCheck = setInterval(() => {
      const currentElements = sceneElementsRef.current;
      const prev = prevElementsRef.current;

      const changed = elementsChanged(prev, currentElements);

      if (changed) {
        prevElementsRef.current = currentElements; // set prev to current to prevent re-trigger

        // reset debounce timer on change
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        // after interval from last change, perform save
        debounceTimerRef.current = setTimeout(() => {
          console.log("[useAutoSave] Changes settled, saving to:", fileHandle.name);

          const latestElements = sceneElementsRef.current;
          const content = serializeAsJSON(latestElements, appStateRef.current, {}, "local");

          const saveToFile = async () => {
            if (isSavingRef.current) {
              console.log("[useAutoSave] Save already in progress, skipping");
              return;
            }
            isSavingRef.current = true; // acquire lock
            try {
              const writable = await fileHandle.createWritable();
              await writable.write(content);
              await writable.close();
              console.log("[useAutoSave] ✅ Auto-saved successfully to:", fileHandle.name);
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

    // clear interval on file change or unmount
    return () => {
      console.log("[useAutoSave] Clearing auto-save interval");
      clearInterval(intervalCheck);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [fileHandle, sceneElementsRef, appStateRef]);
}

export default useAutoSave;
