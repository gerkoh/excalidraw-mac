import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  stripLastFailedAssistantForRetry,
  resolveMaxModelApiAttempts,
  DEFAULT_MAX_MODEL_API_ATTEMPTS,
  withModelRetry,
  CopilotTurnAbortedError,
} = require("./copilot-agent-utils.js");

describe("stripLastFailedAssistantForRetry", () => {
  it("removes a trailing assistant message with stopReason error", () => {
    const agent = {
      state: {
        messages: [
          { role: "user", content: [{ type: "text", text: "hi" }] },
          { role: "assistant", stopReason: "error", errorMessage: "rate limited" },
        ],
        errorMessage: "rate limited",
      },
    };
    expect(stripLastFailedAssistantForRetry(agent)).toBe(true);
    expect(agent.state.messages).toHaveLength(1);
    expect(agent.state.messages[0].role).toBe("user");
    expect(agent.state.errorMessage).toBeUndefined();
  });

  it("removes assistant when errorMessage is set without stopReason", () => {
    const agent = {
      state: {
        messages: [{ role: "assistant", errorMessage: "boom" }],
        errorMessage: "boom",
      },
    };
    expect(stripLastFailedAssistantForRetry(agent)).toBe(true);
    expect(agent.state.messages).toHaveLength(0);
  });

  it("does not remove aborted assistant turns", () => {
    const messages = [{ role: "assistant", stopReason: "aborted", errorMessage: "nope" }];
    const agent = { state: { messages: [...messages], errorMessage: "nope" } };
    expect(stripLastFailedAssistantForRetry(agent)).toBe(false);
    expect(agent.state.messages).toEqual(messages);
  });

  it("does not remove user or successful assistant messages", () => {
    expect(
      stripLastFailedAssistantForRetry({
        state: { messages: [{ role: "user", content: [] }] },
      }),
    ).toBe(false);
    expect(
      stripLastFailedAssistantForRetry({
        state: {
          messages: [{ role: "assistant", stopReason: "end" }],
        },
      }),
    ).toBe(false);
  });
});

describe("resolveMaxModelApiAttempts", () => {
  it("reads maxModelApiAttempts from copilot config", () => {
    expect(resolveMaxModelApiAttempts({ maxModelApiAttempts: 3 })).toBe(3);
    expect(resolveMaxModelApiAttempts({ maxModelApiAttempts: 7 })).toBe(7);
  });

  it("defaults when config is missing or invalid", () => {
    expect(resolveMaxModelApiAttempts({})).toBe(DEFAULT_MAX_MODEL_API_ATTEMPTS);
    expect(resolveMaxModelApiAttempts({ maxModelApiAttempts: 0 })).toBe(
      DEFAULT_MAX_MODEL_API_ATTEMPTS,
    );
    expect(resolveMaxModelApiAttempts({ maxModelApiAttempts: "5" })).toBe(
      DEFAULT_MAX_MODEL_API_ATTEMPTS,
    );
  });

  it("floors fractional values", () => {
    expect(resolveMaxModelApiAttempts({ maxModelApiAttempts: 2.9 })).toBe(2);
  });
});

describe("withModelRetry maxAttempts", () => {
  it("uses maxAttempts=1 without retrying", async () => {
    const attempts = [];
    const agent = { state: { errorMessage: undefined, messages: [] } };

    await expect(
      withModelRetry(agent, {
        maxAttempts: 1,
        signal: { aborted: false },
        runAttempt: async (attempt) => {
          attempts.push(attempt);
          agent.state.errorMessage = "fail";
        },
      }),
    ).rejects.toThrow("fail");

    expect(attempts).toEqual([1]);
  });

  it("throws CopilotTurnAbortedError when the turn signal is aborted", async () => {
    const agent = { state: { errorMessage: undefined, messages: [] } };
    await expect(
      withModelRetry(agent, {
        signal: { aborted: true },
        runAttempt: async () => {},
      }),
    ).rejects.toThrow(CopilotTurnAbortedError);
  });
});
