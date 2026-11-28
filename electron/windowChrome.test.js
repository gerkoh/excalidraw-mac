import { describe, it, expect } from "vitest";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const {
  TITLE_BAR_HEIGHT,
  TRAFFIC_LIGHT_BUTTON,
  TRAFFIC_LIGHT_INSET,
  windowChromeOptions,
} = require("./windowChrome");

describe("window chrome", () => {
  it("hides the native title so the tabs can sit in that row", () => {
    expect(windowChromeOptions().titleBarStyle).toBe("hiddenInset");
  });

  it("centers the traffic lights inside the tab strip", () => {
    const { y } = windowChromeOptions().trafficLightPosition;
    expect(y).toBe(Math.round((TITLE_BAR_HEIGHT - TRAFFIC_LIGHT_BUTTON) / 2));
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y + TRAFFIC_LIGHT_BUTTON).toBeLessThanOrEqual(TITLE_BAR_HEIGHT);
  });

  it("leaves a gap wider than the lights themselves", () => {
    const { x } = windowChromeOptions().trafficLightPosition;
    expect(TRAFFIC_LIGHT_INSET).toBeGreaterThan(x + TRAFFIC_LIGHT_BUTTON);
  });
});
