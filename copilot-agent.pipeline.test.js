import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { CopilotAgentSession } = require("./copilot-agent.js");

describe("CopilotAgentSession", () => {
  it("rejects overlapping send() calls", async () => {
    const session = new CopilotAgentSession({
      getConfig: () => ({ copilot: { enabled: true } }),
      getWindows: () => [],
    });
    session.activeTurn = { aborted: false, diagramAgent: null };

    await expect(session.send("hello")).resolves.toEqual({
      ok: false,
      error: "A copilot turn is already in progress.",
    });
  });
});
