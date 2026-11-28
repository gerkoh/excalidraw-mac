import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSaveController,
  resolveDebounceMs,
  DEFAULT_AUTOSAVE_DEBOUNCE_MS,
} from "./saveController";

const DEBOUNCE_MS = 1000;
const PATH = "/drawings/a.excalidraw";
const OTHER_PATH = "/drawings/b.excalidraw";

// a write whose completion the test controls
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const snapshot = (key, hasContent = true) => ({ key, hasContent });

let writeFile;
let saveFileDialog;
let onStateChange;
let scene; // what serialize() returns right now
let serialize;
let saver;

const setup = () => {
  writeFile = vi.fn(() => Promise.resolve(true));
  saveFileDialog = vi.fn(() => Promise.resolve(null));
  onStateChange = vi.fn();
  scene = "scene-0";
  serialize = vi.fn(() => scene);
  saver = createSaveController({ writeFile, saveFileDialog, onStateChange });
  saver.setSerializer(serialize);
  saver.setDebounceMs(DEBOUNCE_MS);
};

// a document that has been opened and baselined by its first onChange
const openDocument = (filePath = PATH, key = "loaded") => {
  saver.startDocument(filePath);
  saver.observe(snapshot(key));
};

// lets pending promise callbacks (write completions, follow-up saves) run
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "error").mockImplementation(() => {});
  setup();
});

