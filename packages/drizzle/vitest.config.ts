import { testDefaults } from "@internal/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    ...testDefaults,
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
      // src/test holds test helpers. The command's entry only calls what it
      // imports; tests run it as a child process, which the report can't
      // see.
      exclude: ["src/test/**", "src/robkit-migrate-command.ts"],
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
