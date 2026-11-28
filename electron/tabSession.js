// How many drawings one window keeps. Each tab holds a live canvas, so the cap
// is a memory limit as well as a UI limit.
const MAX_TABS = 8;

const isFilePath = (filePath) => typeof filePath === "string" && filePath.trim() !== "";

const tabFilePath = (tab) => (isFilePath(tab?.filePath) ? tab.filePath : null);

// null means "no window", which can still open the first one. A number is the open count.
const canAddTab = (count, max = MAX_TABS) => Number.isInteger(count) && count >= 0 && count < max;

const findTabByPath = (tabs, filePath) => {
  if (!isFilePath(filePath) || !Array.isArray(tabs)) return null;
  return tabs.find((tab) => tabFilePath(tab) === filePath) ?? null;
};

// "focus" the path is already open, "add" there is room, "replace" the window is at the cap
const openModeFor = ({ tabCount, alreadyOpen }) => {
  if (alreadyOpen) return "focus";
  if (canAddTab(tabCount)) return "add";
  return "replace";
};

// Closest saved tab to `anchor`. A tie keeps the earlier one (the drawing before the gap).
const nearestIndex = (indexes, anchor) => {
  let best = indexes[0];
  let bestDistance = Math.abs(indexes[0] - anchor);
  for (const index of indexes) {
    const distance = Math.abs(index - anchor);
    if (distance < bestDistance || (distance === bestDistance && index < best)) {
      best = index;
      bestDistance = distance;
    }
  }
  return best;
};

const savedIndexes = (tabs) => {
  const indexes = [];
  tabs.forEach((tab, index) => {
    if (tabFilePath(tab)) indexes.push(index);
  });
  return indexes;
};

// Every saved tab, in order. An untitled active tab (discarded, or never saved) selects
// the nearest remaining path. No saved tabs is an empty session, which a quit writes.
const snapshotForQuit = (tabs, activeId) => {
  const list = Array.isArray(tabs) ? tabs : [];
  const kept = savedIndexes(list);
  if (kept.length === 0) return { tabs: [], activeIndex: 0 };

  const activeIndex = list.findIndex((tab) => tab?.id === activeId);
  const anchor = activeIndex === -1 ? 0 : activeIndex;
  const chosen = tabFilePath(list[activeIndex]) ? activeIndex : nearestIndex(kept, anchor);
  return {
    tabs: kept.map((index) => ({ filePath: tabFilePath(list[index]) })),
    activeIndex: kept.indexOf(chosen),
  };
};

// The one drawing a window-close should restore. Null means "leave the stored session
// alone": a blank untitled window must not forget the last real file.
const snapshotForWindowClose = (tabs, activeId) => {
  const list = Array.isArray(tabs) ? tabs : [];
  const active = list.find((tab) => tab?.id === activeId);
  const filePath = tabFilePath(active);
  if (!filePath) return null;
  return { tabs: [{ filePath }], activeIndex: 0 };
};

const emptySession = () => ({ tabs: [], activeIndex: 0 });

// Store payloads are untrusted (hand-edited json, older builds). Drop anything without a path.
const normalizeStoredSession = (raw) => {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.tabs)) return emptySession();
  const tabs = [];
  for (const tab of raw.tabs) {
    if (tabs.length >= MAX_TABS) break;
    const filePath = tabFilePath(tab);
    if (filePath) tabs.push({ filePath });
  }
  if (tabs.length === 0) return emptySession();
  const requested = Number.isInteger(raw.activeIndex) ? raw.activeIndex : 0;
  const activeIndex = requested >= 0 && requested < tabs.length ? requested : 0;
  return { tabs, activeIndex };
};

// `keep` drops paths that are missing or not allowed. If the active one goes, pick the nearest.
const filterStoredTabs = (raw, keep) => {
  const session = normalizeStoredSession(raw);
  const kept = [];
  const keptIndexes = [];
  session.tabs.forEach((tab, index) => {
    if (keep(tab)) {
      kept.push(tab);
      keptIndexes.push(index);
    }
  });
  if (kept.length === 0) return emptySession();
  const chosen = keptIndexes.includes(session.activeIndex)
    ? session.activeIndex
    : nearestIndex(keptIndexes, session.activeIndex);
  return { tabs: kept, activeIndex: keptIndexes.indexOf(chosen) };
};

module.exports = {
  MAX_TABS,
  canAddTab,
  findTabByPath,
  openModeFor,
  snapshotForQuit,
  snapshotForWindowClose,
  normalizeStoredSession,
  filterStoredTabs,
};
