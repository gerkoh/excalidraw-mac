import dagre from "@dagrejs/dagre";

const getArrowEndpointIds = (element) => [
  element.startBinding?.elementId ?? element.startElementId ?? element.from,
  element.endBinding?.elementId ?? element.endElementId ?? element.to,
];

const DAGRE_NODE_TYPES = new Set(["rectangle", "ellipse", "diamond", "text"]);

const nodeSizeForLayout = (element) => {
  const w = Number.isFinite(element.width) ? element.width : 120;
  const h = Number.isFinite(element.height) ? element.height : 60;
  return {
    width: Math.max(w, 48),
    height: Math.max(h, 40),
  };
};

const isBackgroundZone = (el) =>
  el?.type === "rectangle" &&
  Number.isFinite(el?.opacity) &&
  el.opacity < 100;

/** Layer connected diagram nodes left-to-right. Skips when there are no semantic arrows. */
export const withDagreLayout = (elements) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const edgeRecords = [];

  for (const element of elements) {
    if (element.type !== "arrow") continue;
    const [startId, endId] = getArrowEndpointIds(element);
    if (!startId || !endId || startId === endId) continue;
    const startEl = byId.get(startId);
    const endEl = byId.get(endId);
    if (
      !startEl ||
      !endEl ||
      !DAGRE_NODE_TYPES.has(startEl.type) ||
      !DAGRE_NODE_TYPES.has(endEl.type)
    ) {
      continue;
    }
    if (isBackgroundZone(startEl) || isBackgroundZone(endEl)) {
      continue;
    }
    edgeRecords.push({
      from: startId,
      to: endId,
      name:
        element.id && String(element.id).length
          ? String(element.id)
          : `${startId}->${endId}-${edgeRecords.length}`,
    });
  }

  if (edgeRecords.length === 0) {
    return elements;
  }

  const nodeIds = new Set();
  for (const { from, to } of edgeRecords) {
    nodeIds.add(from);
    nodeIds.add(to);
  }

  const g = new dagre.graphlib.Graph({ multigraph: true }).setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 56,
    ranksep: 88,
    marginx: 32,
    marginy: 32,
  });

  for (const id of nodeIds) {
    const el = byId.get(id);
    const { width, height } = nodeSizeForLayout(el);
    g.setNode(id, { width, height });
  }

  for (const { from, to, name } of edgeRecords) {
    if (!g.hasNode(from) || !g.hasNode(to)) continue;
    g.setEdge(from, to, {}, name);
  }

  dagre.layout(g);

  const posById = new Map();
  for (const id of nodeIds) {
    const n = g.node(id);
    if (!n) continue;
    posById.set(id, {
      x: n.x - n.width / 2,
      y: n.y - n.height / 2,
    });
  }

  return elements.map((element) => {
    const p = posById.get(element.id);
    if (!p) return element;
    return { ...element, x: p.x, y: p.y };
  });
};
