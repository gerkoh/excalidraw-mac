import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require("./menu");

const createFakeWindow = () => ({ webContents: { send: vi.fn() } });

const setup = ({ focusedWindow = createFakeWindow(), themePreference = "system" } = {}) => {
  const getFocusedWindow = vi.fn(() => focusedWindow);
  const clearLastOpenedPath = vi.fn();
  const setThemePreference = vi.fn();
  const template = buildMenuTemplate({
    appName: "excalidraw-mac",
    getFocusedWindow,
    clearLastOpenedPath,
    themePreference,
    setThemePreference,
  });
  const findMenu = (label) => template.find((menu) => menu.label === label);
  const findFileItem = (label) => findMenu("File").submenu.find((item) => item.label === label);
  const findViewItem = (label) => findMenu("View").submenu.find((item) => item.label === label);
  return {
    template,
    focusedWindow,
    getFocusedWindow,
    clearLastOpenedPath,
    setThemePreference,
    findMenu,
    findFileItem,
    findViewItem,
  };
};

describe("buildMenuTemplate", () => {
  it("has the app, File, Edit, View and Window menus in order", () => {
    const { template } = setup();
    expect(template.map((menu) => menu.label)).toEqual([
      "excalidraw-mac",
      "File",
      "Edit",
      "View",
      "Window",
    ]);
  });

  it("uses the app name for the first menu", () => {
    const template = buildMenuTemplate({
      appName: "Other Name",
      getFocusedWindow: () => null,
      clearLastOpenedPath: () => {},
    });
    expect(template[0].label).toBe("Other Name");
  });

  it("does not touch the window or store while building", () => {
    const { getFocusedWindow, clearLastOpenedPath, setThemePreference, focusedWindow } = setup();
    expect(getFocusedWindow).not.toHaveBeenCalled();
    expect(clearLastOpenedPath).not.toHaveBeenCalled();
    expect(setThemePreference).not.toHaveBeenCalled();
    expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
  });

  it("has New, separator, Open…, Open Recent, separator, Save, Save As… in the File menu", () => {
    const { findMenu } = setup();
    expect(findMenu("File").submenu.map((item) => item.label ?? item.type)).toEqual([
      "New",
      "separator",
      "Open…",
      "Open Recent",
      "separator",
      "Save",
      "Save As…",
    ]);
  });

  it.each([
    ["New", "Cmd+N", "menu-new"],
    ["Open…", "Cmd+O", "menu-open"],
    ["Save", "Cmd+S", "menu-save"],
    ["Save As…", "Cmd+Shift+S", "menu-save-as"],
  ])("%s has accelerator %s and sends %s to the focused window", (label, accelerator, channel) => {
    const { findFileItem, focusedWindow } = setup();
    const item = findFileItem(label);
    expect(item.accelerator).toBe(accelerator);

    item.click();

    expect(focusedWindow.webContents.send).toHaveBeenCalledTimes(1);
    expect(focusedWindow.webContents.send).toHaveBeenCalledWith(channel);
  });

  it.each(["New", "Open…", "Save", "Save As…"])(
    "%s does nothing to windows when none is focused",
    (label) => {
      const { findFileItem, getFocusedWindow } = setup({ focusedWindow: null });
      expect(() => findFileItem(label).click()).not.toThrow();
      expect(getFocusedWindow).toHaveBeenCalledTimes(1);
    },
  );

  it("New clears the last opened path before notifying the window", () => {
    const { findFileItem, clearLastOpenedPath, focusedWindow } = setup();
    findFileItem("New").click();
    expect(clearLastOpenedPath).toHaveBeenCalledTimes(1);
    expect(clearLastOpenedPath.mock.invocationCallOrder[0]).toBeLessThan(
      focusedWindow.webContents.send.mock.invocationCallOrder[0],
    );
  });

  it("New clears the last opened path even when no window is focused", () => {
    const { findFileItem, clearLastOpenedPath } = setup({ focusedWindow: null });
    findFileItem("New").click();
    expect(clearLastOpenedPath).toHaveBeenCalledTimes(1);
  });

  it.each(["Open…", "Save", "Save As…"])("%s does not clear the last opened path", (label) => {
    const { findFileItem, clearLastOpenedPath } = setup();
    findFileItem(label).click();
    expect(clearLastOpenedPath).not.toHaveBeenCalled();
  });

  it("looks up the focused window at click time, not build time", () => {
    const first = createFakeWindow();
    const second = createFakeWindow();
    const getFocusedWindow = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const template = buildMenuTemplate({
      appName: "excalidraw-mac",
      getFocusedWindow,
      clearLastOpenedPath: () => {},
    });
    const save = template[1].submenu.find((item) => item.label === "Save");

    save.click();
    save.click();

    expect(first.webContents.send).toHaveBeenCalledTimes(1);
    expect(second.webContents.send).toHaveBeenCalledTimes(1);
  });

  it("keeps the standard roles in the app, Edit, View and Window menus", () => {
    const { findMenu, template } = setup();
    const roles = (menu) => menu.submenu.filter((item) => item.role).map((item) => item.role);
    expect(roles(template[0])).toEqual(["about", "hide", "hideOthers", "unhide", "quit"]);
    expect(roles(findMenu("Edit"))).toEqual(["undo", "redo", "cut", "copy", "paste", "selectAll"]);
    expect(roles(findMenu("View"))).toEqual([
      "reload",
      "toggleDevTools",
      "zoomIn",
      "zoomOut",
      "resetZoom",
      "togglefullscreen",
    ]);
    expect(roles(findMenu("Window"))).toEqual(["minimize", "zoom", "close"]);
  });

  describe("File -> Open Recent", () => {
    it("uses the macOS recentDocuments role so the OS fills it", () => {
      const { findFileItem } = setup();
      const openRecent = findFileItem("Open Recent");
      expect(openRecent.role).toBe("recentDocuments");
      expect(openRecent.click).toBeUndefined();
    });

    it("has only a Clear Menu item using the clearRecentDocuments role", () => {
      const { findFileItem } = setup();
      expect(findFileItem("Open Recent").submenu).toEqual([
        { label: "Clear Menu", role: "clearRecentDocuments" },
      ]);
    });

    it("sits directly after Open…", () => {
      const { findMenu } = setup();
      const labels = findMenu("File").submenu.map((item) => item.label);
      expect(labels.indexOf("Open Recent")).toBe(labels.indexOf("Open…") + 1);
    });
  });

  describe("View -> Appearance", () => {
    it("sits between Reset Zoom and Toggle Full Screen, fenced by separators", () => {
      const { findMenu } = setup();
      const items = findMenu("View").submenu.map((item) => item.role ?? item.label ?? item.type);
      expect(items.slice(items.indexOf("resetZoom"))).toEqual([
        "resetZoom",
        "separator",
        "Appearance",
        "separator",
        "togglefullscreen",
      ]);
    });

    it("offers System, Light and Dark as radio items", () => {
      const { findViewItem } = setup();
      const items = findViewItem("Appearance").submenu;
      expect(items.map((item) => item.label)).toEqual(["System", "Light", "Dark"]);
      items.forEach((item) => expect(item.type).toBe("radio"));
    });

    it.each([
      ["system", "System"],
      ["light", "Light"],
      ["dark", "Dark"],
    ])("checks only the %s item for that preference", (themePreference, checkedLabel) => {
      const { findViewItem } = setup({ themePreference });
      const checked = findViewItem("Appearance")
        .submenu.filter((item) => item.checked)
        .map((item) => item.label);
      expect(checked).toEqual([checkedLabel]);
    });

    it.each([undefined, null, "sepia", ""])(
      "checks System for an unknown preference (%j)",
      (themePreference) => {
        const { findViewItem } = setup({ themePreference });
        const checked = findViewItem("Appearance")
          .submenu.filter((item) => item.checked)
          .map((item) => item.label);
        expect(checked).toEqual(["System"]);
      },
    );

    it.each([
      ["System", "system"],
      ["Light", "light"],
      ["Dark", "dark"],
    ])("clicking %s sets the %s preference", (label, preference) => {
      const { findViewItem, setThemePreference, focusedWindow } = setup();
      findViewItem("Appearance")
        .submenu.find((item) => item.label === label)
        .click();
      expect(setThemePreference).toHaveBeenCalledTimes(1);
      expect(setThemePreference).toHaveBeenCalledWith(preference);
      expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
    });

    it("gives each radio item a stable id", () => {
      const { findViewItem } = setup();
      expect(findViewItem("Appearance").submenu.map((item) => item.id)).toEqual([
        "appearance-system",
        "appearance-light",
        "appearance-dark",
      ]);
    });
  });
});
