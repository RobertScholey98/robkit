import { defineConfig } from "vitest/config";

// The stack starts Postgres, migrates core and boots Vite, which takes a while.
export default defineConfig({
  test: {
    globalSetup: ["./src/install.ts"],
    // pnpm test:production and pnpm test:combination run these, each with
    // its own config.
    exclude: [
      "src/production.test.ts",
      "src/combination.test.ts",
      "**/node_modules/**",
    ],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});
