// Shared by the main process (loaded with require(), like electron-store) and
// the renderer (bundled by Vite), so it must stay plain ESM with no imports.

// custom URL scheme registered with macOS; must match `build.protocols` in package.json
export const LIBRARY_PROTOCOL = "excalidraw-mac";
export const LIBRARY_INSTALL_ACTION = "addlibrary";
// passed to <Excalidraw libraryReturnUrl>; libraries.excalidraw.com redirects to
// `${LIBRARY_RETURN_URL}#addLibrary=<encoded library url>&token=<editor id>`
export const LIBRARY_RETURN_URL = `${LIBRARY_PROTOCOL}://${LIBRARY_INSTALL_ACTION}`;

export const LIBRARY_HOST = "libraries.excalidraw.com";

// Only https://libraries.excalidraw.com on the default port, without credentials.
// Stricter than Excalidraw's built-in default, which allows any *.excalidraw.com
// host over any protocol.
export const isAllowedLibraryUrl = (libraryUrl) => {
  if (typeof libraryUrl !== "string") return false;
  let url;
  try {
    url = new URL(libraryUrl);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === LIBRARY_HOST &&
    url.port === "" &&
    url.username === "" &&
    url.password === ""
  );
};

// Mirrors Excalidraw's own install handling, which decodes once more after
// URLSearchParams in case the library URL was double-encoded.
const decodeLibraryUrl = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
};

// Parses `excalidraw-mac://addlibrary#addLibrary=<url>&token=<token>` (or the
// legacy `?addLibrary=` query form) into { libraryUrl, token }.
// Returns null unless the URL is an install request for an allowed library URL.
export const parseLibraryInstallUrl = (installUrl) => {
  if (typeof installUrl !== "string") return null;
  let url;
  try {
    url = new URL(installUrl);
  } catch {
    return null;
  }
  if (url.protocol !== `${LIBRARY_PROTOCOL}:`) return null;
  // non-special schemes keep the host's case, so compare case-insensitively
  if (url.hostname.toLowerCase() !== LIBRARY_INSTALL_ACTION) return null;
  if (url.pathname !== "" && url.pathname !== "/") return null;

  const hashParams = new URLSearchParams(url.hash.slice(1));
  const params = hashParams.has("addLibrary") ? hashParams : url.searchParams;
  const rawLibraryUrl = params.get("addLibrary");
  if (!rawLibraryUrl) return null;

  const libraryUrl = decodeLibraryUrl(rawLibraryUrl);
  if (!isAllowedLibraryUrl(libraryUrl)) return null;

  return { libraryUrl, token: params.get("token") || null };
};
