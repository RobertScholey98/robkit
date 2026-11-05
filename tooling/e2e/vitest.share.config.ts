import { defineConfig } from "vitest/config";

// The share e2e makes its own two installs and runs pnpm install in them
// between journeys. pnpm hard-links packages from one shared store, so that
// would touch the files under another suite's running core, and node --watch
// would restart it mid-journey. pnpm test runs it after the other suites.
export default defineConfig({
  test: {
    include: ["src/share.test.ts"],
    testTimeout: 600_000,
    hookTimeout: 900_000,
  },
});
