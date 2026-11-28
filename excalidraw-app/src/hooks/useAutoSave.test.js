import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import useAutoSave, { isElementsChanged } from "./useAutoSave";

const el = (id, version = 1) => ({ id, version });

describe("isElementsChanged", () => {
  it.each([
    ["prev is undefined", undefined, []],
    ["prev is null", null, []],
    ["next is null", [], null],
    ["next is undefined", [], undefined],
    ["both are null", null, null],
    ["prev is an object", {}, []],
    ["next is a string", [], "[]"],
  ])("treats non-arrays as changed (%s)", (_label, prev, next) => {
    expect(isElementsChanged(prev, next)).toBe(true);
  });

  it("is unchanged for two empty arrays", () => {
    expect(isElementsChanged([], [])).toBe(false);
  });

  it("is unchanged for the same array instance", () => {
    const elements = [el("a"), el("b")];
    expect(isElementsChanged(elements, elements)).toBe(false);
  });

  it("is unchanged for different arrays with the same ids and versions", () => {
    expect(isElementsChanged([el("a", 2), el("b", 5)], [el("a", 2), el("b", 5)])).toBe(false);
  });

  it("ignores properties other than id and version", () => {
    const prev = [{ id: "a", version: 1, x: 0 }];
    const next = [{ id: "a", version: 1, x: 999 }];
    expect(isElementsChanged(prev, next)).toBe(false);
  });

  it.each([
    ["an element is added", [el("a")], [el("a"), el("b")]],
    ["an element is removed", [el("a"), el("b")], [el("a")]],
    ["going from empty to one element", [], [el("a")]],
  ])("is changed when %s", (_label, prev, next) => {
    expect(isElementsChanged(prev, next)).toBe(true);
  });

  it("is changed when an id differs at the same index", () => {
    expect(isElementsChanged([el("a"), el("b")], [el("a"), el("c")])).toBe(true);
  });

  it("is changed when elements are reordered", () => {
    expect(isElementsChanged([el("a"), el("b")], [el("b"), el("a")])).toBe(true);
  });

  it("is changed when a version differs", () => {
    expect(isElementsChanged([el("a", 1)], [el("a", 2)])).toBe(true);
  });

  it("is changed when only the last element's version differs", () => {
    expect(isElementsChanged([el("a"), el("b"), el("c", 1)], [el("a"), el("b"), el("c", 2)])).toBe(
      true,
    );
  });
});

