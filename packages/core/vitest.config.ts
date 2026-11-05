import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./src/test/global-setup.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      include: ["src/**"],
      exclude: ["src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 95, branches: 95, functions: 90, lines: 96 },
    },
  },
});
