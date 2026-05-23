const crypto = require("crypto");
const { normalizeText } = require("./message-text");

const DRAWABLE_ELEMENT_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "arrow",
  "text",
  "line",
  "freedraw",
  "image",
]);

function normalizeDiagramElement(element, index) {
  if (!element || typeof element !== "object") {
    throw new Error(`Diagram element at index ${index} must be an object`);
  }

  const type = normalizeText(element.type, "rectangle");

  if (type === "cameraUpdate") {
    return { ...element, type };
  }

  const hasCoords =
    Number.isFinite(element.x) &&
    Number.isFinite(element.y) &&
    Number.isFinite(element.width) &&
    Number.isFinite(element.height);

  if (DRAWABLE_ELEMENT_TYPES.has(type) && !hasCoords) {
    throw new Error(
      `Diagram element at index ${index} (${type}#${element.id ?? "?"}) is missing finite x/y/width/height`,
    );
  }

  return {
    ...element,
    id: normalizeText(element.id, `copilot-${crypto.randomUUID()}`),
    type,
    x: Number.isFinite(element.x) ? element.x : index * 220,
    y: Number.isFinite(element.y) ? element.y : 0,
    width: Number.isFinite(element.width) ? element.width : 180,
    height: Number.isFinite(element.height) ? element.height : 80,
  };
}

function parseDiagramResponse(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }

  const codeBlock = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1].trim());
    } catch {
      /* fall through */
    }
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }

  return null;
}

function buildDiagramSummary(title, elements, { failed = false, errorMessage = "" } = {}) {
  if (failed) {
    return `[Diagram generation failed: ${errorMessage}. Explain the concept without visual references.]`;
  }

  const labels = [];
  for (const el of elements) {
    if (el.type === "cameraUpdate") continue;
    const label = el.label?.text || el.label || el.text || "";
    if (label) labels.push(`${el.type}: "${label}"`);
  }
  const drawn = elements.filter((e) => e.type !== "cameraUpdate").length;
  if (drawn === 0) return "";
  const detail = labels.length > 0 ? labels.join(", ") : `${drawn} element(s)`;
  return `A diagram titled "${title}" was rendered on the canvas with ${drawn} element(s): ${detail}. Reference this diagram in your explanation.`;
}

module.exports = {
  normalizeDiagramElement,
  parseDiagramResponse,
  buildDiagramSummary,
};
