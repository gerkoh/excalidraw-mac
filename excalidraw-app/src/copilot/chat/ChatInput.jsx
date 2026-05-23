import { useCallback, useState } from "react";
import { getApplySimpleLayout, setApplySimpleLayout } from "../copilotLayoutSettings";
import { useAutoResizeTextarea } from "./useAutoResizeTextarea";

export function ChatInput({ isStreaming, onSend, onAbort, onReset }) {
  const [applySimpleLayout, setApplySimpleLayoutLocal] = useState(() => getApplySimpleLayout());
  const [draft, setDraft] = useState("");
  const textareaRef = useAutoResizeTextarea(draft);

  const onApplySimpleLayoutChange = useCallback((e) => {
    const checked = e.target.checked;
    setApplySimpleLayoutLocal(checked);
    setApplySimpleLayout(checked);
  }, []);

  const submit = useCallback(async () => {
    const text = draft;
    setDraft("");
    await onSend(text);
  }, [draft, onSend]);

  return (
    <div
      className="chat-input"
      style={{
        flex: "0 0 auto",
        padding: "0.5rem 0.5rem 0",
        borderTop: "1px solid #d0d0d0",
        background: "var(--island-bg-color, #fff)",
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: "0.9rem",
          cursor: "pointer",
          userSelect: "none",
          paddingBottom: 6,
        }}
      >
        <input
          type="checkbox"
          checked={applySimpleLayout}
          onChange={onApplySimpleLayoutChange}
        />
        Apply simple layout
      </label>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder="Ask Copilot…"
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "10px 12px",
          resize: "none",
          lineHeight: 1.5,
          font: "inherit",
          whiteSpace: "pre-wrap",
          overflowWrap: "break-word",
          wordBreak: "break-word",
          borderRadius: "5px",
          border: "1px solid #cccccc",
          boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
        }}
      />
      <div style={{ display: "flex", gap: 8, paddingTop: 8, paddingBottom: 8 }}>
        <button disabled={isStreaming} onClick={() => void submit()}>
          Send
        </button>
        <button disabled={!isStreaming} onClick={onAbort}>
          Abort
        </button>
        <button onClick={onReset}>New session</button>
      </div>
    </div>
  );
}
