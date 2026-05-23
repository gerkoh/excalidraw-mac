import { describe, expect, it } from "vitest";
import { withDagreLayout } from "./dagreLayout";
import { findOverlappingPairs } from "./diagramOverlap";

const chain = (count) => {
  const nodes = Array.from({ length: count }, (_, i) => ({
    id: `n${i}`,
    type: "rectangle",
    x: i * 17,
    y: i * 23,
    width: 80,
    height: 40,
    label: { text: `N${i}` },
  }));
  const edges = Array.from({ length: count - 1 }, (_, i) => ({
    id: `e${i}`,
    type: "arrow",
    from: `n${i}`,
    to: `n${i + 1}`,
  }));
  return [...nodes, ...edges];
};

const fanIn = (count) => {
  const sources = Array.from({ length: count }, (_, i) => ({
    id: `s${i}`,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 70,
    height: 36,
  }));
  return [
    ...sources,
    { id: "sink", type: "rectangle", x: 0, y: 0, width: 90, height: 44 },
    ...sources.map((s, i) => ({ id: `e${i}`, type: "arrow", from: s.id, to: "sink" })),
  ];
};

describe("withDagreLayout edge cases", () => {
  it("lays out a 12-node linear chain without overlap", () => {
    const out = withDagreLayout(chain(12));
    expect(findOverlappingPairs(out, { minGap: 4 })).toHaveLength(0);
  });

  it("lays out 8-way fan-in without overlap", () => {
    const out = withDagreLayout(fanIn(8));
    expect(findOverlappingPairs(out, { minGap: 4 })).toHaveLength(0);
  });

  it("ignores self-loop arrows", () => {
    const out = withDagreLayout([
      { id: "a", type: "rectangle", x: 0, y: 0, width: 80, height: 40 },
      { id: "b", type: "rectangle", x: 200, y: 0, width: 80, height: 40 },
      { id: "loop", type: "arrow", from: "a", to: "a" },
      { id: "edge", type: "arrow", from: "a", to: "b" },
    ]);
    const byId = Object.fromEntries(out.filter((e) => e.id).map((e) => [e.id, e]));
    expect(byId.a.x).toBeLessThan(byId.b.x);
    expect(findOverlappingPairs(out, { minGap: 4 })).toHaveLength(0);
  });

  it("leaves arrow-only diagrams unchanged", () => {
    const input = [{ id: "a", type: "arrow", x: 0, y: 0, width: 100, height: 0, points: [[0, 0], [100, 0]] }];
    expect(withDagreLayout(input)).toEqual(input);
  });

  it("handles diamond decision nodes in a branching graph", () => {
    const out = withDagreLayout([
      { id: "start", type: "ellipse", x: 0, y: 0, width: 90, height: 50 },
      { id: "gate", type: "diamond", x: 100, y: 100, width: 100, height: 70 },
      { id: "left", type: "rectangle", x: 0, y: 200, width: 80, height: 40 },
      { id: "right", type: "rectangle", x: 200, y: 200, width: 80, height: 40 },
      { id: "e1", type: "arrow", from: "start", to: "gate" },
      { id: "e2", type: "arrow", from: "gate", to: "left" },
      { id: "e3", type: "arrow", from: "gate", to: "right" },
    ]);
    expect(findOverlappingPairs(out, { minGap: 4 })).toHaveLength(0);
  });
});
