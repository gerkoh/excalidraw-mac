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
  NATIVE_CHROME_THEME,
  readMacSystemIsDark,
  watchMacSystemAppearance,
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

describe("readMacSystemIsDark", () => {
  it("is dark only when AppleInterfaceStyle is Dark", () => {
    const systemPreferences = {
      getUserDefault: vi.fn(() => "Dark"),
    };
    expect(readMacSystemIsDark(systemPreferences)).toBe(true);
    expect(systemPreferences.getUserDefault).toHaveBeenCalledWith("AppleInterfaceStyle", "string");
  });

  it.each([undefined, null, "", "Light"])("treats %j as light", (style) => {
    expect(readMacSystemIsDark({ getUserDefault: () => style })).toBe(false);
  });

  it("treats a missing defaults key as light", () => {
    expect(
      readMacSystemIsDark({
        getUserDefault: () => {
          throw new Error("key missing");
        },
      }),
    ).toBe(false);
  });
});

describe("watchMacSystemAppearance", () => {
  it("broadcasts when macOS changes appearance", () => {
    const listener = vi.fn();
    let notify;
    const systemPreferences = {
      subscribeNotification: vi.fn((name, callback) => {
        notify = callback;
        return 1;
      }),
    };
    watchMacSystemAppearance(systemPreferences, listener);
    expect(systemPreferences.subscribeNotification).toHaveBeenCalledWith(
      "AppleInterfaceThemeChangedNotification",
      expect.any(Function),
    );
    notify("AppleInterfaceThemeChangedNotification", {}, "");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the platform has no notification API", () => {
    expect(() => watchMacSystemAppearance({}, vi.fn())).not.toThrow();
  });
});

const createFakeNativeTheme = () => {
  const nativeTheme = new EventEmitter();
  nativeTheme.themeSource = "system";
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
    const nativeTheme = createFakeNativeTheme();
    const rebuildMenu = vi.fn();
    let systemDark = systemIsDark;
    let notifySystemChange = () => {};
    const controller = createThemeController({
      store,
      nativeTheme,
      getAllWindows: () => windows,
      rebuildMenu,
      isSystemDark: () => systemDark,
      onSystemThemeChange: (listener) => {
        notifySystemChange = listener;
      },
    });
    return {
      store,
      nativeTheme,
      rebuildMenu,
      windows,
      controller,
      setSystemDark(next) {
        systemDark = next;
        notifySystemChange();
      },
    };
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
    it.each(["light", "dark", "system", 123])(
      "pins native chrome to dark when the stored preference is %j",
      (stored) => {
        const { nativeTheme, controller } = setup({ stored });
        nativeTheme.themeSource = "light";
        controller.init();
        expect(nativeTheme.themeSource).toBe(NATIVE_CHROME_THEME);
      },
    );

    it("broadcasts when the Mac appearance changes while following the system", () => {
      const { windows, controller, setSystemDark } = setup({ stored: "system" });
      controller.init();

      setSystemDark(true);

      expect(windows[0].webContents.send).toHaveBeenLastCalledWith("theme-changed", "dark");
      expect(windows[0].setBackgroundColor).toHaveBeenLastCalledWith("#121212");
    });

    it("keeps an explicit preference when the Mac appearance changes", () => {
      const { windows, controller, setSystemDark } = setup({ stored: "light" });
      controller.init();

      setSystemDark(true);

      expect(windows[0].webContents.send).toHaveBeenLastCalledWith("theme-changed", "light");
    });

    it("does not broadcast by itself", () => {
      const { windows, controller } = setup();
      controller.init();
      expect(windows[0].webContents.send).not.toHaveBeenCalled();
    });

    it("resolves Follow System from the Mac, not from the pinned dark chrome", () => {
      const { controller } = setup({ stored: "system", systemIsDark: false });
      controller.init();
      expect(controller.getEffectiveTheme()).toBe("light");
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
      "persists %s, keeps native chrome dark, rebuilds the menu and broadcasts",
      (preference) => {
        const { store, nativeTheme, rebuildMenu, windows, controller } = setup({
          systemIsDark: true,
        });
        controller.init();

        expect(controller.setPreference(preference)).toBe(true);

        expect(store.set).toHaveBeenCalledWith("themePreference", preference);
        expect(nativeTheme.themeSource).toBe(NATIVE_CHROME_THEME);
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
        expect(nativeTheme.themeSource).toBe(NATIVE_CHROME_THEME);
        expect(rebuildMenu).not.toHaveBeenCalled();
        expect(windows[0].webContents.send).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalled();
      },
    );
  });
});
