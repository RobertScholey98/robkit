import { testDefaults } from "@internal/vitest-config";
import { defineConfig } from "vitest/config";

// The stack starts Postgres, migrates core and boots Vite, which takes a while.
export default defineConfig({
  test: {
    ...testDefaults,
    testTimeout: 180_000,
    hookTimeout: 180_000,
    projects: [
      {
        extends: true,
        test: {
          name: "stacks",
          // Every install the journeys run in, linked to this checkout.
          globalSetup: ["./src/install.ts"],
          // pnpm test:production runs this, with its own config.
          exclude: [
            "src/production.test.ts",
            "src/registry.test.ts",
            "src/upgrade.test.ts",
            "**/node_modules/**",
          ],
        },
      },
      {
        extends: true,
        // Makes its own install from a local registry, so it needs none of
        // the global setup's.
        test: {
          name: "registry",
          include: ["src/registry.test.ts", "src/upgrade.test.ts"],
        },
      },
    ],
  },
});
