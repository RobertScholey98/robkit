import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import coreSchema from "./core-schema.js";
import layer from "./layers.js";
import noSilentCatch from "./no-silent-catch.js";
import relativeImportExtension from "./relative-import-extension.js";

const robkit = {
  rules: {
    "core-schema": coreSchema,
    layer,
    "no-silent-catch": noSilentCatch,
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
        "preserve-caught-error": ["error", { requireCatchParameter: true }],
        "robkit/core-schema": "error",
        "robkit/layer": "error",
        "robkit/no-silent-catch": "error",
        "robkit/relative-import-extension": "error",
      },
    },
  );
}
