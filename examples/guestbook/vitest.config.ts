import { defineConfig } from "vitest/config";

// pnpm test runs the app's tests without its Vite config, which needs the
// environment pnpm dev gives it.
export default defineConfig({ test: { passWithNoTests: true } });
