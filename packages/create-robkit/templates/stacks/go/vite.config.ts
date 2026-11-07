import { readDevServerEnv, orThrow } from "@robkit/input";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const { port, domain } = orThrow(readDevServerEnv(process.env));

// Under pnpm dev the Go server runs Vite on a port of its own, set as
// PORT, and passes it every page request the guard lets through, so Vite
// serves the page and its hot updates on <slug>.<domain>. vite build
// writes the page to dist/public, which the built server serves.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist/public" },
  server: {
    host: "127.0.0.1",
    ...(port && { port, strictPort: true }),
    ...(domain && { allowedHosts: [`.${domain}`] }),
  },
});
