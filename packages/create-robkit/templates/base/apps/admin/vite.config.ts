import devServer from "@hono/vite-dev-server";
import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. Page loads go
// through the Hono app and its guard; Vite serves the client's modules and
// styles itself.
export default defineConfig({
  plugins: [robkit(), devServer({ entry: "src/server.ts" }), tailwindcss()],
  // There is no index.html for Vite to scan, so name the client's entry.
  optimizeDeps: { entries: ["src/client/main.tsx"] },
  // The production build: the client's files, and a manifest the server
  // reads to name them on its page.
  build: {
    outDir: "dist/client",
    manifest: true,
    rolldownOptions: { input: "src/client/main.tsx" },
  },
});
