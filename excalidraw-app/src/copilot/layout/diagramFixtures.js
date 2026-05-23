/** Messy LLM-style coordinates — layout should normalize these. */

export const tcpHandshake = () => [
  {
    id: "client",
    type: "rectangle",
    x: 880,
    y: 420,
    width: 120,
    height: 56,
    label: { text: "Client" },
  },
  {
    id: "server",
    type: "rectangle",
    x: 15,
    y: 8,
    width: 120,
    height: 56,
    label: { text: "Server" },
  },
  { id: "syn", type: "arrow", from: "client", to: "server", label: { text: "SYN" } },
  { id: "synack", type: "arrow", from: "server", to: "client", label: { text: "SYN-ACK" } },
  { id: "ack", type: "arrow", from: "client", to: "server", label: { text: "ACK" } },
];

export const transformerAttention = () => [
  { id: "tokens", type: "rectangle", x: 0, y: 0, width: 100, height: 48, label: { text: "Tokens" } },
  { id: "emb", type: "rectangle", x: 500, y: 200, width: 100, height: 48, label: { text: "Embedding" } },
  { id: "qkv", type: "rectangle", x: 10, y: 300, width: 100, height: 48, label: { text: "QKV" } },
  { id: "attn", type: "rectangle", x: 400, y: 50, width: 110, height: 48, label: { text: "Attention" } },
  { id: "out", type: "rectangle", x: 700, y: 600, width: 100, height: 48, label: { text: "Output" } },
  { id: "a1", type: "arrow", from: "tokens", to: "emb" },
  { id: "a2", type: "arrow", from: "emb", to: "qkv" },
  { id: "a3", type: "arrow", from: "qkv", to: "attn" },
  { id: "a4", type: "arrow", from: "attn", to: "out" },
];

export const attentionBranchMerge = () => [
  { id: "emb", type: "rectangle", x: 200, y: 200, width: 90, height: 44, label: { text: "Embedding" } },
  { id: "qkv", type: "rectangle", x: 50, y: 50, width: 90, height: 44, label: { text: "QKV" } },
  { id: "vals", type: "rectangle", x: 700, y: 1, width: 90, height: 44, label: { text: "Values" } },
  { id: "wsum", type: "rectangle", x: 3, y: 600, width: 96, height: 44, label: { text: "Weighted Sum" } },
  { id: "e1", type: "arrow", from: "emb", to: "qkv" },
  { id: "e2", type: "arrow", from: "emb", to: "vals" },
  { id: "e3", type: "arrow", from: "qkv", to: "wsum" },
  { id: "e4", type: "arrow", from: "vals", to: "wsum" },
];

export const layeredMicroservices = () => [
  {
    id: "ui-zone",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 900,
    height: 180,
    opacity: 30,
    backgroundColor: "#dbe4ff",
  },
  {
    id: "api-zone",
    type: "rectangle",
    x: 0,
    y: 200,
    width: 900,
    height: 180,
    opacity: 30,
    backgroundColor: "#e5dbff",
  },
  {
    id: "browser",
    type: "rectangle",
    x: 40,
    y: 40,
    width: 120,
    height: 56,
    label: { text: "Browser" },
  },
  {
    id: "gateway",
    type: "rectangle",
    x: 40,
    y: 240,
    width: 120,
    height: 56,
    label: { text: "API Gateway" },
  },
  {
    id: "auth",
    type: "rectangle",
    x: 240,
    y: 240,
    width: 120,
    height: 56,
    label: { text: "Auth" },
  },
  {
    id: "orders",
    type: "rectangle",
    x: 440,
    y: 240,
    width: 120,
    height: 56,
    label: { text: "Orders" },
  },
  { id: "a1", type: "arrow", from: "browser", to: "gateway" },
  { id: "a2", type: "arrow", from: "gateway", to: "auth" },
  { id: "a3", type: "arrow", from: "gateway", to: "orders" },
];

