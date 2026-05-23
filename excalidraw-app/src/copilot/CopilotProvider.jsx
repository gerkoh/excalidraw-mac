import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createMessageId } from "./provider/createMessageId";
import { getPipelineStatus } from "./provider/copilotPhaseLabels";
import { reduceCopilotEvent } from "./provider/reduceCopilotEvent";

const CopilotContext = createContext(null);

export function CopilotProvider({ isOpen, children }) {
  const streamingTextRef = useRef("");

  const [messages, setMessages] = useState([]);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipelinePhase, setPipelinePhase] = useState(null);
  const [diagramWarning, setDiagramWarning] = useState(undefined);
  const [errorMessage, setErrorMessage] = useState(undefined);

  const eventDraft = useMemo(
    () => ({
      streamingTextRef,
      setMessages,
      setStreamingText,
      setIsStreaming,
      setPipelinePhase,
      setDiagramWarning,
      setErrorMessage,
    }),
    [],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setStreamingText("");
    streamingTextRef.current = "";
    setIsStreaming(false);
    setPipelinePhase(null);
    setDiagramWarning(undefined);
    setErrorMessage(undefined);
    void window.electronAPI?.copilotReset?.();
  }, []);

  const abort = useCallback(() => {
    void window.electronAPI?.copilotAbort?.();
  }, []);

  const handleEvent = useCallback(
    (event) => reduceCopilotEvent(event, eventDraft),
    [eventDraft],
  );

  const sendMessage = useCallback(async (text) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { id: createMessageId(), role: "user", text: trimmed }]);
    setErrorMessage(undefined);
    setDiagramWarning(undefined);

    try {
      const result = await window.electronAPI?.copilotSend?.(trimmed);
      if (result?.aborted) {
        setIsStreaming(false);
        setPipelinePhase(null);
        return;
      }
      if (result?.ok === false) {
        setIsStreaming(false);
        setPipelinePhase(null);
        setErrorMessage(
          typeof result.error === "string" && result.error.trim()
            ? result.error
            : "Copilot could not send the message.",
        );
      }
    } catch (err) {
      setIsStreaming(false);
      setPipelinePhase(null);
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCopilotEvent?.(handleEvent);
    return () => unsubscribe?.();
  }, [handleEvent]);

  useEffect(() => {
    if (!isOpen) return;
    void window.electronAPI?.copilotStart?.().catch((err) => {
      setErrorMessage(err.message);
    });
  }, [isOpen]);

  const pipelineStatus = getPipelineStatus({ isStreaming, pipelinePhase, streamingText });

  const value = useMemo(
    () => ({
      isOpen,
      isStreaming,
      pipelinePhase,
      pipelineStatus,
      diagramWarning,
      errorMessage,
      messages,
      streamingText,
      sendMessage,
      abort,
      reset,
    }),
    [
      abort,
      diagramWarning,
      errorMessage,
      isOpen,
      isStreaming,
      messages,
      pipelinePhase,
      pipelineStatus,
      reset,
      sendMessage,
      streamingText,
    ],
  );

  return <CopilotContext.Provider value={value}>{children}</CopilotContext.Provider>;
}

export function useCopilot() {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error("useCopilot must be used within CopilotProvider");
  }
  return ctx;
}
