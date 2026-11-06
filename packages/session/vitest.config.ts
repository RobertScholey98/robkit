import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**"],
      // Type tests run in the typechecker, and src/test holds test helpers.
      exclude: ["src/**/*.test-d.ts", "src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 96, branches: 93, functions: 97, lines: 99 },
    },
  },
});
