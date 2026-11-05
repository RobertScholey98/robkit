import { defineConfig } from "vitest/config";

// The stack starts Postgres, migrates core and boots Vite, which takes a while.
export default defineConfig({
  test: {
    globalSetup: ["./src/install.ts"],
    // pnpm test:production and vitest.share.config.ts run these.
    exclude: [
      "src/production.test.ts",
      "src/share.test.ts",
      "**/node_modules/**",
    ],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
