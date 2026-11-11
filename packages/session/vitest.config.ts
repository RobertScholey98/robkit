import { testDefaults } from "@internal/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    ...testDefaults,
    coverage: {
      include: ["src/**"],
      // Type tests run in the typechecker, and src/test holds test helpers.
      exclude: ["src/**/*.test-d.ts", "src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 98, branches: 95, functions: 100, lines: 99 },
    },
  },
});
