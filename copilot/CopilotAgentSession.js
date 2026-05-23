const path = require("path");
const { CopilotTurnAbortedError } = require("./constants");
const { normalizeErrorMessage } = require("./message-text");
const { createExplanationAgent, mapExplanationEvent } = require("./agent-factories");
const { runDiagramPhase } = require("./diagram-phase");
const { generateExplanation } = require("./explanation-phase");

class CopilotAgentSession {
  constructor({ getConfig, getWindows }) {
    this.getConfig = getConfig;
    this.getWindows = getWindows;
    this.explanationAgent = null;
    this.pi = null;
    this.activeTurn = null;
    this.promptsDir = path.join(__dirname, "..");
  }

  async lazyLoadPi() {
    if (!this.pi) {
      this.pi = {
        agentCore: await import("@earendil-works/pi-agent-core"),
        ai: await import("@earendil-works/pi-ai"),
      };
    }
    return this.pi;
  }

  emit(channel, payload) {
    for (const win of this.getWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }

  emitEvent(payload) {
    this.emit("copilot:event", payload);
  }

  getTurnSignal() {
    return this.activeTurn ?? { aborted: true };
  }

  assertTurnActive() {
    if (this.getTurnSignal().aborted) {
      throw new CopilotTurnAbortedError();
    }
  }

  getCopilotConfig() {
    return this.getConfig()?.copilot ?? {};
  }

  isEnabled() {
    return this.getCopilotConfig().enabled !== false;
  }

  setPhase(phase) {
    this.emitEvent({ type: "phase_change", phase });
  }

  async ensureExplanationAgent() {
    if (!this.explanationAgent) {
      this.explanationAgent = await createExplanationAgent({
        pi: await this.lazyLoadPi(),
        config: this.getCopilotConfig(),
        onEvent: (event, agent) => {
          const mapped = mapExplanationEvent(event, agent);
          if (mapped) this.emitEvent(mapped);
        },
      });
    }
    return this.explanationAgent;
  }

  async start() {
    if (!this.isEnabled()) throw new Error("Copilot is disabled in config.json");
    await this.ensureExplanationAgent();
    return { ok: true };
  }

  async send(text) {
    if (typeof text !== "string" || !text.trim()) return { ok: false };
    if (this.activeTurn) {
      return { ok: false, error: "A copilot turn is already in progress." };
    }

    await this.start();
    const trimmed = text.trim();
    this.activeTurn = { aborted: false, diagramAgent: null };

    try {
      this.emitEvent({ type: "agent_start" });
      this.setPhase("diagram");

      const diagramSummary = await runDiagramPhase(this, trimmed);

      this.assertTurnActive();
      this.setPhase("explaining");
      await generateExplanation(this, trimmed, diagramSummary);
      return { ok: true };
    } catch (err) {
      if (err instanceof CopilotTurnAbortedError) {
        return { ok: false, aborted: true };
      }
      const errText = err instanceof Error ? err.message : String(err);
      this.emitEvent({
        type: "agent_end",
        errorMessage: normalizeErrorMessage(errText),
      });
      return { ok: false, error: normalizeErrorMessage(errText) ?? errText };
    } finally {
      this.activeTurn = null;
    }
  }

  abort() {
    if (this.activeTurn) {
      this.activeTurn.aborted = true;
      this.activeTurn.diagramAgent?.abort();
    }
    this.explanationAgent?.abort();
    this.emit("copilot:diagram-abort", {});
    this.emitEvent({ type: "agent_end", errorMessage: undefined, aborted: true });
    this.activeTurn = null;
    return { ok: true };
  }

  reset() {
    this.abort();
    this.explanationAgent?.reset();
    this.emitEvent({ type: "reset" });
    return { ok: true };
  }

  dispose() {
    this.abort();
    this.explanationAgent = null;
  }
}

module.exports = { CopilotAgentSession };
