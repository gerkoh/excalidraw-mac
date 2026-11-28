import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const { LIBRARY_CHANNELS, registerLibraryIpcHandlers } = require("./libraryIpc");
const { LIBRARY_FILE_NAME, serializeLibrary } = require("./libraryStore");
const { createLibraryInstallQueue } = require("./libraryInstall");

const item = (id) => ({ id, status: "published", created: 1, elements: [{ id: `${id}-el` }] });
const event = { sender: {} };

let tmpDir;
let libraryPath;
let handlers;
let installQueue;

// fake ipcMain that records handle() registrations so tests can invoke them
const register = () => {
  handlers = {};
  const ipcMain = { handle: vi.fn((channel, handler) => (handlers[channel] = handler)) };
  installQueue = createLibraryInstallQueue();
  registerLibraryIpcHandlers({ ipcMain, libraryPath, installQueue });
  return ipcMain;
};

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidraw-mac-test-"));
  libraryPath = path.join(tmpDir, LIBRARY_FILE_NAME);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("LIBRARY_CHANNELS", () => {
  it("uses the channel names preload.js exposes", () => {
    expect(LIBRARY_CHANNELS).toEqual({
      get: "get-library",
      save: "save-library",
      takePendingInstalls: "take-pending-library-installs",
      installRequested: "library-install-requested",
    });
  });
});

describe("registerLibraryIpcHandlers", () => {
  it("registers exactly the get, save and take-pending handlers", () => {
    const ipcMain = register();
    expect(ipcMain.handle).toHaveBeenCalledTimes(3);
    expect(Object.keys(handlers).sort()).toEqual(
      [LIBRARY_CHANNELS.get, LIBRARY_CHANNELS.save, LIBRARY_CHANNELS.takePendingInstalls].sort(),
    );
  });

  describe("get-library", () => {
    it("resolves to null when there is no library yet", async () => {
      register();
      await expect(handlers[LIBRARY_CHANNELS.get](event)).resolves.toBeNull();
    });

    it("reads the library from the fixed path", async () => {
      fs.writeFileSync(libraryPath, serializeLibrary([item("a")]));
      register();
      await expect(handlers[LIBRARY_CHANNELS.get](event)).resolves.toEqual({
        libraryItems: [item("a")],
      });
    });

    it("ignores any path the renderer tries to pass", async () => {
      const otherPath = path.join(tmpDir, "other.excalidrawlib");
      fs.writeFileSync(otherPath, serializeLibrary([item("other")]));
      register();
      await expect(handlers[LIBRARY_CHANNELS.get](event, otherPath)).resolves.toBeNull();
    });

    it("rejects when the library file can't be read", async () => {
      fs.mkdirSync(libraryPath);
      register();
      await expect(handlers[LIBRARY_CHANNELS.get](event)).rejects.toThrow();
    });
  });

  describe("save-library", () => {
    it("writes the items to the fixed path and resolves to true", async () => {
      register();
      await expect(handlers[LIBRARY_CHANNELS.save](event, [item("a")])).resolves.toBe(true);
      expect(fs.readFileSync(libraryPath, "utf-8")).toBe(serializeLibrary([item("a")]));
    });

    it("only ever writes the fixed library file, whatever extra args are sent", async () => {
      register();
      const attackerPath = path.join(tmpDir, "evil.excalidraw");
      await handlers[LIBRARY_CHANNELS.save](event, [item("a")], attackerPath);
      expect(fs.readdirSync(tmpDir)).toEqual([LIBRARY_FILE_NAME]);
    });

    it.each([
      ["a path string instead of items", "/etc/passwd"],
      ["undefined", undefined],
      ["invalid items", [{ id: "x" }]],
    ])("resolves to false for %s without writing", async (_label, payload) => {
      register();
      await expect(handlers[LIBRARY_CHANNELS.save](event, payload)).resolves.toBe(false);
      expect(fs.readdirSync(tmpDir)).toEqual([]);
      expect(console.error).toHaveBeenCalledWith(
        "[main] Failed to save library:",
        libraryPath,
        expect.any(TypeError),
      );
    });

    it("resolves to false when the write fails", async () => {
      fs.mkdirSync(libraryPath);
      fs.writeFileSync(path.join(libraryPath, "blocker"), "");
      register();
      await expect(handlers[LIBRARY_CHANNELS.save](event, [item("a")])).resolves.toBe(false);
    });
  });

  describe("take-pending-library-installs", () => {
    it("returns queued requests once, then an empty list", () => {
      register();
      const request = { libraryUrl: "https://libraries.excalidraw.com/a", token: null };
      installQueue.enqueue(request);
      expect(handlers[LIBRARY_CHANNELS.takePendingInstalls](event)).toEqual([request]);
      expect(handlers[LIBRARY_CHANNELS.takePendingInstalls](event)).toEqual([]);
    });
  });
});
