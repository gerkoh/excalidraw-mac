import { describe, expect, it } from "vitest";
import { withDagreLayout } from "./dagreLayout";
import { findOverlappingPairs, formatOverlapReport } from "./diagramOverlap";
import { DIAGRAM_FIXTURES } from "./diagramFixtures";

const assertNoOverlaps = (elements, minGap = 4) => {
  const pairs = findOverlappingPairs(elements, { minGap });
  if (pairs.length > 0) {
    throw new Error(`Overlapping nodes:\n${formatOverlapReport(pairs)}`);
  }
};

const layoutIds = (elements) =>
  Object.fromEntries(
    elements.filter((e) => e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond").map((e) => [e.id, e]),
  );

describe("withDagreLayout", () => {
  it("returns elements unchanged when there are no semantic arrows", () => {
    const input = [
      { id: "a", type: "rectangle", x: 10, y: 20, width: 100, height: 50 },
      { id: "b", type: "rectangle", x: 30, y: 40, width: 100, height: 50 },
    ];
    const out = withDagreLayout(input);
    expect(out).toEqual(input);
  });

  it("orders TCP handshake endpoints left-to-right", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.tcpHandshake());
    const { client, server } = layoutIds(out);
    expect(client.x).toBeLessThan(server.x);
    assertNoOverlaps(out);
  });

  it("orders transformer attention chain left-to-right", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.transformerAttention());
    const ids = layoutIds(out);
    expect(ids.tokens.x).toBeLessThan(ids.emb.x);
    expect(ids.emb.x).toBeLessThan(ids.qkv.x);
    expect(ids.qkv.x).toBeLessThan(ids.attn.x);
    expect(ids.attn.x).toBeLessThan(ids.out.x);
    assertNoOverlaps(out);
  });

  it("lays out attention branch-merge without node overlap", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.attentionBranchMerge());
    const ids = layoutIds(out);
    expect(ids.emb.x).toBeLessThan(ids.qkv.x);
    expect(ids.emb.x).toBeLessThan(ids.vals.x);
    expect(ids.qkv.x).toBeLessThan(ids.wsum.x);
    expect(ids.vals.x).toBeLessThan(ids.wsum.x);
    assertNoOverlaps(out);
  });

  it("lays out layered microservices without semantic node overlap", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.layeredMicroservices());
    const ids = layoutIds(out);
    expect(ids.browser.x).toBeLessThan(ids.gateway.x);
    expect(ids.gateway.x).toBeLessThan(ids.auth.x);
    expect(ids.gateway.x).toBeLessThan(ids.orders.x);
    // Parallel branches share rank (same x) but must not overlap vertically
    assertNoOverlaps(out);
  });

  it("separates fan-out targets that start stacked at the same point", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.fanOutHub());
    assertNoOverlaps(out);
  });

  it("lays out decision tree branches without overlap", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.decisionTree());
    const ids = layoutIds(out);
    expect(ids.start.x).toBeLessThan(ids.check.x);
    expect(ids.check.x).toBeLessThan(ids.yes.x);
    expect(ids.check.x).toBeLessThan(ids.no.x);
    assertNoOverlaps(out);
  });

  it("lays out cyclic graphs without node overlap", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.cycleGraph());
    assertNoOverlaps(out);
  });

  it("separates disconnected subgraphs (known gap: orphans stack at origin)", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.disconnectedSubgraphs());
    const pairs = findOverlappingPairs(out, { minGap: 4 });
    const g1 = layoutIds(out);
    expect(g1["g1-a"].x).toBeLessThan(g1["g1-b"].x);
    expect(g1["g2-a"].x).toBeLessThan(g1["g2-b"].x);
    expect(pairs.some((p) => p.a.id === "g2-a" && p.b.id === "g2-b")).toBe(false);
  });

  it("documents orphan nodes overlapping when not in the dagre graph", () => {
    const out = withDagreLayout(DIAGRAM_FIXTURES.orphanNodesAtOrigin());
    const pairs = findOverlappingPairs(out, { minGap: 4 });
    const orphanOverlap = pairs.filter(
      (p) =>
        (p.a.id?.startsWith("orphan") && p.b.id?.startsWith("orphan")) ||
        (p.a.id?.startsWith("orphan") && p.b.id?.startsWith("orphan")),
    );
    expect(orphanOverlap.length).toBeGreaterThan(0);
  });
});
