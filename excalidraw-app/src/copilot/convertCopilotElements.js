import { convertToExcalidrawElements, restore } from "@excalidraw/excalidraw";
import { withDeterministicArrowGeometry } from "./layout/arrowGeometry";
import { withDagreLayout } from "./layout/dagreLayout";
import { withExcalifont, withNativeLabelDefaults } from "./layout/elementDefaults";

/**
 * @param {unknown[]} elements
 * @param {{ applyDagreLayout?: boolean }} [options]
 */
export const convertCopilotElements = (elements, options = {}) => {
  const applyDagre = options.applyDagreLayout !== false;
  const laidOut = applyDagre ? withDagreLayout(elements) : elements;
  const normalizedElements = withDeterministicArrowGeometry(laidOut);
  const converted = convertToExcalidrawElements(
    normalizedElements.map(withNativeLabelDefaults),
    { regenerateIds: false },
  ).map(withExcalifont);

  return restore({ elements: converted }, null, null, {
    refreshDimensions: true,
  }).elements;
};
