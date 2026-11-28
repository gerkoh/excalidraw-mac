const fs = require("fs");
const { writeFileAtomic } = require("./atomicWrite");

// --- Path Validation ---

const isAllowedPath = (filePath) => {
  return typeof filePath === "string" && filePath.endsWith(".excalidraw");
};

// --- Config ---

// read config from file
const readConfig = async (configPath) => {
  try {
    const content = await fs.promises.readFile(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("[main] Failed to read config:", err);
    return null;
  }
};

// --- Drawings ---

// returns file content, or null if the path is disallowed, missing or unreadable
const readDrawing = async (filePath) => {
  if (!isAllowedPath(filePath)) {
    console.error("[main] Rejected read for disallowed path:", filePath);
    return null;
  }
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch (err) {
    if (err.code !== "ENOENT") console.error("[main] Failed to read file:", filePath, err);
    return null;
  }
};

// every drawing write (auto-save, ⌘S, Save As, before switch/close) goes through here.
// returns true on success, false if the path or content is rejected or the write fails
const writeDrawing = async (filePath, content) => {
  if (!isAllowedPath(filePath)) {
    console.error("[main] Rejected write for disallowed path:", filePath);
    return false;
  }
  if (typeof content !== "string") {
    console.error("[main] Rejected write with non-string content:", filePath);
    return false;
  }
  try {
    await writeFileAtomic(filePath, content);
    return true;
  } catch (err) {
    console.error("[main] Failed to write file:", filePath, err);
    return false;
  }
};

module.exports = { isAllowedPath, readConfig, readDrawing, writeDrawing };
