import { defineConfig } from "eslint/config";
// robkit's own lint policy, which create-robkit copied from robkit.
import { policy } from "./tooling/eslint/policy.js";

export default defineConfig(
  // TanStack Router writes routeTree.gen.ts from the files in src/routes.
  { ignores: ["**/dist/", "**/routeTree.gen.ts"] },
  policy(import.meta.dirname),
);
