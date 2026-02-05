import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  root: "excalidraw-app",
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@config": path.resolve(__dirname, "config.json"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  }
});
