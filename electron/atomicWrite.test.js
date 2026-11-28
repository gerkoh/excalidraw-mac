import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const { writeFileAtomic, tempPathFor } = require("./atomicWrite");

let tmpDir;
let target;

const realOpen = fs.promises.open;

// wraps the real FileHandle so one of its methods can be made to fail or be observed
const spyOnFileHandle = (overrides) =>
  vi.spyOn(fs.promises, "open").mockImplementation(async (...args) => {
    const handle = await realOpen(...args);
    Object.entries(overrides).forEach(([method, impl]) => {
      const original = handle[method].bind(handle);
      handle[method] = (...methodArgs) => impl(original, ...methodArgs);
    });
    return handle;
  });

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "excalidraw-mac-atomic-"));
  target = path.join(tmpDir, "drawing.excalidraw");
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("tempPathFor", () => {
  it("is a hidden .tmp sibling of the target, named after it", () => {
    const tempPath = tempPathFor("/Users/me/notes/plan.excalidraw");
    expect(path.dirname(tempPath)).toBe("/Users/me/notes");
    expect(path.basename(tempPath)).toMatch(/^\.plan\.excalidraw\.[0-9a-f]{12}\.tmp$/);
  });

  it("is different on every call", () => {
    const paths = new Set(Array.from({ length: 50 }, () => tempPathFor(target)));
    expect(paths.size).toBe(50);
  });

  it("handles names with spaces and unicode", () => {
    const tempPath = tempPathFor(path.join(tmpDir, "my drawing ✏️.excalidraw"));
    expect(path.basename(tempPath)).toMatch(/^\.my drawing ✏️\.excalidraw\.[0-9a-f]{12}\.tmp$/);
  });
});

