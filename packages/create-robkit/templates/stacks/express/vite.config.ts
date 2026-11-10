import { robkit } from "@robkit/vite";
import { expressApp } from "@robkit/vite/express";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. expressApp()
// hands every request but Vite's own to the Express app, so the guard sees
// page loads, and loads it again after each change.
export default defineConfig({
  plugins: [robkit(), expressApp("/src/server.tsx"), tailwindcss()],
  // The production build: the server, ready for Node, as dist/serve.js,
  // and the stylesheet its page links, in dist/assets.
  build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true },
});
