import { useEffect, useState } from "react";
import { createSaveController, resolveDebounceMs } from "../utils/saveController";

const reportToMain = (state) => window.electronAPI.setDocumentState(state);

// Creates the save controller for one drawing (see saveController.js).
// onStateChange defaults to reporting a single document; a tab passes its own reporter
// so the shell can publish the whole session.
const useAutoSave = ({ config, getSerializedScene, onStateChange }) => {
  const [saver] = useState(() =>
    createSaveController({
      writeFile: (filePath, content) => window.electronAPI.writeFile(filePath, content),
      saveFileDialog: (content) => window.electronAPI.saveFileDialog(content),
      // { filePath, hasFilePath, dirty, hasContent }
      onStateChange: onStateChange ?? reportToMain,
    }),
  );

  useEffect(() => {
    saver.setReporter(onStateChange ?? reportToMain);
  }, [saver, onStateChange]);

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
