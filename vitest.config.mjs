import { defineConfig } from "vitest/config";

// two projects so each test runs in the environment its code runs in:
// electron main/preload in node, renderer in jsdom
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "main",
          environment: "node",
          include: ["*.test.js", "electron/**/*.test.js", "shared/**/*.test.js"],
        },
      },
      {
        test: {
          name: "renderer",
          environment: "jsdom",
          include: ["excalidraw-app/src/**/*.test.{js,jsx}"],
          setupFiles: ["excalidraw-app/src/test/setup.js"],
          server: { deps: { inline: ["@excalidraw/excalidraw"] } },
        },
      },
    ],
  },
});
