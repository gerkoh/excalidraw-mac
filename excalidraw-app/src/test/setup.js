import { vi } from "vitest";

// jsdom has no canvas; @excalidraw/excalidraw touches a 2d context at import time
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ filter: "none" }));
