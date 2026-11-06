import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A `*.db.test.ts` file needs the suite's Postgres, which needs Docker.
    // `test:unit` runs the `unit` project alone, so `pnpm check` runs the
    // rest without starting Postgres.
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["./src/test/global-setup.ts"],
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      include: ["src/**"],
      exclude: ["src/test/**"],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 96, branches: 96, functions: 91, lines: 97 },
    },
  },
});
