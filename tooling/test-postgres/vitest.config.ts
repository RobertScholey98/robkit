import { defineConfig } from "vitest/config";

// Starting a container can take a while, longer still when CI pulls the image.
export default defineConfig({
  test: {
    testTimeout: 120_000,
    hookTimeout: 120_000,
    coverage: {
      include: ["src/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 89, branches: 90, functions: 96, lines: 89 },
    },
  },
});
