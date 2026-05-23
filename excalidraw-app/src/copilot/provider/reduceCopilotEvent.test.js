import { describe, expect, it, vi } from "vitest";
import { reduceCopilotEvent } from "./reduceCopilotEvent";

function createDraft() {
  const streamingTextRef = { current: "" };
  return {
    streamingTextRef,
    setMessages: vi.fn(),
    setStreamingText: vi.fn((value) => {
      if (typeof value === "function") return;
      streamingTextRef.display = value;
    }),
    setIsStreaming: vi.fn(),
    setPipelinePhase: vi.fn(),
    setDiagramWarning: vi.fn(),
    setErrorMessage: vi.fn(),
  };
}

describe("reduceCopilotEvent", () => {
  it("clears streaming text on message_end", () => {
    const draft = createDraft();
    draft.streamingTextRef.current = "hello world";

    reduceCopilotEvent(
      { type: "message_end", role: "assistant", text: "hello world" },
      draft,
    );

    expect(draft.setStreamingText).toHaveBeenCalledWith("");
    expect(draft.streamingTextRef.current).toBe("");
    expect(draft.setMessages).toHaveBeenCalled();
  });
});