afterEach(() => {
  saver.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("resolveDebounceMs", () => {
  it.each([
    [{ autoSaveDebounceMs: 500 }, 500],
    [{ autoSaveDebounceMs: 0 }, 0],
    [{ autoSaveDebounceMs: 2000, autoSaveCheckIntervalMs: 500 }, 2000],
  ])("uses a valid config value (%j)", (config, expected) => {
    expect(resolveDebounceMs(config)).toBe(expected);
  });

  it.each([
    ["null config", null],
    ["undefined config", undefined],
    ["missing key", {}],
    ["negative", { autoSaveDebounceMs: -1 }],
    ["NaN", { autoSaveDebounceMs: NaN }],
    ["Infinity", { autoSaveDebounceMs: Infinity }],
    ["a string", { autoSaveDebounceMs: "2000" }],
    ["null value", { autoSaveDebounceMs: null }],
  ])("falls back to the default for %s", (_label, config) => {
    expect(resolveDebounceMs(config)).toBe(DEFAULT_AUTOSAVE_DEBOUNCE_MS);
  });

  it("defaults to 2000ms", () => {
    expect(DEFAULT_AUTOSAVE_DEBOUNCE_MS).toBe(2000);
  });
});

describe("initial state", () => {
  it("is an untitled, clean, empty drawing", () => {
    expect(saver.getState()).toEqual({
      filePath: null,
      hasFilePath: false,
      dirty: false,
      hasContent: false,
    });
  });

  it("does not report anything until something happens", () => {
    expect(onStateChange).not.toHaveBeenCalled();
  });
});

describe("no save after open / new without edits", () => {
  it("does not save after opening a file and receiving its first onChange", async () => {
    openDocument();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).not.toHaveBeenCalled();
    expect(saver.getState().dirty).toBe(false);
  });

  it("does not save on repeated onChange with the same snapshot (pointer moves, scrolling)", async () => {
    openDocument();
    for (let i = 0; i < 20; i++) saver.observe(snapshot("loaded"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("does not mark a new drawing dirty after reset", () => {
    openDocument();
    saver.observe(snapshot("edited"));
    saver.startDocument(null);
    saver.observe(snapshot("empty", false));
    expect(saver.getState()).toEqual({
      filePath: null,
      hasFilePath: false,
      dirty: false,
      hasContent: false,
    });
  });

  it("baselines on whatever the first onChange after opening shows, even if it differs from before", async () => {
    openDocument(PATH, "first-file");
    saver.startDocument(OTHER_PATH);
    saver.observe(snapshot("second-file"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).not.toHaveBeenCalled();
    expect(saver.getState().dirty).toBe(false);
  });

  it("the first real edit after opening does save", async () => {
    openDocument();
    saver.observe(snapshot("edited"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(PATH, "scene-0");
  });

  it("startDocument cancels a pending auto-save of the previous drawing", async () => {
    openDocument();
    saver.observe(snapshot("edited"));
    saver.startDocument(OTHER_PATH);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("startDocument clears dirty and reports the new path", () => {
    openDocument();
    saver.observe(snapshot("edited"));
    onStateChange.mockClear();

    saver.startDocument(OTHER_PATH);

    expect(onStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: OTHER_PATH, hasFilePath: true, dirty: false }),
    );
  });

  it("treats undefined as untitled", () => {
    saver.startDocument(undefined);
    expect(saver.getState().filePath).toBeNull();
  });
});

describe("debounced auto-save", () => {
  beforeEach(() => openDocument());

  it("saves once the debounce has passed without further edits", async () => {
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 1);
    expect(writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("resets the debounce on every edit", async () => {
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100);
    saver.observe(snapshot("edit-2"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100);
    expect(writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("does not reset the debounce for onChange calls without an edit", async () => {
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS - 100);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(100);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("saves once for a burst of edits", async () => {
    for (let i = 0; i < 50; i++) {
      saver.observe(snapshot(`edit-${i}`));
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("serializes when the save runs, not when the edit happened", async () => {
    saver.observe(snapshot("edit-1"));
    scene = "scene-later";
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(PATH, "scene-later");
  });

  it("uses the configured debounce", async () => {
    saver.setDebounceMs(5000);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(4999);
    expect(writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("uses the 2000ms default before a debounce is configured", async () => {
    const fresh = createSaveController({ writeFile, saveFileDialog, onStateChange });
    fresh.setSerializer(serialize);
    fresh.startDocument(PATH);
    fresh.observe(snapshot("loaded"));
    fresh.observe(snapshot("edit"));
    await vi.advanceTimersByTimeAsync(1999);
    expect(writeFile).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeFile).toHaveBeenCalledTimes(1);
    fresh.dispose();
  });

  it("saves again for edits after a completed save", async () => {
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    saver.observe(snapshot("edit-2"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it("dispose cancels a pending debounce", async () => {
    saver.observe(snapshot("edit-1"));
    saver.dispose();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("untitled drawings", () => {
  beforeEach(() => openDocument(null, "empty"));

  it("are marked dirty by edits but never auto-saved", async () => {
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(saver.getState().dirty).toBe(true);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("save() resolves false without writing or serializing", async () => {
    await expect(saver.save()).resolves.toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
    expect(serialize).not.toHaveBeenCalled();
  });
});

describe("coalescing: a save is never dropped", () => {
  beforeEach(() => openDocument());

  it("an edit during an in-flight save gets exactly one follow-up save with the latest scene", async () => {
    const first = deferred();
    writeFile.mockReturnValueOnce(first.promise);

    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledTimes(1);

    scene = "scene-2";
    saver.observe(snapshot("edit-2"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledTimes(1); // still waiting for the first

    first.resolve(true);
    await flush();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenLastCalledWith(PATH, "scene-2");
  });

  it("many save requests during a flight still produce exactly one follow-up", async () => {
    const first = deferred();
    writeFile.mockReturnValueOnce(first.promise);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    for (let i = 2; i < 10; i++) {
      saver.observe(snapshot(`edit-${i}`));
      await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
      saver.save();
    }
    scene = "scene-final";
    first.resolve(true);
    await flush();

    expect(writeFile).toHaveBeenCalledTimes(2);
    expect(writeFile).toHaveBeenLastCalledWith(PATH, "scene-final");
  });

  it("does not run a follow-up when nothing was requested during the flight", async () => {
    const first = deferred();
    writeFile.mockReturnValueOnce(first.promise);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    first.resolve(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);

    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("never has two writes in flight at once", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    writeFile.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 300));
      inFlight -= 1;
      return true;
    });

    for (let i = 0; i < 10; i++) {
      saver.observe(snapshot(`edit-${i}`));
      saver.save();
      await vi.advanceTimersByTimeAsync(100);
    }
    await vi.advanceTimersByTimeAsync(10_000);

    expect(maxInFlight).toBe(1);
  });

  it("a save requested during a flight resolves only after its follow-up is written", async () => {
    const first = deferred();
    const second = deferred();
    writeFile.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    saver.save();
    scene = "scene-close";
    let closingDone = false;
    const closing = saver.save().then((saved) => {
      closingDone = true;
      return saved;
    });

    first.resolve(true);
    await flush();
    expect(writeFile).toHaveBeenLastCalledWith(PATH, "scene-close");
    expect(closingDone).toBe(false);

    second.resolve(true);
    await expect(closing).resolves.toBe(true);
  });

  it("an explicit save() cancels the pending debounce instead of saving twice", async () => {
    saver.observe(snapshot("edit-1"));
    await saver.save();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).toHaveBeenCalledTimes(1);
  });

  it("a failed write is followed by a save on the next edit", async () => {
    writeFile.mockResolvedValueOnce(false);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    saver.observe(snapshot("edit-2"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledTimes(2);
  });

  it("a thrown write doesn't wedge the pipeline", async () => {
    writeFile.mockRejectedValueOnce(new Error("ipc down"));
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(console.error).toHaveBeenCalledWith(
      "[saveController] ❌ Save failed:",
      PATH,
      expect.any(Error),
    );
    await expect(saver.save()).resolves.toBe(true);
  });

  it("a follow-up queued for the old drawing is dropped when a new drawing starts", async () => {
    const first = deferred();
    writeFile.mockReturnValueOnce(first.promise);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    saver.observe(snapshot("edit-2"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS); // queues a follow-up

    saver.startDocument(OTHER_PATH);
    saver.observe(snapshot("other-loaded"));
    first.resolve(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(saver.getState().dirty).toBe(false);
  });
});

describe("explicit save()", () => {
  it("writes even when clean, so the viewport is persisted on close / switch / ⌘S", async () => {
    openDocument();
    await expect(saver.save()).resolves.toBe(true);
    expect(writeFile).toHaveBeenCalledWith(PATH, "scene-0");
  });

  it("resolves false when the write reports failure", async () => {
    openDocument();
    writeFile.mockResolvedValueOnce(false);
    await expect(saver.save()).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith("[saveController] ❌ Save returned failure:", PATH);
  });

  it("treats a non-true write result as failure", async () => {
    openDocument();
    writeFile.mockResolvedValueOnce("yes");
    await expect(saver.save()).resolves.toBe(false);
  });

  it("resolves false and writes nothing when serializing throws", async () => {
    openDocument();
    serialize.mockImplementationOnce(() => {
      throw new Error("bad scene");
    });
    await expect(saver.save()).resolves.toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("resolves false when no serializer has been set yet", async () => {
    const fresh = createSaveController({ writeFile, saveFileDialog, onStateChange });
    fresh.startDocument(PATH);
    await expect(fresh.save()).resolves.toBe(false);
    expect(writeFile).not.toHaveBeenCalled();
  });
});

describe("dirty state", () => {
  const dirtyReports = () => onStateChange.mock.calls.map(([state]) => state.dirty);

  it("goes dirty on an edit and clean once the save succeeds", async () => {
    openDocument();
    saver.observe(snapshot("edit-1"));
    expect(saver.getState().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saver.getState().dirty).toBe(false);
  });

  it("reports each transition exactly once", async () => {
    openDocument();
    onStateChange.mockClear();
    saver.observe(snapshot("edit-1"));
    saver.observe(snapshot("edit-2"));
    saver.observe(snapshot("edit-3"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(dirtyReports()).toEqual([true, false]);
  });

  it("stays dirty when the write fails", async () => {
    openDocument();
    writeFile.mockResolvedValue(false);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saver.getState().dirty).toBe(true);
  });

  it("stays dirty when the write throws", async () => {
    openDocument();
    writeFile.mockRejectedValue(new Error("boom"));
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saver.getState().dirty).toBe(true);
  });

  it("stays dirty if an edit lands while the save is in flight, until the follow-up saves", async () => {
    openDocument();
    const first = deferred();
    writeFile.mockReturnValueOnce(first.promise);
    saver.observe(snapshot("edit-1"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    saver.observe(snapshot("edit-2"));
    first.resolve(true);
    await flush();
    expect(saver.getState().dirty).toBe(true);

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(saver.getState().dirty).toBe(false);
  });

  it("a clean save does not report a transition", async () => {
    openDocument();
    onStateChange.mockClear();
    await saver.save();
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it("reports hasContent changes even without an edit transition", () => {
    openDocument(null, "empty");
    onStateChange.mockClear();
    saver.observe(snapshot("drew", true));
    saver.observe(snapshot("deleted-all", false));
    expect(onStateChange.mock.calls.map(([state]) => state.hasContent)).toEqual([true, false]);
  });

  it("reports the full state shape", () => {
    openDocument(PATH, "loaded");
    expect(onStateChange).toHaveBeenLastCalledWith({
      filePath: PATH,
      hasFilePath: true,
      dirty: false,
      hasContent: true,
    });
  });
});

describe("saveAs()", () => {
  beforeEach(() => openDocument(null, "empty"));

  it("passes the serialized scene to the dialog and adopts the chosen path", async () => {
    saver.observe(snapshot("edit-1"));
    saveFileDialog.mockResolvedValue(OTHER_PATH);

    await expect(saver.saveAs()).resolves.toBe(OTHER_PATH);

    expect(saveFileDialog).toHaveBeenCalledWith("scene-0");
    expect(saver.getState()).toEqual({
      filePath: OTHER_PATH,
      hasFilePath: true,
      dirty: false,
      hasContent: true,
    });
  });

  it("does not write through writeFile (the dialog handler writes the file)", async () => {
    saveFileDialog.mockResolvedValue(OTHER_PATH);
    await saver.saveAs();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("keeps everything as it was when the dialog is cancelled", async () => {
    saver.observe(snapshot("edit-1"));
    await expect(saver.saveAs()).resolves.toBeNull();
    expect(saver.getState()).toEqual({
      filePath: null,
      hasFilePath: false,
      dirty: true,
      hasContent: true,
    });
  });

  it("resolves null and logs when the dialog throws", async () => {
    saveFileDialog.mockRejectedValue(new Error("ipc down"));
    await expect(saver.saveAs()).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[saveController] ❌ Save As failed:",
      expect.any(Error),
    );
  });

  it("resolves null when serializing throws, without opening the dialog", async () => {
    serialize.mockImplementationOnce(() => {
      throw new Error("bad scene");
    });
    await expect(saver.saveAs()).resolves.toBeNull();
    expect(saveFileDialog).not.toHaveBeenCalled();
  });

  it("stays dirty and auto-saves to the new path if edited while the dialog was open", async () => {
    const dialog = deferred();
    saveFileDialog.mockReturnValue(dialog.promise);
    const saving = saver.saveAs();
    saver.observe(snapshot("edit-during-dialog"));
    dialog.resolve(OTHER_PATH);
    await saving;

    expect(saver.getState().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledWith(OTHER_PATH, "scene-0");
    expect(saver.getState().dirty).toBe(false);
  });

  it("later edits auto-save to the new path", async () => {
    saveFileDialog.mockResolvedValue(OTHER_PATH);
    await saver.saveAs();
    saver.observe(snapshot("edit-after"));
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(writeFile).toHaveBeenCalledWith(OTHER_PATH, "scene-0");
  });

  it("from a titled drawing, cancels the pending auto-save of the old file", async () => {
    openDocument(PATH);
    saver.observe(snapshot("edit-1"));
    saveFileDialog.mockResolvedValue(OTHER_PATH);
    await saver.saveAs();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 5);
    expect(writeFile).not.toHaveBeenCalled();
    expect(saver.getState().filePath).toBe(OTHER_PATH);
  });
});
