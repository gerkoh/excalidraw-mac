import { useEffect } from "react";
import { useHandleLibrary } from "@excalidraw/excalidraw";
import { isAllowedLibraryUrl } from "../../../shared/libraryUrl.mjs";

// Excalidraw calls load() on startup (and before each save, to reconcile) and
// save() after every library change. The main process owns the file path.
export const libraryAdapter = {
  load: () => window.electronAPI.getLibrary(),
  save: async ({ libraryItems }) => {
    const saved = await window.electronAPI.saveLibrary(libraryItems);
    // Excalidraw expects save() to throw on failure; it then shows an error toast
    if (!saved) throw new Error("Couldn't save the library to disk");
  },
};

const fetchLibraryBlob = async (libraryUrl) => {
  const response = await fetch(libraryUrl, { credentials: "omit" });
  if (response.redirected && !isAllowedLibraryUrl(response.url)) {
    throw new Error(`Library download redirected to a disallowed URL: ${response.url}`);
  }
  if (!response.ok) {
    throw new Error(`Couldn't download library (HTTP ${response.status})`);
  }
  return response.blob();
};

// Downloads a library and merges it into the current one after the user confirms.
// Excalidraw's updateLibrary validates the payload (loadLibraryFromBlob) before
// prompting. Always prompts: excalidraw-mac:// URLs can be opened by any website,
// so a matching token isn't treated as consent. Resolves to true if the install
// went through (or the user declined), false if it was rejected or failed.
export const installLibraryFromUrl = async (excalidrawAPI, { libraryUrl, token }) => {
  if (!isAllowedLibraryUrl(libraryUrl)) {
    console.error("[useLibrary] Rejected library install from disallowed URL:", libraryUrl);
    return false;
  }
  if (token !== excalidrawAPI.id) {
    console.log("[useLibrary] Install token doesn't match this editor session");
  }
  console.log("[useLibrary] Installing library from:", libraryUrl);
  try {
    await excalidrawAPI.updateLibrary({
      // a function runs inside Excalidraw's update queue, so the download starts
      // only after earlier library updates (e.g. the initial load) have settled
      libraryItems: () => fetchLibraryBlob(libraryUrl),
      prompt: true,
      merge: true,
      defaultStatus: "published",
      openLibraryMenu: true,
    });
    return true;
  } catch (err) {
    console.error("[useLibrary] Library install failed:", err);
    excalidrawAPI.updateScene({ appState: { errorMessage: err.message } });
    return false;
  }
};

const useLibrary = ({ excalidrawAPI }) => {
  // loads the saved library on startup and saves it on every change
  useHandleLibrary({
    excalidrawAPI,
    adapter: libraryAdapter,
    // also guards Excalidraw's own `#addLibrary=` hash handling
    validateLibraryUrl: isAllowedLibraryUrl,
  });

  useEffect(() => {
    if (!excalidrawAPI) return;

    const installPendingLibraries = async () => {
      try {
        const requests = await window.electronAPI.takePendingLibraryInstalls();
        for (const request of requests) {
          await installLibraryFromUrl(excalidrawAPI, request);
        }
      } catch (err) {
        console.error("[useLibrary] Failed to process library installs:", err);
      }
    };

    const unsubscribe = window.electronAPI.onLibraryInstallRequested(installPendingLibraries);
    // requests that arrived before the editor mounted (e.g. the app was launched by the URL)
    installPendingLibraries();
    return unsubscribe;
  }, [excalidrawAPI]);
};

export default useLibrary;