export const fanOutHub = () => [
  { id: "hub", type: "rectangle", x: 100, y: 100, width: 100, height: 50, label: { text: "Hub" } },
  { id: "s1", type: "rectangle", x: 100, y: 100, width: 90, height: 44, label: { text: "S1" } },
  { id: "s2", type: "rectangle", x: 100, y: 100, width: 90, height: 44, label: { text: "S2" } },
  { id: "s3", type: "rectangle", x: 100, y: 100, width: 90, height: 44, label: { text: "S3" } },
  { id: "s4", type: "rectangle", x: 100, y: 100, width: 90, height: 44, label: { text: "S4" } },
  { id: "s5", type: "rectangle", x: 100, y: 100, width: 90, height: 44, label: { text: "S5" } },
  { id: "e1", type: "arrow", from: "hub", to: "s1" },
  { id: "e2", type: "arrow", from: "hub", to: "s2" },
  { id: "e3", type: "arrow", from: "hub", to: "s3" },
  { id: "e4", type: "arrow", from: "hub", to: "s4" },
  { id: "e5", type: "arrow", from: "hub", to: "s5" },
];

export const orphanNodesAtOrigin = () => [
  { id: "connected-a", type: "rectangle", x: 0, y: 0, width: 100, height: 50, label: { text: "A" } },
  { id: "connected-b", type: "rectangle", x: 300, y: 0, width: 100, height: 50, label: { text: "B" } },
  { id: "orphan-1", type: "rectangle", x: 0, y: 0, width: 100, height: 50, label: { text: "Orphan 1" } },
  { id: "orphan-2", type: "rectangle", x: 0, y: 0, width: 100, height: 50, label: { text: "Orphan 2" } },
  { id: "edge", type: "arrow", from: "connected-a", to: "connected-b" },
];

export const decisionTree = () => [
  { id: "start", type: "ellipse", x: 0, y: 0, width: 100, height: 60, label: { text: "Start" } },
  { id: "check", type: "diamond", x: 200, y: 0, width: 120, height: 80, label: { text: "Valid?" } },
  { id: "yes", type: "rectangle", x: 400, y: -60, width: 100, height: 50, label: { text: "Process" } },
  { id: "no", type: "rectangle", x: 400, y: 80, width: 100, height: 50, label: { text: "Reject" } },
  { id: "e1", type: "arrow", from: "start", to: "check" },
  { id: "e2", type: "arrow", from: "check", to: "yes", label: { text: "yes" } },
  { id: "e3", type: "arrow", from: "check", to: "no", label: { text: "no" } },
];

export const cycleGraph = () => [
  { id: "a", type: "rectangle", x: 0, y: 0, width: 90, height: 44, label: { text: "A" } },
  { id: "b", type: "rectangle", x: 200, y: 100, width: 90, height: 44, label: { text: "B" } },
  { id: "c", type: "rectangle", x: 0, y: 200, width: 90, height: 44, label: { text: "C" } },
  { id: "e1", type: "arrow", from: "a", to: "b" },
  { id: "e2", type: "arrow", from: "b", to: "c" },
  { id: "e3", type: "arrow", from: "c", to: "a" },
];

export const disconnectedSubgraphs = () => [
  { id: "g1-a", type: "rectangle", x: 0, y: 0, width: 80, height: 40, label: { text: "G1-A" } },
  { id: "g1-b", type: "rectangle", x: 0, y: 0, width: 80, height: 40, label: { text: "G1-B" } },
  { id: "g2-a", type: "rectangle", x: 0, y: 0, width: 80, height: 40, label: { text: "G2-A" } },
  { id: "g2-b", type: "rectangle", x: 0, y: 0, width: 80, height: 40, label: { text: "G2-B" } },
  { id: "g1-e", type: "arrow", from: "g1-a", to: "g1-b" },
  { id: "g2-e", type: "arrow", from: "g2-a", to: "g2-b" },
];

export const wideLabelNodes = () => [
  {
    id: "src",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    label: { text: "Short" },
  },
  {
    id: "dst",
    type: "rectangle",
    x: 200,
    y: 0,
    width: 80,
    height: 40,
    label: { text: "Authentication & Authorization Service" },
  },
  { id: "edge", type: "arrow", from: "src", to: "dst" },
];

/** All nodes stacked — stress test for dagre fan-out separation. */
export const denseFanOut = () => [
  { id: "hub", type: "rectangle", x: 50, y: 50, width: 100, height: 50, label: { text: "Hub" } },
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `leaf${i}`,
    type: "rectangle",
    x: 50,
    y: 50,
    width: 85,
    height: 40,
    label: { text: `Leaf ${i}` },
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: `e${i}`,
    type: "arrow",
    from: "hub",
    to: `leaf${i}`,
  })),
];

