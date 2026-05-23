import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.js"],
    include: [
      "excalidraw-app/src/**/*.test.{js,jsx,ts,tsx}",
      "copilot-agent.*.test.js",
    ],
  },
});

