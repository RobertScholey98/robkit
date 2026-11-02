import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // TanStack Router writes routeTree.gen.ts from the files in src/routes.
  { ignores: ["**/dist/", "**/routeTree.gen.ts"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["apps/**"],
    ignores: ["apps/core/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@robkit/core",
              message:
                "Layer rule: only apps/core imports @robkit/core. Code reaches core over HTTP only.",
            },
          ],
        },
      ],
    },
  },
);
