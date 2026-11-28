import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require("./menu");

const createFakeWindow = () => ({ webContents: { send: vi.fn() } });

const setup = ({
  focusedWindow = createFakeWindow(),
  themePreference = "system",
  mayReplace = true,
} = {}) => {
  const getFocusedWindow = vi.fn(() => focusedWindow);
  const clearLastOpenedPath = vi.fn();
  const setThemePreference = vi.fn();
  const confirmReplaceDocument = vi.fn(() => Promise.resolve(mayReplace));
  const template = buildMenuTemplate({
    appName: "excalidraw-mac",
    getFocusedWindow,
    clearLastOpenedPath,
    confirmReplaceDocument,
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
    confirmReplaceDocument,
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
      confirmReplaceDocument: () => Promise.resolve(true),
    });
    expect(template[0].label).toBe("Other Name");
  });

  it("does not touch the window or store while building", () => {
    const {
      getFocusedWindow,
      clearLastOpenedPath,
      confirmReplaceDocument,
      setThemePreference,
      focusedWindow,
    } = setup();
    expect(getFocusedWindow).not.toHaveBeenCalled();
    expect(clearLastOpenedPath).not.toHaveBeenCalled();
    expect(setThemePreference).not.toHaveBeenCalled();
    expect(confirmReplaceDocument).not.toHaveBeenCalled();
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
  ])(
    "%s has accelerator %s and sends %s to the focused window",
    async (label, accelerator, channel) => {
      const { findFileItem, focusedWindow } = setup();
      const item = findFileItem(label);
      expect(item.accelerator).toBe(accelerator);

      await item.click();

      expect(focusedWindow.webContents.send).toHaveBeenCalledTimes(1);
      expect(focusedWindow.webContents.send).toHaveBeenCalledWith(channel);
    },
  );

  it.each(["New", "Open…", "Save", "Save As…"])(
    "%s does nothing to windows when none is focused",
    async (label) => {
      const { findFileItem, getFocusedWindow, confirmReplaceDocument } = setup({
        focusedWindow: null,
      });
      await expect(Promise.resolve(findFileItem(label).click())).resolves.toBeUndefined();
      expect(getFocusedWindow).toHaveBeenCalledTimes(1);
      expect(confirmReplaceDocument).not.toHaveBeenCalled();
    },
  );

  it("New clears the last opened path before notifying the window", async () => {
    const { findFileItem, clearLastOpenedPath, focusedWindow } = setup();
    await findFileItem("New").click();
    expect(clearLastOpenedPath).toHaveBeenCalledTimes(1);
    expect(clearLastOpenedPath.mock.invocationCallOrder[0]).toBeLessThan(
      focusedWindow.webContents.send.mock.invocationCallOrder[0],
    );
  });

  it("New clears the last opened path even when no window is focused", async () => {
    const { findFileItem, clearLastOpenedPath } = setup({ focusedWindow: null });
    await findFileItem("New").click();
    expect(clearLastOpenedPath).toHaveBeenCalledTimes(1);
  });

  it.each(["Open…", "Save", "Save As…"])(
    "%s does not clear the last opened path",
    async (label) => {
      const { findFileItem, clearLastOpenedPath } = setup();
      await findFileItem(label).click();
      expect(clearLastOpenedPath).not.toHaveBeenCalled();
    },
  );

  it("looks up the focused window at click time, not build time", () => {
    const first = createFakeWindow();
    const second = createFakeWindow();
    const getFocusedWindow = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const template = buildMenuTemplate({
      appName: "excalidraw-mac",
      getFocusedWindow,
      clearLastOpenedPath: () => {},
      confirmReplaceDocument: () => Promise.resolve(true),
    });
    const save = template[1].submenu.find((item) => item.label === "Save");

    save.click();
    save.click();

    expect(first.webContents.send).toHaveBeenCalledTimes(1);
    expect(second.webContents.send).toHaveBeenCalledTimes(1);
  });

  describe("unsaved changes guard", () => {
    it.each(["New", "Open…"])(
      "%s asks to resolve unsaved changes of the focused window first",
      async (label) => {
        const { findFileItem, confirmReplaceDocument, focusedWindow } = setup();
        await findFileItem(label).click();
        expect(confirmReplaceDocument).toHaveBeenCalledTimes(1);
        expect(confirmReplaceDocument).toHaveBeenCalledWith(focusedWindow);
        expect(confirmReplaceDocument.mock.invocationCallOrder[0]).toBeLessThan(
          focusedWindow.webContents.send.mock.invocationCallOrder[0],
        );
      },
    );

    it.each(["New", "Open…"])("%s does nothing when the user cancels", async (label) => {
      const { findFileItem, clearLastOpenedPath, focusedWindow } = setup({ mayReplace: false });
      await findFileItem(label).click();
      expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
      expect(clearLastOpenedPath).not.toHaveBeenCalled();
    });

    it("New does not clear the last opened path until the user has decided", async () => {
      let decide;
      const { findFileItem, clearLastOpenedPath, confirmReplaceDocument, focusedWindow } = setup();
      confirmReplaceDocument.mockReturnValue(
        new Promise((resolve) => {
          decide = resolve;
        }),
      );

      const clicking = findFileItem("New").click();
      await Promise.resolve();
      expect(clearLastOpenedPath).not.toHaveBeenCalled();
      expect(focusedWindow.webContents.send).not.toHaveBeenCalled();

      decide(true);
      await clicking;
      expect(clearLastOpenedPath).toHaveBeenCalledTimes(1);
      expect(focusedWindow.webContents.send).toHaveBeenCalledWith("menu-new");
    });

    it("sends to the window that was focused when clicked, even if focus moves meanwhile", async () => {
      const first = createFakeWindow();
      const second = createFakeWindow();
      const getFocusedWindow = vi.fn().mockReturnValueOnce(first).mockReturnValue(second);
      const template = buildMenuTemplate({
        appName: "excalidraw-mac",
        getFocusedWindow,
        clearLastOpenedPath: () => {},
        confirmReplaceDocument: () => Promise.resolve(true),
      });
      const open = template[1].submenu.find((item) => item.label === "Open…");

      await open.click();

      expect(first.webContents.send).toHaveBeenCalledWith("menu-open");
      expect(second.webContents.send).not.toHaveBeenCalled();
    });

    it.each(["Save", "Save As…"])(
      "%s never prompts (it doesn't replace the drawing)",
      async (label) => {
        const { findFileItem, confirmReplaceDocument } = setup();
        await findFileItem(label).click();
        expect(confirmReplaceDocument).not.toHaveBeenCalled();
      },
    );
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
