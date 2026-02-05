import { useRef, useEffect } from "react";
import { serializeAsJSON } from "@excalidraw/excalidraw";
import config from "@config";

const AUTOSAVE_INTERVAL_MS = config.autoSaveInterval;

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

    // debounce auto-save with interval
    const intervalDebounce = setInterval(() => {
      const currentElements = sceneElementsRef.current;
      const prev = prevElementsRef.current;

      const changed = elementsChanged(prev, currentElements);

      if (changed) {
        console.log("[useAutoSave] Changes detected, saving to:", fileHandle.name);

        const content = serializeAsJSON(currentElements, appStateRef.current, {}, "local");

        const saveToFile = async () => {
          if (isSavingRef.current) {
            console.log("[useAutoSave] Save already in progress, skipping");
            return;
          }
          isSavingRef.current = true;  // acquire lock
          try {
            const writable = await fileHandle.createWritable();
            await writable.write(content);
            await writable.close();
            console.log("[useAutoSave] ✅ Auto-saved successfully to:", fileHandle.name);
          } catch (err) {
            console.error("[useAutoSave] ❌ Auto-save failed:", err);
          } finally {
            isSavingRef.current = false;  // release lock
          }
        };

        saveToFile();
        prevElementsRef.current = currentElements;
      }
    }, AUTOSAVE_INTERVAL_MS);

    // clear interval on file change or unmount
    return () => {
      console.log("[useAutoSave] Clearing auto-save interval");
      clearInterval(intervalDebounce);
    };
  }, [fileHandle, sceneElementsRef, appStateRef]);  // watch for these changes to re-run effect
}

export default useAutoSave;
