import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Under pnpm dev the Go server runs Vite on a port of its own, set as
// PORT, and passes it every page request the guard lets through, so Vite
// serves the page and its hot updates on <slug>.<domain>. robkit() sets
// that dev server up. vite build writes the page to dist/public, which the
// built server serves.
export default defineConfig({
  plugins: [robkit(), react(), tailwindcss()],
  build: { outDir: "dist/public" },
});
