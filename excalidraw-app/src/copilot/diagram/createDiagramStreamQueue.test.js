import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAMERA_SETTLE_DELAY_MS,
  ELEMENT_STREAM_DELAY_MS,
  createDiagramStreamQueue,
} from "./createDiagramStreamQueue";

vi.mock("../../utils/cameraUtils", () => ({
  CAMERA_ANIM_MS: 10,
}));

describe("createDiagramStreamQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("applies elements with pacing then finalizes", async () => {
    const elements = [];
    let finalized = false;
    const queue = createDiagramStreamQueue({
      excalidrawAPI: {},
      cameraAnimator: { animateCamera: vi.fn(), cancel: vi.fn() },
      onElement: (el) => elements.push(el),
      onFinalize: () => {
        finalized = true;
      },
    });

    queue.enqueue({ type: "element", data: { id: "a" } });
    queue.enqueue({ type: "element", data: { id: "b" } });
    queue.markEnd({ ok: true });

    await vi.advanceTimersByTimeAsync(ELEMENT_STREAM_DELAY_MS * 2 + CAMERA_SETTLE_DELAY_MS);

    expect(elements).toEqual([{ id: "a" }, { id: "b" }]);
    expect(finalized).toBe(true);
  });

  it("reset clears pending work without finalizing", async () => {
    let finalized = false;
    const queue = createDiagramStreamQueue({
      excalidrawAPI: {},
      cameraAnimator: { animateCamera: vi.fn(), cancel: vi.fn() },
      onElement: vi.fn(),
      onFinalize: () => {
        finalized = true;
      },
    });

    queue.enqueue({ type: "element", data: { id: "a" } });
    queue.markEnd({ ok: true });
    queue.reset();

    await vi.advanceTimersByTimeAsync(ELEMENT_STREAM_DELAY_MS + CAMERA_SETTLE_DELAY_MS);

    expect(finalized).toBe(false);
  });

  it("abort stops processing mid-stream", async () => {
    const elements = [];
    const queue = createDiagramStreamQueue({
      excalidrawAPI: {},
      cameraAnimator: { animateCamera: vi.fn(), cancel: vi.fn() },
      onElement: (el) => elements.push(el),
      onFinalize: vi.fn(),
    });

    queue.enqueue({ type: "element", data: { id: "a" } });
    queue.enqueue({ type: "element", data: { id: "b" } });
    queue.abort();

    await vi.advanceTimersByTimeAsync(ELEMENT_STREAM_DELAY_MS * 3);

    expect(elements.length).toBeLessThanOrEqual(1);
  });
});
