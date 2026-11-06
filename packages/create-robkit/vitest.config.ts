import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Most tests spend their time waiting on a process they spawned or on
    // files they write, so the tests in a file run side by side. A test
    // that shares an install only reads it.
    sequence: { concurrent: true },
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
      thresholds: { statements: 73, branches: 66, functions: 80, lines: 74 },
    },
  },
});
