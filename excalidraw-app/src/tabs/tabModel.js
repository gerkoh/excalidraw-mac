import { canAddTab } from "../../../electron/tabSession.js";

let sequence = 0;

export const createTabId = () => {
  sequence += 1;
  return `tab-${sequence}`;
};

// filePath stays null until the canvas reports a successful load or save, so a missing
// file is never announced to the window title. initialFilePath is what the canvas loads.
export const createTab = (filePath = null) => ({
  id: createTabId(),
  initialFilePath: filePath,
  generation: 0,
  filePath: null,
  dirty: false,
  hasContent: false,
});

export const blankSession = () => {
  const tab = createTab(null);
  return { tabs: [tab], activeId: tab.id };
};

export const sessionFromFiles = (filePaths, activeIndex = 0) => {
  const tabs = filePaths.map((filePath) => createTab(filePath));
  if (tabs.length === 0) return blankSession();
  const index = activeIndex >= 0 && activeIndex < tabs.length ? activeIndex : 0;
  return { tabs, activeId: tabs[index].id };
};

export const tabLabel = (filePath) => {
  if (typeof filePath !== "string" || filePath.trim() === "") return "Untitled";
  const base = filePath.split(/[/\\]/).pop();
  const dot = base.lastIndexOf(".");
  const name = dot > 0 ? base.slice(0, dot) : base;
  return name === "" ? "Untitled" : name;
};

export const addBlankTab = (session) => {
  if (!canAddTab(session.tabs.length)) return session;
  const tab = createTab(null);
  return { tabs: [...session.tabs, tab], activeId: tab.id };
};

// "focus" when that file is already open, "add" when there is room, "replace" at the cap.
export const addPathTab = (session, filePath) => {
  const existing = session.tabs.find((tab) => tab.filePath === filePath);
  if (existing) return { session: { ...session, activeId: existing.id }, mode: "focus" };
  if (!canAddTab(session.tabs.length)) return { session, mode: "replace" };
  const tab = createTab(filePath);
  return { session: { tabs: [...session.tabs, tab], activeId: tab.id }, mode: "add" };
};

export const replaceActivePath = (session, filePath) => ({
  ...session,
  tabs: session.tabs.map((tab) =>
    tab.id === session.activeId
      ? {
          ...tab,
          initialFilePath: filePath,
          filePath: null,
          generation: tab.generation + 1,
          dirty: false,
          hasContent: false,
        }
      : tab,
  ),
});

export const closeTab = (session, tabId) => {
  const index = session.tabs.findIndex((tab) => tab.id === tabId);
  if (index === -1) return session;
  const tabs = session.tabs.filter((tab) => tab.id !== tabId);
  if (tabs.length === 0) return { tabs, activeId: null };
  if (session.activeId !== tabId) return { ...session, tabs };
  const neighbor = session.tabs[index + 1] ?? session.tabs[index - 1];
  return { tabs, activeId: neighbor.id };
};

export const updateTabState = (session, tabId, state) => {
  const tab = session.tabs.find((item) => item.id === tabId);
  if (!tab) return session;
  const filePath = state.filePath ?? null;
  const dirty = state.dirty === true;
  const hasContent = state.hasContent === true;
  if (tab.filePath === filePath && tab.dirty === dirty && tab.hasContent === hasContent) {
    return session;
  }
  return {
    ...session,
    tabs: session.tabs.map((item) =>
      item.id === tabId ? { ...item, filePath, dirty, hasContent } : item,
    ),
  };
};

export const toSessionReport = (session) => ({
  activeTabId: session.activeId,
  tabs: session.tabs.map((tab) => ({
    id: tab.id,
    filePath: tab.filePath,
    dirty: tab.dirty === true,
    hasFilePath: tab.filePath !== null,
    hasContent: tab.hasContent === true,
  })),
});
