import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useAutoSave from "./useAutoSave";

const PATH = "/drawings/a.excalidraw";
const DEBOUNCE_MS = 500;

let getSerializedScene;

const createElectronAPI = () => {
  window.electronAPI = {
    writeFile: vi.fn(() => Promise.resolve(true)),
    saveFileDialog: vi.fn(() => Promise.resolve(null)),
    setDocumentState: vi.fn(),
  };
};

const renderAutoSave = (props = {}) =>
  renderHook((hookProps) => useAutoSave(hookProps), {
    initialProps: { config: { autoSaveDebounceMs: DEBOUNCE_MS }, getSerializedScene, ...props },
  });

// open a file and make one edit, the way useFileOperations + onChange drive the saver
const openAndEdit = (saver, filePath = PATH) => {
  saver.startDocument(filePath);
  saver.observe({ key: "loaded", hasContent: true });
  saver.observe({ key: "edited", hasContent: true });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  createElectronAPI();
  getSerializedScene = vi.fn(() => "scene");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.electronAPI;
});

describe("useAutoSave", () => {
  it("returns the same saver across re-renders", () => {
    const { result, rerender } = renderAutoSave();
    const first = result.current;
    rerender({ config: { autoSaveDebounceMs: 1 }, getSerializedScene: vi.fn() });
    expect(result.current).toBe(first);
  });

  it("does not report or write anything just by mounting", async () => {
    renderAutoSave();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(window.electronAPI.setDocumentState).not.toHaveBeenCalled();
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });

  it("auto-saves through electronAPI.writeFile after the configured debounce", async () => {
    const { result } = renderAutoSave();
    openAndEdit(result.current);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(PATH, "scene");
  });

  it("keeps auto-saving with the 2000ms default when config failed to load", async () => {
    const { result } = renderAutoSave({ config: null });
    openAndEdit(result.current);
    await vi.advanceTimersByTimeAsync(1999);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("tolerates an old config that still has autoSaveCheckIntervalMs", async () => {
    const { result } = renderAutoSave({
      config: { autoSaveDebounceMs: DEBOUNCE_MS, autoSaveCheckIntervalMs: 500 },
    });
    openAndEdit(result.current);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("applies a config that arrives after mount", async () => {
    const { result, rerender } = renderAutoSave({ config: null });
    rerender({ config: { autoSaveDebounceMs: 100 }, getSerializedScene });
    openAndEdit(result.current);
    await vi.advanceTimersByTimeAsync(100);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("uses the latest serializer (e.g. once the Excalidraw API is ready)", async () => {
    const { result, rerender } = renderAutoSave();
    const next = vi.fn(() => "next-scene");
    rerender({ config: { autoSaveDebounceMs: DEBOUNCE_MS }, getSerializedScene: next });
    openAndEdit(result.current);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(next).toHaveBeenCalledTimes(1);
    expect(getSerializedScene).not.toHaveBeenCalled();
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(PATH, "next-scene");
  });

  it("routes Save As through electronAPI.saveFileDialog", async () => {
    window.electronAPI.saveFileDialog.mockResolvedValue("/new.excalidraw");
    const { result } = renderAutoSave();
    await expect(result.current.saveAs()).resolves.toBe("/new.excalidraw");
    expect(window.electronAPI.saveFileDialog).toHaveBeenCalledWith("scene");
  });

  it("reports dirty / hasFilePath / hasContent to main (and nothing else)", async () => {
    const { result } = renderAutoSave();
    openAndEdit(result.current);
    expect(window.electronAPI.setDocumentState).toHaveBeenLastCalledWith({
      dirty: true,
      hasFilePath: true,
      hasContent: true,
    });

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(window.electronAPI.setDocumentState).toHaveBeenLastCalledWith({
      dirty: false,
      hasFilePath: true,
      hasContent: true,
    });
  });

  it("reports untitled edits as dirty without a file path", () => {
    const { result } = renderAutoSave();
    openAndEdit(result.current, null);
    expect(window.electronAPI.setDocumentState).toHaveBeenLastCalledWith({
      dirty: true,
      hasFilePath: false,
      hasContent: true,
    });
  });

  it("cancels a pending auto-save on unmount", async () => {
    const { result, unmount } = renderAutoSave();
    openAndEdit(result.current);
    unmount();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });
});
