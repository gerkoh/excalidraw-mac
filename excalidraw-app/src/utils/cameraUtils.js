// Camera animation utilities for Excalidraw viewport transitions.
// Used by the copilot streaming handler to smoothly frame diagram regions as elements arrive.

export const CAMERA_ANIM_MS = 350;

const CAMERA_ZOOM_PADDING = 0.92;

/**
 * Coerce a value to a finite number, returning the fallback if the
 * conversion produces NaN or Infinity.
 */
export const toFiniteNumber = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

/**
 * Resolve drawable canvas width/height inside the Excalidraw container,
 * accounting for a docked sidebar when present.
 */
export function getExcalidrawCanvasMetrics(container = document.querySelector(".excalidraw")) {
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const dockedSidebarRect = document.querySelector(".sidebar--docked")?.getBoundingClientRect();

  const width = dockedSidebarRect
    ? Math.max(dockedSidebarRect.left - containerRect.left, 0)
    : containerRect.width;
  const height = containerRect.height;

  if (width === 0 || height === 0) return null;
  return { width, height };
}

/**
 * Create a scoped camera animator tied to one hook instance.
 * Cancelling starts fresh from the current viewport on the next call.
 */
export function createCameraAnimator() {
  let activeAnimFrameId = null;

  const cancel = () => {
    if (activeAnimFrameId != null) {
      cancelAnimationFrame(activeAnimFrameId);
      activeAnimFrameId = null;
    }
  };

  /**
   * @param {object} api - Excalidraw API instance
   * @param {{ x?: number, y?: number, width?: number, height?: number }} camera
   * @param {{ getCanvasMetrics?: () => { width: number, height: number } | null }} [options]
   */
  const animateCamera = (api, camera, options = {}) => {
    cancel();

    const metrics =
      options.getCanvasMetrics?.() ?? getExcalidrawCanvasMetrics();
    if (!metrics || !api) return;

    const { width: cw, height: ch } = metrics;

    const cameraWidth = toFiniteNumber(camera?.width, 800);
    const cameraHeight = toFiniteNumber(camera?.height, 600);
    const cameraX = toFiniteNumber(camera?.x, 0);
    const cameraY = toFiniteNumber(camera?.y, 0);
    if (cameraWidth <= 0 || cameraHeight <= 0) return;

    const targetZoom =
      Math.min(cw / cameraWidth, ch / cameraHeight) * CAMERA_ZOOM_PADDING;
    if (!Number.isFinite(targetZoom) || targetZoom <= 0) return;

    const targetScrollX =
      -cameraX * targetZoom + (cw - cameraWidth * targetZoom) / 2;
    const targetScrollY =
      -cameraY * targetZoom + (ch - cameraHeight * targetZoom) / 2;
    if (!Number.isFinite(targetScrollX) || !Number.isFinite(targetScrollY)) {
      return;
    }

    const appState = api.getAppState();
    const startScrollX = toFiniteNumber(appState.scrollX, 0);
    const startScrollY = toFiniteNumber(appState.scrollY, 0);
    const startZoom = toFiniteNumber(appState.zoom?.value, 1);
    const startTime = performance.now();

    const step = (now) => {
      const t = Math.min((now - startTime) / CAMERA_ANIM_MS, 1);
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

      api.updateScene({
        appState: {
          scrollX: startScrollX + (targetScrollX - startScrollX) * ease,
          scrollY: startScrollY + (targetScrollY - startScrollY) * ease,
          zoom: { value: startZoom + (targetZoom - startZoom) * ease },
        },
      });

      if (t < 1) {
        activeAnimFrameId = requestAnimationFrame(step);
      } else {
        activeAnimFrameId = null;
      }
    };

    activeAnimFrameId = requestAnimationFrame(step);
  };

  return { animateCamera, cancel };
}

/** Back-compat wrapper using a module-level animator (prefer createCameraAnimator in new code). */
const defaultAnimator = createCameraAnimator();
export const animateCamera = defaultAnimator.animateCamera;
