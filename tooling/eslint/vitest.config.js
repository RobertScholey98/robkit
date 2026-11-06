import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["*.js"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 97, branches: 94, functions: 97, lines: 99 },
    },
  },
});