export const oauth2Flow = () => [
  { id: "user", type: "rectangle", x: 900, y: 400, width: 100, height: 48, label: { text: "User" } },
  { id: "browser", type: "rectangle", x: 600, y: 100, width: 110, height: 48, label: { text: "Browser" } },
  { id: "auth", type: "rectangle", x: 200, y: 300, width: 120, height: 48, label: { text: "Auth Server" } },
  { id: "api", type: "rectangle", x: 10, y: 500, width: 110, height: 48, label: { text: "Resource API" } },
  { id: "e1", type: "arrow", from: "user", to: "browser", label: { text: "login" } },
  { id: "e2", type: "arrow", from: "browser", to: "auth", label: { text: "authorize" } },
  { id: "e3", type: "arrow", from: "auth", to: "browser", label: { text: "code" } },
  { id: "e4", type: "arrow", from: "browser", to: "api", label: { text: "token" } },
];

export const restApiCrud = () => [
  { id: "client", type: "rectangle", x: 800, y: 50, width: 100, height: 48, label: { text: "Client" } },
  { id: "api", type: "rectangle", x: 400, y: 200, width: 100, height: 48, label: { text: "REST API" } },
  { id: "db", type: "rectangle", x: 20, y: 400, width: 100, height: 48, label: { text: "Database" } },
  { id: "e1", type: "arrow", from: "client", to: "api", label: { text: "POST /items" } },
  { id: "e2", type: "arrow", from: "api", to: "db", label: { text: "INSERT" } },
  { id: "e3", type: "arrow", from: "db", to: "api", label: { text: "row id" } },
  { id: "e4", type: "arrow", from: "api", to: "client", label: { text: "201 Created" } },
];

export const pubSubQueue = () => [
  { id: "pub", type: "rectangle", x: 0, y: 200, width: 100, height: 48, label: { text: "Publisher" } },
  { id: "queue", type: "rectangle", x: 300, y: 0, width: 100, height: 48, label: { text: "Queue" } },
  { id: "sub1", type: "rectangle", x: 600, y: 100, width: 100, height: 48, label: { text: "Worker A" } },
  { id: "sub2", type: "rectangle", x: 600, y: 300, width: 100, height: 48, label: { text: "Worker B" } },
  { id: "e1", type: "arrow", from: "pub", to: "queue", label: { text: "publish" } },
  { id: "e2", type: "arrow", from: "queue", to: "sub1", label: { text: "deliver" } },
  { id: "e3", type: "arrow", from: "queue", to: "sub2", label: { text: "deliver" } },
];

export const loadBalancer = () => [
  { id: "clients", type: "rectangle", x: 0, y: 150, width: 110, height: 48, label: { text: "Clients" } },
  { id: "lb", type: "rectangle", x: 250, y: 150, width: 100, height: 48, label: { text: "Load Balancer" } },
  { id: "s1", type: "rectangle", x: 500, y: 50, width: 90, height: 44, label: { text: "Server 1" } },
  { id: "s2", type: "rectangle", x: 500, y: 150, width: 90, height: 44, label: { text: "Server 2" } },
  { id: "s3", type: "rectangle", x: 500, y: 250, width: 90, height: 44, label: { text: "Server 3" } },
  { id: "e0", type: "arrow", from: "clients", to: "lb" },
  { id: "e1", type: "arrow", from: "lb", to: "s1" },
  { id: "e2", type: "arrow", from: "lb", to: "s2" },
  { id: "e3", type: "arrow", from: "lb", to: "s3" },
];

export const ciCdPipeline = () => [
  { id: "commit", type: "rectangle", x: 700, y: 300, width: 100, height: 44, label: { text: "Commit" } },
  { id: "build", type: "rectangle", x: 500, y: 100, width: 100, height: 44, label: { text: "Build" } },
  { id: "test", type: "rectangle", x: 250, y: 300, width: 100, height: 44, label: { text: "Test" } },
  { id: "deploy", type: "rectangle", x: 0, y: 100, width: 100, height: 44, label: { text: "Deploy" } },
  { id: "e1", type: "arrow", from: "commit", to: "build" },
  { id: "e2", type: "arrow", from: "build", to: "test" },
  { id: "e3", type: "arrow", from: "test", to: "deploy" },
];

