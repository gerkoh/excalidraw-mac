import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  MAX_TABS,
  canAddTab,
  findTabByPath,
  openModeFor,
  snapshotForQuit,
  snapshotForWindowClose,
  normalizeStoredSession,
  filterStoredTabs,
} = require("./tabSession");

const pathTab = (id, filePath) => ({ id, filePath });
const untitled = (id) => ({ id, filePath: null });

describe("canAddTab", () => {
  it("allows every count below the cap, including a brand new window", () => {
    expect(canAddTab(0)).toBe(true);
    expect(canAddTab(MAX_TABS - 1)).toBe(true);
  });

  it("rejects the cap itself and anything that isn't a count", () => {
    expect(canAddTab(MAX_TABS)).toBe(false);
    expect(canAddTab(MAX_TABS + 1)).toBe(false);
    expect(canAddTab(-1)).toBe(false);
    expect(canAddTab(1.5)).toBe(false);
    expect(canAddTab(null)).toBe(false);
    expect(canAddTab(undefined)).toBe(false);
  });
});

describe("findTabByPath", () => {
  const tabs = [pathTab("a", "/a.excalidraw"), untitled("b"), pathTab("c", "/c.excalidraw")];

  it("finds the first tab with that exact path", () => {
    expect(findTabByPath(tabs, "/c.excalidraw")).toEqual(pathTab("c", "/c.excalidraw"));
  });

  it("returns null when the path isn't open", () => {
    expect(findTabByPath(tabs, "/missing.excalidraw")).toBeNull();
    expect(findTabByPath(tabs, "")).toBeNull();
    expect(findTabByPath(tabs, null)).toBeNull();
    expect(findTabByPath(null, "/a.excalidraw")).toBeNull();
  });
});

describe("openModeFor", () => {
  it("focuses a path that is already open, even at the cap", () => {
    expect(openModeFor({ tabCount: MAX_TABS, alreadyOpen: true })).toBe("focus");
  });

  it("adds while there is room", () => {
    expect(openModeFor({ tabCount: 1, alreadyOpen: false })).toBe("add");
    expect(openModeFor({ tabCount: MAX_TABS - 1, alreadyOpen: false })).toBe("add");
  });

  it("replaces the active tab at the cap", () => {
    expect(openModeFor({ tabCount: MAX_TABS, alreadyOpen: false })).toBe("replace");
  });
});

describe("snapshotForQuit", () => {
  it("keeps every saved tab and the active index", () => {
    const tabs = [
      pathTab("a", "/a.excalidraw"),
      pathTab("b", "/b.excalidraw"),
      pathTab("c", "/c.excalidraw"),
    ];
    expect(snapshotForQuit(tabs, "b")).toEqual({
      tabs: [
        { filePath: "/a.excalidraw" },
        { filePath: "/b.excalidraw" },
        { filePath: "/c.excalidraw" },
      ],
      activeIndex: 1,
    });
  });

  it("drops untitled tabs and, on a tie, selects the earlier saved neighbour", () => {
    const tabs = [pathTab("a", "/a.excalidraw"), untitled("b"), pathTab("c", "/c.excalidraw")];
    expect(snapshotForQuit(tabs, "b")).toEqual({
      tabs: [{ filePath: "/a.excalidraw" }, { filePath: "/c.excalidraw" }],
      activeIndex: 0,
    });
  });

  it("selects the only saved neighbour when the active tab is untitled at the end", () => {
    const tabs = [pathTab("a", "/a.excalidraw"), untitled("b")];
    expect(snapshotForQuit(tabs, "b")).toEqual({
      tabs: [{ filePath: "/a.excalidraw" }],
      activeIndex: 0,
    });
  });

  it("writes an empty session when nothing was saved", () => {
    expect(snapshotForQuit([untitled("a"), untitled("b")], "b")).toEqual({
      tabs: [],
      activeIndex: 0,
    });
  });

  it("selects the first saved tab when the active id is already gone", () => {
    const tabs = [pathTab("a", "/a.excalidraw"), pathTab("c", "/c.excalidraw")];
    expect(snapshotForQuit(tabs, "missing")).toEqual({
      tabs: [{ filePath: "/a.excalidraw" }, { filePath: "/c.excalidraw" }],
      activeIndex: 0,
    });
  });

  it("treats a blank path as unsaved", () => {
    expect(snapshotForQuit([pathTab("a", "  "), pathTab("b", "/b.excalidraw")], "a")).toEqual({
      tabs: [{ filePath: "/b.excalidraw" }],
      activeIndex: 0,
    });
  });

  it("treats garbage as an empty session", () => {
    expect(snapshotForQuit(null, "a")).toEqual({ tabs: [], activeIndex: 0 });
    expect(snapshotForQuit(undefined, null)).toEqual({ tabs: [], activeIndex: 0 });
  });
});

