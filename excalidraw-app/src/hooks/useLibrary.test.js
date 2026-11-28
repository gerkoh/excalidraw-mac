import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useHandleLibrary, loadLibraryFromBlob } from "@excalidraw/excalidraw";
import useLibrary, {
  libraryAdapter,
  installLibraryFromUrl,
  registerLibraryEditor,
  resetLibrarySync,
} from "./useLibrary";
import { isAllowedLibraryUrl } from "../../../shared/libraryUrl.mjs";

// keep the real loaders; only the persistence hook is replaced so its options can be inspected
vi.mock("@excalidraw/excalidraw", async (importOriginal) => ({
  ...(await importOriginal()),
  useHandleLibrary: vi.fn(),
}));

const LIBRARY_URL = "https://libraries.excalidraw.com/libraries/a/b.excalidrawlib";
const REQUEST = { libraryUrl: LIBRARY_URL, token: "editor-id" };

const element = (id) => ({
  id,
  type: "rectangle",
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  version: 1,
  versionNonce: 1,
});
const v1Library = JSON.stringify({
  type: "excalidrawlib",
  version: 1,
  library: [[element("a")], [element("b")]],
});
const v2Library = JSON.stringify({
  type: "excalidrawlib",
  version: 2,
  libraryItems: [{ id: "item-1", status: "published", created: 1, elements: [element("c")] }],
});

const okResponse = (body, overrides = {}) => ({
  ok: true,
  status: 200,
  redirected: false,
  url: LIBRARY_URL,
  blob: () => Promise.resolve(new Blob([body], { type: "application/json" })),
  ...overrides,
});

let excalidrawAPI;
let installedItems;
let onInstallRequested;
let unsubscribe;

// Mimics Excalidraw's updateLibrary: resolves the source (calling it if it's a
// function), validates it with the real loadLibraryFromBlob, then asks to confirm.
// A declined prompt resolves without changes, like Excalidraw's AbortError handling.
const createExcalidrawAPI = () => ({
  id: "editor-id",
  updateScene: vi.fn(),
  updateLibrary: vi.fn(async ({ libraryItems, prompt, defaultStatus }) => {
    const source = await (typeof libraryItems === "function" ? libraryItems([]) : libraryItems);
    const items = await loadLibraryFromBlob(source, defaultStatus);
    if (prompt && !window.confirm(`Add ${items.length} shape(s) to your library?`)) return [];
    installedItems = items;
    return items;
  }),
});

const createElectronAPI = ({ pending = [] } = {}) => {
  unsubscribe = vi.fn();
  const queue = [...pending];
  window.electronAPI = {
    getLibrary: vi.fn(() => Promise.resolve(null)),
    saveLibrary: vi.fn(() => Promise.resolve(true)),
    takePendingLibraryInstalls: vi.fn(() => Promise.resolve(queue.splice(0))),
    onLibraryInstallRequested: vi.fn((callback) => {
      onInstallRequested = callback;
      return unsubscribe;
    }),
  };
  return {
    // what main does on open-url: queue, then notify
    requestInstall: async (request) => {
      queue.push(request);
      await act(async () => {
        await onInstallRequested({ sender: {} });
      });
    },
  };
};

beforeEach(() => {
  resetLibrarySync();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(okResponse(v1Library))),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  excalidrawAPI = createExcalidrawAPI();
  installedItems = undefined;
  onInstallRequested = undefined;
  useHandleLibrary.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.electronAPI;
});

