const path = require("path");
const fs = require("fs");
const {
  DEFAULT_EXPLANATION_PROMPT,
  DEFAULT_MAX_MODEL_API_ATTEMPTS,
  COPILOT_MODEL_CONFIG_ERROR,
} = require("./constants");
const { normalizeText } = require("./message-text");

const PROJECT_ROOT = path.join(__dirname, "..");
let cachedDiagramCheatSheet = null;

function loadDiagramCheatSheet(baseDir = PROJECT_ROOT) {
  if (cachedDiagramCheatSheet) return cachedDiagramCheatSheet;
  const promptPath = path.join(baseDir, "prompts", "diagram-cheat-sheet.md");
  cachedDiagramCheatSheet = fs.readFileSync(promptPath, "utf-8");
  return cachedDiagramCheatSheet;
}

function clearDiagramCheatSheetCache() {
  cachedDiagramCheatSheet = null;
}

function resolveExplanationModel(copilot) {
  const explanation =
    copilot?.explanation && typeof copilot.explanation === "object" ? copilot.explanation : {};
  const provider =
    typeof explanation.provider === "string" && explanation.provider.trim()
      ? explanation.provider.trim()
      : "";
  const model =
    typeof explanation.model === "string" && explanation.model.trim()
      ? explanation.model.trim()
      : "";

  if (!provider || !model) {
    throw new Error(COPILOT_MODEL_CONFIG_ERROR);
  }

  return {
    provider,
    model,
    systemPrompt: normalizeText(explanation.systemPrompt, DEFAULT_EXPLANATION_PROMPT),
  };
}

function resolveDiagramModel(copilot) {
  resolveExplanationModel(copilot);

  const explanation =
    copilot?.explanation && typeof copilot.explanation === "object" ? copilot.explanation : {};
  const diagram = copilot?.diagram && typeof copilot.diagram === "object" ? copilot.diagram : {};

  const expProvider = normalizeText(explanation.provider, "");
  const expModel = normalizeText(explanation.model, "");

  const diaProvider = normalizeText(diagram.provider, "");
  const diaModel = normalizeText(diagram.model, "");

  if ((diaProvider && !diaModel) || (!diaProvider && diaModel)) {
    throw new Error(
      `${COPILOT_MODEL_CONFIG_ERROR}\n\nDiagram model is incomplete: provide both copilot.diagram.provider and copilot.diagram.model, or remove both to use the explanation model.`,
    );
  }

  if (diaProvider && diaModel) {
    return { provider: diaProvider, model: diaModel };
  }

  return { provider: expProvider, model: expModel };
}

const resolveCopilotAgentModel = resolveDiagramModel;

function resolveMaxModelApiAttempts(copilot) {
  const raw = copilot?.maxModelApiAttempts;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
    return Math.floor(raw);
  }
  return DEFAULT_MAX_MODEL_API_ATTEMPTS;
}

module.exports = {
  loadDiagramCheatSheet,
  clearDiagramCheatSheetCache,
  resolveExplanationModel,
  resolveDiagramModel,
  resolveCopilotAgentModel,
  resolveMaxModelApiAttempts,
};