export const kubernetesIngress = () => [
  { id: "ingress", type: "rectangle", x: 0, y: 150, width: 110, height: 48, label: { text: "Ingress" } },
  { id: "svc", type: "rectangle", x: 220, y: 150, width: 100, height: 48, label: { text: "Service" } },
  { id: "pod1", type: "rectangle", x: 420, y: 80, width: 90, height: 44, label: { text: "Pod A" } },
  { id: "pod2", type: "rectangle", x: 420, y: 200, width: 90, height: 44, label: { text: "Pod B" } },
  { id: "db", type: "rectangle", x: 620, y: 150, width: 90, height: 44, label: { text: "DB" } },
  { id: "e1", type: "arrow", from: "ingress", to: "svc" },
  { id: "e2", type: "arrow", from: "svc", to: "pod1" },
  { id: "e3", type: "arrow", from: "svc", to: "pod2" },
  { id: "e4", type: "arrow", from: "pod1", to: "db" },
  { id: "e5", type: "arrow", from: "pod2", to: "db" },
];

export const tlsHandshake = () => [
  { id: "client", type: "rectangle", x: 700, y: 400, width: 110, height: 48, label: { text: "Client" } },
  { id: "server", type: "rectangle", x: 50, y: 50, width: 110, height: 48, label: { text: "Server" } },
  { id: "e1", type: "arrow", from: "client", to: "server", label: { text: "ClientHello" } },
  { id: "e2", type: "arrow", from: "server", to: "client", label: { text: "ServerHello" } },
  { id: "e3", type: "arrow", from: "client", to: "server", label: { text: "Finished" } },
];

export const eventSourcing = () => [
  { id: "cmd", type: "rectangle", x: 0, y: 200, width: 100, height: 44, label: { text: "Command" } },
  { id: "agg", type: "rectangle", x: 200, y: 200, width: 110, height: 44, label: { text: "Aggregate" } },
  { id: "events", type: "rectangle", x: 400, y: 200, width: 100, height: 44, label: { text: "Event Store" } },
  { id: "proj", type: "rectangle", x: 600, y: 100, width: 100, height: 44, label: { text: "Projection" } },
  { id: "read", type: "rectangle", x: 800, y: 200, width: 100, height: 44, label: { text: "Read Model" } },
  { id: "e1", type: "arrow", from: "cmd", to: "agg" },
  { id: "e2", type: "arrow", from: "agg", to: "events" },
  { id: "e3", type: "arrow", from: "events", to: "proj" },
  { id: "e4", type: "arrow", from: "proj", to: "read" },
];

export const cacheAside = () => [
  { id: "app", type: "rectangle", x: 0, y: 150, width: 90, height: 44, label: { text: "App" } },
  { id: "cache", type: "rectangle", x: 200, y: 50, width: 90, height: 44, label: { text: "Cache" } },
  { id: "db", type: "rectangle", x: 200, y: 250, width: 90, height: 44, label: { text: "DB" } },
  { id: "e1", type: "arrow", from: "app", to: "cache", label: { text: "get" } },
  { id: "e2", type: "arrow", from: "cache", to: "app", label: { text: "miss" } },
  { id: "e3", type: "arrow", from: "app", to: "db", label: { text: "query" } },
  { id: "e4", type: "arrow", from: "db", to: "app", label: { text: "row" } },
  { id: "e5", type: "arrow", from: "app", to: "cache", label: { text: "set" } },
];

export const DIAGRAM_FIXTURES = {
  tcpHandshake,
  transformerAttention,
  attentionBranchMerge,
  layeredMicroservices,
  fanOutHub,
  orphanNodesAtOrigin,
  decisionTree,
  cycleGraph,
  disconnectedSubgraphs,
  wideLabelNodes,
  denseFanOut,
  oauth2Flow,
  restApiCrud,
  pubSubQueue,
  loadBalancer,
  ciCdPipeline,
  kubernetesIngress,
  tlsHandshake,
  eventSourcing,
  cacheAside,
};
