const getElementAnchor = (element, fixedPoint) => {
  const [fx = 0.5, fy = 0.5] = Array.isArray(fixedPoint)
    ? fixedPoint
    : [0.5, 0.5];

  return [
    element.x + element.width * fx,
    element.y + element.height * fy,
  ];
};

const getDefaultArrowFixedPoints = (startElement, endElement) => {
  const startCenterX = startElement.x + startElement.width / 2;
  const startCenterY = startElement.y + startElement.height / 2;
  const endCenterX = endElement.x + endElement.width / 2;
  const endCenterY = endElement.y + endElement.height / 2;
  const dx = endCenterX - startCenterX;
  const dy = endCenterY - startCenterY;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { start: [1, 0.5], end: [0, 0.5] }
      : { start: [0, 0.5], end: [1, 0.5] };
  }

  return dy >= 0
    ? { start: [0.5, 1], end: [0.5, 0] }
    : { start: [0.5, 0], end: [0.5, 1] };
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getArrowEndpointIds = (element) => [
  element.startBinding?.elementId ?? element.startElementId ?? element.from,
  element.endBinding?.elementId ?? element.endElementId ?? element.to,
];

const getParallelArrowKey = (startElementId, endElementId) =>
  [startElementId, endElementId].sort().join("->");

const getParallelFixedPoints = ({
  startElement,
  endElement,
  startFixedPoint,
  endFixedPoint,
  index,
  count,
}) => {
  if (count <= 1) {
    return { start: startFixedPoint, end: endFixedPoint };
  }

  const startCenterX = startElement.x + startElement.width / 2;
  const startCenterY = startElement.y + startElement.height / 2;
  const endCenterX = endElement.x + endElement.width / 2;
  const endCenterY = endElement.y + endElement.height / 2;
  const dx = endCenterX - startCenterX;
  const dy = endCenterY - startCenterY;
  const offset = index - (count - 1) / 2;
  const fixedPointOffset = clamp(0.5 + offset * 0.18, 0.2, 0.8);

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      start: [startFixedPoint[0], fixedPointOffset],
      end: [endFixedPoint[0], fixedPointOffset],
    };
  }

  return {
    start: [fixedPointOffset, startFixedPoint[1]],
    end: [fixedPointOffset, endFixedPoint[1]],
  };
};

export const withDeterministicArrowGeometry = (elements) => {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const parallelArrowCounts = new Map();
  const parallelArrowIndexes = new Map();

  for (const element of elements) {
    if (element.type !== "arrow") continue;
    const [startElementId, endElementId] = getArrowEndpointIds(element);
    if (!byId.has(startElementId) || !byId.has(endElementId)) continue;
    const key = getParallelArrowKey(startElementId, endElementId);
    parallelArrowCounts.set(key, (parallelArrowCounts.get(key) ?? 0) + 1);
  }

  return elements.map((element) => {
    if (element.type !== "arrow") return element;

    const [startElementId, endElementId] = getArrowEndpointIds(element);
    const startElement = byId.get(startElementId);
    const endElement = byId.get(endElementId);
    if (!startElement || !endElement) return element;

    const defaultFixedPoints = getDefaultArrowFixedPoints(startElement, endElement);
    const parallelKey = getParallelArrowKey(startElementId, endElementId);
    const parallelCount = parallelArrowCounts.get(parallelKey) ?? 1;
    const parallelIndex = parallelArrowIndexes.get(parallelKey) ?? 0;
    parallelArrowIndexes.set(parallelKey, parallelIndex + 1);

    const fixedPoints = getParallelFixedPoints({
      startElement,
      endElement,
      startFixedPoint:
        element.startBinding?.fixedPoint ?? defaultFixedPoints.start,
      endFixedPoint:
        element.endBinding?.fixedPoint ?? defaultFixedPoints.end,
      index: parallelIndex,
      count: parallelCount,
    });

    const startBinding = {
      elementId: startElement.id,
      fixedPoint: fixedPoints.start,
    };
    const endBinding = {
      elementId: endElement.id,
      fixedPoint: fixedPoints.end,
    };
    const [startX, startY] = getElementAnchor(startElement, startBinding.fixedPoint);
    const [endX, endY] = getElementAnchor(endElement, endBinding.fixedPoint);
    const width = endX - startX;
    const height = endY - startY;

    return {
      ...element,
      x: startX,
      y: startY,
      width,
      height,
      points: [
        [0, 0],
        [width, height],
      ],
      startBinding,
      endBinding,
      endArrowhead: element.endArrowhead ?? "arrow",
    };
  });
};
