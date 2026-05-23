import { describe, expect, it } from "vitest";
import { withDeterministicArrowGeometry } from "./arrowGeometry";

describe("withDeterministicArrowGeometry", () => {
  it("offsets parallel arrows on the same edge pair", () => {
    const nodes = [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 100 },
      { id: "b", type: "rectangle", x: 300, y: 0, width: 100, height: 100 },
    ];
    const arrows = [
      { id: "f1", type: "arrow", from: "a", to: "b" },
      { id: "f2", type: "arrow", from: "a", to: "b" },
      { id: "f3", type: "arrow", from: "a", to: "b" },
    ];
    const out = withDeterministicArrowGeometry([...nodes, ...arrows]);
    const yValues = ["f1", "f2", "f3"].map((id) => out.find((e) => e.id === id).y);
    expect(new Set(yValues).size).toBe(3);
  });

  it("derives orthogonal bindings for horizontal flow", () => {
    const out = withDeterministicArrowGeometry([
      { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      { id: "b", type: "rectangle", x: 250, y: 0, width: 100, height: 50 },
      { id: "edge", type: "arrow", from: "a", to: "b" },
    ]);
    expect(out.find((e) => e.id === "edge")).toMatchObject({
      startBinding: { elementId: "a", fixedPoint: [1, 0.5] },
      endBinding: { elementId: "b", fixedPoint: [0, 0.5] },
    });
  });

  it("derives vertical bindings when nodes are stacked", () => {
    const out = withDeterministicArrowGeometry([
      { id: "top", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      { id: "bottom", type: "rectangle", x: 0, y: 200, width: 100, height: 50 },
      { id: "edge", type: "arrow", from: "top", to: "bottom" },
    ]);
    expect(out.find((e) => e.id === "edge")).toMatchObject({
      startBinding: { fixedPoint: [0.5, 1] },
      endBinding: { fixedPoint: [0.5, 0] },
    });
  });
});
