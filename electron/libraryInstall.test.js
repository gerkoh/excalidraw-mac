import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import path from "path";

const require = createRequire(import.meta.url);
const {
  registerLibraryProtocolClient,
  createLibraryInstallQueue,
  handleLibraryInstallUrl,
} = require("./libraryInstall");
const { LIBRARY_CHANNELS, registerLibraryIpcHandlers } = require("./libraryIpc");

const LIBRARY_URL = "https://libraries.excalidraw.com/libraries/a/b.excalidrawlib";
const INSTALL_URL = `excalidraw-mac://addlibrary#addLibrary=${encodeURIComponent(LIBRARY_URL)}&token=t1`;
const REQUEST = { libraryUrl: LIBRARY_URL, token: "t1" };

const createWindow = ({ minimized = false } = {}) => ({
  isMinimized: vi.fn(() => minimized),
  restore: vi.fn(),
  focus: vi.fn(),
  webContents: { send: vi.fn() },
});

let installQueue;
let deps;

const setup = ({ win = null, ready = true } = {}) => {
  installQueue = createLibraryInstallQueue();
  deps = {
    installQueue,
    getWindow: vi.fn(() => win),
    isAppReady: vi.fn(() => ready),
    createWindow: vi.fn(),
  };
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createLibraryInstallQueue", () => {
  it("starts empty", () => {
    expect(createLibraryInstallQueue().takeAll()).toEqual([]);
  });

  it("returns requests in arrival order and clears them", () => {
    const queue = createLibraryInstallQueue();
    queue.enqueue({ libraryUrl: "1" });
    queue.enqueue({ libraryUrl: "2" });
    expect(queue.takeAll()).toEqual([{ libraryUrl: "1" }, { libraryUrl: "2" }]);
    expect(queue.takeAll()).toEqual([]);
  });

  it("keeps requests that arrive after a take for the next take", () => {
    const queue = createLibraryInstallQueue();
    queue.enqueue({ libraryUrl: "1" });
    const first = queue.takeAll();
    queue.enqueue({ libraryUrl: "2" });
    expect(first).toEqual([{ libraryUrl: "1" }]);
    expect(queue.takeAll()).toEqual([{ libraryUrl: "2" }]);
  });

  it("keeps separate queues independent", () => {
    const a = createLibraryInstallQueue();
    const b = createLibraryInstallQueue();
    a.enqueue({ libraryUrl: "1" });
    expect(b.takeAll()).toEqual([]);
  });
});

