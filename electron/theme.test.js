import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRequire } from "module";
import { EventEmitter } from "events";

const require = createRequire(import.meta.url);
const {
  THEME_PREFERENCES,
  DEFAULT_THEME_PREFERENCE,
  BACKGROUND_COLORS,
  isThemePreference,
  normalizeThemePreference,
  resolveEffectiveTheme,
  backgroundColorFor,
  buildAppearanceMenuItem,
  createThemeController,
} = require("./theme");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("preferences", () => {
  it("are system, light and dark, defaulting to system", () => {
    expect(THEME_PREFERENCES).toEqual(["system", "light", "dark"]);
    expect(DEFAULT_THEME_PREFERENCE).toBe("system");
  });

  it.each(["system", "light", "dark"])("accepts %s", (value) => {
    expect(isThemePreference(value)).toBe(true);
    expect(normalizeThemePreference(value)).toBe(value);
  });

  it.each([undefined, null, "", "Dark", "SYSTEM", "sepia", 1, {}, ["dark"]])(
    "rejects %j and normalizes it to system",
    (value) => {
      expect(isThemePreference(value)).toBe(false);
      expect(normalizeThemePreference(value)).toBe("system");
    },
  );
});

describe("resolveEffectiveTheme", () => {
  it.each([
    ["system", false, "light"],
    ["system", true, "dark"],
    ["light", false, "light"],
    ["light", true, "light"],
    ["dark", false, "dark"],
    ["dark", true, "dark"],
  ])("preference %s with system dark=%s -> %s", (preference, systemIsDark, expected) => {
    expect(resolveEffectiveTheme(preference, systemIsDark)).toBe(expected);
  });

  it.each([undefined, null, "sepia"])("treats unknown preference %j as system", (preference) => {
    expect(resolveEffectiveTheme(preference, true)).toBe("dark");
    expect(resolveEffectiveTheme(preference, false)).toBe("light");
  });
});

describe("backgroundColorFor", () => {
  it("uses Excalidraw's dark canvas colour for dark and white for light", () => {
    expect(backgroundColorFor("dark")).toBe(BACKGROUND_COLORS.dark);
    expect(backgroundColorFor("light")).toBe(BACKGROUND_COLORS.light);
    expect(BACKGROUND_COLORS).toEqual({ light: "#ffffff", dark: "#121212" });
  });

  it.each([undefined, "system", "sepia"])("falls back to light for %j", (value) => {
    expect(backgroundColorFor(value)).toBe("#ffffff");
  });
});

describe("buildAppearanceMenuItem", () => {
  it("does not call setThemePreference while building", () => {
    const setThemePreference = vi.fn();
    buildAppearanceMenuItem({ themePreference: "dark", setThemePreference });
    expect(setThemePreference).not.toHaveBeenCalled();
  });

  it.each(["system", "light", "dark"])("checks exactly one item for %s", (themePreference) => {
    const { submenu } = buildAppearanceMenuItem({ themePreference, setThemePreference: vi.fn() });
    expect(submenu.filter((item) => item.checked).map((item) => item.id)).toEqual([
      `appearance-${themePreference}`,
    ]);
  });
});

const createFakeNativeTheme = ({ systemIsDark = false } = {}) => {
  const nativeTheme = new EventEmitter();
  nativeTheme.systemIsDark = systemIsDark;
  nativeTheme.themeSource = "system";
  // mirrors Electron: themeSource overrides the OS when it's light/dark
  Object.defineProperty(nativeTheme, "shouldUseDarkColors", {
    get() {
      if (this.themeSource === "dark") return true;
      if (this.themeSource === "light") return false;
      return this.systemIsDark;
    },
  });
  return nativeTheme;
};

const createFakeStore = (initial = {}) => {
  const data = { ...initial };
  return {
    data,
    get: vi.fn((key) => data[key]),
    set: vi.fn((key, value) => {
      data[key] = value;
    }),
  };
};

const createFakeWindow = ({ destroyed = false } = {}) => ({
  isDestroyed: vi.fn(() => destroyed),
  setBackgroundColor: vi.fn(),
  webContents: { send: vi.fn() },
});

