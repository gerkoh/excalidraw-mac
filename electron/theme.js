// --- Appearance ---

// what the user picked in View -> Appearance (persisted as store key "themePreference")
const THEME_PREFERENCES = ["system", "light", "dark"];
const DEFAULT_THEME_PREFERENCE = "system";

// matches Excalidraw's dark canvas (white inverted by its 93% dark-mode filter) to avoid a white flash
const BACKGROUND_COLORS = { light: "#ffffff", dark: "#121212" };

const isThemePreference = (value) => THEME_PREFERENCES.includes(value);

// unknown / corrupted stored values fall back to following the system
const normalizeThemePreference = (value) =>
  isThemePreference(value) ? value : DEFAULT_THEME_PREFERENCE;

// effective theme is always "light" or "dark", which is what Excalidraw's `theme` prop accepts
const resolveEffectiveTheme = (preference, systemIsDark) => {
  const normalized = normalizeThemePreference(preference);
  if (normalized === "system") return systemIsDark ? "dark" : "light";
  return normalized;
};

const backgroundColorFor = (effectiveTheme) =>
  effectiveTheme === "dark" ? BACKGROUND_COLORS.dark : BACKGROUND_COLORS.light;

const APPEARANCE_LABELS = { system: "System", light: "Light", dark: "Dark" };

const buildAppearanceMenuItem = ({ themePreference, setThemePreference }) => {
  const current = normalizeThemePreference(themePreference);
  return {
    label: "Appearance",
    submenu: THEME_PREFERENCES.map((preference) => ({
      id: `appearance-${preference}`,
      label: APPEARANCE_LABELS[preference],
      type: "radio",
      checked: preference === current,
      click: () => setThemePreference(preference),
    })),
  };
};

// owns the preference -> nativeTheme.themeSource -> windows flow; electron objects are injected for tests
const createThemeController = ({ store, nativeTheme, getAllWindows, rebuildMenu }) => {
  const getPreference = () => normalizeThemePreference(store.get("themePreference"));

  const getEffectiveTheme = () =>
    resolveEffectiveTheme(getPreference(), nativeTheme.shouldUseDarkColors);

  // pushes the effective theme to every window; idempotent, safe to call on every nativeTheme "updated"
  const broadcast = () => {
    const theme = getEffectiveTheme();
    for (const win of getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.setBackgroundColor(backgroundColorFor(theme));
      win.webContents.send("theme-changed", theme);
    }
    return theme;
  };

  // themeSource makes native dialogs, menus and the renderer's prefers-color-scheme match
  const init = () => {
    nativeTheme.themeSource = getPreference();
    nativeTheme.on("updated", broadcast);
  };

  const setPreference = (preference) => {
    if (!isThemePreference(preference)) {
      console.error("[main] Rejected unknown theme preference:", preference);
      return false;
    }
    store.set("themePreference", preference);
    nativeTheme.themeSource = preference;
    // radio checks must follow changes that didn't come from the menu (Excalidraw's in-app toggle)
    rebuildMenu();
    // "updated" doesn't fire when the effective colours stay the same, so push explicitly
    broadcast();
    return true;
  };

  return { getPreference, getEffectiveTheme, broadcast, init, setPreference };
};

module.exports = {
  THEME_PREFERENCES,
  DEFAULT_THEME_PREFERENCE,
  BACKGROUND_COLORS,
  isThemePreference,
  normalizeThemePreference,
  resolveEffectiveTheme,
  backgroundColorFor,
  buildAppearanceMenuItem,
  createThemeController,
};
