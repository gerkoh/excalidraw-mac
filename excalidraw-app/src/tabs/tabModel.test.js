import { describe, it, expect } from "vitest";
import { MAX_TABS } from "../../../electron/tabSession.js";
import {
  addBlankTab,
  addPathTab,
  blankSession,
  closeTab,
  replaceActivePath,
  sessionFromFiles,
  tabLabel,
  updateTabState,
} from "./tabModel";

const fileState = (filePath) => ({ filePath, hasFilePath: true, dirty: false, hasContent: true });

describe("tabLabel", () => {
  it("uses the file name without the extension", () => {
    expect(tabLabel("/Users/me/diagram.excalidraw")).toBe("diagram");
    expect(tabLabel("/Users/me/a.b.excalidraw")).toBe("a.b");
  });

  it("is Untitled when there is no file", () => {
    expect(tabLabel(null)).toBe("Untitled");
    expect(tabLabel("")).toBe("Untitled");
    expect(tabLabel("   ")).toBe("Untitled");
  });
});

describe("tab session", () => {
  it("starts from files with the requested one active", () => {
    const session = sessionFromFiles(["/a.excalidraw", "/b.excalidraw"], 1);
    expect(session.tabs.map((tab) => tab.initialFilePath)).toEqual([
      "/a.excalidraw",
      "/b.excalidraw",
    ]);
    expect(session.activeId).toBe(session.tabs[1].id);
    expect(session.tabs[1].filePath).toBeNull();
  });

  it("adds a blank tab and selects it, until the cap", () => {
    let session = blankSession();
    session = addBlankTab(session);
    expect(session.tabs).toHaveLength(2);
    expect(session.activeId).toBe(session.tabs[1].id);
    expect(session.tabs[1].initialFilePath).toBeNull();

    while (session.tabs.length < MAX_TABS) session = addBlankTab(session);
    const atCap = addBlankTab(session);
    expect(atCap).toBe(session);
    expect(atCap.tabs).toHaveLength(MAX_TABS);
  });

  it("focuses a path that is already open instead of opening it twice", () => {
    let session = sessionFromFiles(["/a.excalidraw", "/b.excalidraw"], 0);
    session = updateTabState(session, session.tabs[1].id, fileState("/b.excalidraw"));
    const result = addPathTab(session, "/b.excalidraw");
    expect(result.mode).toBe("focus");
    expect(result.session.tabs).toHaveLength(2);
    expect(result.session.activeId).toBe(session.tabs[1].id);
  });

  it("adds a path while there is room and asks to replace at the cap", () => {
    let session = blankSession();
    const added = addPathTab(session, "/new.excalidraw");
    expect(added.mode).toBe("add");
    expect(added.session.tabs).toHaveLength(2);
    expect(added.session.tabs[1].initialFilePath).toBe("/new.excalidraw");

    while (session.tabs.length < MAX_TABS) session = addBlankTab(session);
    const blocked = addPathTab(session, "/ninth.excalidraw");
    expect(blocked.mode).toBe("replace");
    expect(blocked.session.tabs).toHaveLength(MAX_TABS);
  });

  it("replaces the active tab's file and bumps its generation so the canvas reloads", () => {
    const session = sessionFromFiles(["/a.excalidraw", "/b.excalidraw"], 0);
    const next = replaceActivePath(session, "/c.excalidraw");
    expect(next.activeId).toBe(session.activeId);
    expect(next.tabs[0].initialFilePath).toBe("/c.excalidraw");
    expect(next.tabs[0].generation).toBe(1);
    expect(next.tabs[1].generation).toBe(0);
  });

  it("closes a tab and selects the neighbour when the active one goes", () => {
    const session = sessionFromFiles(["/a.excalidraw", "/b.excalidraw", "/c.excalidraw"], 1);
    const closed = closeTab(session, session.tabs[1].id);
    expect(closed.tabs.map((tab) => tab.initialFilePath)).toEqual([
      "/a.excalidraw",
      "/c.excalidraw",
    ]);
    expect(closed.activeId).toBe(session.tabs[2].id);
  });

  it("keeps the active tab when a different one is closed", () => {
    const session = sessionFromFiles(["/a.excalidraw", "/b.excalidraw"], 0);
    const closed = closeTab(session, session.tabs[1].id);
    expect(closed.activeId).toBe(session.tabs[0].id);
    expect(closed.tabs).toHaveLength(1);
  });

  it("ignores a state report that changes nothing", () => {
    const session = blankSession();
    const next = updateTabState(session, session.activeId, {
      filePath: null,
      dirty: false,
      hasContent: false,
    });
    expect(next).toBe(session);
  });
});