describe("handleLibraryInstallUrl", () => {
  describe("before the app is ready (launched by the URL)", () => {
    it("queues the request without creating a window", () => {
      setup({ win: null, ready: false });
      expect(handleLibraryInstallUrl(INSTALL_URL, deps)).toBe(true);
      expect(deps.createWindow).not.toHaveBeenCalled();
      expect(installQueue.takeAll()).toEqual([REQUEST]);
    });

    it("queues several requests in order", () => {
      setup({ win: null, ready: false });
      const second = INSTALL_URL.replace("b.excalidrawlib", "c.excalidrawlib");
      handleLibraryInstallUrl(INSTALL_URL, deps);
      handleLibraryInstallUrl(second, deps);
      expect(installQueue.takeAll().map((r) => r.libraryUrl)).toEqual([
        LIBRARY_URL,
        LIBRARY_URL.replace("b.excalidrawlib", "c.excalidrawlib"),
      ]);
    });

    it("hands the queued request to the renderer once it asks (end to end with IPC)", () => {
      setup({ win: null, ready: false });
      handleLibraryInstallUrl(INSTALL_URL, deps);

      // later, app.whenReady registers IPC and the renderer drains the queue on mount
      const handlers = {};
      registerLibraryIpcHandlers({
        ipcMain: { handle: (channel, handler) => (handlers[channel] = handler) },
        libraryPath: "/unused/library.excalidrawlib",
        installQueue,
      });
      expect(handlers[LIBRARY_CHANNELS.takePendingInstalls]()).toEqual([REQUEST]);
      expect(handlers[LIBRARY_CHANNELS.takePendingInstalls]()).toEqual([]);
    });
  });

  describe("when the app is ready but has no window (closed with ⌘W)", () => {
    it("queues the request and creates a window, which drains the queue on load", () => {
      setup({ win: null, ready: true });
      expect(handleLibraryInstallUrl(INSTALL_URL, deps)).toBe(true);
      expect(deps.createWindow).toHaveBeenCalledTimes(1);
      expect(installQueue.takeAll()).toEqual([REQUEST]);
    });
  });

  describe("when a window exists", () => {
    it("queues the request, focuses the window and notifies the renderer", () => {
      const win = createWindow();
      setup({ win });
      expect(handleLibraryInstallUrl(INSTALL_URL, deps)).toBe(true);
      expect(win.focus).toHaveBeenCalledTimes(1);
      expect(win.restore).not.toHaveBeenCalled();
      expect(win.webContents.send).toHaveBeenCalledWith(LIBRARY_CHANNELS.installRequested);
      expect(deps.createWindow).not.toHaveBeenCalled();
      expect(installQueue.takeAll()).toEqual([REQUEST]);
    });

    it("sends no request data with the notification (the renderer takes it from the queue)", () => {
      const win = createWindow();
      setup({ win });
      handleLibraryInstallUrl(INSTALL_URL, deps);
      expect(win.webContents.send.mock.calls[0]).toEqual([LIBRARY_CHANNELS.installRequested]);
    });

    it("restores a minimized window before focusing it", () => {
      const win = createWindow({ minimized: true });
      setup({ win });
      handleLibraryInstallUrl(INSTALL_URL, deps);
      expect(win.restore).toHaveBeenCalledTimes(1);
      expect(win.focus).toHaveBeenCalledTimes(1);
    });

    it("queues before notifying, so the renderer finds the request when it asks", () => {
      const win = createWindow();
      setup({ win });
      win.webContents.send.mockImplementation(() => {
        expect(installQueue.takeAll()).toEqual([REQUEST]);
      });
      handleLibraryInstallUrl(INSTALL_URL, deps);
      expect(win.webContents.send).toHaveBeenCalled();
    });
  });

  describe("rejected URLs", () => {
    it.each([
      ["a disallowed library host", INSTALL_URL.replace("libraries.excalidraw.com", "evil.com")],
      ["an http library URL", INSTALL_URL.replace("https", "http")],
      ["a lookalike host", INSTALL_URL.replace("excalidraw.com", "excalidraw.com.evil.com")],
      ["a missing addLibrary param", "excalidraw-mac://addlibrary#token=t1"],
      ["an unknown action", INSTALL_URL.replace("addlibrary", "deleteeverything")],
      ["garbage", "not a url"],
    ])("ignores %s: nothing queued, no window touched", (_label, url) => {
      const win = createWindow();
      setup({ win });
      expect(handleLibraryInstallUrl(url, deps)).toBe(false);
      expect(installQueue.takeAll()).toEqual([]);
      expect(win.focus).not.toHaveBeenCalled();
      expect(win.webContents.send).not.toHaveBeenCalled();
      expect(deps.createWindow).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith("[main] Rejected library install URL:", url);
    });

    it("doesn't create a window for a rejected URL when none is open", () => {
      setup({ win: null, ready: true });
      handleLibraryInstallUrl("excalidraw-mac://addlibrary", deps);
      expect(deps.createWindow).not.toHaveBeenCalled();
    });
  });
});

describe("registerLibraryProtocolClient", () => {
  const createApp = () => ({ setAsDefaultProtocolClient: vi.fn(() => true) });

  it("registers just the scheme for the packaged app", () => {
    const app = createApp();
    const result = registerLibraryProtocolClient({
      app,
      defaultApp: undefined,
      execPath: "/Applications/excalidraw-mac.app/Contents/MacOS/excalidraw-mac",
      argv: ["/Applications/excalidraw-mac.app/Contents/MacOS/excalidraw-mac"],
    });
    expect(result).toBe(true);
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith("excalidraw-mac");
    expect(app.setAsDefaultProtocolClient.mock.calls[0]).toHaveLength(1);
  });

  it("passes the Electron binary and the absolute app path in dev (`electron .`)", () => {
    const app = createApp();
    registerLibraryProtocolClient({
      app,
      defaultApp: true,
      execPath: "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      argv: ["/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron", "."],
    });
    expect(app.setAsDefaultProtocolClient).toHaveBeenCalledWith(
      "excalidraw-mac",
      "/repo/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
      [path.resolve(".")],
    );
  });

  it("doesn't register in dev when argv has no app path", () => {
    const app = createApp();
    expect(
      registerLibraryProtocolClient({
        app,
        defaultApp: true,
        execPath: "/electron",
        argv: ["/electron"],
      }),
    ).toBe(false);
    expect(app.setAsDefaultProtocolClient).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it("returns whatever Electron reports", () => {
    const app = { setAsDefaultProtocolClient: vi.fn(() => false) };
    expect(registerLibraryProtocolClient({ app, defaultApp: false, execPath: "", argv: [] })).toBe(
      false,
    );
  });
});
