const textFromMessage = (message) => {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text") return block.text ?? "";
      return "";
    })
    .join("");
};

/** Filters out thinking/thought blocks (used for structured JSON extraction). */
const textFromMessageNoThinking = (message) => {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => !block?.thought)
    .map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text") return block.text ?? "";
      return "";
    })
    .join("");
};

const normalizeText = (value, fallback) => {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const normalizeErrorMessage = (value) => {
  if (!value) return undefined;

  if (typeof value === "object") {
    if (value.error?.message) return value.error.message;
    if (value.message) return value.message;
    try {
      value = JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (typeof value !== "string") return String(value);

  const parseErrorText = (text) => {
    const parsed = JSON.parse(text);
    return parsed?.error?.message || parsed?.message;
  };

  try {
    return parseErrorText(value) || value;
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        return parseErrorText(value.slice(start, end + 1)) || value;
      } catch {
        return value;
      }
    }
  }

  return value;
};

module.exports = {
  textFromMessage,
  textFromMessageNoThinking,
  normalizeText,
  normalizeErrorMessage,
};
