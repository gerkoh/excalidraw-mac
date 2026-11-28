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

// Native dialogs, alerts, and the menu bar stay dark. The canvas theme is separate.
const NATIVE_CHROME_THEME = "dark";
const MAC_INTERFACE_STYLE_KEY = "AppleInterfaceStyle";
const MAC_APPEARANCE_NOTIFICATION = "AppleInterfaceThemeChangedNotification";

// AppleInterfaceStyle is "Dark" while the Mac is in dark mode, and missing in light mode.
// nativeTheme.shouldUseDarkColors cannot be used once themeSource is pinned to dark.
const readMacSystemIsDark = (systemPreferences) => {
  try {
    return systemPreferences.getUserDefault(MAC_INTERFACE_STYLE_KEY, "string") === "Dark";
  } catch {
    return false;
  }
};

const watchMacSystemAppearance = (systemPreferences, listener) => {
  if (typeof systemPreferences.subscribeNotification !== "function") return;
  systemPreferences.subscribeNotification(MAC_APPEARANCE_NOTIFICATION, () => listener());
};

// owns the preference -> canvas theme flow. Native chrome is pinned dark.
// isSystemDark and onSystemThemeChange are injected so tests do not touch macOS.
const createThemeController = ({
  store,
  nativeTheme,
  getAllWindows,
  rebuildMenu,
  isSystemDark,
  onSystemThemeChange,
}) => {
  const getPreference = () => normalizeThemePreference(store.get("themePreference"));

  const getEffectiveTheme = () => resolveEffectiveTheme(getPreference(), isSystemDark());

  // pushes the effective canvas theme to every window
  const broadcast = () => {
    const theme = getEffectiveTheme();
    for (const win of getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.setBackgroundColor(backgroundColorFor(theme));
      win.webContents.send("theme-changed", theme);
    }
    return theme;
  };

  const init = () => {
    nativeTheme.themeSource = NATIVE_CHROME_THEME;
    onSystemThemeChange(broadcast);
  };

  const setPreference = (preference) => {
    if (!isThemePreference(preference)) {
      console.error("[main] Rejected unknown theme preference:", preference);
      return false;
    }
    store.set("themePreference", preference);
    nativeTheme.themeSource = NATIVE_CHROME_THEME;
    // radio checks must follow changes that didn't come from the menu (Excalidraw's in-app toggle)
    rebuildMenu();
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
  NATIVE_CHROME_THEME,
  readMacSystemIsDark,
  watchMacSystemAppearance,
  createThemeController,
};