describe("snapshotForWindowClose", () => {
  it("remembers only the active tab when it has a file", () => {
    const tabs = [pathTab("a", "/a.excalidraw"), pathTab("b", "/b.excalidraw")];
    expect(snapshotForWindowClose(tabs, "b")).toEqual({
      tabs: [{ filePath: "/b.excalidraw" }],
      activeIndex: 0,
    });
  });

  it("returns null for an untitled active tab so the previous session is left alone", () => {
    const tabs = [pathTab("a", "/a.excalidraw"), untitled("b")];
    expect(snapshotForWindowClose(tabs, "b")).toBeNull();
  });

  it("returns null when the active tab is missing or the list is garbage", () => {
    expect(snapshotForWindowClose([pathTab("a", "/a.excalidraw")], "missing")).toBeNull();
    expect(snapshotForWindowClose(null, "a")).toBeNull();
  });
});

describe("normalizeStoredSession", () => {
  it("keeps a valid session and its active index", () => {
    expect(
      normalizeStoredSession({
        tabs: [{ filePath: "/a.excalidraw" }, { filePath: "/b.excalidraw" }],
        activeIndex: 1,
      }),
    ).toEqual({
      tabs: [{ filePath: "/a.excalidraw" }, { filePath: "/b.excalidraw" }],
      activeIndex: 1,
    });
  });

  it("drops entries without a path and clamps a bad active index", () => {
    expect(
      normalizeStoredSession({
        tabs: [{ filePath: "" }, { filePath: "/b.excalidraw" }, { nope: true }],
        activeIndex: 9,
      }),
    ).toEqual({ tabs: [{ filePath: "/b.excalidraw" }], activeIndex: 0 });
  });

  it("stops at the cap", () => {
    const tabs = Array.from({ length: MAX_TABS + 2 }, (_, index) => ({
      filePath: `/t${index}.excalidraw`,
    }));
    expect(normalizeStoredSession({ tabs, activeIndex: 0 }).tabs).toHaveLength(MAX_TABS);
  });

  it("returns an empty session for missing or malformed payloads", () => {
    const empty = { tabs: [], activeIndex: 0 };
    expect(normalizeStoredSession(undefined)).toEqual(empty);
    expect(normalizeStoredSession(null)).toEqual(empty);
    expect(normalizeStoredSession({})).toEqual(empty);
    expect(normalizeStoredSession({ tabs: "nope" })).toEqual(empty);
    expect(normalizeStoredSession({ tabs: [{ filePath: "  " }] })).toEqual(empty);
  });
});

describe("filterStoredTabs", () => {
  it("drops tabs the predicate rejects and retargets the active index to the nearest survivor", () => {
    const session = {
      tabs: [
        { filePath: "/a.excalidraw" },
        { filePath: "/gone.excalidraw" },
        { filePath: "/c.excalidraw" },
      ],
      activeIndex: 1,
    };
    expect(filterStoredTabs(session, (tab) => tab.filePath !== "/gone.excalidraw")).toEqual({
      tabs: [{ filePath: "/a.excalidraw" }, { filePath: "/c.excalidraw" }],
      activeIndex: 0,
    });
  });

  it("returns an empty session when every tab is rejected", () => {
    expect(
      filterStoredTabs({ tabs: [{ filePath: "/a.excalidraw" }], activeIndex: 0 }, () => false),
    ).toEqual({ tabs: [], activeIndex: 0 });
  });
});
