import { useRef, useEffect } from "react";
import { createCameraAnimator } from "../utils/cameraUtils";
import { createSceneSync } from "../copilot/diagram/diagramSceneSync";
import { createDiagramStreamQueue } from "../copilot/diagram/createDiagramStreamQueue";
import { convertCopilotElements } from "../copilot/convertCopilotElements";

/** Ephemeral test hook — cleared on unmount. Not part of the product API. */
const COPILOT_DIAGRAM_TEST_KEY = "__COPILOT_DIAGRAM_TEST__";

const useCopilotDiagram = ({ excalidrawAPI, sceneElementsRef }) => {
  const copilotRawRef = useRef([]);
  const copilotElementIdsRef = useRef(new Set());

  useEffect(() => {
    if (!excalidrawAPI) return undefined;

    const cameraAnimator = createCameraAnimator();
    const scene = createSceneSync({
      excalidrawAPI,
      sceneElementsRef,
      copilotRawRef,
      copilotElementIdsRef,
    });

    const stream = createDiagramStreamQueue({
      excalidrawAPI,
      cameraAnimator,
      onElement: (element) => {
        copilotRawRef.current.push(element);
        scene.updateSceneWithCopilotElements({ applyDagreLayout: false });
      },
      onFinalize: () => {
        if (copilotRawRef.current.length > 0) {
          scene.updateSceneWithCopilotElements({ applyDagreLayout: true });
        }
      },
    });

    const unsubs = [
      window.electronAPI.onCopilotDiagramStart?.((diagram) => {
        stream.reset();
        if (diagram?.reset !== false) {
          scene.clearCopilotElements();
        }
      }),
      window.electronAPI.onCopilotDiagramElement?.((element) => {
        stream.enqueue({ type: "element", data: element });
      }),
      window.electronAPI.onCopilotDiagramCamera?.((camera) => {
        stream.enqueue({ type: "camera", data: camera });
      }),
      window.electronAPI.onCopilotDiagramEnd?.((payload) => {
        stream.markEnd(payload);
      }),
      window.electronAPI.onCopilotDiagramAbort?.(() => {
        stream.abort();
      }),
    ];

    if (typeof window !== "undefined") {
      window[COPILOT_DIAGRAM_TEST_KEY] = {
        clearDiagram: () => {
          stream.reset();
          scene.clearCopilotElements();
        },
        injectDiagram: (rawElements, opts = {}) => {
          stream.reset();
          scene.clearCopilotElements();
          copilotRawRef.current = [...rawElements];
          scene.updateSceneWithCopilotElements({
            applyDagreLayout: opts.applyDagreLayout !== false,
          });
        },
        getCopilotRawElements: () => [...copilotRawRef.current],
        getCopilotElementIds: () => [...copilotElementIdsRef.current],
        getSceneElements: () => sceneElementsRef.current ?? [],
        convertElements: convertCopilotElements,
      };
    }

    return () => {
      if (typeof window !== "undefined") {
        delete window[COPILOT_DIAGRAM_TEST_KEY];
      }
      cameraAnimator.cancel();
      unsubs.forEach((fn) => fn?.());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excalidrawAPI]);
};

export default useCopilotDiagram;
