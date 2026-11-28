import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, waitFor, act } from "@testing-library/react";

// the real Excalidraw can't render in jsdom; capture the props App passes instead
const excalidrawProps = { current: null };
vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: (props) => {
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

const createElectronAPI = ({ theme = "light", lastPath = null, files = {} } = {}) => {
  const noopSubscribe = vi.fn(() => () => {});
  const api = {
    getConfig: vi.fn(() => Promise.resolve(null)),
    getPendingFile: vi.fn(() => Promise.resolve(null)),
    getLastPath: vi.fn(() => Promise.resolve(lastPath)),
    readFile: vi.fn((filePath) => Promise.resolve(files[filePath] ?? null)),
    writeFile: vi.fn(() => Promise.resolve(true)),
    openFileDialog: vi.fn(() => Promise.resolve(null)),
    saveFileDialog: vi.fn(() => Promise.resolve(null)),
    acknowledgeClose: vi.fn(),
    onMenuNew: noopSubscribe,
    onMenuOpen: noopSubscribe,
    onMenuSave: noopSubscribe,
    onMenuSaveAs: noopSubscribe,
    onOpenFile: noopSubscribe,
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
    await waitFor(() => expect(api.getLastPath).toHaveBeenCalled());
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
        expect.objectContaining({ filePath: "/Users/me/diagram.excalidraw" }),
      ),
    );
    expect(api.setDocumentState).toHaveBeenCalledTimes(1);
  });

  it("reports untitled (null) when there is no file, without a prior report", async () => {
    const api = await renderReady();
    await waitFor(() =>
      expect(api.setDocumentState).toHaveBeenCalledWith(
        expect.objectContaining({ filePath: null }),
      ),
    );
    expect(api.setDocumentState).toHaveBeenCalledTimes(1);
  });

  it("reports untitled when the last file can't be read", async () => {
    const api = await renderReady({ lastPath: "/gone.excalidraw" });
    await waitFor(() =>
      expect(api.setDocumentState).toHaveBeenCalledWith(
        expect.objectContaining({ filePath: null }),
      ),
    );
    expect(api.setDocumentState).not.toHaveBeenCalledWith(
      expect.objectContaining({ filePath: "/gone.excalidraw" }),
    );
  });
});
