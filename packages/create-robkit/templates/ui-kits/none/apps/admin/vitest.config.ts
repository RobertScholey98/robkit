import { defineConfig } from "vitest/config";

// Without this, Vitest would load vite.config.ts, which needs ROBKIT_CORE_URL.
export default defineConfig({});
