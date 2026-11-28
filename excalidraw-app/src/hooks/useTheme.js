import { useState, useEffect, useRef, useCallback } from "react";
import { isTheme, detectInAppThemeChange } from "../utils/themeUtils";

// effective theme ("light" | "dark") comes from main (View -> Appearance resolved against macOS);
// undefined until the first answer so Excalidraw never mounts in the wrong theme
const useTheme = () => {
  const [theme, setTheme] = useState(undefined);
  // the value we are passing as Excalidraw's `theme` prop, updated synchronously with setTheme
  // so onChange never compares against a stale prop during a re-render
  const propThemeRef = useRef(undefined);
  // appState.theme seen in the previous onChange
  const lastAppThemeRef = useRef(null);

  useEffect(() => {
    let receivedUpdate = false;
    const applyTheme = (next) => {
      propThemeRef.current = next;
      setTheme(next);
    };

    const unsubscribe = window.electronAPI.onThemeChanged((_event, next) => {
      if (!isTheme(next)) {
        console.error("[useTheme] Ignoring unknown theme from main:", next);
        return;
      }
      receivedUpdate = true;
      applyTheme(next);
    });

    window.electronAPI
      .getTheme()
      .then((initial) => {
        // a theme-changed event that arrived meanwhile is newer than this answer
        if (receivedUpdate) return;
        applyTheme(isTheme(initial) ? initial : "light");
      })
      .catch((err) => {
        console.error("[useTheme] Failed to get theme, falling back to light:", err);
        if (!receivedUpdate) applyTheme("light");
      });

    return unsubscribe;
  }, []);

  // call from Excalidraw's onChange with appState.theme
  const handleAppThemeChange = useCallback((appTheme) => {
    const preference = detectInAppThemeChange({
      previousAppTheme: lastAppThemeRef.current,
      nextAppTheme: appTheme,
      propTheme: propThemeRef.current,
    });
    lastAppThemeRef.current = appTheme;
    if (preference) {
      console.log("[useTheme] In-app theme toggle, setting preference:", preference);
      window.electronAPI.setThemePreference(preference);
    }
  }, []);

  return { theme, handleAppThemeChange };
};

export default useTheme;
