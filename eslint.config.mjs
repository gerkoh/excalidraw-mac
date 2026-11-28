import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,

  // React (JSX) files in excalidraw-app/src
  {
    files: ["excalidraw-app/src/**/*.{js,jsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        Array: "readonly",
        fetch: "readonly",
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off", // not needed with React 17+ JSX transform
      "react/prop-types": "off", // no PropTypes in this project
    },
  },

  // Electron main process + preload (CommonJS, Node globals)
  {
    files: ["main.js", "preload.js", "electron/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        __dirname: "readonly",
        require: "readonly",
        module: "readonly",
        process: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
      },
    },
  },

  // Code shared by main and renderer (plain ESM, only globals both environments have)
  {
    files: ["shared/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        URL: "readonly",
        URLSearchParams: "readonly",
        decodeURIComponent: "readonly",
      },
    },
  },

  // Vite + Vitest config (ESM, Node)
  {
    files: ["vite.config.mjs", "vitest.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },

  // Tests (ESM, run by Vitest; vitest APIs are imported explicitly, not globals)
  // main-process tests load the CommonJS modules under test via createRequire
  {
    files: ["**/*.test.{js,jsx}", "excalidraw-app/src/test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        window: "readonly",
        console: "readonly",
        process: "readonly",
        HTMLCanvasElement: "readonly",
      },
    },
  },

  // Prettier must be last to turn off conflicting rules
  prettier,

  // Ignore build output & dependencies
  {
    ignores: ["node_modules/", "dist/", "excalidraw-app/dist/"],
  },
];
