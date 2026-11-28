import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const {
  UNTITLED,
  formatWindowTitle,
  applyCurrentFileToWindow,
  createSetCurrentFileHandler,
  createCurrentFileRecorder,
  isReadableFile,
  missingFileError,
  createOpenFileHandler,
  buildOpenRecentMenuItem,
} = require("./document");
const { isAllowedPath } = require("./fileService");

const createFakeWindow = ({ destroyed = false, minimized = false, macOS = true } = {}) => {
  const win = {
    isDestroyed: vi.fn(() => destroyed),
    isMinimized: vi.fn(() => minimized),
    restore: vi.fn(),
    focus: vi.fn(),
    setTitle: vi.fn(),
    webContents: { send: vi.fn() },
  };
  if (macOS) win.setRepresentedFilename = vi.fn();
  return win;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("formatWindowTitle", () => {
  it.each([
    ["/Users/me/diagram.excalidraw", "diagram"],
    ["diagram.excalidraw", "diagram"],
    ["relative/dir/diagram.excalidraw", "diagram"],
    ["/Users/me/a.b.excalidraw", "a.b"],
    ["/Users/me/archive.json.excalidraw", "archive.json"],
    ["/Users/me/v1.2.3 final.excalidraw", "v1.2.3 final"],
    ["/path with spaces/my drawing.excalidraw", "my drawing"],
    ["/Users/me/图表.excalidraw", "图表"],
    ["/Users/me/café ☕️.excalidraw", "café ☕️"],
    ["/Users/me/🎨.excalidraw", "🎨"],
    ["/Users/me/dir.with.dots/plan.excalidraw", "plan"],
    ["/Users/me/no-extension", "no-extension"],
  ])("%s -> %s", (filePath, expected) => {
    expect(formatWindowTitle(filePath)).toBe(expected);
  });

  it("keeps a dotfile name whole (path.extname treats it as having no extension)", () => {
    expect(formatWindowTitle("/Users/me/.excalidraw")).toBe(".excalidraw");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace", "   "],
    ["a number", 42],
    ["an object", { path: "/a.excalidraw" }],
  ])("is Untitled for %s", (_label, value) => {
    expect(formatWindowTitle(value)).toBe(UNTITLED);
  });

  it("exposes Untitled as the constant", () => {
    expect(UNTITLED).toBe("Untitled");
  });
});

describe("applyCurrentFileToWindow", () => {
  it("sets the title and macOS represented filename for a file", () => {
    const win = createFakeWindow();
    applyCurrentFileToWindow(win, "/Users/me/diagram.excalidraw");
    expect(win.setTitle).toHaveBeenCalledWith("diagram");
    expect(win.setRepresentedFilename).toHaveBeenCalledWith("/Users/me/diagram.excalidraw");
  });

  it("shows Untitled and clears the proxy icon with an empty string when there is no file", () => {
    const win = createFakeWindow();
    applyCurrentFileToWindow(win, null);
    expect(win.setTitle).toHaveBeenCalledWith("Untitled");
    expect(win.setRepresentedFilename).toHaveBeenCalledWith("");
  });

  it("works on platforms without setRepresentedFilename", () => {
    const win = createFakeWindow({ macOS: false });
    expect(() => applyCurrentFileToWindow(win, "/a.excalidraw")).not.toThrow();
    expect(win.setTitle).toHaveBeenCalledWith("a");
  });

  it("does nothing for a destroyed window", () => {
    const win = createFakeWindow({ destroyed: true });
    applyCurrentFileToWindow(win, "/a.excalidraw");
    expect(win.setTitle).not.toHaveBeenCalled();
    expect(win.setRepresentedFilename).not.toHaveBeenCalled();
  });

  it.each([null, undefined])("does nothing without a window (%s)", (win) => {
    expect(() => applyCurrentFileToWindow(win, "/a.excalidraw")).not.toThrow();
  });
});

describe("createSetCurrentFileHandler", () => {
  const setup = ({ win = createFakeWindow() } = {}) => {
    const getWindowFromWebContents = vi.fn(() => win);
    const handler = createSetCurrentFileHandler({ isAllowedPath, getWindowFromWebContents });
    const sender = { id: 1 };
    return { handler, win, getWindowFromWebContents, event: { sender } };
  };

  it("applies the reported file to the sender's window", () => {
    const { handler, win, getWindowFromWebContents, event } = setup();
    expect(handler(event, "/Users/me/diagram.excalidraw")).toBe(true);
    expect(getWindowFromWebContents).toHaveBeenCalledWith(event.sender);
    expect(win.setTitle).toHaveBeenCalledWith("diagram");
    expect(win.setRepresentedFilename).toHaveBeenCalledWith("/Users/me/diagram.excalidraw");
  });

  it("accepts null as untitled", () => {
    const { handler, win, event } = setup();
    expect(handler(event, null)).toBe(true);
    expect(win.setTitle).toHaveBeenCalledWith("Untitled");
    expect(win.setRepresentedFilename).toHaveBeenCalledWith("");
  });

  it.each([
    ["undefined", undefined],
    ["a non-excalidraw path", "/etc/passwd"],
    ["an empty string", ""],
    ["a number", 7],
  ])("rejects %s without touching the window", (_label, value) => {
    const { handler, win, getWindowFromWebContents, event } = setup();
    expect(handler(event, value)).toBe(false);
    expect(getWindowFromWebContents).not.toHaveBeenCalled();
    expect(win.setTitle).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("returns false when the sender has no window", () => {
    const { handler, event } = setup({ win: null });
    expect(handler(event, "/a.excalidraw")).toBe(false);
  });
});

describe("createCurrentFileRecorder", () => {
  const setup = () => {
    const store = { set: vi.fn() };
    const addRecentDocument = vi.fn();
    const record = createCurrentFileRecorder({ store, addRecentDocument, isAllowedPath });
    return { store, addRecentDocument, record };
  };

  it("persists lastOpenedPath and adds the file to recent documents", () => {
    const { store, addRecentDocument, record } = setup();
    expect(record("/Users/me/diagram.excalidraw")).toBe(true);
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(store.set).toHaveBeenCalledWith("lastOpenedPath", "/Users/me/diagram.excalidraw");
    expect(addRecentDocument).toHaveBeenCalledTimes(1);
    expect(addRecentDocument).toHaveBeenCalledWith("/Users/me/diagram.excalidraw");
  });

  it("records the same file again each time it becomes current (moves it to the top)", () => {
    const { addRecentDocument, record } = setup();
    record("/a.excalidraw");
    record("/a.excalidraw");
    expect(addRecentDocument).toHaveBeenCalledTimes(2);
  });

  it("keeps unicode paths intact", () => {
    const { store, addRecentDocument, record } = setup();
    record("/Users/me/图表 ☕️.excalidraw");
    expect(store.set).toHaveBeenCalledWith("lastOpenedPath", "/Users/me/图表 ☕️.excalidraw");
    expect(addRecentDocument).toHaveBeenCalledWith("/Users/me/图表 ☕️.excalidraw");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a non-excalidraw path", "/Users/me/notes.txt"],
    ["an empty string", ""],
    ["an object", { path: "/a.excalidraw" }],
  ])("ignores %s", (_label, value) => {
    const { store, addRecentDocument, record } = setup();
    expect(record(value)).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
    expect(addRecentDocument).not.toHaveBeenCalled();
  });
});

describe("isReadableFile", () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidraw-mac-test-"));
  });

  afterEach(() => {
    fs.chmodSync(tmpDir, 0o700);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("is true for an existing file", () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, "{}");
    expect(isReadableFile(filePath)).toBe(true);
  });

  it("is false for a missing (moved / deleted) file", () => {
    expect(isReadableFile(path.join(tmpDir, "gone.excalidraw"))).toBe(false);
  });

  it("is false for a file deleted after it was recorded", () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, "{}");
    fs.rmSync(filePath);
    expect(isReadableFile(filePath)).toBe(false);
  });

  it("is false for a directory named like a drawing", () => {
    const dirPath = path.join(tmpDir, "folder.excalidraw");
    fs.mkdirSync(dirPath);
    expect(isReadableFile(dirPath)).toBe(false);
  });

  it.skipIf(process.getuid?.() === 0)("is false for a file without read permission", () => {
    const filePath = path.join(tmpDir, "locked.excalidraw");
    fs.writeFileSync(filePath, "{}");
    fs.chmodSync(filePath, 0o000);
    expect(isReadableFile(filePath)).toBe(false);
  });

  it.each([null, undefined, 42])("is false for a non-path (%s)", (value) => {
    expect(isReadableFile(value)).toBe(false);
  });
});

