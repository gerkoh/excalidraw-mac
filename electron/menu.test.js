import { describe, it, expect, vi } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { buildMenuTemplate } = require("./menu");

const createFakeWindow = () => ({
  webContents: { send: vi.fn(), reload: vi.fn() },
  close: vi.fn(),
});

const setup = ({
  focusedWindow = createFakeWindow(),
  themePreference = "system",
  mayDiscard = true,
  tabCount = focusedWindow ? 1 : null,
} = {}) => {
  const getFocusedWindow = vi.fn(() => focusedWindow);
  const getOpenTabCount = vi.fn(() => tabCount);
  const createWindow = vi.fn();
  const setThemePreference = vi.fn();
  const prepareToDiscardContents = vi.fn(() => Promise.resolve(mayDiscard));
  const template = buildMenuTemplate({
    appName: "excalidraw-mac",
    getFocusedWindow,
    getOpenTabCount,
    createWindow,
    prepareToDiscardContents,
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
    getOpenTabCount,
    createWindow,
    prepareToDiscardContents,
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
    });
    expect(template[0].label).toBe("Other Name");
  });

  it("does not touch the window while building", () => {
    const { getFocusedWindow, setThemePreference, focusedWindow, createWindow } = setup();
    expect(getFocusedWindow).not.toHaveBeenCalled();
    expect(setThemePreference).not.toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
    expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
    expect(focusedWindow.close).not.toHaveBeenCalled();
  });

  it("has New, New Tab, Open…, Save, Close Tab and Close Window in the File menu", () => {
    const { findMenu } = setup();
    expect(findMenu("File").submenu.map((item) => item.label ?? item.type)).toEqual([
      "New",
      "New Tab",
      "separator",
      "Open…",
      "Open Recent",
      "separator",
      "Save",
      "Save As…",
      "separator",
      "Close Tab",
      "Close Window",
    ]);
  });

  it.each([
    ["New", "Cmd+N", "menu-new-tab"],
    ["New Tab", "Cmd+T", "menu-new-tab"],
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

  it.each(["Save", "Save As…", "Close Tab", "Close Window"])(
    "%s does nothing when no window is focused",
    async (label) => {
      const { findFileItem, getFocusedWindow, createWindow } = setup({ focusedWindow: null });
      await expect(Promise.resolve(findFileItem(label).click())).resolves.toBeUndefined();
      expect(getFocusedWindow).toHaveBeenCalledTimes(1);
      expect(createWindow).not.toHaveBeenCalled();
    },
  );

  it.each(["New", "New Tab"])("%s opens a blank window when none is focused", async (label) => {
    const { findFileItem, createWindow } = setup({ focusedWindow: null });
    await findFileItem(label).click();
    expect(createWindow).toHaveBeenCalledTimes(1);
    expect(createWindow).toHaveBeenCalledWith({ blank: true });
  });

  it("Open… opens a blank window and asks it to show the open dialog when none is focused", async () => {
    const { findFileItem, createWindow } = setup({ focusedWindow: null });
    await findFileItem("Open…").click();
    expect(createWindow).toHaveBeenCalledWith({ blank: true, openDialog: true });
  });

  it.each(["New", "New Tab"])(
    "disables %s at the tab cap and the click does nothing",
    async (label) => {
      const { findFileItem, focusedWindow } = setup({ tabCount: 8 });
      const item = findFileItem(label);
      expect(item.enabled).toBe(false);
      await item.click();
      expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
    },
  );

  it("Close Tab asks the renderer to close the active tab when others remain", async () => {
    const { findFileItem, focusedWindow } = setup({ tabCount: 3 });
    const item = findFileItem("Close Tab");
    expect(item.accelerator).toBe("Cmd+W");
    await item.click();
    expect(focusedWindow.webContents.send).toHaveBeenCalledWith("menu-close-tab");
    expect(focusedWindow.close).not.toHaveBeenCalled();
  });

  it("Close Tab closes the window when it is the last tab", async () => {
    const { findFileItem, focusedWindow } = setup({ tabCount: 1 });
    await findFileItem("Close Tab").click();
    expect(focusedWindow.close).toHaveBeenCalledTimes(1);
    expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
  });

  it("Close Window closes the window even when several tabs are open", async () => {
    const { findFileItem, focusedWindow } = setup({ tabCount: 4 });
    const item = findFileItem("Close Window");
    expect(item.accelerator).toBe("Cmd+Shift+W");
    await item.click();
    expect(focusedWindow.close).toHaveBeenCalledTimes(1);
    expect(focusedWindow.webContents.send).not.toHaveBeenCalled();
  });

  it("looks up the focused window at click time, not build time", () => {
    const first = createFakeWindow();
    const second = createFakeWindow();
    const getFocusedWindow = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const template = buildMenuTemplate({
      appName: "excalidraw-mac",
      getFocusedWindow,
      getOpenTabCount: () => 2,
    });
    const save = template[1].submenu.find((item) => item.label === "Save");

    save.click();
    save.click();

    expect(first.webContents.send).toHaveBeenCalledTimes(1);
    expect(second.webContents.send).toHaveBeenCalledTimes(1);
  });

  describe("unsaved changes guard", () => {
    it.each(["New", "New Tab", "Open…"])(
      "%s does not ask about unsaved changes before adding a tab",
      async (label) => {
        const { findFileItem, focusedWindow, prepareToDiscardContents } = setup();
        await findFileItem(label).click();
        expect(prepareToDiscardContents).not.toHaveBeenCalled();
        expect(focusedWindow.webContents.send).toHaveBeenCalledTimes(1);
      },
    );

    it("sends to the window that was focused when clicked, even if focus moves meanwhile", async () => {
      const first = createFakeWindow();
      const second = createFakeWindow();
      const getFocusedWindow = vi.fn().mockReturnValueOnce(first).mockReturnValue(second);
      const template = buildMenuTemplate({
        appName: "excalidraw-mac",
        getFocusedWindow,
        getOpenTabCount: () => 1,
      });
      const open = template[1].submenu.find((item) => item.label === "Open…");

      await open.click();

      expect(first.webContents.send).toHaveBeenCalledWith("menu-open");
      expect(second.webContents.send).not.toHaveBeenCalled();
    });

    it.each(["Save", "Save As…"])(
      "%s never prompts (it doesn't replace the drawing)",
      async (label) => {
        const { findFileItem, prepareToDiscardContents } = setup();
        await findFileItem(label).click();
        expect(prepareToDiscardContents).not.toHaveBeenCalled();
      },
    );
  });

  it("keeps the standard roles in the app, Edit, View and Window menus", () => {
    const { findMenu, template } = setup();
    const roles = (menu) => menu.submenu.filter((item) => item.role).map((item) => item.role);
    expect(roles(template[0])).toEqual(["about", "hide", "hideOthers", "unhide", "quit"]);
    expect(roles(findMenu("Edit"))).toEqual(["undo", "redo", "cut", "copy", "paste", "selectAll"]);
    expect(roles(findMenu("View"))).toEqual([
      "toggleDevTools",
      "zoomIn",
      "zoomOut",
      "resetZoom",
      "togglefullscreen",
    ]);
    expect(roles(findMenu("Window"))).toEqual(["minimize", "zoom"]);
  });

  describe("View -> Reload", () => {
    it("asks about unsaved changes and reloads only when the user agrees", async () => {
      const { findViewItem, prepareToDiscardContents, focusedWindow } = setup();
      const reload = findViewItem("Reload");
      expect(reload.accelerator).toBe("CmdOrCtrl+R");

      prepareToDiscardContents.mockResolvedValueOnce(false);
      await reload.click();
      expect(prepareToDiscardContents).toHaveBeenCalledWith(focusedWindow);
      expect(focusedWindow.webContents.reload).not.toHaveBeenCalled();

      prepareToDiscardContents.mockResolvedValueOnce(true);
      await reload.click();
      expect(focusedWindow.webContents.reload).toHaveBeenCalledTimes(1);
    });

    it("does nothing when no window is focused", async () => {
      const { findViewItem, prepareToDiscardContents } = setup({ focusedWindow: null });
      await findViewItem("Reload").click();
      expect(prepareToDiscardContents).not.toHaveBeenCalled();
    });
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
