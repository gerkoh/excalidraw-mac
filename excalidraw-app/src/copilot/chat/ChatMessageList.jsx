import { CopilotMarkdown } from "../CopilotMarkdown";

export function ChatMessageList({
  messages,
  pipelineStatus,
  streamingText,
  diagramWarning,
  errorMessage,
}) {
  return (
    <div
      className="chat-streaming-response"
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        padding: "0.5rem",
        userSelect: "text",
        cursor: "text",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      {messages.map((m) => (
        <div key={m.id} className="copilot-message copilot-message--markdown">
          <strong style={{ textTransform: "capitalize", display: "block", marginBottom: 6 }}>
            {m.role}
          </strong>
          {m.role === "user" ? (
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
          ) : (
            <CopilotMarkdown text={m.text} />
          )}
        </div>
      ))}
      {pipelineStatus ? (
        <div style={{ color: "var(--color-gray-60, #666)", fontStyle: "italic" }}>
          {pipelineStatus}
        </div>
      ) : null}
      {streamingText ? (
        <div className="copilot-message copilot-message--streaming copilot-message--markdown">
          <strong style={{ display: "block", marginBottom: 6 }}>assistant</strong>
          <CopilotMarkdown text={streamingText} />
        </div>
      ) : null}
      {diagramWarning ? (
        <div style={{ whiteSpace: "pre-wrap", color: "#8a6d00" }}>
          <strong>diagram</strong>: {diagramWarning} (continuing with explanation only)
        </div>
      ) : null}
      {errorMessage ? (
        <div style={{ whiteSpace: "pre-wrap", color: "#b00020" }}>
          <strong>error</strong>: {errorMessage}
        </div>
      ) : null}
    </div>
  );
}
