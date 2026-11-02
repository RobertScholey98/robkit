import { config } from "@internal/eslint-config";

export default [
  // TanStack Router writes this from the files in src/routes.
  { ignores: ["src/routeTree.gen.ts"] },
  ...config(import.meta.dirname),
];
