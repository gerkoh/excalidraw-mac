const crypto = require("crypto");
const { loadDiagramCheatSheet, resolveDiagramModel, resolveExplanationModel } = require("./model-config");
const { normalizeText } = require("./message-text");
const { textFromMessage, normalizeErrorMessage } = require("./message-text");

function buildDiagramSystemPrompt(config, promptsDir) {
  const customPrompt = normalizeText(config.diagram?.systemPrompt, "");
  const diagramCheatSheet = loadDiagramCheatSheet(promptsDir);

  return (
    `You generate Excalidraw diagrams as structured JSON.\n` +
    `Your ENTIRE response must be a single JSON object — no markdown fences, no explanation text.\n\n` +
    `${diagramCheatSheet}\n` +
    (customPrompt ? `\nAdditional instructions:\n${customPrompt}\n` : "") +
    `\nBEFORE outputting the JSON, mentally walk through each element and verify:\n` +
    `1. No two shapes overlap or touch — every shape has at least 30px clearance from all neighbors.\n` +
    `2. Every arrow with "from"/"to" references an id that exists in the elements array. Mismatched IDs cause invisible arrows.\n` +
    `3. Connection annotations use arrow labels, NOT standalone text elements. Only use standalone text for the diagram title.\n` +
    `4. Arrow labels have enough space and do not collide with neighboring shapes.\n\n` +
    `Response format (output ONLY this JSON):\n` +
    `{\n  "title": "Short diagram title",\n  "elements": [ ...excalidraw elements per the cheat sheet... ]\n}\n\n` +
    `If the question does not benefit from a diagram, respond with:\n{ "title": "", "elements": [] }`
  );
}

function buildExplanationSystemPrompt(config) {
  const { systemPrompt: basePrompt } = resolveExplanationModel(config);

  return (
    `${basePrompt}\n\n` +
    `You are embedded inside an Excalidraw teaching app. ` +
    `Before your explanation, a diagram may have been rendered on the canvas. ` +
    `You will receive a summary of what was drawn, or a note that diagram generation failed. ` +
    `Reference the diagram explicitly when one was rendered — describe the visual structure, connections, and key elements the user can see.\n` +
    `If no diagram was rendered, provide a clear explanation without visual references.`
  );
}

async function createDiagramAgent({ pi, config, promptsDir }) {
  const { agentCore, ai } = pi;
  const modelConfig = resolveDiagramModel(config);

  return new agentCore.Agent({
    initialState: {
      systemPrompt: buildDiagramSystemPrompt(config, promptsDir),
      model: ai.getModel(modelConfig.provider, modelConfig.model),
      tools: [],
      messages: [],
    },
    sessionId: `excalidraw-diagram-${crypto.randomUUID()}`,
  });
}

async function createExplanationAgent({ pi, config, onEvent }) {
  const { agentCore, ai } = pi;
  const { provider, model } = resolveExplanationModel(config);

  const agent = new agentCore.Agent({
    initialState: {
      systemPrompt: buildExplanationSystemPrompt(config),
      model: ai.getModel(provider, model),
      tools: [],
      messages: [],
    },
    sessionId: `excalidraw-explanation-${crypto.randomUUID()}`,
  });

  agent.subscribe((event) => onEvent(event, agent));
  return agent;
}

function mapExplanationEvent(event, agent) {
  switch (event.type) {
    case "message_start":
      return { type: "message_start", role: event.message?.role };
    case "message_update":
      if (event.assistantMessageEvent?.type === "text_delta") {
        return { type: "text_delta", delta: event.assistantMessageEvent.delta ?? "" };
      }
      return null;
    case "message_end":
      return {
        type: "message_end",
        role: event.message?.role,
        text: textFromMessage(event.message),
      };
    case "agent_end":
      return {
        type: "agent_end",
        errorMessage: normalizeErrorMessage(agent.state.errorMessage),
      };
    default:
      return null;
  }
}

module.exports = {
  createDiagramAgent,
  createExplanationAgent,
  mapExplanationEvent,
};
