import { createMessageId } from "./createMessageId";

const clearStreaming = (draft) => {
  draft.streamingTextRef.current = "";
  draft.setStreamingText("");
};

/**
 * Pure reducer for copilot IPC events. Mutates `draft` state snapshots in place
 * via setters passed from the provider.
 */
export function reduceCopilotEvent(event, draft) {
  switch (event.type) {
    case "agent_start": {
      draft.setIsStreaming(true);
      draft.setPipelinePhase("diagram");
      draft.setDiagramWarning(undefined);
      draft.setErrorMessage(undefined);
      return;
    }
    case "phase_change": {
      draft.setPipelinePhase(typeof event.phase === "string" ? event.phase : null);
      return;
    }
    case "diagram_error": {
      const message =
        typeof event.message === "string" && event.message.trim()
          ? event.message.trim()
          : "Diagram generation failed.";
      draft.setDiagramWarning(message);
      return;
    }
    case "agent_end": {
      draft.setIsStreaming(false);
      draft.setPipelinePhase(null);
      if (event.aborted) {
        clearStreaming(draft);
        return;
      }
      draft.setErrorMessage(event.errorMessage);
      clearStreaming(draft);
      return;
    }
    case "message_start": {
      if (event.role === "assistant") {
        clearStreaming(draft);
        draft.setPipelinePhase("explaining");
      }
      return;
    }
    case "text_delta": {
      const delta = event.delta ?? "";
      if (typeof delta === "string" && delta.length) {
        draft.streamingTextRef.current += delta;
        draft.setStreamingText(draft.streamingTextRef.current);
      }
      return;
    }
    case "message_end": {
      if (event.role !== "assistant") return;
      const text = event.text || draft.streamingTextRef.current;
      if (text) {
        draft.setMessages((prev) => [
          ...prev,
          { id: createMessageId(), role: "assistant", text },
        ]);
      }
      clearStreaming(draft);
      draft.setPipelinePhase(null);
      return;
    }
    case "reset": {
      draft.setMessages([]);
      clearStreaming(draft);
      draft.setIsStreaming(false);
      draft.setPipelinePhase(null);
      draft.setDiagramWarning(undefined);
      draft.setErrorMessage(undefined);
      return;
    }
    default:
      return;
  }
}