describe("libraryAdapter", () => {
  it("load() returns what the main process reads", async () => {
    createElectronAPI();
    const data = { libraryItems: [{ id: "a", elements: [] }] };
    window.electronAPI.getLibrary.mockResolvedValue(data);
    await expect(libraryAdapter.load({ source: "load" })).resolves.toBe(data);
    expect(window.electronAPI.getLibrary).toHaveBeenCalledWith();
  });

  it("load() resolves to null when there's no saved library", async () => {
    createElectronAPI();
    await expect(libraryAdapter.load({ source: "save" })).resolves.toBeNull();
  });

  it("load() rejects when the main process can't read the file, so Excalidraw aborts saves", async () => {
    createElectronAPI();
    window.electronAPI.getLibrary.mockRejectedValue(new Error("EACCES"));
    await expect(libraryAdapter.load({ source: "save" })).rejects.toThrow("EACCES");
  });

  it("save() sends only the items (never a path) to the main process", async () => {
    createElectronAPI();
    const libraryItems = [{ id: "a", elements: [] }];
    await libraryAdapter.save({ libraryItems });
    expect(window.electronAPI.saveLibrary).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.saveLibrary).toHaveBeenCalledWith(libraryItems);
  });

  it("save() throws when the main process reports failure, so Excalidraw shows an error", async () => {
    createElectronAPI();
    window.electronAPI.saveLibrary.mockResolvedValue(false);
    await expect(libraryAdapter.save({ libraryItems: [] })).rejects.toThrow(
      "Couldn't save the library to disk",
    );
  });

  it("pushes a save into every mounted editor and serves that copy to the next load", async () => {
    createElectronAPI();
    const libraryItems = [{ id: "a", elements: [] }];
    const first = { updateLibrary: vi.fn(() => libraryAdapter.save({ libraryItems })) };
    const second = { updateLibrary: vi.fn(() => Promise.resolve([])) };
    registerLibraryEditor(first);
    registerLibraryEditor(second);

    await libraryAdapter.save({ libraryItems });

    expect(window.electronAPI.saveLibrary).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.saveLibrary).toHaveBeenCalledWith(libraryItems);
    expect(first.updateLibrary).toHaveBeenCalledWith({
      libraryItems,
      merge: false,
      prompt: false,
      defaultStatus: "published",
    });
    expect(second.updateLibrary).toHaveBeenCalledTimes(1);
    window.electronAPI.getLibrary.mockClear();
    await expect(libraryAdapter.load()).resolves.toBe(libraryItems);
    expect(window.electronAPI.getLibrary).not.toHaveBeenCalled();
  });

  it("save() propagates IPC errors", async () => {
    createElectronAPI();
    window.electronAPI.saveLibrary.mockRejectedValue(new Error("ipc down"));
    await expect(libraryAdapter.save({ libraryItems: [] })).rejects.toThrow("ipc down");
  });
});

