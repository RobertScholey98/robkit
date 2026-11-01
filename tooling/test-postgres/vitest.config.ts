import { defineConfig } from "vitest/config";

// Starting a container can take a while, longer still when CI pulls the image.
export default defineConfig({
  test: { testTimeout: 120_000, hookTimeout: 120_000 },
});