describe("missingFileError", () => {
  it("names the file in the title and gives the full path in the content", () => {
    const { title, content } = missingFileError("/Users/me/old/diagram.excalidraw");
    expect(title).toBe('"diagram.excalidraw" can\'t be opened');
    expect(content).toContain("moved, renamed or deleted");
    expect(content).toContain("/Users/me/old/diagram.excalidraw");
  });
});

describe("createOpenFileHandler", () => {
  const FILE = "/Users/me/diagram.excalidraw";

  const setup = ({
    readable = true,
    storeReady = true,
    appReady = true,
    win = createFakeWindow(),
  } = {}) => {
    const deps = {
      isAllowedPath,
      isReadable: vi.fn(() => readable),
      showError: vi.fn(),
      isStoreReady: vi.fn(() => storeReady),
      recordCurrentFile: vi.fn(),
      getWindow: vi.fn(() => win),
      isAppReady: vi.fn(() => appReady),
      setPendingFile: vi.fn(),
      createWindow: vi.fn(),
    };
    return { deps, win, handle: createOpenFileHandler(deps) };
  };

  it.each([null, undefined, "/Users/me/notes.txt", ""])("ignores disallowed path %j", (value) => {
    const { deps, handle } = setup();
    expect(handle(value)).toBe("ignored");
    expect(deps.isReadable).not.toHaveBeenCalled();
    expect(deps.showError).not.toHaveBeenCalled();
    expect(deps.recordCurrentFile).not.toHaveBeenCalled();
    expect(deps.setPendingFile).not.toHaveBeenCalled();
  });

  describe("missing file (e.g. a recent item that was moved or deleted)", () => {
    it.each([
      ["with a window", {}],
      ["with all windows closed", { win: null }],
      ["while the app is launching", { storeReady: false, appReady: false, win: null }],
    ])("shows a native error %s", (_label, options) => {
      const { deps, handle } = setup({ readable: false, ...options });
      expect(handle(FILE)).toBe("missing");
      expect(deps.showError).toHaveBeenCalledTimes(1);
      expect(deps.showError).toHaveBeenCalledWith(
        missingFileError(FILE).title,
        missingFileError(FILE).content,
      );
    });

    it("doesn't clobber the current drawing or the remembered path", () => {
      const { deps, win, handle } = setup({ readable: false });
      handle(FILE);
      expect(deps.recordCurrentFile).not.toHaveBeenCalled();
      expect(deps.setPendingFile).not.toHaveBeenCalled();
      expect(deps.createWindow).not.toHaveBeenCalled();
      expect(win.webContents.send).not.toHaveBeenCalled();
    });

    it("doesn't open a window when all windows are closed", () => {
      const { deps, handle } = setup({ readable: false, win: null });
      handle(FILE);
      expect(deps.createWindow).not.toHaveBeenCalled();
    });
  });

  describe("app running with a window", () => {
    it("records the file and sends it to the renderer", () => {
      const { deps, win, handle } = setup();
      expect(handle(FILE)).toBe("sent");
      expect(deps.recordCurrentFile).toHaveBeenCalledWith(FILE);
      expect(win.webContents.send).toHaveBeenCalledTimes(1);
      expect(win.webContents.send).toHaveBeenCalledWith("open-file", FILE);
      expect(deps.setPendingFile).not.toHaveBeenCalled();
      expect(deps.createWindow).not.toHaveBeenCalled();
    });

    it("records before sending so a renderer that is still loading picks it up as last path", () => {
      const { deps, win, handle } = setup();
      handle(FILE);
      expect(deps.recordCurrentFile.mock.invocationCallOrder[0]).toBeLessThan(
        win.webContents.send.mock.invocationCallOrder[0],
      );
    });

    it("focuses the window", () => {
      const { win, handle } = setup();
      handle(FILE);
      expect(win.focus).toHaveBeenCalledTimes(1);
      expect(win.restore).not.toHaveBeenCalled();
    });

    it("restores a minimized window", () => {
      const { win, handle } = setup({ win: createFakeWindow({ minimized: true }) });
      handle(FILE);
      expect(win.restore).toHaveBeenCalledTimes(1);
      expect(win.focus).toHaveBeenCalledTimes(1);
    });
  });

  describe("app running with all windows closed", () => {
    it("records the file, queues it as pending and reopens a window", () => {
      const { deps, handle } = setup({ win: null });
      expect(handle(FILE)).toBe("reopened");
      expect(deps.recordCurrentFile).toHaveBeenCalledWith(FILE);
      expect(deps.setPendingFile).toHaveBeenCalledWith(FILE);
      expect(deps.createWindow).toHaveBeenCalledTimes(1);
    });

    it("queues the pending file before creating the window that reads it", () => {
      const { deps, handle } = setup({ win: null });
      handle(FILE);
      expect(deps.setPendingFile.mock.invocationCallOrder[0]).toBeLessThan(
        deps.createWindow.mock.invocationCallOrder[0],
      );
    });
  });

  describe("app still launching", () => {
    it("queues the file without recording when the store isn't ready", () => {
      const { deps, handle } = setup({ storeReady: false, appReady: false, win: null });
      expect(handle(FILE)).toBe("queued");
      expect(deps.setPendingFile).toHaveBeenCalledWith(FILE);
      expect(deps.recordCurrentFile).not.toHaveBeenCalled();
      expect(deps.createWindow).not.toHaveBeenCalled();
    });

    it("queues without creating a window when the store is ready but the app isn't", () => {
      const { deps, handle } = setup({ appReady: false, win: null });
      expect(handle(FILE)).toBe("queued");
      expect(deps.recordCurrentFile).toHaveBeenCalledWith(FILE);
      expect(deps.setPendingFile).toHaveBeenCalledWith(FILE);
      expect(deps.createWindow).not.toHaveBeenCalled();
    });
  });
});

describe("buildOpenRecentMenuItem", () => {
  it("is a recentDocuments submenu with Clear Menu", () => {
    expect(buildOpenRecentMenuItem()).toEqual({
      label: "Open Recent",
      role: "recentDocuments",
      submenu: [{ label: "Clear Menu", role: "clearRecentDocuments" }],
    });
  });

  it("returns a fresh object each call so menu rebuilds can't share mutated state", () => {
    expect(buildOpenRecentMenuItem()).not.toBe(buildOpenRecentMenuItem());
  });
});
