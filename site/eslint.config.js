import { config } from "@internal/eslint-config";
import astro from "eslint-plugin-astro";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: [".astro/"] },
  config(import.meta.dirname),
  astro.configs.recommended,
  {
    // TypeScript's project service can't read an .astro file, so its
    // frontmatter gets the rules that need no types. `astro check` types it.
    files: ["**/*.astro"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
