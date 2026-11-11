import { testDefaults } from "@internal/vitest-config";
import { defineConfig } from "vitest/config";

// Two projects: `unit` needs no browser, and pnpm check runs it as
// test:unit. `browser` opens the built site in Chromium, and only test
// runs it.
export default defineConfig({
  test: {
    ...testDefaults,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["src/**/*.browser.test.ts"],
          // A CI runner takes several times as long as a laptop to start
          // Chromium and run axe.
          testTimeout: 120_000,
          hookTimeout: 180_000,
        },
      },
    ],
    coverage: {
      include: ["src/**/*.ts"],
      // The browser tests drive the scripts a page runs and use the test
      // helpers. Astro reads content.config.ts as it builds, and the
      // built-site tests check what it made. Coverage measures the code the
      // site builds with.
      exclude: ["src/scripts/**", "src/test/**", "src/content.config.ts"],
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
