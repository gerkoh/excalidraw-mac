import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import useFileOperations from "./useFileOperations";
import { createSaveController } from "../utils/saveController";

const LISTENERS = [
  "onMenuNew",
  "onMenuOpen",
  "onMenuSave",
  "onMenuSaveAs",
  "onOpenFile",
  "onSaveAsRequest",
  "onBeforeClose",
];

const savedScene = (overrides = {}) =>
  JSON.stringify({
    type: "excalidraw",
    elements: [{ id: "a", version: 1 }],
    appState: { scrollX: 1, scrollY: 2, zoom: { value: 1 } },
    files: {},
    ...overrides,
  });

const createExcalidrawAPI = () => ({
  updateScene: vi.fn(),
  addFiles: vi.fn(),
  resetScene: vi.fn(),
  history: { clear: vi.fn() },
});

// the current file path now lives in the save controller
const currentFilePath = () => saver.getState().filePath;

let handlers;
let unsubscribes;
let excalidrawAPI;
let sceneElementsRef;
let appStateRef;
let getSerializedScene;
let saver;

const createElectronAPI = ({ pendingFile = null, lastPath = null, files = {} } = {}) => {
  handlers = {};
  unsubscribes = {};
  const api = {
    getPendingFile: vi.fn(() => Promise.resolve(pendingFile)),
    getLastPath: vi.fn(() => Promise.resolve(lastPath)),
    readFile: vi.fn((filePath) => Promise.resolve(files[filePath] ?? null)),
    writeFile: vi.fn(() => Promise.resolve(true)),
    openFileDialog: vi.fn(() => Promise.resolve(null)),
    saveFileDialog: vi.fn(() => Promise.resolve(null)),
    acknowledgeClose: vi.fn(),
    sendSaveAsResult: vi.fn(),
  };
  LISTENERS.forEach((name) => {
    unsubscribes[name] = vi.fn();
    api[name] = vi.fn((callback) => {
      handlers[name] = callback;
      return unsubscribes[name];
    });
  });
  window.electronAPI = api;
  return api;
};

const renderFileOps = (props = {}) =>
  renderHook((hookProps) => useFileOperations(hookProps), {
    initialProps: { excalidrawAPI, sceneElementsRef, appStateRef, saver, ...props },
  });

// render and wait for the startup load to resolve
const renderLoaded = async (props) => {
  const rendered = renderFileOps(props);
  await waitFor(() => expect(rendered.result.current.initialData).not.toBeUndefined());
  return rendered;
};

// menu handlers are async; run them inside act so state updates flush
const trigger = async (name, ...args) => {
  await act(async () => {
    await handlers[name](...args);
  });
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  excalidrawAPI = createExcalidrawAPI();
  sceneElementsRef = { current: [{ id: "x", version: 1 }] };
  appStateRef = { current: { scrollX: 0 } };
  getSerializedScene = vi.fn(() => "serialized-scene");
  // the real controller, wired to the mocked electronAPI the way useAutoSave wires it
  saver = createSaveController({
    writeFile: (filePath, content) => window.electronAPI.writeFile(filePath, content),
    saveFileDialog: (content) => window.electronAPI.saveFileDialog(content),
    onStateChange: vi.fn(),
  });
  saver.setSerializer(getSerializedScene);
});

afterEach(() => {
  vi.restoreAllMocks();
  delete window.electronAPI;
});

