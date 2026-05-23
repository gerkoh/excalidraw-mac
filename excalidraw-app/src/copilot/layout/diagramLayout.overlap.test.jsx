import { beforeEach, describe, expect, it, vi } from "vitest";
import { findOverlappingPairs, formatOverlapReport } from "./diagramOverlap";
import { DIAGRAM_FIXTURES } from "./diagramFixtures";
import { resetApplySimpleLayoutForTests } from "../copilotLayoutSettings";

const convertToExcalidrawElements = vi.fn((elements) =>
  elements.flatMap((element) =>
    element.label
      ? [
          element,
          {
            id: `${element.id}-label`,
            type: "text",
            text: element.label.text,
            containerId: element.id,
            x: element.x,
            y: element.y,
            width: element.width,
            height: 20,
            textAlign: element.label.textAlign,
            verticalAlign: element.label.verticalAlign,
          },
        ]
      : [element],
  ),
);
const restore = vi.fn((scene) => ({ elements: scene.elements }));

vi.mock("@excalidraw/excalidraw", () => ({
  FONT_FAMILY: { Excalifont: 1 },
  convertToExcalidrawElements,
  restore,
}));

const { convertCopilotElements } = await import("../convertCopilotElements");

const assertNoSemanticOverlaps = (elements, minGap = 4) => {
  const pairs = findOverlappingPairs(elements, { minGap });
  if (pairs.length > 0) {
    throw new Error(`Semantic overlaps after convert:\n${formatOverlapReport(pairs)}`);
  }
};

const PROMPT_SCENARIOS = [
  {
    name: "TCP 3-way handshake",
    prompt: "Draw a TCP three-way handshake between client and server",
    fixture: DIAGRAM_FIXTURES.tcpHandshake,
  },
  {
    name: "Transformer attention",
    prompt: "Explain transformer self-attention with a flow diagram",
    fixture: DIAGRAM_FIXTURES.transformerAttention,
  },
  {
    name: "Attention branch merge",
    prompt: "Show QKV split and weighted sum merge in attention",
    fixture: DIAGRAM_FIXTURES.attentionBranchMerge,
  },
  {
    name: "Layered microservices",
    prompt: "Draw a 3-tier microservices architecture with background zones",
    fixture: DIAGRAM_FIXTURES.layeredMicroservices,
  },
  {
    name: "Hub fan-out",
    prompt: "Show one API gateway routing to five backend services",
    fixture: DIAGRAM_FIXTURES.fanOutHub,
  },
  {
    name: "Decision tree",
    prompt: "Flowchart: start, diamond valid?, yes process / no reject",
    fixture: DIAGRAM_FIXTURES.decisionTree,
  },
  {
    name: "Cycle graph",
    prompt: "Draw a feedback loop A → B → C → A",
    fixture: DIAGRAM_FIXTURES.cycleGraph,
  },
  {
    name: "Wide labels",
    prompt: "Connect a short node to a long-named authentication service",
    fixture: DIAGRAM_FIXTURES.wideLabelNodes,
  },
  {
    name: "Dense 8-way fan-out",
    prompt: "Show one hub connecting to eight microservices",
    fixture: DIAGRAM_FIXTURES.denseFanOut,
  },
  {
    name: "OAuth2 authorization code",
    prompt: "Draw OAuth2 authorization code flow with user, browser, auth server, and API",
    fixture: DIAGRAM_FIXTURES.oauth2Flow,
  },
  {
    name: "REST API CRUD",
    prompt: "Show a REST POST request from client through API to database and back",
    fixture: DIAGRAM_FIXTURES.restApiCrud,
  },
  {
    name: "Pub/sub queue",
    prompt: "Diagram a message queue with one publisher and two workers",
    fixture: DIAGRAM_FIXTURES.pubSubQueue,
  },
  {
    name: "Load balancer",
    prompt: "Clients hit a load balancer that routes to three servers",
    fixture: DIAGRAM_FIXTURES.loadBalancer,
  },
  {
    name: "CI/CD pipeline",
    prompt: "Linear pipeline: commit → build → test → deploy",
    fixture: DIAGRAM_FIXTURES.ciCdPipeline,
  },
  {
    name: "Kubernetes ingress",
    prompt: "Ingress → service → pods → database",
    fixture: DIAGRAM_FIXTURES.kubernetesIngress,
  },
  {
    name: "TLS handshake",
    prompt: "Draw a simplified TLS handshake between client and server",
    fixture: DIAGRAM_FIXTURES.tlsHandshake,
  },
  {
    name: "Event sourcing",
    prompt: "Command → aggregate → event store → projection → read model",
    fixture: DIAGRAM_FIXTURES.eventSourcing,
  },
  {
    name: "Cache-aside pattern",
    prompt: "App reads cache, on miss queries DB and writes back to cache",
    fixture: DIAGRAM_FIXTURES.cacheAside,
  },
];

beforeEach(() => {
  convertToExcalidrawElements.mockClear();
  restore.mockClear();
  resetApplySimpleLayoutForTests(true);
});

describe("diagram layout overlap (prompt fixtures)", () => {
  it.each(PROMPT_SCENARIOS)(
    "$name — no semantic node overlap after full layout pipeline",
    ({ fixture }) => {
      const elements = convertCopilotElements(fixture(), { applyDagreLayout: true });
      assertNoSemanticOverlaps(elements);
    },
  );

  it("streaming partial layout may overlap until finalize (expected)", () => {
    const partial = convertCopilotElements(DIAGRAM_FIXTURES.fanOutHub(), {
      applyDagreLayout: false,
    });
    const pairs = findOverlappingPairs(partial, { minGap: 0 });
    expect(pairs.length).toBeGreaterThan(0);
  });

  it("finalize pass resolves streaming overlaps for connected fan-out", () => {
    const finalized = convertCopilotElements(DIAGRAM_FIXTURES.fanOutHub(), {
      applyDagreLayout: true,
    });
    assertNoSemanticOverlaps(finalized);
  });

  it("orphan nodes outside dagre graph still overlap (known bug)", () => {
    const elements = convertCopilotElements(DIAGRAM_FIXTURES.orphanNodesAtOrigin(), {
      applyDagreLayout: true,
    });
    const orphanPairs = findOverlappingPairs(elements, { minGap: 4 }).filter(
      (p) => p.a.id?.startsWith("orphan") || p.b.id?.startsWith("orphan"),
    );
    expect(orphanPairs.length).toBeGreaterThan(0);
  });

  // Post-fix spec: unconnected nodes should be grid-placed after dagre pass
  it.skip("orphan nodes get grid-placed when not in dagre graph", () => {
    const elements = convertCopilotElements(DIAGRAM_FIXTURES.orphanNodesAtOrigin(), {
      applyDagreLayout: true,
    });
    expect(findOverlappingPairs(elements, { minGap: 4 })).toHaveLength(0);
  });

  it("disconnected subgraphs: each connected pair is laid out without internal overlap", () => {
    const elements = convertCopilotElements(DIAGRAM_FIXTURES.disconnectedSubgraphs(), {
      applyDagreLayout: true,
    });
    const byId = Object.fromEntries(elements.filter((e) => e.id).map((e) => [e.id, e]));
    expect(byId["g1-a"].x).toBeLessThan(byId["g1-b"].x);
    expect(byId["g2-a"].x).toBeLessThan(byId["g2-b"].x);
  });
});
