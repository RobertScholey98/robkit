import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The API report and pack checks read built packages, which takes
    // seconds while turbo runs lint and typecheck beside them.
    testTimeout: 30_000,
    coverage: {
      include: ["src/**"],
      // The command-line scripts. Their tests run them as child processes,
      // which coverage can't see, and cli-tests.test.ts makes sure each has
      // one.
      exclude: [
        "src/check-*.ts",
        "src/print-*.ts",
        "src/new-*.ts",
        "src/release-*.ts",
      ],
      // Today's coverage, rounded down. Raise them as it rises; CI fails a
      // pull request that lowers one.
      thresholds: { statements: 96, branches: 88, functions: 96, lines: 98 },
    },
  },
});
