import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  LIBRARY_PROTOCOL,
  LIBRARY_RETURN_URL,
  LIBRARY_HOST,
  isAllowedLibraryUrl,
  parseLibraryInstallUrl,
} from "./libraryUrl.mjs";

const LIBRARY_URL =
  "https://libraries.excalidraw.com/libraries/youritjang/software-architecture.excalidrawlib";

// what libraries.excalidraw.com builds: `${referrer}#addLibrary=${encodeURIComponent(url)}&token=${token}`
const installUrl = (libraryUrl, { token = "editor-id", query = false } = {}) => {
  const params = `addLibrary=${encodeURIComponent(libraryUrl)}${token ? `&token=${token}` : ""}`;
  return `${LIBRARY_RETURN_URL}${query ? "?" : "#"}${params}`;
};

describe("constants", () => {
  it("builds the return URL from the protocol and install action", () => {
    expect(LIBRARY_PROTOCOL).toBe("excalidraw-mac");
    expect(LIBRARY_RETURN_URL).toBe("excalidraw-mac://addlibrary");
    expect(LIBRARY_HOST).toBe("libraries.excalidraw.com");
  });

  it("registers the same scheme with electron-builder (Info.plist CFBundleURLTypes)", () => {
    const packageJsonPath = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const { build } = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    const schemes = build.protocols.flatMap((protocol) => protocol.schemes);
    expect(schemes).toEqual([LIBRARY_PROTOCOL]);
  });
});

describe("isAllowedLibraryUrl", () => {
  it.each([
    LIBRARY_URL,
    "https://libraries.excalidraw.com/",
    "https://libraries.excalidraw.com",
    "https://libraries.excalidraw.com/libraries/a/b.excalidrawlib?v=2#frag",
    // default port and host casing are normalised by URL
    "https://libraries.excalidraw.com:443/libraries/a/b.excalidrawlib",
    "https://LIBRARIES.Excalidraw.COM/libraries/a/b.excalidrawlib",
  ])("allows %s", (url) => {
    expect(isAllowedLibraryUrl(url)).toBe(true);
  });

  it.each([
    ["http (not https)", "http://libraries.excalidraw.com/libraries/a/b.excalidrawlib"],
    ["other excalidraw host", "https://excalidraw.com/libraries/a/b.excalidrawlib"],
    ["other excalidraw subdomain", "https://evil.excalidraw.com/a.excalidrawlib"],
    ["subdomain of the library host", "https://x.libraries.excalidraw.com/a.excalidrawlib"],
    ["lookalike suffix host", "https://libraries.excalidraw.com.evil.com/a.excalidrawlib"],
    ["lookalike prefix host", "https://evillibraries.excalidraw.com/a.excalidrawlib"],
    ["lookalike hyphenated host", "https://evil-libraries.excalidraw.com/a.excalidrawlib"],
    ["host in the path", "https://evil.com/libraries.excalidraw.com/a.excalidrawlib"],
    ["host in the query", "https://evil.com/?u=https://libraries.excalidraw.com/a"],
    ["host as userinfo", "https://libraries.excalidraw.com@evil.com/a.excalidrawlib"],
    ["credentials", "https://user:pass@libraries.excalidraw.com/a.excalidrawlib"],
    ["username only", "https://user@libraries.excalidraw.com/a.excalidrawlib"],
    ["non-default port", "https://libraries.excalidraw.com:8443/a.excalidrawlib"],
    ["trailing-dot host", "https://libraries.excalidraw.com./a.excalidrawlib"],
    ["punycode lookalike", "https://xn--librries-9za.excalidraw.com/a.excalidrawlib"],
    [
      "github raw (trusted upstream, not here)",
      "https://raw.githubusercontent.com/excalidraw/excalidraw-libraries/main/a.excalidrawlib",
    ],
    ["javascript:", "javascript:alert(1)//libraries.excalidraw.com"],
    ["file:", "file:///etc/passwd"],
    ["file: with the host", "file://libraries.excalidraw.com/a.excalidrawlib"],
    ["data:", "data:application/json,{}"],
    ["ftp:", "ftp://libraries.excalidraw.com/a.excalidrawlib"],
    ["our own scheme", "excalidraw-mac://libraries.excalidraw.com/a"],
    ["protocol-relative", "//libraries.excalidraw.com/a.excalidrawlib"],
    ["relative path", "/libraries/a/b.excalidrawlib"],
    ["bare host", "libraries.excalidraw.com/a.excalidrawlib"],
    ["empty string", ""],
    ["not a URL", "not a url"],
  ])("rejects %s", (_label, url) => {
    expect(isAllowedLibraryUrl(url)).toBe(false);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["a URL object", new URL(LIBRARY_URL)],
    ["an array", [LIBRARY_URL]],
  ])("rejects %s (non-string)", (_label, value) => {
    expect(isAllowedLibraryUrl(value)).toBe(false);
  });
});

