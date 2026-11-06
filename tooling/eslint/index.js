import comments from "@eslint-community/eslint-plugin-eslint-comments/configs";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import coreSchema from "./core-schema.js";
import layer from "./layers.js";
import noBareError from "./no-bare-error.js";
import noBrandCast from "./no-brand-cast.js";
import noJsonCast from "./no-json-cast.js";
import noSilentCatch from "./no-silent-catch.js";
import oneProblemType from "./one-problem-type.js";
import relativeImportExtension from "./relative-import-extension.js";
import { testFiles } from "./test-files.js";

const robkit = {
  rules: {
    "core-schema": coreSchema,
    layer,
    "no-bare-error": noBareError,
    "no-brand-cast": noBrandCast,
    "no-json-cast": noJsonCast,
    "no-silent-catch": noSilentCatch,
    "one-problem-type": oneProblemType,
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
      // Input from outside goes through a reader; a cast would skip it.
      // Parsed JSON is any, which no-unsafe-type-assertion lets through.
      // Tests may cast to build what they feed the code under test, and
      // throw a fixed error to see what the code does with one.
      files: ["**/*.ts", "**/*.tsx"],
      ignores: testFiles,
      plugins: { robkit },
      rules: {
        "@typescript-eslint/no-unsafe-type-assertion": "error",
        "robkit/no-bare-error": "error",
        "robkit/no-json-cast": "error",
      },
    },
    {
      // Only a reader makes a branded value, in tests too: a test builds
      // one with the reader or a builder from @internal/test-session.
      files: ["**/*.ts", "**/*.tsx"],
      plugins: { robkit },
      rules: { "robkit/no-brand-cast": "error" },
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
        "robkit/one-problem-type": "error",
        "robkit/relative-import-extension": "error",
      },
    },
    // A suppression says why after `--`, and one that suppresses nothing goes.
    comments.recommended,
    {
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: {
        "@eslint-community/eslint-comments/require-description": "error",
      },
    },
  );
}
