import { canAddTab } from "../../../electron/tabSession.js";
import { TITLE_BAR_HEIGHT, TRAFFIC_LIGHT_INSET } from "../../../electron/windowChrome.js";
import { tabLabel } from "../tabs/tabModel";
import "./TabBar.css";

// A saved drawing is named after its file. An unsaved one stays "Untitled",
// with the same leading dot once it has unsaved changes.
const labelFor = (tab) => {
  const name = tabLabel(tab.filePath ?? tab.initialFilePath);
  return tab.dirty ? `• ${name}` : name;
};

const TabBar = ({ theme, tabs, activeId, trafficLights, onSelect, onClose, onNew }) => {
  const canAdd = canAddTab(tabs.length);
  return (
    <div
      role="tablist"
      aria-label="Drawings"
      className={`drawing-tabs drawing-tabs-${theme === "dark" ? "dark" : "light"}`}
      style={{
        height: TITLE_BAR_HEIGHT,
        paddingLeft: trafficLights ? TRAFFIC_LIGHT_INSET : 8,
        // Empty parts of this strip drag the window, since it replaces the title bar.
        WebkitAppRegion: "drag",
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const label = labelFor(tab);
        return (
          <div
            key={tab.id}
            className="drawing-tab"
            data-active={active ? "true" : "false"}
            role="presentation"
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              onClose(tab.id);
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              title={label}
              className="drawing-tab-main"
              onClick={() => onSelect(tab.id)}
            >
              <span className="drawing-tab-label">{label}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${tabLabel(tab.filePath ?? tab.initialFilePath)}`}
              className="drawing-tab-close"
              onClick={() => onClose(tab.id)}
            >
              ×
            </button>
          </div>
        );
      })}
      <button
        type="button"
        aria-label="New tab"
        className="drawing-tab-new"
        disabled={!canAdd}
        onClick={onNew}
      >
        +
      </button>
    </div>
  );
};

export default TabBar;
