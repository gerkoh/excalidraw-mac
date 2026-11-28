// The tab strip is the window's title bar. Main positions the traffic lights
// with these numbers, and the renderer leaves the same gap so the two meet.

const TITLE_BAR_HEIGHT = 40;
// macOS traffic-light buttons are 12pt tall. Centering them keeps the lights
// on the same row as the tabs.
const TRAFFIC_LIGHT_BUTTON = 12;
const TRAFFIC_LIGHT_X = 12;
const TRAFFIC_LIGHT_Y = Math.round((TITLE_BAR_HEIGHT - TRAFFIC_LIGHT_BUTTON) / 2);
// Three lights and the gaps between them, then a little air before the first tab.
const TRAFFIC_LIGHT_INSET = 78;

const windowChromeOptions = () => ({
  titleBarStyle: "hiddenInset",
  trafficLightPosition: { x: TRAFFIC_LIGHT_X, y: TRAFFIC_LIGHT_Y },
});

module.exports = {
  TITLE_BAR_HEIGHT,
  TRAFFIC_LIGHT_BUTTON,
  TRAFFIC_LIGHT_INSET,
  windowChromeOptions,
};
