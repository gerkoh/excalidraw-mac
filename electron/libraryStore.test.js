import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const {
  LIBRARY_FILE_NAME,
  getLibraryPath,
  getLibraryBackupPath,
  isValidLibraryItems,
  parseLibraryFile,
  serializeLibrary,
  readLibrary,
  writeLibrary,
} = require("./libraryStore");

const element = (id) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10 });
const v2Item = (id) => ({ id, status: "published", created: 1, elements: [element(`${id}-el`)] });
const v1Item = (id) => [element(`${id}-el`)];

const v2File = (libraryItems) =>
  JSON.stringify({
    type: "excalidrawlib",
    version: 2,
    source: "https://excalidraw.com",
    libraryItems,
  });
const v1File = (library) =>
  JSON.stringify({ type: "excalidrawlib", version: 1, source: "https://excalidraw.com", library });

let tmpDir;
let libraryPath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidraw-mac-test-"));
  libraryPath = path.join(tmpDir, LIBRARY_FILE_NAME);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("paths", () => {
  it("stores the library as library.excalidrawlib directly in the user data folder", () => {
    expect(getLibraryPath("/Users/me/Library/Application Support/excalidraw-mac")).toBe(
      "/Users/me/Library/Application Support/excalidraw-mac/library.excalidrawlib",
    );
  });

  it("puts the backup next to the library", () => {
    expect(getLibraryBackupPath("/data/library.excalidrawlib")).toBe(
      "/data/library.excalidrawlib.bak",
    );
  });
});

describe("isValidLibraryItems", () => {
  it.each([
    ["an empty list", []],
    ["v2 items", [v2Item("a"), v2Item("b")]],
    ["v1 items", [v1Item("a"), v1Item("b")]],
    ["mixed v1 and v2 items", [v1Item("a"), v2Item("b")]],
    ["an item with no elements", [{ id: "a", elements: [] }]],
  ])("accepts %s", (_label, items) => {
    expect(isValidLibraryItems(items)).toBe(true);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "[]"],
    ["an object", { libraryItems: [] }],
    ["a null item", [null]],
    ["a string item", ["item"]],
    ["an item without elements", [{ id: "a" }]],
    ["an item with non-array elements", [{ id: "a", elements: {} }]],
    ["an item with a null element", [{ id: "a", elements: [null] }]],
    ["a v1 item with a non-object element", [[element("a"), 5]]],
    ["one bad item among good ones", [v2Item("a"), null]],
  ])("rejects %s", (_label, items) => {
    expect(isValidLibraryItems(items)).toBe(false);
  });
});

describe("parseLibraryFile", () => {
  it("returns the items of a v2 file", () => {
    expect(parseLibraryFile(v2File([v2Item("a")]))).toEqual([v2Item("a")]);
  });

  it("returns the items of a v1 file", () => {
    expect(parseLibraryFile(v1File([v1Item("a")]))).toEqual([v1Item("a")]);
  });

  it("returns an empty list for an empty library", () => {
    expect(parseLibraryFile(v2File([]))).toEqual([]);
  });

  it("reads files written by serializeLibrary", () => {
    expect(parseLibraryFile(serializeLibrary([v2Item("a")]))).toEqual([v2Item("a")]);
  });

  it.each([
    ["empty content", ""],
    ["invalid JSON", "{ not json"],
    ["truncated JSON", v2File([v2Item("a")]).slice(0, 40)],
    ["JSON null", "null"],
    ["a JSON array", "[]"],
    ["a JSON string", '"excalidrawlib"'],
    [
      "a drawing instead of a library",
      JSON.stringify({ type: "excalidraw", version: 2, elements: [] }),
    ],
    ["a missing type", JSON.stringify({ version: 2, libraryItems: [] })],
    ["an unknown version", JSON.stringify({ type: "excalidrawlib", version: 3, libraryItems: [] })],
    ["a missing version", JSON.stringify({ type: "excalidrawlib", libraryItems: [] })],
    ["a string version", JSON.stringify({ type: "excalidrawlib", version: "2", libraryItems: [] })],
    ["no items key", JSON.stringify({ type: "excalidrawlib", version: 2 })],
    ["non-array items", JSON.stringify({ type: "excalidrawlib", version: 2, libraryItems: {} })],
    ["invalid items", v2File([null])],
  ])("returns null for %s", (_label, content) => {
    expect(parseLibraryFile(content)).toBeNull();
  });
});

describe("serializeLibrary", () => {
  it("writes the standard v2 .excalidrawlib envelope", () => {
    expect(JSON.parse(serializeLibrary([v2Item("a")]))).toEqual({
      type: "excalidrawlib",
      version: 2,
      source: "excalidraw-mac",
      libraryItems: [v2Item("a")],
    });
  });

  it("pretty-prints like Excalidraw's own library export", () => {
    expect(serializeLibrary([])).toBe(
      '{\n  "type": "excalidrawlib",\n  "version": 2,\n  "source": "excalidraw-mac",\n  "libraryItems": []\n}',
    );
  });
});

