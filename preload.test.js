import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";

// preload.js is CommonJS loaded by Node's own require, which vi.mock can't intercept,
// so a fake electron module is placed in the require cache instead
const require = createRequire(import.meta.url);
const electronPath = require.resolve("electron");
const preloadPath = require.resolve("./preload.js");

let ipcRenderer;
let api;

const loadPreload = () => {
  ipcRenderer = {
    invoke: vi.fn(() => Promise.resolve("invoke-result")),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const contextBridge = {
    exposeInMainWorld: vi.fn((key, value) => {
      if (key === "electronAPI") api = value;
    }),
  };
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: { contextBridge, ipcRenderer },
  };
  delete require.cache[preloadPath];
  require(preloadPath);
  return contextBridge;
};

beforeEach(() => {
  api = undefined;
});

afterEach(() => {
  delete require.cache[electronPath];
  delete require.cache[preloadPath];
});

describe("preload", () => {
  it("exposes exactly one electronAPI object to the main world", () => {
    const contextBridge = loadPreload();
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledTimes(1);
    expect(contextBridge.exposeInMainWorld).toHaveBeenCalledWith("electronAPI", expect.any(Object));
  });

  it("keeps the exact electronAPI surface the renderer relies on", () => {
    loadPreload();
    expect(Object.keys(api).sort()).toEqual(
      [
        "getConfig",
        "readFile",
        "writeFile",
        "getLastPath",
        "getPendingFile",
        "openFileDialog",
        "saveFileDialog",
        "onMenuNew",
        "onMenuOpen",
        "onMenuSave",
        "onMenuSaveAs",
        "onOpenFile",
        "getTheme",
        "setThemePreference",
        "onThemeChanged",
        "onBeforeClose",
        "acknowledgeClose",
        "setDocumentState",
        "onSaveAsRequest",
        "sendSaveAsResult",
        "getLibrary",
        "saveLibrary",
        "takePendingLibraryInstalls",
        "onLibraryInstallRequested",
      ].sort(),
    );
    Object.values(api).forEach((value) => expect(value).toBeTypeOf("function"));
  });

  it("does not touch ipcRenderer while loading", () => {
    loadPreload();
    expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    expect(ipcRenderer.send).not.toHaveBeenCalled();
    expect(ipcRenderer.on).not.toHaveBeenCalled();
  });

  describe("invoke methods", () => {
    it.each([
      ["getConfig", [], ["get-config"]],
      ["readFile", ["/a.excalidraw"], ["read-file", "/a.excalidraw"]],
      ["writeFile", ["/a.excalidraw", "{}"], ["write-file", "/a.excalidraw", "{}"]],
      ["getLastPath", [], ["get-last-path"]],
      ["getPendingFile", [], ["get-pending-file"]],
      ["openFileDialog", [], ["open-file-dialog"]],
      ["saveFileDialog", ["{}"], ["save-file-dialog", "{}"]],
      ["getTheme", [], ["get-theme"]],
      ["getLibrary", [], ["get-library"]],
      ["saveLibrary", [[{ id: "a", elements: [] }]], ["save-library", [{ id: "a", elements: [] }]]],
      ["takePendingLibraryInstalls", [], ["take-pending-library-installs"]],
    ])("%s invokes the right channel with its args", async (method, args, expected) => {
      loadPreload();
      await expect(api[method](...args)).resolves.toBe("invoke-result");
      expect(ipcRenderer.invoke).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.invoke).toHaveBeenCalledWith(...expected);
    });

    it("does not forward extra args to channels that take none", () => {
      loadPreload();
      api.getConfig("unexpected");
      api.getLastPath("unexpected");
      api.getTheme("unexpected");
      expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, "get-config");
      expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, "get-last-path");
      expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, "get-theme");
    });

    it("never lets the renderer send a library path", () => {
      loadPreload();
      api.getLibrary("/etc/passwd");
      api.saveLibrary([], "/Users/me/evil.excalidraw");
      api.takePendingLibraryInstalls("unexpected");
      expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(1, "get-library");
      expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(2, "save-library", []);
      expect(ipcRenderer.invoke).toHaveBeenNthCalledWith(3, "take-pending-library-installs");
    });

    it("uses the same library channel names as the main process", () => {
      const { LIBRARY_CHANNELS } = require("./electron/libraryIpc");
      loadPreload();
      api.getLibrary();
      api.saveLibrary([]);
      api.takePendingLibraryInstalls();
      api.onLibraryInstallRequested(vi.fn());
      expect(ipcRenderer.invoke.mock.calls.map(([channel]) => channel)).toEqual([
        LIBRARY_CHANNELS.get,
        LIBRARY_CHANNELS.save,
        LIBRARY_CHANNELS.takePendingInstalls,
      ]);
      expect(ipcRenderer.on).toHaveBeenCalledWith(
        LIBRARY_CHANNELS.installRequested,
        expect.any(Function),
      );
    });

    it("acknowledgeClose sends (not invokes) close-acknowledged", () => {
      loadPreload();
      expect(api.acknowledgeClose()).toBeUndefined();
      expect(ipcRenderer.send).toHaveBeenCalledWith("close-acknowledged");
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });

    it("setDocumentState sends (not invokes) the state on set-document-state", () => {
      loadPreload();
      const state = { dirty: true, hasFilePath: false, hasContent: true };
      expect(api.setDocumentState(state)).toBeUndefined();
      expect(ipcRenderer.send).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.send).toHaveBeenCalledWith("set-document-state", state);
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });

    it.each([[true], [false]])("sendSaveAsResult sends %s on save-as-result", (saved) => {
      loadPreload();
      expect(api.sendSaveAsResult(saved)).toBeUndefined();
      expect(ipcRenderer.send).toHaveBeenCalledWith("save-as-result", saved);
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });
  });

  describe("send methods", () => {
    it.each([
      ["setThemePreference", ["dark"], ["set-theme-preference", "dark"]],
      ["setThemePreference", ["system"], ["set-theme-preference", "system"]],
    ])("%s(%j) sends (not invokes) the right channel", (method, args, expected) => {
      loadPreload();
      expect(api[method](...args)).toBeUndefined();
      expect(ipcRenderer.send).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.send).toHaveBeenCalledWith(...expected);
      expect(ipcRenderer.invoke).not.toHaveBeenCalled();
    });
  });

  describe("event listeners", () => {
    const listeners = [
      ["onMenuNew", "menu-new"],
      ["onMenuOpen", "menu-open"],
      ["onMenuSave", "menu-save"],
      ["onMenuSaveAs", "menu-save-as"],
      ["onOpenFile", "open-file"],
      ["onThemeChanged", "theme-changed"],
      ["onBeforeClose", "before-close"],
      ["onSaveAsRequest", "save-as-request"],
      ["onLibraryInstallRequested", "library-install-requested"],
    ];

    it.each(listeners)("%s registers the callback on %s", (method, channel) => {
      loadPreload();
      const callback = vi.fn();
      api[method](callback);
      expect(ipcRenderer.on).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.on).toHaveBeenCalledWith(channel, callback);
      expect(ipcRenderer.removeListener).not.toHaveBeenCalled();
    });

    it.each(listeners)("%s returns an unsubscribe that removes it from %s", (method, channel) => {
      loadPreload();
      const callback = vi.fn();
      const unsubscribe = api[method](callback);
      expect(unsubscribe).toBeTypeOf("function");

      unsubscribe();

      expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.removeListener).toHaveBeenCalledWith(channel, callback);
    });

    it("unsubscribing one callback leaves other callbacks on the same channel alone", () => {
      loadPreload();
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribeFirst = api.onMenuSave(first);
      api.onMenuSave(second);

      unsubscribeFirst();

      expect(ipcRenderer.removeListener).toHaveBeenCalledTimes(1);
      expect(ipcRenderer.removeListener).toHaveBeenCalledWith("menu-save", first);
    });

    it("passes the callback through unwrapped so ipc event args reach it", () => {
      loadPreload();
      const callback = vi.fn();
      api.onOpenFile(callback);
      const registered = ipcRenderer.on.mock.calls[0][1];
      registered({ sender: {} }, "/a.excalidraw");
      expect(callback).toHaveBeenCalledWith({ sender: {} }, "/a.excalidraw");
    });
  });
});