describe("useFileOperations startup", () => {
  it("starts with initialData undefined so the app can hold off rendering", () => {
    createElectronAPI();
    window.electronAPI.getPendingFile.mockReturnValue(new Promise(() => {}));
    const { result } = renderFileOps();
    expect(result.current.initialData).toBeUndefined();
    expect(currentFilePath()).toBeNull();
  });

  it("prefers the pending OS file over the last opened path", async () => {
    createElectronAPI({
      pendingFile: "/pending.excalidraw",
      lastPath: "/last.excalidraw",
      files: { "/pending.excalidraw": savedScene(), "/last.excalidraw": savedScene() },
    });
    await renderLoaded();

    expect(window.electronAPI.getLastPath).not.toHaveBeenCalled();
    expect(window.electronAPI.readFile).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.readFile).toHaveBeenCalledWith("/pending.excalidraw");
    expect(currentFilePath()).toBe("/pending.excalidraw");
  });

  it("falls back to the last opened path when there is no pending file", async () => {
    createElectronAPI({
      lastPath: "/last.excalidraw",
      files: { "/last.excalidraw": savedScene() },
    });
    await renderLoaded();

    expect(window.electronAPI.readFile).toHaveBeenCalledWith("/last.excalidraw");
    expect(currentFilePath()).toBe("/last.excalidraw");
  });

  it("exposes the parsed file as initialData", async () => {
    createElectronAPI({
      lastPath: "/last.excalidraw",
      files: { "/last.excalidraw": savedScene() },
    });
    const { result } = await renderLoaded();

    expect(result.current.initialData).toEqual({
      elements: [{ id: "a", version: 1 }],
      appState: { scrollX: 1, scrollY: 2, zoom: { value: 1 } },
      files: {},
    });
  });

  it("asks Excalidraw to scroll to content for a file without a viewport", async () => {
    createElectronAPI({
      lastPath: "/last.excalidraw",
      files: { "/last.excalidraw": savedScene({ appState: {} }) },
    });
    const { result } = await renderLoaded();
    expect(result.current.initialData.scrollToContent).toBe(true);
  });

  it("gives null initialData without reading anything when there is no file to open", async () => {
    createElectronAPI();
    const { result } = await renderLoaded();

    expect(result.current.initialData).toBeNull();
    expect(currentFilePath()).toBeNull();
    expect(window.electronAPI.readFile).not.toHaveBeenCalled();
  });

  it("gives null initialData and no current path when the file can't be read", async () => {
    createElectronAPI({ lastPath: "/missing.excalidraw" });
    const { result } = await renderLoaded();

    expect(result.current.initialData).toBeNull();
    expect(currentFilePath()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[useFileOperations] Failed to read file on startup:",
      "/missing.excalidraw",
    );
  });

  it("treats an empty file like an unreadable one", async () => {
    createElectronAPI({ lastPath: "/empty.excalidraw", files: { "/empty.excalidraw": "" } });
    const { result } = await renderLoaded();
    expect(result.current.initialData).toBeNull();
    expect(currentFilePath()).toBeNull();
  });

  it("gives null initialData and no current path when the file is malformed", async () => {
    createElectronAPI({ lastPath: "/bad.excalidraw", files: { "/bad.excalidraw": "{ nope" } });
    const { result } = await renderLoaded();

    expect(result.current.initialData).toBeNull();
    expect(currentFilePath()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[useFileOperations] Failed to parse file on startup:",
      "/bad.excalidraw",
    );
  });

  it("gives null initialData when the IPC call throws", async () => {
    createElectronAPI();
    const error = new Error("ipc down");
    window.electronAPI.getPendingFile.mockRejectedValue(error);
    const { result } = await renderLoaded();

    expect(result.current.initialData).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[useFileOperations] Error loading initial file:",
      error,
    );
  });

  it("only loads once, even across re-renders", async () => {
    createElectronAPI({
      lastPath: "/last.excalidraw",
      files: { "/last.excalidraw": savedScene() },
    });
    const { rerender } = await renderLoaded();
    rerender({ excalidrawAPI, sceneElementsRef, appStateRef, saver });
    expect(window.electronAPI.getPendingFile).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.readFile).toHaveBeenCalledTimes(1);
  });
});

