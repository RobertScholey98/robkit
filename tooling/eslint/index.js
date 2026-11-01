import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import layer from "./layers.js";
import relativeImportExtension from "./relative-import-extension.js";

const robkit = {
  rules: {
    layer,
    "relative-import-extension": relativeImportExtension,
  },
};

/**
 * Shared ESLint config with type-aware rules.
 * @param {string} tsconfigRootDir the calling package's directory, usually `import.meta.dirname`
 */
export function config(tsconfigRootDir) {
  return defineConfig(
    { ignores: ["dist/", "coverage/"] },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    {
      files: ["**/*.js"],
      extends: [tseslint.configs.disableTypeChecked],
    },
    {
      plugins: { robkit },
      rules: {
        "robkit/layer": "error",
        "robkit/relative-import-extension": "error",
      },
    },
  );
}
