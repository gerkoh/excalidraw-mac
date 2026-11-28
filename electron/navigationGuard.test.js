import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import { EventEmitter } from "events";

const require = createRequire(import.meta.url);
const { isExternallyOpenable, isAppUrl, attachNavigationGuard } = require("./navigationGuard");

const APP_URL = "file:///Applications/excalidraw-mac.app/Contents/Resources/app/dist/index.html";

const ALLOWED = [
  "http://example.com",
  "https://libraries.excalidraw.com/?target=_excalidraw&referrer=x",
  "HTTPS://EXAMPLE.COM/path",
  "mailto:someone@example.com",
  "https://user:pass@example.com:8443/a?b=c#d",
];

const DENIED = [
  "file:///etc/passwd",
  "file:///Users/me/drawing.excalidraw",
  "javascript:alert(1)",
  " javascript:alert(1)",
  "JAVASCRIPT:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "blob:https://example.com/uuid",
  "vbscript:msgbox",
  "ftp://example.com",
  "ssh://example.com",
  "smb://server/share",
  "x-apple.systempreferences:com.apple.preference",
  "vscode://file/etc/passwd",
  "slack://open",
  "tel:+123456",
  "about:blank",
  "chrome://settings",
  "devtools://devtools",
  "",
  "not a url",
  "//example.com",
  "example.com",
];

describe("isExternallyOpenable", () => {
  it.each(ALLOWED)("allows %s", (url) => {
    expect(isExternallyOpenable(url)).toBe(true);
  });

  it.each(DENIED)("denies %j", (url) => {
    expect(isExternallyOpenable(url)).toBe(false);
  });

  it.each([[undefined], [null], [42], [{ href: "https://example.com" }]])(
    "denies non-string %j",
    (url) => {
      expect(isExternallyOpenable(url)).toBe(false);
    },
  );
});

describe("isAppUrl", () => {
  it("matches the app's own index", () => {
    expect(isAppUrl(APP_URL, APP_URL)).toBe(true);
  });

  it("matches the app's own index with a hash (in-page links)", () => {
    expect(isAppUrl(`${APP_URL}#json=abc`, APP_URL)).toBe(true);
  });

  it.each([
    ["another local file", "file:///etc/passwd"],
    ["a sibling file", APP_URL.replace("index.html", "other.html")],
    ["the index with a query string", `${APP_URL}?x=1`],
    ["a web page", "https://excalidraw.com"],
    ["a prefix of the app url", APP_URL.slice(0, -5)],
    ["non-string", undefined],
  ])("does not match %s", (_label, url) => {
    expect(isAppUrl(url, APP_URL)).toBe(false);
  });
});

describe("attachNavigationGuard", () => {
  let webContents;
  let openExternal;
  let windowOpenHandler;

  const navigate = (url) => {
    const event = { url, preventDefault: vi.fn() };
    webContents.emit("will-navigate", event, url);
    return event;
  };

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    webContents = new EventEmitter();
    webContents.setWindowOpenHandler = vi.fn((handler) => {
      windowOpenHandler = handler;
    });
    openExternal = vi.fn(() => Promise.resolve());
    attachNavigationGuard(webContents, { appUrl: APP_URL, openExternal });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("window.open (links, Browse libraries)", () => {
    it("installs a window open handler", () => {
      expect(webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);
    });

    it.each(ALLOWED)("opens %s in the system browser and denies the new window", (url) => {
      expect(windowOpenHandler({ url })).toEqual({ action: "deny" });
      expect(openExternal).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith(url);
    });

    it.each(DENIED)("denies %j without opening anything", (url) => {
      expect(windowOpenHandler({ url })).toEqual({ action: "deny" });
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("opens Excalidraw's Browse libraries URL externally", () => {
      const url =
        "https://libraries.excalidraw.com?target=_excalidraw&referrer=file%3A%2F%2F&useHash=true&token=abc&theme=light&version=2";
      windowOpenHandler({ url });
      expect(openExternal).toHaveBeenCalledWith(url);
    });

    it("denies even the app's own url as a new window", () => {
      expect(windowOpenHandler({ url: APP_URL })).toEqual({ action: "deny" });
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("logs, rather than throws, when the OS fails to open the URL", async () => {
      openExternal.mockRejectedValue(new Error("no handler"));
      expect(windowOpenHandler({ url: "https://example.com" })).toEqual({ action: "deny" });
      await vi.waitFor(() =>
        expect(console.error).toHaveBeenCalledWith(
          "[main] Failed to open URL externally:",
          "https://example.com",
          expect.any(Error),
        ),
      );
    });

    it("copes with an openExternal that returns nothing", () => {
      openExternal.mockReturnValue(undefined);
      expect(() => windowOpenHandler({ url: "https://example.com" })).not.toThrow();
    });
  });

  describe("will-navigate", () => {
    it("lets the app navigate to its own index (e.g. hash changes)", () => {
      const event = navigate(`${APP_URL}#scene`);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(openExternal).not.toHaveBeenCalled();
    });

    it.each(ALLOWED)("blocks navigating the app window to %s and opens it externally", (url) => {
      const event = navigate(url);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith(url);
    });

    it.each(DENIED)("blocks navigating to %j without opening anything", (url) => {
      const event = navigate(url);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(openExternal).not.toHaveBeenCalled();
    });

    it("falls back to the legacy url argument when the event has none", () => {
      const event = { preventDefault: vi.fn() };
      webContents.emit("will-navigate", event, "https://example.com");
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(openExternal).toHaveBeenCalledWith("https://example.com");
    });

    it("blocks when no url is given at all", () => {
      const event = { preventDefault: vi.fn() };
      webContents.emit("will-navigate", event);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(openExternal).not.toHaveBeenCalled();
    });
  });
});
