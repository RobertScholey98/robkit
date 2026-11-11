import { testDefaults } from "@internal/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    ...testDefaults,
    // Most tests spend their time waiting on a process they spawned or on
    // files they write, so the tests in a file run side by side. A test
    // that shares an install only reads it.
    sequence: { concurrent: true },
    // Many tests write a whole install to disk, which takes seconds on
    // Windows while lint and typecheck run beside them.
    testTimeout: 30_000,
    // A `*.pack.test.ts` file builds and packs robkit's own packages, which
    // takes most of a minute under load. `test:unit` runs the `unit`
    // project alone, so `pnpm check` skips it; `test` runs both.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          // The templates hold an install's own tests, which run in a
          // generated install.
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.pack.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "pack",
          include: ["src/**/*.pack.test.ts"],
          testTimeout: 120_000,
        },
      },
    ],
    coverage: {
      include: ["src/**"],
      exclude: ["src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 86, branches: 77, functions: 92, lines: 87 },
    },
  },
});
