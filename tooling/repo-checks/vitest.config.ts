import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The API report and pack checks read built packages, which takes
    // seconds while turbo runs lint and typecheck beside them.
    testTimeout: 30_000,
    coverage: {
      include: ["src/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 82, branches: 73, functions: 87, lines: 84 },
    },
  },
});
