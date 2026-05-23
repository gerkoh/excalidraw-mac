import { FONT_FAMILY } from "@excalidraw/excalidraw";

export const withNativeLabelDefaults = (element) => {
  if (!element.label) return element;

  const label =
    typeof element.label === "string" ? { text: element.label } : element.label;

  return {
    ...element,
    label: {
      textAlign: "center",
      verticalAlign: "middle",
      ...label,
    },
  };
};

export const withExcalifont = (element) =>
  element.type === "text"
    ? { ...element, fontFamily: FONT_FAMILY.Excalifont ?? 1 }
    : element;
