import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The templates hold an install's own tests, which run in a generated install.
    include: ["src/**/*.test.ts"],
    // Many tests write a whole install to disk, which takes seconds on
    // Windows while lint and typecheck run beside them.
    testTimeout: 30_000,
  },
});
