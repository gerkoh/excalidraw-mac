const EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

// only well-known, browser-safe schemes are handed to the OS; file:, javascript:, data:
// and custom app schemes could run or open local things, so they are dropped
const isExternallyOpenable = (url) => {
  if (typeof url !== "string") return false;
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
};

const withoutHash = (url) => url.split("#")[0];

// same page as the app's own index.html; only the hash may differ
const isAppUrl = (url, appUrl) => typeof url === "string" && withoutHash(url) === appUrl;

const openIfExternal = (url, openExternal) => {
  if (!isExternallyOpenable(url)) {
    console.warn("[main] Blocked opening URL:", url);
    return;
  }
  Promise.resolve(openExternal(url)).catch((err) => {
    console.error("[main] Failed to open URL externally:", url, err);
  });
};

// keeps the app window on index.html: new windows and navigations go to the system browser (or nowhere)
const attachNavigationGuard = (webContents, { appUrl, openExternal }) => {
  webContents.setWindowOpenHandler(({ url }) => {
    openIfExternal(url, openExternal);
    return { action: "deny" };
  });

  // Electron 45 passes the URL on the event; the second argument is the deprecated form
  webContents.on("will-navigate", (event, legacyUrl) => {
    const url = event.url ?? legacyUrl;
    if (isAppUrl(url, appUrl)) return;
    event.preventDefault();
    openIfExternal(url, openExternal);
  });
};

module.exports = { isExternallyOpenable, isAppUrl, attachNavigationGuard };
