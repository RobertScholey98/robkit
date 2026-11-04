import { defineConfig } from "vitest/config";

// The kit matrix runs one install per job: pnpm test:combination, with
// E2E_COMBINATION set to the install's init flags as JSON.
export default defineConfig({
  test: {
    globalSetup: ["./src/combination-setup.ts"],
    include: ["src/combination.test.ts"],
    testTimeout: 900_000,
    hookTimeout: 900_000,
  },
});
