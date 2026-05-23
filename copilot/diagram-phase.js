const crypto = require("crypto");
const { CopilotTurnAbortedError } = require("./constants");
const { textFromMessageNoThinking } = require("./message-text");
const { withModelRetry } = require("./model-retry");
const { resolveMaxModelApiAttempts } = require("./model-config");
const {
  buildDiagramSummary,
  normalizeDiagramElement,
  parseDiagramResponse,
} = require("./diagram-parse");
const { normalizeText } = require("./message-text");
const { createDiagramAgent } = require("./agent-factories");

async function generateDiagram(session, question) {
  const agent = await createDiagramAgent({
    pi: await session.lazyLoadPi(),
    config: session.getCopilotConfig(),
    promptsDir: session.promptsDir,
  });

  if (session.activeTurn) {
    session.activeTurn.diagramAgent = agent;
  }

  let responseText = "";

  agent.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    ) {
      responseText += event.assistantMessageEvent.delta ?? "";
    }
    if (event.type === "message_end") {
      const endText = textFromMessageNoThinking(event.message);
      if (endText && !responseText) {
        responseText = endText;
      }
    }
  });

  await withModelRetry(agent, {
    signal: session.getTurnSignal(),
    maxAttempts: resolveMaxModelApiAttempts(session.getCopilotConfig()),
    runAttempt: async (attempt) => {
      if (attempt === 1) await agent.prompt(question);
      else await agent.continue();
    },
  });

  if (session.activeTurn) {
    session.activeTurn.diagramAgent = null;
  }

  const parsed = parseDiagramResponse(responseText);
  if (!parsed || !Array.isArray(parsed.elements)) {
    const parseError = "Could not parse diagram JSON from the model response.";
    console.warn("[copilot:diagram]", parseError);
    console.warn("[copilot:diagram] Raw (first 500 chars):", responseText.slice(0, 500));
    return { ok: false, error: parseError, rawText: responseText };
  }

  return { ok: true, title: parsed.title, elements: parsed.elements };
}

function emitDiagramToRenderer(session, diagramResult) {
  const title = normalizeText(diagramResult.title, "Copilot diagram");
  const elements = diagramResult.elements;
  const diagramId = crypto.randomUUID();

  session.assertTurnActive();
  session.emit("copilot:diagram-start", { id: diagramId, title, reset: true });

  let drawnCount = 0;
  for (const element of elements) {
    session.assertTurnActive();
    if (element.type === "cameraUpdate") {
      session.emit("copilot:diagram-camera", element);
    } else {
      try {
        const normalized = normalizeDiagramElement(element, drawnCount);
        session.emit("copilot:diagram-element", normalized);
        drawnCount++;
      } catch (err) {
        console.warn("[copilot:diagram] Skipping invalid element:", err.message);
      }
    }
  }

  session.assertTurnActive();
  session.emit("copilot:diagram-end", { id: diagramId, title, elementCount: drawnCount });
  return buildDiagramSummary(title, elements);
}

async function runDiagramPhase(session, question) {
  try {
    const diagramResult = await generateDiagram(session, question);
    if (!diagramResult.ok) {
      const errMsg = diagramResult.error ?? "Diagram generation failed.";
      session.emitEvent({ type: "diagram_error", message: errMsg });
      return buildDiagramSummary("", [], { failed: true, errorMessage: errMsg });
    }
    if (diagramResult.elements.length === 0) {
      return "";
    }
    session.setPhase("drawing");
    return emitDiagramToRenderer(session, diagramResult);
  } catch (err) {
    if (err instanceof CopilotTurnAbortedError) throw err;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[copilot:pipeline] Diagram phase failed:", errMsg);
    session.emitEvent({ type: "diagram_error", message: errMsg });
    return buildDiagramSummary("", [], { failed: true, errorMessage: errMsg });
  }
}

module.exports = {
  generateDiagram,
  emitDiagramToRenderer,
  runDiagramPhase,
};