describe("writeFileAtomic", () => {
  describe("success", () => {
    it("creates a new file with the content", async () => {
      await writeFileAtomic(target, "hello");
      expect(fs.readFileSync(target, "utf-8")).toBe("hello");
    });

    it("replaces an existing file", async () => {
      fs.writeFileSync(target, "old content that is much longer than the new one");
      await writeFileAtomic(target, "new");
      expect(fs.readFileSync(target, "utf-8")).toBe("new");
    });

    it("leaves no temp file behind", async () => {
      await writeFileAtomic(target, "hello");
      expect(fs.readdirSync(tmpDir)).toEqual(["drawing.excalidraw"]);
    });

    it("writes utf-8 and large content intact", async () => {
      const content = JSON.stringify({
        text: "日本語 ✏️ héllo",
        data: "A".repeat(5 * 1024 * 1024),
      });
      await writeFileAtomic(target, content);
      expect(fs.readFileSync(target, "utf-8")).toBe(content);
    });

    it("writes an empty string", async () => {
      fs.writeFileSync(target, "old");
      await writeFileAtomic(target, "");
      expect(fs.readFileSync(target, "utf-8")).toBe("");
    });

    it("writes the temp file in the target's directory, then renames it over the target", async () => {
      const rename = vi.spyOn(fs.promises, "rename");
      await writeFileAtomic(target, "hello");
      expect(rename).toHaveBeenCalledTimes(1);
      const [from, to] = rename.mock.calls[0];
      expect(to).toBe(target);
      expect(path.dirname(from)).toBe(tmpDir);
      expect(path.basename(from)).toMatch(/^\.drawing\.excalidraw\.[0-9a-f]{12}\.tmp$/);
    });

    it("fsyncs the temp file before renaming", async () => {
      const sync = vi.fn((original) => original());
      spyOnFileHandle({ sync });
      const rename = vi.spyOn(fs.promises, "rename");

      await writeFileAtomic(target, "hello");

      expect(sync).toHaveBeenCalledTimes(1);
      expect(sync.mock.invocationCallOrder[0]).toBeLessThan(rename.mock.invocationCallOrder[0]);
    });

    it("refuses to reuse an existing temp path (opens with wx)", async () => {
      const open = vi.spyOn(fs.promises, "open");
      await writeFileAtomic(target, "hello");
      expect(open).toHaveBeenCalledWith(expect.any(String), "wx");
    });

    it("keeps the existing file's permissions", async () => {
      fs.writeFileSync(target, "old");
      fs.chmodSync(target, 0o600);
      await writeFileAtomic(target, "new");
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    });

    it("writes through a symlink to its target and keeps the link", async () => {
      const realFile = path.join(tmpDir, "real.excalidraw");
      fs.writeFileSync(realFile, "old");
      fs.symlinkSync(realFile, target);

      await writeFileAtomic(target, "new");

      expect(fs.lstatSync(target).isSymbolicLink()).toBe(true);
      expect(fs.readFileSync(realFile, "utf-8")).toBe("new");
      expect(fs.readdirSync(tmpDir).sort()).toEqual(["drawing.excalidraw", "real.excalidraw"]);
    });

    it("handles concurrent writes to the same file without leaving temp files", async () => {
      await Promise.all([
        writeFileAtomic(target, "first"),
        writeFileAtomic(target, "second"),
        writeFileAtomic(target, "third"),
      ]);
      expect(["first", "second", "third"]).toContain(fs.readFileSync(target, "utf-8"));
      expect(fs.readdirSync(tmpDir)).toEqual(["drawing.excalidraw"]);
    });
  });

  describe("failure", () => {
    it("rename failure keeps the original file, removes the temp file and rethrows", async () => {
      fs.writeFileSync(target, "original");
      const error = Object.assign(new Error("rename failed"), { code: "EXDEV" });
      vi.spyOn(fs.promises, "rename").mockRejectedValue(error);

      await expect(writeFileAtomic(target, "new")).rejects.toBe(error);

      expect(fs.readFileSync(target, "utf-8")).toBe("original");
      expect(fs.readdirSync(tmpDir)).toEqual(["drawing.excalidraw"]);
    });

    it("write failure (e.g. disk full) keeps the original file and removes the temp file", async () => {
      fs.writeFileSync(target, "original");
      const error = Object.assign(new Error("no space"), { code: "ENOSPC" });
      spyOnFileHandle({ writeFile: () => Promise.reject(error) });

      await expect(writeFileAtomic(target, "new")).rejects.toBe(error);

      expect(fs.readFileSync(target, "utf-8")).toBe("original");
      expect(fs.readdirSync(tmpDir)).toEqual(["drawing.excalidraw"]);
    });

    it("fsync failure keeps the original file and removes the temp file", async () => {
      fs.writeFileSync(target, "original");
      const error = new Error("fsync failed");
      spyOnFileHandle({ sync: () => Promise.reject(error) });

      await expect(writeFileAtomic(target, "new")).rejects.toBe(error);

      expect(fs.readFileSync(target, "utf-8")).toBe("original");
      expect(fs.readdirSync(tmpDir)).toEqual(["drawing.excalidraw"]);
    });

    it("closes the temp file handle when a write fails", async () => {
      const close = vi.fn((original) => original());
      spyOnFileHandle({ writeFile: () => Promise.reject(new Error("boom")), close });

      await expect(writeFileAtomic(target, "new")).rejects.toThrow("boom");

      expect(close).toHaveBeenCalledTimes(1);
    });

    it("still rethrows the original error if cleanup fails too", async () => {
      const error = new Error("rename failed");
      vi.spyOn(fs.promises, "rename").mockRejectedValue(error);
      vi.spyOn(fs.promises, "rm").mockRejectedValue(new Error("rm failed"));

      await expect(writeFileAtomic(target, "new")).rejects.toBe(error);
    });

    it("rejects without creating anything when the directory does not exist", async () => {
      const missing = path.join(tmpDir, "missing-dir", "a.excalidraw");
      await expect(writeFileAtomic(missing, "new")).rejects.toMatchObject({ code: "ENOENT" });
      expect(fs.readdirSync(tmpDir)).toEqual([]);
    });

    it("rejects and cleans up when the target is a directory", async () => {
      fs.mkdirSync(target);
      await expect(writeFileAtomic(target, "new")).rejects.toThrow();
      expect(fs.statSync(target).isDirectory()).toBe(true);
      expect(fs.readdirSync(tmpDir)).toEqual(["drawing.excalidraw"]);
    });
  });
});
