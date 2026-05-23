import { useState } from "react";
import { Sidebar as ExcalidrawSidebar } from "@excalidraw/excalidraw";
import { CopilotProvider } from "./CopilotProvider";
import { ChatPanel } from "./chat/ChatPanel";

export function CopilotSidebar() {
  const [docked, setDocked] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [isOpen, setIsOpen] = useState(false);

  return (
    <ExcalidrawSidebar
      name="copilot"
      docked={docked}
      onDock={setDocked}
      onStateChange={(state) => {
        setIsOpen(Boolean(state?.name === "copilot"));
        if (state?.name === "copilot" && !docked) {
          setDocked(true);
        }
      }}
      activeTab={activeTab}
      onActiveTabChange={setActiveTab}
    >
      <ExcalidrawSidebar.Header />
      <ExcalidrawSidebar.Tabs
        style={{
          padding: "0.5rem",
          height: "100%",
          minHeight: 0,
          display: "flex",
        }}
        activeTab={activeTab}
        onActiveTabChange={setActiveTab}
      >
        <ExcalidrawSidebar.Tab
          tab="chat"
          style={{ height: "100%", minHeight: 0, display: "flex", flex: 1 }}
        >
          <CopilotProvider isOpen={isOpen}>
            <ChatPanel />
          </CopilotProvider>
        </ExcalidrawSidebar.Tab>
      </ExcalidrawSidebar.Tabs>
    </ExcalidrawSidebar>
  );
}
