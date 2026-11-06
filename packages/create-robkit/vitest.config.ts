import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The templates hold an install's own tests, which run in a generated install.
    include: ["src/**/*.test.ts"],
    // Many tests write a whole install to disk, which takes seconds on
    // Windows while lint and typecheck run beside them.
    testTimeout: 30_000,
    coverage: {
      include: ["src/**"],
      exclude: ["src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 70, branches: 59, functions: 77, lines: 71 },
    },
  },
});
