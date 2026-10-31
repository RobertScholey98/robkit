import { defineConfig } from "vitest/config";

// The stack starts Postgres, migrates core and boots Vite, which takes a while.
export default defineConfig({
  test: { testTimeout: 180_000, hookTimeout: 180_000 },
});
