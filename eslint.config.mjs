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
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        performance: "readonly",
        getComputedStyle: "readonly",
        localStorage: "readonly",
        Array: "readonly",
        Set: "readonly",
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
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },

  // Electron main process + preload (CommonJS, Node globals)
  {
    files: ["main.js", "preload.js", "copilot-agent.js", "copilot-agent-utils.js", "copilot/**/*.js"],
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
      },
    },
  },

  // Root Vitest specs (Node globals)
  {
    files: ["copilot-agent.*.test.js"],
    languageOptions: {
      globals: {
        console: "readonly",
      },
    },
  },

  // Vite config (ESM, Node)
  {
    files: ["vite.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },

  // Prettier must be last to turn off conflicting rules
  prettier,

  // Ignore build output & dependencies
  {
    ignores: [
      "node_modules/",
      "dist/",
      "excalidraw-app/dist/",

      // TypeScript is compiled by Vite, but this repo doesn't configure ESLint for TS yet.
      // Avoid parse errors until we introduce @typescript-eslint tooling.
      "**/*.ts",
      "**/*.tsx",
    ],
  },
];
