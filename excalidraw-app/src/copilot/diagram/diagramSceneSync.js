import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { convertCopilotElements } from "../convertCopilotElements";
import { getApplySimpleLayout } from "../copilotLayoutSettings";

/** Merge converted copilot elements into the current scene. */
export function createSceneSync({ excalidrawAPI, sceneElementsRef, copilotRawRef, copilotElementIdsRef }) {
  const updateSceneWithCopilotElements = (opts = { applyDagreLayout: true }) => {
    const applyDagre = opts.applyDagreLayout !== false && getApplySimpleLayout();
    const converted = convertCopilotElements([...copilotRawRef.current], {
      applyDagreLayout: applyDagre,
    });
    const currentElements = sceneElementsRef.current ?? [];
    const copilotIds = new Set(converted.map((el) => el.id));
    const retained = currentElements.filter(
      (el) => !copilotIds.has(el.id) && !copilotElementIdsRef.current.has(el.id),
    );
    copilotElementIdsRef.current = copilotIds;

    excalidrawAPI.updateScene({
      elements: [...retained, ...converted],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  const clearCopilotElements = () => {
    const currentElements = sceneElementsRef.current ?? [];
    const retained = currentElements.filter(
      (el) => !copilotElementIdsRef.current.has(el.id),
    );
    copilotRawRef.current = [];
    copilotElementIdsRef.current = new Set();
    excalidrawAPI.updateScene({
      elements: retained,
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
  };

  return { updateSceneWithCopilotElements, clearCopilotElements };
}