describe("parseLibraryInstallUrl", () => {
  it("parses the hash form libraries.excalidraw.com redirects to", () => {
    expect(parseLibraryInstallUrl(installUrl(LIBRARY_URL, { token: "abc123" }))).toEqual({
      libraryUrl: LIBRARY_URL,
      token: "abc123",
    });
  });

  it("parses the legacy query form", () => {
    expect(parseLibraryInstallUrl(installUrl(LIBRARY_URL, { query: true }))).toEqual({
      libraryUrl: LIBRARY_URL,
      token: "editor-id",
    });
  });

  it("prefers the hash over the query when both are present", () => {
    const other = "https://libraries.excalidraw.com/libraries/other/lib.excalidrawlib";
    const url = `${LIBRARY_RETURN_URL}?addLibrary=${encodeURIComponent(other)}#addLibrary=${encodeURIComponent(LIBRARY_URL)}`;
    expect(parseLibraryInstallUrl(url).libraryUrl).toBe(LIBRARY_URL);
  });

  it("returns a null token when it's missing", () => {
    expect(parseLibraryInstallUrl(installUrl(LIBRARY_URL, { token: null }))).toEqual({
      libraryUrl: LIBRARY_URL,
      token: null,
    });
  });

  it("returns a null token when it's empty", () => {
    const url = `${LIBRARY_RETURN_URL}#addLibrary=${encodeURIComponent(LIBRARY_URL)}&token=`;
    expect(parseLibraryInstallUrl(url).token).toBeNull();
  });

  it("accepts an unencoded library URL", () => {
    expect(
      parseLibraryInstallUrl(`${LIBRARY_RETURN_URL}#addLibrary=${LIBRARY_URL}`).libraryUrl,
    ).toBe(LIBRARY_URL);
  });

  it("decodes a double-encoded library URL, like Excalidraw does", () => {
    const url = `${LIBRARY_RETURN_URL}#addLibrary=${encodeURIComponent(encodeURIComponent(LIBRARY_URL))}`;
    expect(parseLibraryInstallUrl(url).libraryUrl).toBe(LIBRARY_URL);
  });

  it("keeps encoded characters in the library path usable", () => {
    const withSpace = "https://libraries.excalidraw.com/libraries/a/my%20lib.excalidrawlib";
    const parsed = parseLibraryInstallUrl(installUrl(withSpace));
    expect(parsed.libraryUrl).toBe(
      "https://libraries.excalidraw.com/libraries/a/my lib.excalidrawlib",
    );
    expect(isAllowedLibraryUrl(parsed.libraryUrl)).toBe(true);
  });

  it("rejects a library URL with malformed percent-encoding", () => {
    const url = `${LIBRARY_RETURN_URL}#addLibrary=${encodeURIComponent("https://libraries.excalidraw.com/%E0%A4%A")}`;
    expect(parseLibraryInstallUrl(url)).toBeNull();
  });

  it.each([
    ["action in a different case", "excalidraw-mac://AddLibrary#addLibrary="],
    ["trailing slash", "excalidraw-mac://addlibrary/#addLibrary="],
  ])("accepts the %s", (_label, prefix) => {
    expect(parseLibraryInstallUrl(`${prefix}${encodeURIComponent(LIBRARY_URL)}`)).toEqual({
      libraryUrl: LIBRARY_URL,
      token: null,
    });
  });

  it.each([
    ["http library URL", installUrl("http://libraries.excalidraw.com/a.excalidrawlib")],
    ["other host", installUrl("https://evil.com/a.excalidrawlib")],
    ["lookalike host", installUrl("https://libraries.excalidraw.com.evil.com/a.excalidrawlib")],
    ["host in path", installUrl("https://evil.com/libraries.excalidraw.com/a.excalidrawlib")],
    ["javascript: library URL", installUrl("javascript:alert(1)")],
    ["file: library URL", installUrl("file:///etc/passwd")],
    ["missing addLibrary", `${LIBRARY_RETURN_URL}#token=abc`],
    ["empty addLibrary", `${LIBRARY_RETURN_URL}#addLibrary=&token=abc`],
    ["no params at all", LIBRARY_RETURN_URL],
    ["unknown action", `excalidraw-mac://open#addLibrary=${encodeURIComponent(LIBRARY_URL)}`],
    [
      "extra path",
      `excalidraw-mac://addlibrary/evil#addLibrary=${encodeURIComponent(LIBRARY_URL)}`,
    ],
    ["other scheme", `https://addlibrary#addLibrary=${encodeURIComponent(LIBRARY_URL)}`],
    [
      "lookalike scheme",
      `excalidraw-macx://addlibrary#addLibrary=${encodeURIComponent(LIBRARY_URL)}`,
    ],
    ["not a URL", "not a url"],
    ["empty string", ""],
  ])("rejects %s", (_label, url) => {
    expect(parseLibraryInstallUrl(url)).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["an object", { url: installUrl(LIBRARY_URL) }],
  ])("rejects %s (non-string)", (_label, value) => {
    expect(parseLibraryInstallUrl(value)).toBeNull();
  });
});
