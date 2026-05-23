import { CAMERA_ANIM_MS } from "../../utils/cameraUtils";

export const ELEMENT_STREAM_DELAY_MS = 80;
export const CAMERA_SETTLE_DELAY_MS = CAMERA_ANIM_MS + 50;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Queues diagram IPC payloads and applies renderer-side pacing.
 */
export function createDiagramStreamQueue({
  excalidrawAPI,
  cameraAnimator,
  onElement,
  onFinalize,
}) {
  const queue = [];
  let processing = false;
  let aborted = false;
  let pendingEnd = null;

  const processQueue = async () => {
    if (processing) return;
    processing = true;

    try {
      while (queue.length > 0 && !aborted) {
        const item = queue.shift();
        if (item.type === "camera") {
          cameraAnimator?.animateCamera(excalidrawAPI, item.data);
          await delay(CAMERA_SETTLE_DELAY_MS);
        } else if (item.type === "element") {
          onElement(item.data);
          await delay(ELEMENT_STREAM_DELAY_MS);
        }
      }

      if (!aborted && pendingEnd && queue.length === 0) {
        onFinalize();
        pendingEnd = null;
      }
    } finally {
      processing = false;
      if (queue.length > 0 && !aborted) {
        void processQueue();
      }
    }
  };

  return {
    enqueue(item) {
      queue.push(item);
      void processQueue();
    },
    markEnd(payload) {
      pendingEnd = payload;
      void processQueue();
    },
    reset() {
      aborted = false;
      queue.length = 0;
      pendingEnd = null;
      cameraAnimator?.cancel();
    },
    abort() {
      aborted = true;
      queue.length = 0;
      pendingEnd = null;
      cameraAnimator?.cancel();
    },
  };
}
