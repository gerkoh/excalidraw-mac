const {
  DEFAULT_MAX_MODEL_API_ATTEMPTS,
  MODEL_RETRY_BASE_DELAY_MS,
  CopilotTurnAbortedError,
  delay,
} = require("./constants");

function stripLastFailedAssistantForRetry(agent) {
  const state = agent?.state;
  if (!state || !Array.isArray(state.messages)) return false;
  const msgs = state.messages;
  const last = msgs[msgs.length - 1];
  if (!last || typeof last !== "object" || last.role !== "assistant") return false;
  if (last.stopReason === "aborted") return false;
  if (last.stopReason !== "error" && !last.errorMessage) return false;

  state.messages = msgs.slice(0, -1);
  state.errorMessage = undefined;
  return true;
}

async function withModelRetry(agent, { runAttempt, signal, maxAttempts = DEFAULT_MAX_MODEL_API_ATTEMPTS }) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) {
      throw new CopilotTurnAbortedError();
    }

    try {
      if (attempt > 1) {
        await delay(MODEL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 2));
        if (signal?.aborted) throw new CopilotTurnAbortedError();
        if (!stripLastFailedAssistantForRetry(agent)) break;
      }

      await runAttempt(attempt);

      if (!agent.state.errorMessage) break;
      if (attempt === maxAttempts) break;
      if (!stripLastFailedAssistantForRetry(agent)) break;
    } catch (err) {
      if (signal?.aborted || err instanceof CopilotTurnAbortedError) throw err;
      if (attempt === maxAttempts) throw err;
      await delay(MODEL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
      if (signal?.aborted) throw new CopilotTurnAbortedError();
      if (!stripLastFailedAssistantForRetry(agent)) throw err;
    }
  }

  if (agent.state.errorMessage) {
    throw new Error(agent.state.errorMessage);
  }
}

module.exports = {
  stripLastFailedAssistantForRetry,
  withModelRetry,
};
