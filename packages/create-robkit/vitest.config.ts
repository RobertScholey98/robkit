import { defineConfig } from "vitest/config";

// The templates hold an install's own tests, which run in a generated install.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
