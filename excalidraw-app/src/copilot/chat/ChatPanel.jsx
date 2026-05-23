import { useCallback, useRef } from "react";
import { useCopilot } from "../CopilotProvider";
import { ChatInput } from "./ChatInput";
import { ChatMessageList } from "./ChatMessageList";

export function ChatPanel() {
  const {
    messages,
    streamingText,
    isStreaming,
    pipelineStatus,
    diagramWarning,
    errorMessage,
    sendMessage,
    abort,
    reset,
  } = useCopilot();
  const containerRef = useRef(null);

  const forcePlainTextClipboard = useCallback((e) => {
    const root = containerRef.current;
    if (!root) return;

    const active = document.activeElement;
    if (active && root.contains(active)) return;

    const sel = window.getSelection?.();
    const text = sel?.toString?.() ?? "";
    if (!text) return;

    const anchorNode = sel?.anchorNode;
    if (anchorNode && !root.contains(anchorNode)) return;

    e.preventDefault();
    e.stopPropagation();
    e.clipboardData?.setData("text/plain", text);
  }, []);

  return (
    <div
      className="chat-container"
      ref={containerRef}
      onCopyCapture={forcePlainTextClipboard}
      onCutCapture={forcePlainTextClipboard}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
      }}
    >
      <ChatMessageList
        messages={messages}
        pipelineStatus={pipelineStatus}
        streamingText={streamingText}
        diagramWarning={diagramWarning}
        errorMessage={errorMessage}
      />
      <ChatInput
        isStreaming={isStreaming}
        onSend={sendMessage}
        onAbort={abort}
        onReset={reset}
      />
    </div>
  );
}
