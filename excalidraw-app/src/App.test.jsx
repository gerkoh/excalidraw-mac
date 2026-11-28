import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, act, screen, cleanup } from "@testing-library/react";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { TITLE_BAR_HEIGHT, TRAFFIC_LIGHT_INSET } = require("../../electron/windowChrome.js");

// the real Excalidraw can't render in jsdom; capture the props App passes instead
const excalidrawProps = { current: null };
const canvases = new Map();
vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props) => {
    if (props.tabKey) canvases.set(props.tabKey, props);
    excalidrawProps.current = props;
    return null;
  },
  serializeAsJSON: vi.fn(() => "{}"),
  // scene snapshots hash the elements; the value only has to be stable
  hashElementsVersion: () => "0",
  // the real hook needs a live editor; App's own tests cover the props, not the library
  useHandleLibrary: () => {},
}));
vi.mock("@excalidraw/excalidraw/index.css", () => ({}));

const { default: App } = await import("./App");

let themeChangedHandler;
let chromeHandler;

const emptyTabs = { blank: false, openDialog: false, tabs: [], activeIndex: 0 };

const createElectronAPI = ({ theme = "light", lastPath = null, openTabs, files = {} } = {}) => {
  const noopSubscribe = vi.fn(() => () => {});
  const restored =
    openTabs ??
    (lastPath
      ? { blank: false, openDialog: false, tabs: [{ filePath: lastPath }], activeIndex: 0 }
      : emptyTabs);
  const api = {
    getConfig: vi.fn(() => Promise.resolve(null)),
    getPendingFile: vi.fn(() => Promise.resolve(null)),
    getLastPath: vi.fn(() => Promise.resolve(lastPath)),
    getOpenTabs: vi.fn(() => Promise.resolve(restored)),
    readFile: vi.fn((filePath) => Promise.resolve(files[filePath] ?? null)),
    writeFile: vi.fn(() => Promise.resolve(true)),
    openFileDialog: vi.fn(() => Promise.resolve(null)),
    saveFileDialog: vi.fn(() => Promise.resolve(null)),
    acknowledgeClose: vi.fn(),
    sendSaveAsResult: vi.fn(),
    confirmCloseTab: vi.fn(() => Promise.resolve("cancel")),
    confirmReplaceActive: vi.fn(() => Promise.resolve(true)),
    closeWindow: vi.fn(),
    onMenuNew: noopSubscribe,
    onMenuNewTab: noopSubscribe,
    onMenuCloseTab: noopSubscribe,
    onMenuOpen: noopSubscribe,
    onMenuSave: noopSubscribe,
    onMenuSaveAs: noopSubscribe,
    onOpenFile: noopSubscribe,
    onActivateTab: noopSubscribe,
    onSaveAsRequest: noopSubscribe,
    onBeforeClose: noopSubscribe,
    setDocumentState: vi.fn(),
    getLibrary: vi.fn(() => Promise.resolve(null)),
    saveLibrary: vi.fn(() => Promise.resolve(true)),
    takePendingLibraryInstalls: vi.fn(() => Promise.resolve([])),
    onLibraryInstallRequested: noopSubscribe,
    getTheme: vi.fn(() => Promise.resolve(theme)),
    setThemePreference: vi.fn(),
    onThemeChanged: vi.fn((callback) => {
      themeChangedHandler = callback;
      return () => {};
    }),
    onWindowChrome: vi.fn((callback) => {
      chromeHandler = callback;
      return () => {};
    }),
  };
  window.electronAPI = api;
  return api;
};

const renderReady = async (options) => {
  const api = createElectronAPI(options);
  render(<App />);
  await waitFor(() => expect(excalidrawProps.current).not.toBeNull());
  return api;
};

beforeEach(() => {
  excalidrawProps.current = null;
  canvases.clear();
  chromeHandler = undefined;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});

