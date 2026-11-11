import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["src/**/*.ts"],
      // The scripts run in the page, not in Node. Astro reads
      // content.config.ts as it builds, and the built-site tests check what
      // it made. Coverage measures the code the site builds with.
      exclude: ["src/scripts/**", "src/content.config.ts"],
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