describe("useFileOperations menu wiring", () => {
  it("does not subscribe until the Excalidraw API is ready", async () => {
    createElectronAPI();
    await renderLoaded({ excalidrawAPI: null });
    LISTENERS.forEach((name) => expect(window.electronAPI[name]).not.toHaveBeenCalled());
  });

  it("subscribes to every menu and lifecycle event once the API is ready", async () => {
    createElectronAPI();
    await renderLoaded();
    LISTENERS.forEach((name) => {
      expect(window.electronAPI[name]).toHaveBeenCalledTimes(1);
      expect(window.electronAPI[name]).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  it("subscribes when the API becomes ready after mount", async () => {
    createElectronAPI();
    const { rerender } = await renderLoaded({ excalidrawAPI: null });
    rerender({ excalidrawAPI, sceneElementsRef, appStateRef, saver });
    LISTENERS.forEach((name) => expect(window.electronAPI[name]).toHaveBeenCalledTimes(1));
  });

  it("unsubscribes everything on unmount", async () => {
    createElectronAPI();
    const { unmount } = await renderLoaded();
    LISTENERS.forEach((name) => expect(unsubscribes[name]).not.toHaveBeenCalled());

    unmount();

    LISTENERS.forEach((name) => expect(unsubscribes[name]).toHaveBeenCalledTimes(1));
  });

  it("re-subscribes when the Excalidraw API instance changes", async () => {
    createElectronAPI();
    const { rerender } = await renderLoaded();
    const nextAPI = createExcalidrawAPI();

    rerender({ excalidrawAPI: nextAPI, sceneElementsRef, appStateRef, saver });

    LISTENERS.forEach((name) => {
      expect(unsubscribes[name]).toHaveBeenCalledTimes(1);
      expect(window.electronAPI[name]).toHaveBeenCalledTimes(2);
    });
  });
});

describe("useFileOperations handlers", () => {
  const openAtStartup = () =>
    createElectronAPI({
      lastPath: "/current.excalidraw",
      files: { "/current.excalidraw": savedScene() },
    });

  describe("⌘N new", () => {
    it("saves the current file, then resets the scene and clears the path", async () => {
      openAtStartup();
      await renderLoaded();

      await trigger("onMenuNew");

      expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
        "/current.excalidraw",
        "serialized-scene",
      );
      expect(excalidrawAPI.resetScene).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
        excalidrawAPI.resetScene.mock.invocationCallOrder[0],
      );
      expect(sceneElementsRef.current).toBeNull();
      expect(appStateRef.current).toBeNull();
      expect(currentFilePath()).toBeNull();
    });

    it("skips saving when no file is open", async () => {
      createElectronAPI();
      await renderLoaded();

      await trigger("onMenuNew");

      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(getSerializedScene).not.toHaveBeenCalled();
      expect(excalidrawAPI.resetScene).toHaveBeenCalledTimes(1);
    });

    it("makes a following ⌘S prompt for a location", async () => {
      openAtStartup();
      await renderLoaded();

      await trigger("onMenuNew");
      window.electronAPI.writeFile.mockClear();
      await trigger("onMenuSave");

      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(window.electronAPI.saveFileDialog).toHaveBeenCalledTimes(1);
    });
  });

  describe("⌘O open", () => {
    it("does nothing when the dialog is cancelled", async () => {
      openAtStartup();
      await renderLoaded();

      await trigger("onMenuOpen");

      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(excalidrawAPI.updateScene).not.toHaveBeenCalled();
      expect(currentFilePath()).toBe("/current.excalidraw");
    });

    it("saves the current file, then loads the chosen one and switches to it", async () => {
      openAtStartup();
      await renderLoaded();
      const image = { mimeType: "image/png", dataURL: "data:image/png;base64,AA==" };
      window.electronAPI.openFileDialog.mockResolvedValue({
        path: "/other.excalidraw",
        content: savedScene({ elements: [{ id: "b", version: 4 }], files: { f1: image } }),
      });

      await trigger("onMenuOpen");

      expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
        "/current.excalidraw",
        "serialized-scene",
      );
      expect(excalidrawAPI.updateScene).toHaveBeenCalledWith({
        elements: [{ id: "b", version: 4 }],
        appState: { scrollX: 1, scrollY: 2, zoom: { value: 1 } },
      });
      expect(excalidrawAPI.addFiles).toHaveBeenCalledWith([{ ...image, id: "f1" }]);
      expect(window.electronAPI.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
        excalidrawAPI.updateScene.mock.invocationCallOrder[0],
      );
      expect(currentFilePath()).toBe("/other.excalidraw");
    });

    it("does not save first when no file is open", async () => {
      createElectronAPI();
      window.electronAPI.openFileDialog.mockResolvedValue({
        path: "/other.excalidraw",
        content: savedScene(),
      });
      await renderLoaded();

      await trigger("onMenuOpen");

      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(currentFilePath()).toBe("/other.excalidraw");
    });

    it("keeps the current scene and path when the chosen file is malformed", async () => {
      openAtStartup();
      await renderLoaded();
      window.electronAPI.openFileDialog.mockResolvedValue({
        path: "/bad.excalidraw",
        content: "{ nope",
      });

      await trigger("onMenuOpen");

      expect(excalidrawAPI.updateScene).not.toHaveBeenCalled();
      expect(currentFilePath()).toBe("/current.excalidraw");
    });

    it("makes a following ⌘S write to the newly opened file", async () => {
      openAtStartup();
      await renderLoaded();
      window.electronAPI.openFileDialog.mockResolvedValue({
        path: "/other.excalidraw",
        content: savedScene(),
      });
      await trigger("onMenuOpen");
      window.electronAPI.writeFile.mockClear();

      await trigger("onMenuSave");

      expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
        "/other.excalidraw",
        "serialized-scene",
      );
    });
  });

  describe("⌘S save", () => {
    it("writes the serialized scene to the current file without a dialog", async () => {
      openAtStartup();
      await renderLoaded();

      await trigger("onMenuSave");

      expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
        "/current.excalidraw",
        "serialized-scene",
      );
      expect(window.electronAPI.saveFileDialog).not.toHaveBeenCalled();
    });

    it("falls back to Save As when no file is open", async () => {
      createElectronAPI();
      window.electronAPI.saveFileDialog.mockResolvedValue("/new.excalidraw");
      await renderLoaded();

      await trigger("onMenuSave");

      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(window.electronAPI.saveFileDialog).toHaveBeenCalledWith("serialized-scene");
      expect(currentFilePath()).toBe("/new.excalidraw");
    });

    it("keeps the current path when writeFile reports failure", async () => {
      openAtStartup();
      window.electronAPI.writeFile.mockResolvedValue(false);
      await renderLoaded();

      await trigger("onMenuSave");

      expect(currentFilePath()).toBe("/current.excalidraw");
      expect(console.log).not.toHaveBeenCalledWith(
        "[useFileOperations] Saved to existing file:",
        expect.anything(),
      );
    });
  });

  describe("⇧⌘S save as", () => {
    it("always opens the dialog, even when a file is open", async () => {
      openAtStartup();
      window.electronAPI.saveFileDialog.mockResolvedValue("/copy.excalidraw");
      await renderLoaded();

      await trigger("onMenuSaveAs");

      expect(window.electronAPI.saveFileDialog).toHaveBeenCalledWith("serialized-scene");
      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(currentFilePath()).toBe("/copy.excalidraw");
    });

    it("keeps the current path when the dialog is cancelled", async () => {
      openAtStartup();
      await renderLoaded();

      await trigger("onMenuSaveAs");

      expect(currentFilePath()).toBe("/current.excalidraw");
    });
  });

  describe("OS open-file", () => {
    it("saves the current file, then reads, loads and switches to the requested one", async () => {
      openAtStartup();
      await renderLoaded();
      window.electronAPI.readFile.mockResolvedValue(savedScene({ elements: [{ id: "c" }] }));

      await trigger("onOpenFile", {}, "/from-finder.excalidraw");

      expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
        "/current.excalidraw",
        "serialized-scene",
      );
      expect(window.electronAPI.readFile).toHaveBeenLastCalledWith("/from-finder.excalidraw");
      expect(excalidrawAPI.updateScene).toHaveBeenCalledWith(
        expect.objectContaining({ elements: [{ id: "c" }] }),
      );
      expect(currentFilePath()).toBe("/from-finder.excalidraw");
    });

    it("keeps the current scene and path when the file can't be read", async () => {
      openAtStartup();
      await renderLoaded();
      window.electronAPI.readFile.mockResolvedValue(null);

      await trigger("onOpenFile", {}, "/gone.excalidraw");

      expect(excalidrawAPI.updateScene).not.toHaveBeenCalled();
      expect(currentFilePath()).toBe("/current.excalidraw");
      expect(console.error).toHaveBeenCalledWith(
        "[useFileOperations] Failed to read file from OS:",
        "/gone.excalidraw",
      );
    });

    it("keeps the current scene and path when the file is malformed", async () => {
      openAtStartup();
      await renderLoaded();
      window.electronAPI.readFile.mockResolvedValue("{ nope");

      await trigger("onOpenFile", {}, "/bad.excalidraw");

      expect(excalidrawAPI.updateScene).not.toHaveBeenCalled();
      expect(currentFilePath()).toBe("/current.excalidraw");
    });
  });

  describe("before-close", () => {
    it("saves the current file, then acknowledges the close", async () => {
      openAtStartup();
      await renderLoaded();

      await trigger("onBeforeClose");

      expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
        "/current.excalidraw",
        "serialized-scene",
      );
      expect(window.electronAPI.acknowledgeClose).toHaveBeenCalledTimes(1);
      expect(window.electronAPI.writeFile.mock.invocationCallOrder[0]).toBeLessThan(
        window.electronAPI.acknowledgeClose.mock.invocationCallOrder[0],
      );
    });

    it("acknowledges without writing when no file is open", async () => {
      createElectronAPI();
      await renderLoaded();

      await trigger("onBeforeClose");

      expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
      expect(window.electronAPI.acknowledgeClose).toHaveBeenCalledTimes(1);
    });

    it("waits for the write to finish before acknowledging", async () => {
      openAtStartup();
      await renderLoaded();
      let finishWrite;
      window.electronAPI.writeFile.mockReturnValue(
        new Promise((resolve) => {
          finishWrite = resolve;
        }),
      );

      let closing;
      await act(async () => {
        closing = handlers.onBeforeClose();
      });
      expect(window.electronAPI.acknowledgeClose).not.toHaveBeenCalled();

      await act(async () => {
        finishWrite(true);
        await closing;
      });
      expect(window.electronAPI.acknowledgeClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe("useFileOperations document baseline (no save right after opening)", () => {
  const snapshot = (key, hasContent = true) => ({ key, hasContent });

  it("starts the startup file as a clean document; its first onChange is not an edit", async () => {
    createElectronAPI({
      lastPath: "/last.excalidraw",
      files: { "/last.excalidraw": savedScene() },
    });
    await renderLoaded();
    saver.observe(snapshot("loaded"));
    expect(saver.getState()).toEqual(
      expect.objectContaining({ filePath: "/last.excalidraw", dirty: false }),
    );
  });

  it.each([
    ["no file to open", {}],
    ["an unreadable file", { lastPath: "/missing.excalidraw" }],
  ])("starts an untitled clean document for %s", async (_label, options) => {
    createElectronAPI(options);
    await renderLoaded();
    saver.observe(snapshot("empty", false));
    expect(saver.getState()).toEqual({
      filePath: null,
      hasFilePath: false,
      dirty: false,
      hasContent: false,
    });
  });

  it("⌘O baselines the opened file and clears undo history", async () => {
    createElectronAPI();
    window.electronAPI.openFileDialog.mockResolvedValue({
      path: "/other.excalidraw",
      content: savedScene(),
    });
    await renderLoaded();
    saver.observe(snapshot("untitled-edit"));

    await trigger("onMenuOpen");
    saver.observe(snapshot("other-loaded"));

    expect(saver.getState().dirty).toBe(false);
    expect(excalidrawAPI.history.clear).toHaveBeenCalledTimes(1);
  });

  it("OS open-file baselines the opened file", async () => {
    createElectronAPI();
    await renderLoaded();
    window.electronAPI.readFile.mockResolvedValue(savedScene());
    saver.observe(snapshot("untitled-edit"));

    await trigger("onOpenFile", {}, "/from-finder.excalidraw");
    saver.observe(snapshot("finder-loaded"));

    expect(saver.getState()).toEqual(
      expect.objectContaining({ filePath: "/from-finder.excalidraw", dirty: false }),
    );
  });

  it("a malformed ⌘O file leaves the current document and its dirty state alone", async () => {
    createElectronAPI({
      lastPath: "/current.excalidraw",
      files: { "/current.excalidraw": savedScene() },
    });
    await renderLoaded();
    saver.observe(snapshot("loaded"));
    window.electronAPI.writeFile.mockResolvedValue(false); // keep it dirty through the pre-save
    saver.observe(snapshot("edit"));
    window.electronAPI.openFileDialog.mockResolvedValue({ path: "/bad.excalidraw", content: "{" });

    await trigger("onMenuOpen");

    expect(saver.getState()).toEqual(
      expect.objectContaining({ filePath: "/current.excalidraw", dirty: true }),
    );
  });

  it("⌘N starts the untitled document and clears the refs before resetting the scene", async () => {
    createElectronAPI({
      lastPath: "/current.excalidraw",
      files: { "/current.excalidraw": savedScene() },
    });
    await renderLoaded();
    let atReset;
    excalidrawAPI.resetScene.mockImplementation(() => {
      atReset = {
        state: saver.getState(),
        elements: sceneElementsRef.current,
        appState: appStateRef.current,
      };
    });

    await trigger("onMenuNew");

    expect(atReset).toEqual({
      state: expect.objectContaining({ filePath: null, dirty: false }),
      elements: null,
      appState: null,
    });
  });

  it("⌘N after untitled edits gives a clean drawing (main already asked about saving)", async () => {
    createElectronAPI();
    await renderLoaded();
    saver.observe(snapshot("empty", false));
    saver.observe(snapshot("edit"));

    await trigger("onMenuNew");
    saver.observe(snapshot("empty", false));

    expect(saver.getState().dirty).toBe(false);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });
});

describe("useFileOperations save-as-request (from the unsaved-changes prompt)", () => {
  it("runs Save As and reports success to main", async () => {
    createElectronAPI();
    window.electronAPI.saveFileDialog.mockResolvedValue("/saved.excalidraw");
    await renderLoaded();

    await trigger("onSaveAsRequest");

    expect(window.electronAPI.saveFileDialog).toHaveBeenCalledWith("serialized-scene");
    expect(window.electronAPI.sendSaveAsResult).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.sendSaveAsResult).toHaveBeenCalledWith(true);
    expect(currentFilePath()).toBe("/saved.excalidraw");
  });

  it("reports false when the user cancels the dialog", async () => {
    createElectronAPI();
    await renderLoaded();
    await trigger("onSaveAsRequest");
    expect(window.electronAPI.sendSaveAsResult).toHaveBeenCalledWith(false);
    expect(currentFilePath()).toBeNull();
  });

  it("reports false when the dialog fails", async () => {
    createElectronAPI();
    window.electronAPI.saveFileDialog.mockRejectedValue(new Error("ipc down"));
    await renderLoaded();
    await trigger("onSaveAsRequest");
    expect(window.electronAPI.sendSaveAsResult).toHaveBeenCalledWith(false);
  });

  it("reports false when the scene can't be serialized", async () => {
    createElectronAPI();
    getSerializedScene.mockImplementation(() => {
      throw new Error("bad scene");
    });
    await renderLoaded();
    await trigger("onSaveAsRequest");
    expect(window.electronAPI.saveFileDialog).not.toHaveBeenCalled();
    expect(window.electronAPI.sendSaveAsResult).toHaveBeenCalledWith(false);
  });
});

describe("useFileOperations before-close robustness", () => {
  it("still acknowledges when the write throws", async () => {
    createElectronAPI({
      lastPath: "/current.excalidraw",
      files: { "/current.excalidraw": savedScene() },
    });
    window.electronAPI.writeFile.mockRejectedValue(new Error("ipc down"));
    await renderLoaded();

    await trigger("onBeforeClose");

    expect(window.electronAPI.acknowledgeClose).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-flight auto-save and then writes the latest scene before acknowledging", async () => {
    createElectronAPI({
      lastPath: "/current.excalidraw",
      files: { "/current.excalidraw": savedScene() },
    });
    await renderLoaded();
    let finishAutoSave;
    window.electronAPI.writeFile.mockReturnValueOnce(
      new Promise((resolve) => {
        finishAutoSave = resolve;
      }),
    );
    const autoSave = saver.save();
    getSerializedScene.mockReturnValue("latest-scene");

    let closing;
    await act(async () => {
      closing = handlers.onBeforeClose();
    });
    expect(window.electronAPI.acknowledgeClose).not.toHaveBeenCalled();

    await act(async () => {
      finishAutoSave(true);
      await autoSave;
      await closing;
    });

    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(2);
    expect(window.electronAPI.writeFile).toHaveBeenLastCalledWith(
      "/current.excalidraw",
      "latest-scene",
    );
    expect(window.electronAPI.acknowledgeClose).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.writeFile.mock.invocationCallOrder[1]).toBeLessThan(
      window.electronAPI.acknowledgeClose.mock.invocationCallOrder[0],
    );
  });
});