describe("App: theme", () => {
  it("doesn't mount Excalidraw until the theme is known", async () => {
    const api = createElectronAPI();
    api.getTheme.mockReturnValue(new Promise(() => {}));
    render(<App />);
    await waitFor(() => expect(api.getOpenTabs).toHaveBeenCalled());
    await act(async () => {});
    expect(excalidrawProps.current).toBeNull();
  });

  it.each(["light", "dark"])(
    "passes the effective %s theme as Excalidraw's theme prop",
    async (theme) => {
      await renderReady({ theme });
      expect(excalidrawProps.current.theme).toBe(theme);
    },
  );

  it("keeps Excalidraw's in-app theme toggle visible", async () => {
    await renderReady();
    expect(excalidrawProps.current.UIOptions.canvasActions.toggleTheme).toBe(true);
  });

  it("keeps the existing canvas actions disabled", async () => {
    await renderReady();
    expect(excalidrawProps.current.UIOptions.canvasActions).toMatchObject({
      loadScene: false,
      saveToActiveFile: false,
      export: false,
    });
  });

  it("applies one theme to every open canvas", async () => {
    const scene = JSON.stringify({ elements: [], appState: {} });
    await renderReady({
      theme: "light",
      openTabs: {
        blank: false,
        openDialog: false,
        tabs: [{ filePath: "/a.excalidraw" }, { filePath: "/b.excalidraw" }],
        activeIndex: 0,
      },
      files: { "/a.excalidraw": scene, "/b.excalidraw": scene },
    });
    await waitFor(() => expect(canvases.size).toBe(2));
    for (const props of canvases.values()) expect(props.theme).toBe("light");

    act(() => themeChangedHandler({}, "dark"));

    for (const props of canvases.values()) expect(props.theme).toBe("dark");
  });

  it("updates the theme prop when main reports a change", async () => {
    await renderReady({ theme: "light" });
    act(() => themeChangedHandler({}, "dark"));
    expect(excalidrawProps.current.theme).toBe("dark");
  });

  it("forwards an in-app toggle from onChange as an explicit preference", async () => {
    const api = await renderReady({ theme: "light" });
    act(() => excalidrawProps.current.onChange([], { theme: "light" }));
    act(() => excalidrawProps.current.onChange([], { theme: "dark" }));
    expect(api.setThemePreference).toHaveBeenCalledWith("dark");
  });

  it("doesn't set a preference when the theme prop drives the change", async () => {
    const api = await renderReady({ theme: "light" });
    act(() => excalidrawProps.current.onChange([], { theme: "light" }));
    act(() => themeChangedHandler({}, "dark"));
    act(() => excalidrawProps.current.onChange([], { theme: "dark" }));
    expect(api.setThemePreference).not.toHaveBeenCalled();
  });

  it("loads a dark-themed file without passing its theme to Excalidraw", async () => {
    const content = JSON.stringify({
      elements: [],
      appState: { theme: "dark", scrollX: 1, scrollY: 2 },
    });
    await renderReady({
      theme: "light",
      lastPath: "/a.excalidraw",
      files: { "/a.excalidraw": content },
    });
    expect(excalidrawProps.current.theme).toBe("light");
    expect(excalidrawProps.current.initialData.appState).not.toHaveProperty("theme");
  });
});

describe("App: window title", () => {
  it("reports the startup file to main", async () => {
    const api = await renderReady({
      lastPath: "/Users/me/diagram.excalidraw",
      files: { "/Users/me/diagram.excalidraw": JSON.stringify({ elements: [], appState: {} }) },
    });
    await waitFor(() =>
      expect(api.setDocumentState).toHaveBeenCalledWith(
        expect.objectContaining({
          tabs: [expect.objectContaining({ filePath: "/Users/me/diagram.excalidraw" })],
        }),
      ),
    );
  });

  it("reports untitled (null) when there is no file", async () => {
    const api = await renderReady();
    await waitFor(() =>
      expect(api.setDocumentState).toHaveBeenCalledWith(
        expect.objectContaining({
          tabs: [expect.objectContaining({ filePath: null })],
        }),
      ),
    );
  });

  it("reports untitled when the last file can't be read", async () => {
    const api = await renderReady({ lastPath: "/gone.excalidraw" });
    await waitFor(() =>
      expect(api.setDocumentState).toHaveBeenCalledWith(
        expect.objectContaining({
          tabs: [expect.objectContaining({ filePath: null })],
        }),
      ),
    );
    const reported = api.setDocumentState.mock.calls.flatMap(([state]) =>
      (state.tabs ?? []).map((tab) => tab.filePath),
    );
    expect(reported).not.toContain("/gone.excalidraw");
  });
});

describe("App: title bar", () => {
  it("keeps the tabs in the title-bar row, clear of the traffic lights", async () => {
    cleanup();
    await renderReady();
    const bar = screen.getByRole("tablist", { name: "Drawings" });
    expect(bar.style.height).toBe(`${TITLE_BAR_HEIGHT}px`);
    expect(bar.style.paddingLeft).toBe(`${TRAFFIC_LIGHT_INSET}px`);

    act(() => chromeHandler(null, { fullScreen: true }));
    expect(bar.style.paddingLeft).toBe("8px");

    act(() => chromeHandler(null, { fullScreen: false }));
    expect(bar.style.paddingLeft).toBe(`${TRAFFIC_LIGHT_INSET}px`);
  });

  it("names a tab after its file, and leaves an unsaved drawing Untitled", async () => {
    cleanup();
    await renderReady({ lastPath: "/Users/me/diagram.excalidraw" });
    expect(screen.getByRole("tab", { name: "diagram" }).textContent).toBe("diagram");

    cleanup();
    await renderReady();
    expect(screen.getByRole("tab", { name: "Untitled" }).textContent).toBe("Untitled");
  });
});
