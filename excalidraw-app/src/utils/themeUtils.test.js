import { describe, it, expect } from "vitest";
import { THEMES, isTheme, detectInAppThemeChange } from "./themeUtils";

describe("isTheme", () => {
  it("accepts only Excalidraw's two themes", () => {
    expect(THEMES).toEqual(["light", "dark"]);
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
  });

  it.each([undefined, null, "", "system", "Dark", 1, {}])("rejects %j", (value) => {
    expect(isTheme(value)).toBe(false);
  });
});

describe("detectInAppThemeChange", () => {
  it.each([
    ["light", "dark", "light", "dark"],
    ["dark", "light", "dark", "light"],
  ])(
    "in-app toggle %s -> %s while the prop is %s becomes preference %s",
    (previousAppTheme, nextAppTheme, propTheme, expected) => {
      expect(detectInAppThemeChange({ previousAppTheme, nextAppTheme, propTheme })).toBe(expected);
    },
  );

  it.each([
    [
      "first onChange after mount",
      { previousAppTheme: null, nextAppTheme: "dark", propTheme: "light" },
    ],
    [
      "first onChange (undefined previous)",
      { previousAppTheme: undefined, nextAppTheme: "dark", propTheme: "light" },
    ],
    ["no change", { previousAppTheme: "dark", nextAppTheme: "dark", propTheme: "light" }],
    [
      "prop-driven change (system went dark)",
      { previousAppTheme: "light", nextAppTheme: "dark", propTheme: "dark" },
    ],
    [
      "prop-driven change (menu chose light)",
      { previousAppTheme: "dark", nextAppTheme: "light", propTheme: "light" },
    ],
    [
      "stale onChange after the prop changed",
      { previousAppTheme: "light", nextAppTheme: "light", propTheme: "dark" },
    ],
    [
      "unknown next theme",
      { previousAppTheme: "light", nextAppTheme: "sepia", propTheme: "light" },
    ],
    [
      "missing next theme",
      { previousAppTheme: "light", nextAppTheme: undefined, propTheme: "light" },
    ],
  ])("returns null for %s", (_label, args) => {
    expect(detectInAppThemeChange(args)).toBeNull();
  });

  it("treats a toggle before the prop is known as a user choice", () => {
    expect(
      detectInAppThemeChange({
        previousAppTheme: "light",
        nextAppTheme: "dark",
        propTheme: undefined,
      }),
    ).toBe("dark");
  });
});
