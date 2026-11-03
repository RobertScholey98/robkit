import { defineConfig } from "vitest/config";

// The production e2e builds an image per app, so it runs on its own:
// pnpm test:production. It makes its own install and needs no global setup.
export default defineConfig({
  test: {
    include: ["src/production.test.ts"],
    testTimeout: 300_000,
    hookTimeout: 900_000,
  },
});
