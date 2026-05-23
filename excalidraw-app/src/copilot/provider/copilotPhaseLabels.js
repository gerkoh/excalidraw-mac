export const PHASE_LABELS = {
  diagram: "Generating diagram…",
  drawing: "Drawing on canvas…",
  explaining: "Writing explanation…",
};

export function getPipelineStatus({ isStreaming, pipelinePhase, streamingText }) {
  if (!isStreaming || !pipelinePhase || streamingText) return null;
  return PHASE_LABELS[pipelinePhase] ?? null;
}
