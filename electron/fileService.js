const fs = require("fs");

// --- Path Validation ---

const isAllowedPath = (filePath) => {
  return typeof filePath === "string" && filePath.endsWith(".excalidraw");
};

// --- Config ---

// read config from file
const readConfig = (configPath) => {
  try {
    const content = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    console.error("[main] Failed to read config:", err);
    return null;
  }
};

// --- Drawings ---

// returns file content, or null if the path is disallowed, missing or unreadable
const readDrawing = (filePath) => {
  try {
    if (!isAllowedPath(filePath)) {
      console.error("[main] Rejected read for disallowed path:", filePath);
      return null;
    }
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    console.error("[main] Failed to read file:", filePath, err);
    return null;
  }
};

// returns true on success, false if the path is disallowed or the write fails
const writeDrawing = (filePath, content) => {
  try {
    if (!isAllowedPath(filePath)) {
      console.error("[main] Rejected write for disallowed path:", filePath);
      return false;
    }
    fs.writeFileSync(filePath, content, "utf-8");
    return true;
  } catch (err) {
    console.error("[main] Failed to write file:", filePath, err);
    return false;
  }
};

module.exports = { isAllowedPath, readConfig, readDrawing, writeDrawing };
