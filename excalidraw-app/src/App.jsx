import { useCallback, useEffect, useRef, useState } from "react";
import TabBar from "./components/TabBar";
import TabCanvas from "./components/TabCanvas";
import useTheme from "./hooks/useTheme";
import { useLibraryInstalls } from "./hooks/useLibrary";
import { canAddTab } from "../../electron/tabSession.js";
import {
  addBlankTab,
  addPathTab,
  blankSession,
  closeTab,
  replaceActivePath,
  sessionFromFiles,
  toSessionReport,
  updateTabState,
} from "./tabs/tabModel";

const shownLayer = { position: "absolute", inset: 0 };
const hiddenLayer = {
  position: "absolute",
  inset: 0,
  visibility: "hidden",
  pointerEvents: "none",
};

const CanvasLayer = ({ active, children }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.inert = !active;
  }, [active]);
  return (
    <div
      ref={ref}
      aria-hidden={active ? undefined : true}
      style={active ? shownLayer : hiddenLayer}
    >
      {children}
    </div>
  );
};

export default function App() {
  const [config, setConfig] = useState(null);
  const [session, setSession] = useState(null);
  const [fullScreen, setFullScreen] = useState(false);
  const sessionRef = useRef(null);
  const actionsRef = useRef(new Map());
  const [activeApi, setActiveApi] = useState(null);

  const { theme, handleAppThemeChange } = useTheme();
  useLibraryInstalls({ excalidrawAPI: activeApi });

  const commit = useCallback((next) => {
    sessionRef.current = next;
    setSession(next);
    if (next) window.electronAPI.setDocumentState(toSessionReport(next));
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const cfg = await window.electronAPI.getConfig();
        setConfig(cfg);
      } catch (err) {
        console.error("[App] Failed to load config:", err);
      }
    };
    loadConfig();
  }, []);

  const openPath = useCallback(
    async (filePath, mode) => {
      const current = sessionRef.current;
      if (!current || !filePath) return;
      const decision = addPathTab(current, filePath);
      if (decision.mode === "focus") {
        commit(decision.session);
        return;
      }
      const replace = mode === "replace" || decision.mode === "replace";
      if (replace) {
        // main already confirmed when it sent mode "replace" (Finder / Open Recent at the cap)
        if (mode !== "replace") {
          const ok = await window.electronAPI.confirmReplaceActive();
          if (!ok) return;
        }
        commit(replaceActivePath(sessionRef.current, filePath));
        return;
      }
      commit(decision.session);
    },
    [commit],
  );

  const openFromDialog = useCallback(async () => {
    const result = await window.electronAPI.openFileDialog();
    if (!result?.path) return;
    await openPath(result.path, null);
  }, [openPath]);

  const closeTabById = useCallback(
    async (tabId) => {
      const result = await window.electronAPI.confirmCloseTab(tabId);
      if (result !== "remove") return;
      const actions = actionsRef.current.get(tabId);
      if (actions?.getState().hasFilePath) await actions.save();
      const current = sessionRef.current;
      if (!current) return;
      actionsRef.current.delete(tabId);
      commit(closeTab(current, tabId));
    },
    [commit],
  );

  const addTab = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !canAddTab(current.tabs.length)) return;
    commit(addBlankTab(current));
  }, [commit]);

  useEffect(() => {
    let cancelled = false;
    const loadStartup = async () => {
      try {
        const pending = await window.electronAPI.getPendingFile();
        const startup = await window.electronAPI.getOpenTabs();
        if (cancelled) return;
        let next;
        if (pending) next = sessionFromFiles([pending], 0);
        else if (startup.blank || !startup.tabs?.length) next = blankSession();
        else
          next = sessionFromFiles(
            startup.tabs.map((tab) => tab.filePath),
            startup.activeIndex,
          );
        commit(next);
        if (startup.openDialog) openFromDialog();
      } catch (err) {
        console.error("[App] Failed to restore tabs:", err);
        if (!cancelled) commit(blankSession());
      }
    };
    loadStartup();
    return () => {
      cancelled = true;
    };
  }, [commit, openFromDialog]);

  useEffect(() => {
    return window.electronAPI.onWindowChrome((_event, chrome) => {
      setFullScreen(Boolean(chrome?.fullScreen));
    });
  }, []);

  const menusReady = session !== null;
  useEffect(() => {
    if (!menusReady) return undefined;
    const api = window.electronAPI;
    const unsubs = [
      api.onMenuNewTab(() => addTab()),
      api.onMenuCloseTab(() => {
        const current = sessionRef.current;
        if (current?.activeId) closeTabById(current.activeId);
      }),
      api.onMenuOpen(() => openFromDialog()),
      api.onMenuSave(() => actionsRef.current.get(sessionRef.current?.activeId)?.save()),
      api.onMenuSaveAs(() => actionsRef.current.get(sessionRef.current?.activeId)?.saveAs()),
      api.onOpenFile((_event, filePath, mode) => openPath(filePath, mode)),
      api.onActivateTab((_event, tabId) => {
        const current = sessionRef.current;
        if (!current?.tabs.some((tab) => tab.id === tabId)) return;
        commit({ ...current, activeId: tabId });
      }),
      api.onBeforeClose(async () => {
        try {
          await Promise.all([...actionsRef.current.values()].map((actions) => actions.save()));
        } finally {
          api.acknowledgeClose();
        }
      }),
      api.onSaveAsRequest(async (_event, tabId) => {
        const actions =
          actionsRef.current.get(tabId) ?? actionsRef.current.get(sessionRef.current?.activeId);
        let saved = false;
        try {
          saved = (await actions?.saveAs()) != null;
        } finally {
          api.sendSaveAsResult(saved);
        }
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub?.());
    // Menus read the live session through sessionRef, so tab edits must not resubscribe.
  }, [menusReady, addTab, closeTabById, openFromDialog, openPath, commit]);

  const onTabState = useCallback(
    (tabId, state) => {
      const current = sessionRef.current;
      if (!current) return;
      const next = updateTabState(current, tabId, state);
      if (next !== current) commit(next);
    },
    [commit],
  );

  const onReady = useCallback((tabId, actions) => {
    if (actions) actionsRef.current.set(tabId, actions);
    else actionsRef.current.delete(tabId);
  }, []);

  const onActiveApi = useCallback((api) => setActiveApi(api), []);

  if (!session || theme === undefined) return null;

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <TabBar
        theme={theme}
        tabs={session.tabs}
        activeId={session.activeId}
        trafficLights={!fullScreen}
        onSelect={(tabId) => commit({ ...session, activeId: tabId })}
        onClose={closeTabById}
        onNew={addTab}
      />
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        {session.tabs.map((tab) => (
          <CanvasLayer key={`${tab.id}:${tab.generation}`} active={tab.id === session.activeId}>
            <TabCanvas
              tabKey={tab.id}
              startupPath={tab.initialFilePath}
              config={config}
              theme={theme}
              active={tab.id === session.activeId}
              onState={(state) => onTabState(tab.id, state)}
              onReady={(actions) => onReady(tab.id, actions)}
              onActiveApi={onActiveApi}
              onThemeChange={handleAppThemeChange}
            />
          </CanvasLayer>
        ))}
      </div>
    </div>
  );
}