describe("installLibraryFromUrl", () => {
  it("merges via updateLibrary with a prompt and opens the library sidebar", async () => {
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(true);
    expect(excalidrawAPI.updateLibrary).toHaveBeenCalledTimes(1);
    expect(excalidrawAPI.updateLibrary).toHaveBeenCalledWith({
      libraryItems: expect.any(Function),
      prompt: true,
      merge: true,
      defaultStatus: "published",
      openLibraryMenu: true,
    });
  });

  it("downloads only when Excalidraw runs the update (inside its queue)", async () => {
    excalidrawAPI.updateLibrary.mockResolvedValue([]);
    await installLibraryFromUrl(excalidrawAPI, REQUEST);
    expect(fetch).not.toHaveBeenCalled();

    const { libraryItems } = excalidrawAPI.updateLibrary.mock.calls[0][0];
    await libraryItems([]);
    expect(fetch).toHaveBeenCalledWith(LIBRARY_URL, { credentials: "omit" });
  });

  it("installs a v1 library from the site", async () => {
    await installLibraryFromUrl(excalidrawAPI, REQUEST);
    expect(installedItems).toHaveLength(2);
    expect(installedItems.map((item) => item.elements[0].id)).toEqual(["a", "b"]);
    expect(installedItems.every((item) => item.status === "published")).toBe(true);
  });

  it("installs a v2 library", async () => {
    fetch.mockResolvedValue(okResponse(v2Library));
    await installLibraryFromUrl(excalidrawAPI, REQUEST);
    expect(installedItems).toHaveLength(1);
    expect(installedItems[0].id).toBe("item-1");
  });

  it("always prompts, even when the token matches this editor", async () => {
    await installLibraryFromUrl(excalidrawAPI, { ...REQUEST, token: excalidrawAPI.id });
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(excalidrawAPI.updateLibrary.mock.calls[0][0].prompt).toBe(true);
  });

  it.each([
    ["a missing token", null],
    ["a token from another session", "other-session"],
  ])("still installs (after the prompt) with %s", async (_label, token) => {
    await expect(installLibraryFromUrl(excalidrawAPI, { ...REQUEST, token })).resolves.toBe(true);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(installedItems).toHaveLength(2);
  });

  it("adds nothing when the user declines", async () => {
    window.confirm.mockReturnValue(false);
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(true);
    expect(installedItems).toBeUndefined();
    expect(excalidrawAPI.updateScene).not.toHaveBeenCalled();
  });

  it.each([
    ["http", "http://libraries.excalidraw.com/libraries/a/b.excalidrawlib"],
    ["another host", "https://evil.com/a.excalidrawlib"],
    ["a lookalike host", "https://libraries.excalidraw.com.evil.com/a.excalidrawlib"],
    ["the host in the path", "https://evil.com/libraries.excalidraw.com/a.excalidrawlib"],
    ["javascript:", "javascript:alert(1)"],
    ["file:", "file:///etc/passwd"],
    ["a non-string", undefined],
  ])("rejects %s without fetching or prompting", async (_label, libraryUrl) => {
    await expect(installLibraryFromUrl(excalidrawAPI, { libraryUrl, token: null })).resolves.toBe(
      false,
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(excalidrawAPI.updateLibrary).not.toHaveBeenCalled();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      "[useLibrary] Rejected library install from disallowed URL:",
      libraryUrl,
    );
  });

  it("shows an error and adds nothing when the download fails", async () => {
    fetch.mockResolvedValue(okResponse("", { ok: false, status: 404 }));
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(excalidrawAPI.updateScene).toHaveBeenCalledWith({
      appState: { errorMessage: "Couldn't download library (HTTP 404)" },
    });
  });

  it("shows an error when the network request rejects", async () => {
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(false);
    expect(excalidrawAPI.updateScene).toHaveBeenCalledWith({
      appState: { errorMessage: "Failed to fetch" },
    });
  });

  it("refuses a download that redirected off the allowed host", async () => {
    fetch.mockResolvedValue(
      okResponse(v1Library, { redirected: true, url: "https://evil.com/a.excalidrawlib" }),
    );
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(installedItems).toBeUndefined();
    expect(excalidrawAPI.updateScene.mock.calls[0][0].appState.errorMessage).toMatch(
      /redirected to a disallowed URL/,
    );
  });

  it("accepts a redirect that stays on the allowed host", async () => {
    fetch.mockResolvedValue(
      okResponse(v1Library, {
        redirected: true,
        url: "https://libraries.excalidraw.com/libraries/a/b-v2.excalidrawlib",
      }),
    );
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(true);
    expect(installedItems).toHaveLength(2);
  });

  it.each([
    ["not JSON", "<html>not a library</html>"],
    ["a drawing, not a library", JSON.stringify({ type: "excalidraw", version: 2, elements: [] })],
    [
      "an unknown library version",
      JSON.stringify({ type: "excalidrawlib", version: 9, libraryItems: [] }),
    ],
  ])("rejects a payload that is %s, before prompting", async (_label, body) => {
    fetch.mockResolvedValue(okResponse(body));
    await expect(installLibraryFromUrl(excalidrawAPI, REQUEST)).resolves.toBe(false);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(installedItems).toBeUndefined();
    expect(excalidrawAPI.updateScene).toHaveBeenCalledWith({
      appState: { errorMessage: expect.any(String) },
    });
  });
});

