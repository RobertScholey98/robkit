import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import { layerConfig } from "./layers.js";
import relativeImportExtension from "./relative-import-extension.js";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));

const robkit = {
  rules: { "relative-import-extension": relativeImportExtension },
};

/**
 * Shared ESLint config with type-aware rules.
 * @param {string} tsconfigRootDir the calling package's directory, usually `import.meta.dirname`
 */
export function config(tsconfigRootDir) {
  const workspace = relative(repoRoot, tsconfigRootDir).replaceAll("\\", "/");

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
    layerConfig(workspace),
    {
      plugins: { robkit },
      rules: { "robkit/relative-import-extension": "error" },
    },
  );
}
