import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // It starts with no tests. Thresholds of 100 make its first code
    // bring tests with it.
    passWithNoTests: true,
    coverage: {
      include: ["src/**"],
      // Type tests run in the typechecker, and src/test holds test helpers.
      exclude: ["src/**/*.test-d.ts", "src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
