import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import useTheme from "./useTheme";

let themeChangedHandler;
let unsubscribe;

const createElectronAPI = ({ getTheme = () => Promise.resolve("light") } = {}) => {
  themeChangedHandler = undefined;
  unsubscribe = vi.fn();
  const api = {
    getTheme: vi.fn(getTheme),
    setThemePreference: vi.fn(),
    onThemeChanged: vi.fn((callback) => {
      themeChangedHandler = callback;
      return unsubscribe;
    }),
  };
  window.electronAPI = api;
  return api;
};

// main -> renderer "theme-changed"
const emitThemeChanged = (theme) => act(() => themeChangedHandler({ sender: {} }, theme));

const renderLoaded = async (initial = "light") => {
  const api = createElectronAPI({ getTheme: () => Promise.resolve(initial) });
  const rendered = renderHook(() => useTheme());
  await waitFor(() => expect(rendered.result.current.theme).toBe(initial));
  return { api, ...rendered };
};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete window.electronAPI;
  vi.restoreAllMocks();
});

describe("useTheme: effective theme from main", () => {
  it("is undefined until main answers so Excalidraw never mounts in the wrong theme", () => {
    createElectronAPI({ getTheme: () => new Promise(() => {}) });
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBeUndefined();
  });

  it.each(["light", "dark"])("uses the initial %s theme from getTheme", async (initial) => {
    const { api } = await renderLoaded(initial);
    expect(api.getTheme).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null, "system", "sepia"])(
    "falls back to light for an unknown initial theme (%j)",
    async (initial) => {
      createElectronAPI({ getTheme: () => Promise.resolve(initial) });
      const { result } = renderHook(() => useTheme());
      await waitFor(() => expect(result.current.theme).toBe("light"));
    },
  );

  it("falls back to light and logs when getTheme fails", async () => {
    createElectronAPI({ getTheme: () => Promise.reject(new Error("ipc down")) });
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current.theme).toBe("light"));
    expect(console.error).toHaveBeenCalled();
  });

  it("follows theme-changed events", async () => {
    const { result } = await renderLoaded("light");
    emitThemeChanged("dark");
    expect(result.current.theme).toBe("dark");
    emitThemeChanged("light");
    expect(result.current.theme).toBe("light");
  });

  it("ignores unknown themes from main", async () => {
    const { result } = await renderLoaded("dark");
    emitThemeChanged("sepia");
    expect(result.current.theme).toBe("dark");
    expect(console.error).toHaveBeenCalled();
  });

  it("keeps a theme-changed event that arrives before getTheme resolves", async () => {
    let resolveInitial;
    createElectronAPI({
      getTheme: () =>
        new Promise((resolve) => {
          resolveInitial = resolve;
        }),
    });
    const { result } = renderHook(() => useTheme());

    emitThemeChanged("dark");
    await act(async () => resolveInitial("light"));

    expect(result.current.theme).toBe("dark");
  });

  it("keeps a theme-changed event that arrives before getTheme rejects", async () => {
    let rejectInitial;
    createElectronAPI({
      getTheme: () =>
        new Promise((_resolve, reject) => {
          rejectInitial = reject;
        }),
    });
    const { result } = renderHook(() => useTheme());

    emitThemeChanged("dark");
    await act(async () => rejectInitial(new Error("late")));

    expect(result.current.theme).toBe("dark");
  });

  it("subscribes once and unsubscribes on unmount", async () => {
    const { api, unmount, rerender } = await renderLoaded();
    rerender();
    expect(api.onThemeChanged).toHaveBeenCalledTimes(1);
    unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe("useTheme: Excalidraw's in-app toggle", () => {
  it("returns a stable handleAppThemeChange", async () => {
    const { result, rerender } = await renderLoaded();
    const first = result.current.handleAppThemeChange;
    rerender();
    emitThemeChanged("dark");
    expect(result.current.handleAppThemeChange).toBe(first);
  });

  it("does nothing on the first onChange after mount", async () => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");
    expect(api.setThemePreference).not.toHaveBeenCalled();
  });

  it("sets an explicit preference when the user toggles in-app", async () => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");
    result.current.handleAppThemeChange("dark");
    expect(api.setThemePreference).toHaveBeenCalledTimes(1);
    expect(api.setThemePreference).toHaveBeenCalledWith("dark");
  });

  it("sends the preference once even if onChange repeats before main replies", async () => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");
    result.current.handleAppThemeChange("dark");
    result.current.handleAppThemeChange("dark");
    result.current.handleAppThemeChange("dark");
    expect(api.setThemePreference).toHaveBeenCalledTimes(1);
  });

  it("doesn't echo main's reply back as another preference change", async () => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");
    result.current.handleAppThemeChange("dark");

    emitThemeChanged("dark");
    result.current.handleAppThemeChange("dark");

    expect(api.setThemePreference).toHaveBeenCalledTimes(1);
  });

  it("doesn't treat a prop-driven change (macOS / Appearance menu) as a toggle", async () => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");

    emitThemeChanged("dark");
    // stale onChange from the render that still had the old appState
    result.current.handleAppThemeChange("light");
    // Excalidraw syncs appState.theme to the new prop
    result.current.handleAppThemeChange("dark");

    expect(api.setThemePreference).not.toHaveBeenCalled();
  });

  it("handles toggling back and forth", async () => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");

    result.current.handleAppThemeChange("dark");
    emitThemeChanged("dark");
    result.current.handleAppThemeChange("light");
    emitThemeChanged("light");

    expect(api.setThemePreference.mock.calls).toEqual([["dark"], ["light"]]);
  });

  it.each([undefined, "sepia"])("ignores an unknown appState.theme (%j)", async (appTheme) => {
    const { api, result } = await renderLoaded("light");
    result.current.handleAppThemeChange("light");
    result.current.handleAppThemeChange(appTheme);
    expect(api.setThemePreference).not.toHaveBeenCalled();
  });
});