describe("useLibrary", () => {
  it("wires Excalidraw's library persistence to the IPC adapter with the strict URL check", () => {
    createElectronAPI();
    renderHook(() => useLibrary({ excalidrawAPI }));
    expect(useHandleLibrary).toHaveBeenCalledWith({
      excalidrawAPI,
      adapter: libraryAdapter,
      validateLibraryUrl: isAllowedLibraryUrl,
    });
  });

  it("passes a validator that rejects URLs Excalidraw's default would allow", () => {
    createElectronAPI();
    renderHook(() => useLibrary({ excalidrawAPI }));
    const { validateLibraryUrl } = useHandleLibrary.mock.calls[0][0];
    expect(validateLibraryUrl("https://evil.excalidraw.com/a.excalidrawlib")).toBe(false);
    expect(validateLibraryUrl("http://libraries.excalidraw.com/a.excalidrawlib")).toBe(false);
    expect(validateLibraryUrl(LIBRARY_URL)).toBe(true);
  });

  it("does nothing with installs until the editor is ready", () => {
    createElectronAPI({ pending: [REQUEST] });
    renderHook(() => useLibrary({ excalidrawAPI: null }));
    expect(useHandleLibrary).toHaveBeenCalledWith(expect.objectContaining({ excalidrawAPI: null }));
    expect(window.electronAPI.onLibraryInstallRequested).not.toHaveBeenCalled();
    expect(window.electronAPI.takePendingLibraryInstalls).not.toHaveBeenCalled();
  });

  it("installs requests queued before the editor mounted (app launched by the URL)", async () => {
    createElectronAPI({ pending: [REQUEST] });
    renderHook(() => useLibrary({ excalidrawAPI }));
    await waitFor(() => expect(installedItems).toHaveLength(2));
    expect(excalidrawAPI.updateLibrary).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(LIBRARY_URL, { credentials: "omit" });
  });

  it("installs several queued requests one after another", async () => {
    const second = "https://libraries.excalidraw.com/libraries/c/d.excalidrawlib";
    createElectronAPI({ pending: [REQUEST, { libraryUrl: second, token: null }] });
    renderHook(() => useLibrary({ excalidrawAPI }));
    await waitFor(() => expect(excalidrawAPI.updateLibrary).toHaveBeenCalledTimes(2));
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([LIBRARY_URL, second]);
  });

  it("installs when the main process signals a new request", async () => {
    const { requestInstall } = createElectronAPI();
    renderHook(() => useLibrary({ excalidrawAPI }));
    await waitFor(() => expect(window.electronAPI.takePendingLibraryInstalls).toHaveBeenCalled());
    expect(excalidrawAPI.updateLibrary).not.toHaveBeenCalled();

    await requestInstall(REQUEST);

    expect(excalidrawAPI.updateLibrary).toHaveBeenCalledTimes(1);
    expect(installedItems).toHaveLength(2);
  });

  it("subscribes before draining, so a request between the two isn't missed", () => {
    createElectronAPI();
    renderHook(() => useLibrary({ excalidrawAPI }));
    const subscribeOrder = window.electronAPI.onLibraryInstallRequested.mock.invocationCallOrder[0];
    const takeOrder = window.electronAPI.takePendingLibraryInstalls.mock.invocationCallOrder[0];
    expect(subscribeOrder).toBeLessThan(takeOrder);
  });

  it("skips disallowed requests and continues with the rest", async () => {
    createElectronAPI({
      pending: [{ libraryUrl: "https://evil.com/a.excalidrawlib", token: null }, REQUEST],
    });
    renderHook(() => useLibrary({ excalidrawAPI }));
    await waitFor(() => expect(excalidrawAPI.updateLibrary).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(LIBRARY_URL, { credentials: "omit" });
  });

  it("logs and survives when taking pending installs fails", async () => {
    createElectronAPI();
    window.electronAPI.takePendingLibraryInstalls.mockRejectedValue(new Error("ipc down"));
    renderHook(() => useLibrary({ excalidrawAPI }));
    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith(
        "[useLibrary] Failed to process library installs:",
        expect.any(Error),
      ),
    );
    expect(excalidrawAPI.updateLibrary).not.toHaveBeenCalled();
  });

  it("unsubscribes on unmount", () => {
    createElectronAPI();
    const { unmount } = renderHook(() => useLibrary({ excalidrawAPI }));
    expect(unsubscribe).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("resubscribes with the new editor when the editor remounts", async () => {
    createElectronAPI();
    const { rerender } = renderHook((props) => useLibrary(props), {
      initialProps: { excalidrawAPI },
    });
    const nextAPI = createExcalidrawAPI();
    rerender({ excalidrawAPI: nextAPI });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(window.electronAPI.onLibraryInstallRequested).toHaveBeenCalledTimes(2);

    window.electronAPI.takePendingLibraryInstalls.mockResolvedValue([REQUEST]);
    await act(async () => {
      await onInstallRequested({ sender: {} });
    });
    expect(nextAPI.updateLibrary).toHaveBeenCalledTimes(1);
    expect(excalidrawAPI.updateLibrary).not.toHaveBeenCalled();
  });
});
