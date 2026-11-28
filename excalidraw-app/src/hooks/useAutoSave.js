import { useEffect, useState } from "react";
import { createSaveController, resolveDebounceMs } from "../utils/saveController";

// Creates the single save controller for the app (see saveController.js) and reports
// its document state to the main process for the edited dot and "Save changes?" prompt.
const useAutoSave = ({ config, getSerializedScene }) => {
  const [saver] = useState(() =>
    createSaveController({
      writeFile: (filePath, content) => window.electronAPI.writeFile(filePath, content),
      saveFileDialog: (content) => window.electronAPI.saveFileDialog(content),
      onStateChange: ({ dirty, hasFilePath, hasContent }) => {
        window.electronAPI.setDocumentState({ dirty, hasFilePath, hasContent });
      },
    }),
  );

  useEffect(() => {
    saver.setDebounceMs(resolveDebounceMs(config));
  }, [saver, config]);

  useEffect(() => {
    saver.setSerializer(getSerializedScene);
  }, [saver, getSerializedScene]);

  useEffect(() => () => saver.dispose(), [saver]);

  return saver;
};

export default useAutoSave;
