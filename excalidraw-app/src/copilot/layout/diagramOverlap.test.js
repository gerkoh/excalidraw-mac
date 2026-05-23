import { describe, expect, it } from "vitest";
import {
  boundsOverlap,
  findOverlappingPairs,
  formatOverlapReport,
  getElementBounds,
  isBackgroundZone,
  isLayoutNode,
  overlapArea,
} from "./diagramOverlap";

describe("diagramOverlap", () => {
  it("detects axis-aligned overlap", () => {
    const a = getElementBounds({ x: 0, y: 0, width: 100, height: 50 });
    const b = getElementBounds({ x: 50, y: 25, width: 100, height: 50 });
    expect(boundsOverlap(a, b)).toBe(true);
    expect(overlapArea(a, b)).toBe(50 * 25);
  });

  it("respects minGap between boxes", () => {
    const a = getElementBounds({ x: 0, y: 0, width: 100, height: 50 });
    const b = getElementBounds({ x: 104, y: 0, width: 100, height: 50 });
    expect(boundsOverlap(a, b, 0)).toBe(false);
    expect(boundsOverlap(a, b, 8)).toBe(true);
  });

  it("ignores background zones and container-bound labels", () => {
    expect(
      isBackgroundZone({ type: "rectangle", opacity: 30, x: 0, y: 0, width: 800, height: 400 }),
    ).toBe(true);
    expect(
      isLayoutNode({ type: "rectangle", opacity: 30, x: 0, y: 0, width: 800, height: 400 }),
    ).toBe(false);
    expect(
      isLayoutNode({
        type: "text",
        containerId: "box",
        x: 10,
        y: 10,
        width: 40,
        height: 20,
      }),
    ).toBe(false);
  });

  it("finds overlapping semantic nodes", () => {
    const pairs = findOverlappingPairs([
      { id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 50 },
      { id: "b", type: "rectangle", x: 20, y: 10, width: 100, height: 50 },
      { id: "arrow", type: "arrow", x: 0, y: 0, width: 200, height: 0 },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("a");
    expect(pairs[0].b.id).toBe("b");
  });

  it("formats overlap reports for debugging", () => {
    const report = formatOverlapReport([
      {
        a: { id: "x", type: "rectangle" },
        b: { id: "y", type: "rectangle" },
        overlapPx: 1200,
      },
    ]);
    expect(report).toContain("x ↔ y");
    expect(report).toContain("1200px²");
  });
});