describe("useAutoSave", () => {
  const CHECK_MS = 500;
  const DEBOUNCE_MS = 2000;
  const config = { autoSaveDebounceMs: DEBOUNCE_MS, autoSaveCheckIntervalMs: CHECK_MS };
  const excalidrawAPI = {};

  let sceneElementsRef;
  let getSerializedScene;

  const renderAutoSave = (overrides = {}) =>
    renderHook((props) => useAutoSave(props), {
      initialProps: {
        sceneElementsRef,
        currentFilePath: "/drawings/a.excalidraw",
        config,
        excalidrawAPI,
        getSerializedScene,
        ...overrides,
      },
    });

  // the first interval tick sees prev as undefined and counts it as a change,
  // so tests that care about edits let that initial save settle first
  const settleInitialSave = async () => {
    await vi.advanceTimersByTimeAsync(CHECK_MS + DEBOUNCE_MS);
    window.electronAPI.writeFile.mockClear();
    getSerializedScene.mockClear();
  };

  // check ticks land on multiples of CHECK_MS, so an edit is detected up to CHECK_MS later
  const editElements = (elements) => {
    sceneElementsRef.current = elements;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    sceneElementsRef = { current: [el("a")] };
    getSerializedScene = vi.fn(() => "serialized-scene");
    window.electronAPI = { writeFile: vi.fn(() => Promise.resolve(true)) };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.electronAPI;
  });

  it.each([
    ["config is missing", { config: null }, "[useAutoSave] Config missing, auto-save disabled"],
    [
      "no file is open",
      { currentFilePath: null },
      "[useAutoSave] No file open, auto-save disabled",
    ],
    [
      "the Excalidraw API is not ready",
      { excalidrawAPI: null },
      "[useAutoSave] Excalidraw API not ready, auto-save disabled",
    ],
  ])("never saves when %s", async (_label, overrides, message) => {
    renderAutoSave(overrides);
    expect(vi.getTimerCount()).toBe(0);

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
    expect(getSerializedScene).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(message);
  });

  it("saves the current scene once after mount, then stays idle while nothing changes", async () => {
    // current behaviour: the first check has no baseline, so it writes even without edits
    renderAutoSave();
    await vi.advanceTimersByTimeAsync(CHECK_MS + DEBOUNCE_MS);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("saves once, after the debounce, when elements change", async () => {
    renderAutoSave();
    await settleInitialSave();

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS); // change detected, debounce starts
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
      "/drawings/a.excalidraw",
      "serialized-scene",
    );

    await vi.advanceTimersByTimeAsync(60_000);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("serializes the scene when the debounce fires, not when the change is detected", async () => {
    renderAutoSave();
    await settleInitialSave();

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS);
    expect(getSerializedScene).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(getSerializedScene).toHaveBeenCalledTimes(1);
  });

  it("resets the debounce when elements change again before it fires", async () => {
    renderAutoSave();
    await settleInitialSave();

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS); // first change detected, debounce starts
    await vi.advanceTimersByTimeAsync(CHECK_MS);

    editElements([el("a", 3)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS); // second change detected, debounce restarts

    // the first debounce would have fired by now
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 2 * CHECK_MS);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2 * CHECK_MS - 1);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("keeps postponing while edits continue, then saves once", async () => {
    renderAutoSave();
    await settleInitialSave();

    for (let version = 2; version <= 10; version++) {
      editElements([el("a", version)]);
      await vi.advanceTimersByTimeAsync(CHECK_MS);
    }
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("does not save when elements are replaced with equal ids and versions", async () => {
    renderAutoSave();
    await settleInitialSave();

    editElements([{ ...el("a"), x: 123 }]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });

  it("uses the check interval and debounce from config", async () => {
    renderAutoSave({ config: { autoSaveDebounceMs: 300, autoSaveCheckIntervalMs: 100 } });

    await vi.advanceTimersByTimeAsync(399);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });

  it("logs when writeFile reports failure", async () => {
    window.electronAPI.writeFile.mockResolvedValue(false);
    renderAutoSave();
    await vi.advanceTimersByTimeAsync(CHECK_MS + DEBOUNCE_MS);
    expect(console.error).toHaveBeenCalledWith("[useAutoSave] ❌ Auto-save returned failure");
  });

  it("logs when writeFile throws and still saves the next change", async () => {
    const error = new Error("disk full");
    window.electronAPI.writeFile.mockRejectedValueOnce(error);
    renderAutoSave();
    await vi.advanceTimersByTimeAsync(CHECK_MS + DEBOUNCE_MS);
    expect(console.error).toHaveBeenCalledWith("[useAutoSave] ❌ Auto-save failed:", error);

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS + DEBOUNCE_MS);
    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(2);
  });

  it("clears its timers on unmount, including a pending debounce", async () => {
    const { unmount } = renderAutoSave();
    await vi.advanceTimersByTimeAsync(CHECK_MS); // debounce pending
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });

  it("does not write a pending change to the old path after the path changes", async () => {
    const { rerender } = renderAutoSave();
    await settleInitialSave();

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS); // debounce pending for a.excalidraw

    rerender({
      sceneElementsRef,
      currentFilePath: "/drawings/b.excalidraw",
      config,
      excalidrawAPI,
      getSerializedScene,
    });
    expect(vi.getTimerCount()).toBe(1); // only the new interval

    await vi.advanceTimersByTimeAsync(60_000);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalledWith(
      "/drawings/a.excalidraw",
      expect.anything(),
    );
  });

  it("saves later changes to the new path after the path changes", async () => {
    const { rerender } = renderAutoSave();
    await settleInitialSave();

    rerender({
      sceneElementsRef,
      currentFilePath: "/drawings/b.excalidraw",
      config,
      excalidrawAPI,
      getSerializedScene,
    });
    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(CHECK_MS + DEBOUNCE_MS);

    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.writeFile).toHaveBeenCalledWith(
      "/drawings/b.excalidraw",
      expect.any(String),
    );
  });

  it("stops saving when the file is closed (path becomes null)", async () => {
    const { rerender } = renderAutoSave();
    await settleInitialSave();

    rerender({
      sceneElementsRef,
      currentFilePath: null,
      config,
      excalidrawAPI,
      getSerializedScene,
    });
    expect(vi.getTimerCount()).toBe(0);

    editElements([el("a", 2)]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(window.electronAPI.writeFile).not.toHaveBeenCalled();
  });

  it("does not restart timers when unrelated props change", async () => {
    const { rerender } = renderAutoSave();
    await vi.advanceTimersByTimeAsync(CHECK_MS); // debounce pending

    rerender({
      sceneElementsRef,
      currentFilePath: "/drawings/a.excalidraw",
      config,
      excalidrawAPI,
      getSerializedScene: vi.fn(() => "other"),
    });
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(window.electronAPI.writeFile).toHaveBeenCalledTimes(1);
  });
});
