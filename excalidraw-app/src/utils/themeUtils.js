const THEMES = ["light", "dark"];

const isTheme = (value) => THEMES.includes(value);

// Excalidraw's in-app toggle (main menu / Shift+Alt+D) only changes its internal appState.theme.
// It counts as a user choice when appState.theme changed since the last onChange AND differs from
// the `theme` prop we pass; prop-driven changes land equal to the prop, so they are never echoed back.
// Returns the explicit preference ("light" | "dark") to persist, or null when nothing should change.
const detectInAppThemeChange = ({ previousAppTheme, nextAppTheme, propTheme }) => {
  if (!isTheme(nextAppTheme)) return null;
  // first onChange after mount: nothing to compare against yet
  if (previousAppTheme == null) return null;
  if (nextAppTheme === previousAppTheme) return null;
  if (nextAppTheme === propTheme) return null;
  return nextAppTheme;
};

export { THEMES, isTheme, detectInAppThemeChange };
