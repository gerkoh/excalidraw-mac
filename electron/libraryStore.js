const fs = require("fs");
const path = require("path");
const { writeFileAtomic } = require("./atomicWrite");

const LIBRARY_FILE_NAME = "library.excalidrawlib";
const LIBRARY_SOURCE = "excalidraw-mac";

const getLibraryPath = (userDataDir) => path.join(userDataDir, LIBRARY_FILE_NAME);
const getLibraryBackupPath = (libraryPath) => `${libraryPath}.bak`;

const isPlainObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// v1 files store each item as a bare array of elements;
// v2 files store { id, status, created, elements, ... }
const isValidLibraryItem = (item) =>
  (Array.isArray(item) && item.every(isPlainObject)) ||
  (isPlainObject(item) && Array.isArray(item.elements) && item.elements.every(isPlainObject));

const isValidLibraryItems = (libraryItems) =>
  Array.isArray(libraryItems) && libraryItems.every(isValidLibraryItem);

// Returns the library items of a v1 ({ library }) or v2 ({ libraryItems }) file,
// or null if the content isn't a library file we can trust.
// The format check matches Excalidraw's own `isValidLibrary`.
const parseLibraryFile = (content) => {
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isPlainObject(data) || data.type !== "excalidrawlib") return null;
  if (data.version !== 1 && data.version !== 2) return null;
  const libraryItems = data.libraryItems || data.library;
  return isValidLibraryItems(libraryItems) ? libraryItems : null;
};

const serializeLibrary = (libraryItems) =>
  JSON.stringify(
    { type: "excalidrawlib", version: 2, source: LIBRARY_SOURCE, libraryItems },
    null,
    2,
  );

// Returns { libraryItems }, or null when there is no usable library yet:
// - missing file: null
// - corrupt file: copied to `<file>.bak`, then null. The corrupt file itself is
//   left alone; it's only replaced once the user changes the library.
// Throws when the file exists but can't be read (or a corrupt file can't be
// backed up), so Excalidraw also aborts saves instead of overwriting it.
const readLibrary = async (libraryPath) => {
  let content;
  try {
    content = await fs.promises.readFile(libraryPath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    console.error("[main] Failed to read library:", libraryPath, err);
    throw err;
  }

  const libraryItems = parseLibraryFile(content);
  if (libraryItems) return { libraryItems };

  const backupPath = getLibraryBackupPath(libraryPath);
  console.error("[main] Library file is corrupt, starting empty. Backing up to:", backupPath);
  await fs.promises.copyFile(libraryPath, backupPath);
  return null;
};

// Writes the items in the standard v2 .excalidrawlib format.
// Throws on invalid items (the file is left untouched) or if the write fails.
const writeLibrary = async (libraryPath, libraryItems) => {
  if (!isValidLibraryItems(libraryItems)) {
    throw new TypeError("Refusing to save invalid library items");
  }
  await fs.promises.mkdir(path.dirname(libraryPath), { recursive: true });
  await writeFileAtomic(libraryPath, serializeLibrary(libraryItems));
};

module.exports = {
  LIBRARY_FILE_NAME,
  LIBRARY_SOURCE,
  getLibraryPath,
  getLibraryBackupPath,
  isValidLibraryItems,
  parseLibraryFile,
  serializeLibrary,
  readLibrary,
  writeLibrary,
};
