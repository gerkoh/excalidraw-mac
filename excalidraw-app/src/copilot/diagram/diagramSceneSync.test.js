import { describe, expect, it, vi } from "vitest";
import { createSceneSync } from "./diagramSceneSync";

const convertCopilotElements = vi.fn((raw) =>
  raw.map((el) => ({ ...el, converted: true })),
);

vi.mock("../convertCopilotElements", () => ({
  convertCopilotElements: (...args) => convertCopilotElements(...args),
}));

vi.mock("../copilotLayoutSettings", () => ({
  getApplySimpleLayout: () => true,
}));

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "IMMEDIATELY" },
}));

describe("diagramSceneSync", () => {
  it("clears only copilot-owned elements", () => {
    const sceneElementsRef = {
      current: [
        { id: "user", type: "rectangle" },
        { id: "copilot-a", type: "rectangle" },
      ],
    };
    const copilotRawRef = { current: [{ id: "copilot-a" }] };
    const copilotElementIdsRef = { current: new Set(["copilot-a"]) };
    const updates = [];

    const excalidrawAPI = {
      updateScene: (payload) => updates.push(payload),
    };

    const scene = createSceneSync({
      excalidrawAPI,
      sceneElementsRef,
      copilotRawRef,
      copilotElementIdsRef,
    });

    scene.clearCopilotElements();

    expect(copilotRawRef.current).toEqual([]);
    expect(copilotElementIdsRef.current.size).toBe(0);
    expect(updates.at(-1).elements).toEqual([{ id: "user", type: "rectangle" }]);
  });
});
