import { defineConfig } from "eslint/config";
import coreSchema from "./core-schema.js";
import layer from "./layers.js";
import { policy } from "./policy.js";

/**
 * Shared ESLint config with type-aware rules: the policy every install
 * gets too, and the rules that know robkit's own packages.
 * @param {string} tsconfigRootDir the calling package's directory, usually `import.meta.dirname`
 */
export function config(tsconfigRootDir) {
  return defineConfig(
    policy(tsconfigRootDir, { "core-schema": coreSchema, layer }),
    {
      rules: { "robkit/core-schema": "error", "robkit/layer": "error" },
    },
  );
}
