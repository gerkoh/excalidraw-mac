import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const { isAllowedPath, readConfig, readDrawing, writeDrawing } = require("./fileService");

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
  it("parses a valid config file", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, JSON.stringify({ windowWidth: 800, autoSaveDebounceMs: 10 }));
    expect(readConfig(configPath)).toEqual({ windowWidth: 800, autoSaveDebounceMs: 10 });
  });

  it("reads the repo's own config.json", () => {
    const config = readConfig(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "config.json"),
    );
    expect(config).toEqual(
      expect.objectContaining({
        windowWidth: expect.any(Number),
        windowHeight: expect.any(Number),
        autoSaveDebounceMs: expect.any(Number),
        autoSaveCheckIntervalMs: expect.any(Number),
      }),
    );
  });

  it("returns null and logs for malformed JSON", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, "{ not json");
    expect(readConfig(configPath)).toBeNull();
    expect(console.error).toHaveBeenCalledWith("[main] Failed to read config:", expect.any(Error));
  });

  it("returns null for an empty file", () => {
    const configPath = path.join(tmpDir, "config.json");
    fs.writeFileSync(configPath, "");
    expect(readConfig(configPath)).toBeNull();
  });

  it("returns null and logs for a missing file", () => {
    expect(readConfig(path.join(tmpDir, "missing.json"))).toBeNull();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("returns null when the path is a directory", () => {
    expect(readConfig(tmpDir)).toBeNull();
  });
});

describe("readDrawing", () => {
  it("returns the file content as a utf-8 string", () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, '{"type":"excalidraw","text":"héllo ✏️"}', "utf-8");
    expect(readDrawing(filePath)).toBe('{"type":"excalidraw","text":"héllo ✏️"}');
  });

  it("returns an empty string for an empty file", () => {
    const filePath = path.join(tmpDir, "empty.excalidraw");
    fs.writeFileSync(filePath, "");
    expect(readDrawing(filePath)).toBe("");
  });

  it("returns null without logging when the file does not exist", () => {
    expect(readDrawing(path.join(tmpDir, "missing.excalidraw"))).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns null and logs for a disallowed path, even if the file exists", () => {
    const filePath = path.join(tmpDir, "secret.txt");
    fs.writeFileSync(filePath, "secret");
    expect(readDrawing(filePath)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[main] Rejected read for disallowed path:",
      filePath,
    );
  });

  it("returns null for a non-string path", () => {
    expect(readDrawing(undefined)).toBeNull();
    expect(readDrawing(null)).toBeNull();
  });

  it("returns null and logs when the path is a directory", () => {
    const dirPath = path.join(tmpDir, "folder.excalidraw");
    fs.mkdirSync(dirPath);
    expect(readDrawing(dirPath)).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      "[main] Failed to read file:",
      dirPath,
      expect.any(Error),
    );
  });
});

describe("writeDrawing", () => {
  it("writes content and returns true", () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    expect(writeDrawing(filePath, "content")).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("content");
  });

  it("overwrites an existing file", () => {
    const filePath = path.join(tmpDir, "a.excalidraw");
    fs.writeFileSync(filePath, "old content that is longer");
    expect(writeDrawing(filePath, "new")).toBe(true);
    expect(fs.readFileSync(filePath, "utf-8")).toBe("new");
  });

  it("round-trips with readDrawing", () => {
    const filePath = path.join(tmpDir, "round trip.excalidraw");
    const content = JSON.stringify({ type: "excalidraw", elements: [{ id: "a" }], text: "日本語" });
    expect(writeDrawing(filePath, content)).toBe(true);
    expect(readDrawing(filePath)).toBe(content);
  });

  it("returns false and does not create the file for a disallowed path", () => {
    const filePath = path.join(tmpDir, "a.excalidraw.bak");
    expect(writeDrawing(filePath, "content")).toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "[main] Rejected write for disallowed path:",
      filePath,
    );
  });

  it("returns false for a non-string path", () => {
    expect(writeDrawing(undefined, "content")).toBe(false);
    expect(fs.readdirSync(tmpDir)).toEqual([]);
  });

  it("returns false and logs when the parent directory does not exist", () => {
    const filePath = path.join(tmpDir, "missing-dir", "a.excalidraw");
    expect(writeDrawing(filePath, "content")).toBe(false);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(console.error).toHaveBeenCalledWith(
      "[main] Failed to write file:",
      filePath,
      expect.any(Error),
    );
  });

  it("returns false when the path is a directory", () => {
    const dirPath = path.join(tmpDir, "folder.excalidraw");
    fs.mkdirSync(dirPath);
    expect(writeDrawing(dirPath, "content")).toBe(false);
  });
});
