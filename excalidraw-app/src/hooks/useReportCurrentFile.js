import { useEffect } from "react";

// main derives the window title + macOS proxy icon from this; it is the only place that reports it,
// so every path change (startup, ⌘N, ⌘O, Save As, Finder / Open Recent) is covered by one effect
const useReportCurrentFile = ({ currentFilePath, isReady }) => {
  useEffect(() => {
    // wait for the startup load so the title doesn't flash "Untitled" before the file is known
    if (!isReady) return;
    window.electronAPI.setCurrentFile(currentFilePath ?? null);
  }, [currentFilePath, isReady]);
};

export default useReportCurrentFile;
