import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  resolveCopilotAgentModel,
  resolveMaxModelApiAttempts,
  DEFAULT_MAX_MODEL_API_ATTEMPTS,
  COPILOT_MODEL_CONFIG_ERROR,
} = require("./copilot-agent-utils.js");

describe("resolveCopilotAgentModel", () => {
  it("requires explanation provider and model", () => {
    expect(() => resolveCopilotAgentModel({ explanation: {} })).toThrow(COPILOT_MODEL_CONFIG_ERROR);
    expect(() =>
      resolveCopilotAgentModel({ explanation: { provider: "google", model: "" } }),
    ).toThrow(COPILOT_MODEL_CONFIG_ERROR);
    expect(() =>
      resolveCopilotAgentModel({ explanation: { provider: "", model: "m" } }),
    ).toThrow(COPILOT_MODEL_CONFIG_ERROR);
  });

  it("returns explanation model when diagram is not fully specified", () => {
    expect(
      resolveCopilotAgentModel({
        explanation: { provider: "google", model: "gemma" },
        diagram: {},
      }),
    ).toEqual({ provider: "google", model: "gemma" });
  });

  it("returns diagram model when both diagram fields are set", () => {
    expect(
      resolveCopilotAgentModel({
        explanation: { provider: "google", model: "exp" },
        diagram: { provider: "openai", model: "gpt" },
      }),
    ).toEqual({ provider: "openai", model: "gpt" });
  });

  it("rejects partial diagram model fields", () => {
    expect(() =>
      resolveCopilotAgentModel({
        explanation: { provider: "google", model: "exp" },
        diagram: { provider: "google", model: "" },
      }),
    ).toThrow(/Diagram model is incomplete/);
    expect(() =>
      resolveCopilotAgentModel({
        explanation: { provider: "google", model: "exp" },
        diagram: { model: "m" },
      }),
    ).toThrow(/Diagram model is incomplete/);
  });
});

describe("resolveMaxModelApiAttempts", () => {
  it("uses copilot.maxModelApiAttempts from config", () => {
    expect(
      resolveMaxModelApiAttempts({
        maxModelApiAttempts: 5,
        explanation: { provider: "google", model: "m" },
      }),
    ).toBe(5);
  });

  it("falls back to default when unset", () => {
    expect(resolveMaxModelApiAttempts({ explanation: { provider: "google", model: "m" } })).toBe(
      DEFAULT_MAX_MODEL_API_ATTEMPTS,
    );
  });
});
