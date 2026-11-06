import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A file's first lint with the type-aware config builds a TypeScript
    // program, which took 5.9 seconds on CI while turbo ran every package.
    testTimeout: 30_000,
    coverage: {
      include: ["*.js"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 97, branches: 94, functions: 98, lines: 99 },
    },
  },
});
