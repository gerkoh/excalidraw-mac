import { Sidebar } from "@excalidraw/excalidraw";

const SidebarTrigger = () => {
  return (
    <Sidebar.Trigger
      name="copilot"
      tab="chat"
      style={{
        backgroundColor: "#70b1ec",
        border: "none",
        color: "#fff",
        padding: "10px 20px",
        borderRadius: "5px",
      }}
    >
      Copilot
    </Sidebar.Trigger>
  );
};

export default SidebarTrigger;
