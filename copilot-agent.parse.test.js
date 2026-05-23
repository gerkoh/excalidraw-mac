import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  parseDiagramResponse,
  buildDiagramSummary,
  normalizeDiagramElement,
  CopilotTurnAbortedError,
  withModelRetry,
} = require("./copilot-agent-utils.js");

describe("parseDiagramResponse", () => {
  it("parses direct JSON", () => {
    expect(parseDiagramResponse('{"title":"T","elements":[]}')).toEqual({
      title: "T",
      elements: [],
    });
  });

  it("parses fenced JSON code blocks", () => {
    const text = 'Here you go:\n```json\n{"title":"T","elements":[{"id":"a","type":"rectangle","x":0,"y":0,"width":1,"height":1}]}\n```';
    expect(parseDiagramResponse(text)?.elements).toHaveLength(1);
  });

  it("returns null for invalid text", () => {
    expect(parseDiagramResponse("not json")).toBeNull();
    expect(parseDiagramResponse("")).toBeNull();
    expect(parseDiagramResponse(null)).toBeNull();
  });
});

describe("buildDiagramSummary", () => {
  it("describes rendered elements", () => {
    const summary = buildDiagramSummary("TCP", [
      { type: "rectangle", id: "c", label: { text: "Client" } },
      { type: "cameraUpdate", width: 800, height: 600, x: 0, y: 0 },
    ]);
    expect(summary).toContain('titled "TCP"');
    expect(summary).toContain("Client");
  });

  it("returns failure context for the explanation agent", () => {
    const summary = buildDiagramSummary("", [], {
      failed: true,
      errorMessage: "rate limited",
    });
    expect(summary).toContain("Diagram generation failed");
    expect(summary).toContain("rate limited");
  });
});

describe("normalizeDiagramElement", () => {
  it("passes through cameraUpdate without coordinate validation", () => {
    expect(
      normalizeDiagramElement({ type: "cameraUpdate", width: 800, height: 600 }, 0),
    ).toMatchObject({ type: "cameraUpdate", width: 800, height: 600 });
  });

  it("throws when drawable elements lack coordinates", () => {
    expect(() => normalizeDiagramElement({ type: "rectangle", id: "r1" }, 0)).toThrow(
      /missing finite x\/y\/width\/height/,
    );
  });
});

describe("withModelRetry", () => {
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
