import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const {
  isAllowedPath,
  readConfig,
  readDrawing,
  writeDrawing,
} = require("./fileService");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidraw-mac-test-"));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("isAllowedPath", () => {
  it.each([
    "/Users/me/drawing.excalidraw",
    "relative/drawing.excalidraw",
    "/path with spaces/my drawing.excalidraw",
    "/Users/me/.excalidraw",
    "/Users/me/archive.json.excalidraw",
  ])("allows %s", (filePath) => {
    expect(isAllowedPath(filePath)).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { path: "a.excalidraw" }],
    ["an array", ["a.excalidraw"]],
  ])("rejects %s", (_label, value) => {
    expect(isAllowedPath(value)).toBe(false);
  });

  it.each([
    "",
    "/Users/me/drawing.json",
    "/Users/me/drawing.excalidraw.bak",
    "/Users/me/drawing.excalidraw/",
    "/Users/me/drawing.excalidraw.json",
    "/Users/me/drawing.excalidrawx",
    "/Users/me/drawing.EXCALIDRAW",
    "/Users/me/drawing.excalidraw ",
    "/Users/me/drawingexcalidraw",
    "/etc/passwd",
  ])("rejects %j", (filePath) => {
    expect(isAllowedPath(filePath)).toBe(false);
  });
});

describe("readConfig", () => {
  it("parses a valid config file", async () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ windowWidth: 800, autoSaveDebounceMs: 10 }));
    await expect(readConfig(configPath)).resolves.toEqual({
      windowWidth: 800,
      autoSaveDebounceMs: 10,
    });
  });

  it("reads the repo's own config.json, which no longer has autoSaveCheckIntervalMs", async () => {
    const config = await readConfig(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "config.json"),
    );
    expect(config).toEqual(
      expect.objectContaining({
        windowWidth: expect.any(Number),
        windowHeight: expect.any(Number),
        autoSaveDebounceMs: expect.any(Number),
      }),
    );
    expect(config).not.toHaveProperty("autoSaveCheckIntervalMs");
  });

  it("still reads an old config that has autoSaveCheckIntervalMs", async () => {
    const configPath = path.join(tmpDir, "config.json");
    const old = { autoSaveDebounceMs: 2000, autoSaveCheckIntervalMs: 500 };
    fs.writeFileSync(configPath, JSON.stringify(old));
    await expect(readConfig(configPath)).resolves.toEqual(old);
  });

  it("returns null and logs for malformed JSON", async () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, "{ not json");
    await expect(readConfig(configPath)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith("[main] Failed to read config:", expect.any(Error));
  });

  it("returns null for an empty file", async () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, "");
    await expect(readConfig(configPath)).resolves.toBeNull();
  });

  it("returns null and logs for a missing file", async () => {
    await expect(readConfig(path.join(tmpDir, "missing.json"))).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("returns null when the path is a directory", async () => {
    await expect(readConfig(tmpDir)).resolves.toBeNull();
  });
});

describe("readDrawing", () => {
  it("returns the file content as a utf-8 string", async () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, '{"type":"excalidraw","text":"héllo ✏️"}', "utf-8");
    await expect(readDrawing(filePath)).resolves.toBe('{"type":"excalidraw","text":"héllo ✏️"}');
  });

  it("returns an empty string for an empty file", async () => {
    const filePath = path.join(tmpDir, "empty.excalidraw");
    fs.writeFileSync(filePath, "");
    await expect(readDrawing(filePath)).resolves.toBe("");
  });

  it("returns null without logging when the file does not exist", async () => {
    await expect(readDrawing(path.join(tmpDir, "missing.excalidraw"))).resolves.toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns null and logs for a disallowed path, even if the file exists", async () => {
    const filePath = path.join(tmpDir, "secret.txt");
    fs.writeFileSync(filePath, "secret");
    await expect(readDrawing(filePath)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[main] Rejected read for disallowed path:",
      filePath,
    );
  });

  it("returns null for a non-string path", async () => {
    await expect(readDrawing(undefined)).resolves.toBeNull();
    await expect(readDrawing(null)).resolves.toBeNull();
  });

  it("returns null and logs when the path is a directory", async () => {
    const dirPath = path.join(tmpDir, "folder.excalidraw");
    fs.mkdirSync(dirPath);
    await expect(readDrawing(dirPath)).resolves.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[main] Failed to read file:",
      dirPath,
      expect.any(Error),
    );
  });

  it("does not use the blocking fs API", async () => {
    const readFileSync = vi.spyOn(fs, "readFileSync");
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, "content");
    await readDrawing(filePath);
    expect(readFileSync).not.toHaveBeenCalled();
  });
});

describe("writeDrawing", () => {
  it("writes content and returns true", async () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    await expect(writeDrawing(filePath, "content")).resolves.toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("content");
  });

  it("overwrites an existing file", async () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, "old content that is longer");
    await expect(writeDrawing(filePath, "new")).resolves.toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("new");
  });

  it("round-trips with readDrawing", async () => {
    const filePath = path.join(tmpDir, "round trip.excalidraw");
    const content = JSON.stringify({ type: "excalidraw", elements: [{ id: "a" }], text: "日本語" });
    await expect(writeDrawing(filePath, content)).resolves.toBe(true);
    await expect(readDrawing(filePath)).resolves.toBe(content);
  });

  it("writes atomically: leaves no temp file behind", async () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    await writeDrawing(filePath, "content");
    expect(fs.readdirSync(tmpDir)).toEqual(["a.excalidraw"]);
  });

  it("does not use the blocking fs API", async () => {
    const writeFileSync = vi.spyOn(fs, "writeFileSync");
    await writeDrawing(path.join(tmpDir, "a.excalidraw"), "content");
    expect(writeFileSync).not.toHaveBeenCalled();
  });

  it("returns false and does not create the file for a disallowed path", async () => {
    const filePath = path.join(tmpDir, "a.excalidraw.bak");
    await expect(writeDrawing(filePath, "content")).resolves.toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      "[main] Rejected write for disallowed path:",
      filePath,
    );
  });

  it("returns false for a non-string path", async () => {
    await expect(writeDrawing(undefined, "content")).resolves.toBe(false);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an object", { elements: [] }],
    ["a number", 42],
  ])("returns false and keeps the existing file for %s content", async (_label, content) => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, "keep me");
    await expect(writeDrawing(filePath, content)).resolves.toBe(false);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("keep me");
    expect(fs.readdirSync(tmpDir)).toEqual(["a.excalidraw"]);
    expect(console.error).toHaveBeenCalledWith(
      "[main] Rejected write with non-string content:",
      filePath,
    );
  });

  it("writes an empty string (an explicit empty save is still a string)", async () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    await expect(writeDrawing(filePath, "")).resolves.toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("");
  });

  it("returns false and logs when the parent directory does not exist", async () => {
    const filePath = path.join(tmpDir, "missing-dir", "a.excalidraw");
    await expect(writeDrawing(filePath, "content")).resolves.toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "[main] Failed to write file:",
      filePath,
      expect.any(Error),
    );
  });

  it("returns false and cleans up when the path is a directory", async () => {
    const dirPath = path.join(tmpDir, "folder.excalidraw");
    fs.mkdirSync(dirPath);
    await expect(writeDrawing(dirPath, "content")).resolves.toBe(false);
    expect(fs.statSync(dirPath).isDirectory()).toBe(true);
    expect(fs.readdirSync(tmpDir)).toEqual(["folder.excalidraw"]);
  });
});
