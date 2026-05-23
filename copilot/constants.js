const DEFAULT_EXPLANATION_PROMPT =
  "You explain concepts clearly and deeply. When diagrams are created, reference them explicitly and summarize how the visual structure supports the explanation.";

const DEFAULT_MAX_MODEL_API_ATTEMPTS = 5;
const MODEL_RETRY_BASE_DELAY_MS = 1000;

const COPILOT_MODEL_CONFIG_ERROR = `Copilot is not configured: set copilot.explanation.provider and copilot.explanation.model in config.json (there is no default model).
To use a separate diagram model, set both copilot.diagram.provider and copilot.diagram.model; if you omit either diagram field, the explanation model is used for diagrams.
Add the API key for your provider in .env (see .env.example — for example GEMINI_API_KEY for Google).
For packaged builds, place .env in the app userData directory (see README).`;

class CopilotTurnAbortedError extends Error {
  constructor(message = "Copilot turn aborted") {
    super(message);
    this.name = "CopilotTurnAbortedError";
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
  DEFAULT_EXPLANATION_PROMPT,
  DEFAULT_MAX_MODEL_API_ATTEMPTS,
  MODEL_RETRY_BASE_DELAY_MS,
  COPILOT_MODEL_CONFIG_ERROR,
  CopilotTurnAbortedError,
  delay,
};
