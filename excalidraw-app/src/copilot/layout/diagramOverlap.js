const LAYOUT_NODE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

/** Background zone rectangles (low opacity) are not semantic layout nodes. */
export const isBackgroundZone = (element) =>
  element?.type === "rectangle" &&
  Number.isFinite(element?.opacity) &&
  element.opacity < 100;

/** Shapes that participate in overlap checks (excludes arrows, labels, zones). */
export const isLayoutNode = (element) => {
  if (!element || element.isDeleted) return false;
  if (element.containerId) return false;
  if (!LAYOUT_NODE_TYPES.has(element.type)) return false;
  if (isBackgroundZone(element)) return false;
  return (
    Number.isFinite(element.x) &&
    Number.isFinite(element.y) &&
    Number.isFinite(element.width) &&
    Number.isFinite(element.height)
  );
};

/** Standalone diagram titles (not bound to a shape container). */
export const isStandaloneTitleText = (element) =>
  element?.type === "text" && !element.containerId;

export const getElementBounds = (element) => ({
  left: element.x,
  top: element.y,
  right: element.x + element.width,
  bottom: element.y + element.height,
});

export const boundsOverlap = (a, b, minGap = 0) =>
  !(
    a.right + minGap <= b.left ||
    b.right + minGap <= a.left ||
    a.bottom + minGap <= b.top ||
    b.bottom + minGap <= a.top
  );

export const overlapArea = (a, b) => {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right <= left || bottom <= top) return 0;
  return (right - left) * (bottom - top);
};

/**
 * @param {unknown[]} elements
 * @param {{ minGap?: number, includeStandaloneText?: boolean }} [options]
 */
export const findOverlappingPairs = (elements, options = {}) => {
  const { minGap = 0, includeStandaloneText = false } = options;
  const nodes = elements.filter(isLayoutNode);
  if (includeStandaloneText) {
    nodes.push(...elements.filter(isStandaloneTitleText));
  }

  const pairs = [];
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = getElementBounds(nodes[i]);
      const b = getElementBounds(nodes[j]);
      if (boundsOverlap(a, b, minGap)) {
        pairs.push({
          a: nodes[i],
          b: nodes[j],
          overlapPx: overlapArea(a, b),
        });
      }
    }
  }
  return pairs;
};

export const formatOverlapReport = (pairs) =>
  pairs
    .map(
      ({ a, b, overlapPx }) =>
        `${a.id ?? a.type} ↔ ${b.id ?? b.type} (${Math.round(overlapPx)}px²)`,
    )
    .join("\n");