describe("readLibrary", () => {
  it("returns null when there is no library file yet", async () => {
    await expect(readLibrary(libraryPath)).resolves.toBeNull();
    expect(fs.readdirSync(tmpDir)).toEqual([]);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("returns null when the user data folder doesn't exist", async () => {
    await expect(readLibrary(path.join(tmpDir, "missing", LIBRARY_FILE_NAME))).resolves.toBeNull();
  });

  it("loads a v2 file", async () => {
    fs.writeFileSync(libraryPath, v2File([v2Item("a"), v2Item("b")]));
    await expect(readLibrary(libraryPath)).resolves.toEqual({
      libraryItems: [v2Item("a"), v2Item("b")],
    });
  });

  it("loads a v1 file, leaving its items for Excalidraw to restore", async () => {
    fs.writeFileSync(libraryPath, v1File([v1Item("a")]));
    await expect(readLibrary(libraryPath)).resolves.toEqual({ libraryItems: [v1Item("a")] });
  });

  it("loads an empty library", async () => {
    fs.writeFileSync(libraryPath, v2File([]));
    await expect(readLibrary(libraryPath)).resolves.toEqual({ libraryItems: [] });
  });

  it("doesn't create a backup for a valid file", async () => {
    fs.writeFileSync(libraryPath, v2File([v2Item("a")]));
    await readLibrary(libraryPath);
    expect(fs.existsSync(getLibraryBackupPath(libraryPath))).toBe(false);
  });

  it.each([
    ["invalid JSON", "{ corrupt"],
    ["an empty file", ""],
    ["a non-library JSON file", JSON.stringify({ type: "excalidraw", elements: [] })],
    ["invalid items", v2File([{ id: "no-elements" }])],
  ])(
    "starts empty for %s, backing it up and leaving the original untouched",
    async (_label, content) => {
      fs.writeFileSync(libraryPath, content);

      await expect(readLibrary(libraryPath)).resolves.toBeNull();

      expect(fs.readFileSync(libraryPath, "utf-8")).toBe(content);
      expect(fs.readFileSync(getLibraryBackupPath(libraryPath), "utf-8")).toBe(content);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("corrupt"),
        getLibraryBackupPath(libraryPath),
      );
    },
  );

  it("replaces an older backup when a newly corrupt file is found", async () => {
    fs.writeFileSync(getLibraryBackupPath(libraryPath), "old backup");
    fs.writeFileSync(libraryPath, "new corrupt");
    await readLibrary(libraryPath);
    expect(fs.readFileSync(getLibraryBackupPath(libraryPath), "utf-8")).toBe("new corrupt");
  });

  it("rejects when the file exists but can't be read, so Excalidraw won't save over it", async () => {
    fs.mkdirSync(libraryPath); // reading a directory fails with EISDIR
    await expect(readLibrary(libraryPath)).rejects.toThrow(/EISDIR/);
    expect(console.error).toHaveBeenCalledWith(
      "[main] Failed to read library:",
      libraryPath,
      expect.any(Error),
    );
  });

  it("rejects when a corrupt file can't be backed up, so it isn't overwritten without a copy", async () => {
    fs.writeFileSync(libraryPath, "{ corrupt");
    fs.mkdirSync(getLibraryBackupPath(libraryPath)); // copying onto a directory fails
    await expect(readLibrary(libraryPath)).rejects.toThrow();
    expect(fs.readFileSync(libraryPath, "utf-8")).toBe("{ corrupt");
  });
});

describe("writeLibrary", () => {
  it("writes the items in the v2 format to the given path", async () => {
    await writeLibrary(libraryPath, [v2Item("a")]);
    expect(fs.readFileSync(libraryPath, "utf-8")).toBe(serializeLibrary([v2Item("a")]));
  });

  it("writes only the library file (no temp files or backups left behind)", async () => {
    await writeLibrary(libraryPath, [v2Item("a")]);
    expect(fs.readdirSync(tmpDir)).toEqual([LIBRARY_FILE_NAME]);
  });

  it("writes an empty library", async () => {
    await writeLibrary(libraryPath, []);
    expect(JSON.parse(fs.readFileSync(libraryPath, "utf-8")).libraryItems).toEqual([]);
  });

  it("replaces the previous library", async () => {
    await writeLibrary(libraryPath, [v2Item("a"), v2Item("b")]);
    await writeLibrary(libraryPath, [v2Item("c")]);
    await expect(readLibrary(libraryPath)).resolves.toEqual({ libraryItems: [v2Item("c")] });
  });

  it("replaces a corrupt file but keeps its backup", async () => {
    fs.writeFileSync(libraryPath, "{ corrupt");
    await readLibrary(libraryPath);

    await writeLibrary(libraryPath, [v2Item("a")]);

    await expect(readLibrary(libraryPath)).resolves.toEqual({ libraryItems: [v2Item("a")] });
    expect(fs.readFileSync(getLibraryBackupPath(libraryPath), "utf-8")).toBe("{ corrupt");
  });

  it("creates the user data folder if it's missing", async () => {
    const nestedPath = path.join(tmpDir, "nested", "dir", LIBRARY_FILE_NAME);
    await writeLibrary(nestedPath, [v2Item("a")]);
    await expect(readLibrary(nestedPath)).resolves.toEqual({ libraryItems: [v2Item("a")] });
  });

  it("round-trips v1 items read from an imported file", async () => {
    await writeLibrary(libraryPath, [v1Item("a")]);
    await expect(readLibrary(libraryPath)).resolves.toEqual({ libraryItems: [v1Item("a")] });
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a string", "[]"],
    ["an envelope object", { libraryItems: [] }],
    ["invalid items", [{ id: "no-elements" }]],
  ])("refuses %s and leaves the existing file untouched", async (_label, items) => {
    fs.writeFileSync(libraryPath, v2File([v2Item("keep")]));
    await expect(writeLibrary(libraryPath, items)).rejects.toThrow(TypeError);
    expect(fs.readFileSync(libraryPath, "utf-8")).toBe(v2File([v2Item("keep")]));
    expect(fs.readdirSync(tmpDir)).toEqual([LIBRARY_FILE_NAME]);
  });
});