describe("createThemeController", () => {
  const setup = ({ stored, systemIsDark = false, windows = [createFakeWindow()] } = {}) => {
    const store = createFakeStore(stored === undefined ? {} : { themePreference: stored });
    const nativeTheme = createFakeNativeTheme({ systemIsDark });
    const rebuildMenu = vi.fn();
    const controller = createThemeController({
      store,
      nativeTheme,
      getAllWindows: () => windows,
      rebuildMenu,
    });
    return { store, nativeTheme, rebuildMenu, windows, controller };
  };

  describe("getPreference", () => {
    it("defaults to system when nothing is stored", () => {
      expect(setup().controller.getPreference()).toBe("system");
    });

    it.each(["light", "dark", "system"])("returns the stored %s", (stored) => {
      expect(setup({ stored }).controller.getPreference()).toBe(stored);
    });

    it("falls back to system for a corrupted stored value", () => {
      expect(setup({ stored: "purple" }).controller.getPreference()).toBe("system");
    });
  });

  describe("init", () => {
    it.each(["light", "dark", "system"])("sets nativeTheme.themeSource to stored %s", (stored) => {
      const { nativeTheme, controller } = setup({ stored });
      controller.init();
      expect(nativeTheme.themeSource).toBe(stored);
    });

    it("sets themeSource to system for a corrupted stored value", () => {
      const { nativeTheme, controller } = setup({ stored: 123 });
      nativeTheme.themeSource = "dark";
      controller.init();
      expect(nativeTheme.themeSource).toBe("system");
    });

    it("broadcasts when macOS appearance changes while following the system", () => {
      const { nativeTheme, windows, controller } = setup({ stored: "system" });
      controller.init();

      nativeTheme.systemIsDark = true;
      nativeTheme.emit("updated");

      expect(windows[0].webContents.send).toHaveBeenLastCalledWith("theme-changed", "dark");
      expect(windows[0].setBackgroundColor).toHaveBeenLastCalledWith("#121212");
    });

    it("keeps an explicit preference when macOS appearance changes", () => {
      const { nativeTheme, windows, controller } = setup({ stored: "light" });
      controller.init();

      nativeTheme.systemIsDark = true;
      nativeTheme.emit("updated");

      expect(windows[0].webContents.send).toHaveBeenLastCalledWith("theme-changed", "light");
    });

    it("does not broadcast by itself", () => {
      const { windows, controller } = setup();
      controller.init();
      expect(windows[0].webContents.send).not.toHaveBeenCalled();
    });
  });

  describe("getEffectiveTheme", () => {
    it.each([
      ["system", false, "light"],
      ["system", true, "dark"],
      ["light", true, "light"],
      ["dark", false, "dark"],
    ])("stored %s with system dark=%s -> %s", (stored, systemIsDark, expected) => {
      const { controller } = setup({ stored, systemIsDark });
      controller.init();
      expect(controller.getEffectiveTheme()).toBe(expected);
    });
  });

  describe("broadcast", () => {
    it("sends the effective theme and background to every live window", () => {
      const windows = [createFakeWindow(), createFakeWindow()];
      const { controller } = setup({ stored: "dark", windows });
      controller.init();

      expect(controller.broadcast()).toBe("dark");

      windows.forEach((win) => {
        expect(win.webContents.send).toHaveBeenCalledWith("theme-changed", "dark");
        expect(win.setBackgroundColor).toHaveBeenCalledWith("#121212");
      });
    });

    it("skips destroyed windows", () => {
      const destroyed = createFakeWindow({ destroyed: true });
      const live = createFakeWindow();
      const { controller } = setup({ windows: [destroyed, live] });
      controller.broadcast();
      expect(destroyed.webContents.send).not.toHaveBeenCalled();
      expect(destroyed.setBackgroundColor).not.toHaveBeenCalled();
      expect(live.webContents.send).toHaveBeenCalledWith("theme-changed", "light");
    });

    it("works with no windows (all closed)", () => {
      const { controller } = setup({ windows: [] });
      expect(() => controller.broadcast()).not.toThrow();
    });
  });

  describe("setPreference", () => {
    it.each(["system", "light", "dark"])(
      "persists %s, sets themeSource, rebuilds the menu and broadcasts",
      (preference) => {
        const { store, nativeTheme, rebuildMenu, windows, controller } = setup({
          systemIsDark: true,
        });
        controller.init();

        expect(controller.setPreference(preference)).toBe(true);

        expect(store.set).toHaveBeenCalledWith("themePreference", preference);
        expect(nativeTheme.themeSource).toBe(preference);
        expect(rebuildMenu).toHaveBeenCalledTimes(1);
        expect(controller.getPreference()).toBe(preference);
        const expected = preference === "light" ? "light" : "dark";
        expect(windows[0].webContents.send).toHaveBeenLastCalledWith("theme-changed", expected);
      },
    );

    it("broadcasts even when the effective theme doesn't change (dark -> system on a dark Mac)", () => {
      const { windows, controller } = setup({ stored: "dark", systemIsDark: true });
      controller.init();
      controller.setPreference("system");
      expect(windows[0].webContents.send).toHaveBeenCalledWith("theme-changed", "dark");
    });

    it("rebuilds the menu after persisting so radio checks read the new value", () => {
      const { store, rebuildMenu, controller } = setup();
      let preferenceSeenByMenu;
      rebuildMenu.mockImplementation(() => {
        preferenceSeenByMenu = controller.getPreference();
      });
      controller.setPreference("dark");
      expect(preferenceSeenByMenu).toBe("dark");
      expect(store.set.mock.invocationCallOrder[0]).toBeLessThan(
        rebuildMenu.mock.invocationCallOrder[0],
      );
    });

    it.each([undefined, null, "", "Dark", "sepia", 0, {}])(
      "rejects %j without side effects",
      (preference) => {
        const { store, nativeTheme, rebuildMenu, windows, controller } = setup({ stored: "light" });
        controller.init();

        expect(controller.setPreference(preference)).toBe(false);

        expect(store.set).not.toHaveBeenCalled();
        expect(nativeTheme.themeSource).toBe("light");
        expect(rebuildMenu).not.toHaveBeenCalled();
        expect(windows[0].webContents.send).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
      },
    );
  });
});
