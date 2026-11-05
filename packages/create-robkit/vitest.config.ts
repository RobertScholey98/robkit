import { defineConfig } from "vitest/config";

// The templates hold an install's own tests, which run in a generated install.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      include: ["src/**"],
      exclude: ["src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 64, branches: 51, functions: 74, lines: 65 },
    },
  },
});
