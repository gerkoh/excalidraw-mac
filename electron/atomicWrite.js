const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// hidden sibling of the target, so the final rename never crosses a filesystem boundary
const tempPathFor = (filePath) => {
  const suffix = crypto.randomBytes(6).toString("hex");
  return path.join(path.dirname(filePath), `.${path.basename(filePath)}.${suffix}.tmp`);
};

// follow a symlinked target so the rename replaces the real file, not the link
const resolveTarget = async (filePath) => {
  try {
    return await fs.promises.realpath(filePath);
  } catch (err) {
    if (err.code === "ENOENT") return filePath;
    throw err;
  }
};

// keep the existing file's permissions; new files get the default mode
const existingMode = async (filePath) => {
  try {
    return (await fs.promises.stat(filePath)).mode;
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
};

// Writes content to a temp file next to the target, fsyncs it, then renames it over the target.
// The target is either fully replaced or left untouched; the temp file is removed on failure.
const writeFileAtomic = async (filePath, content) => {
  const targetPath = await resolveTarget(filePath);
  const mode = await existingMode(targetPath);
  const tempPath = tempPathFor(targetPath);

  let handle = null;
  try {
    handle = await fs.promises.open(tempPath, "wx");
    await handle.writeFile(content, "utf-8");
    if (mode !== null) await handle.chmod(mode & 0o7777);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.promises.rename(tempPath, targetPath);
  } catch (err) {
    if (handle) await handle.close().catch(() => {});
    await fs.promises.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
};

module.exports = { writeFileAtomic, tempPathFor };
