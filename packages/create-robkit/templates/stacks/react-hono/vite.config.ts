import devServer from "@hono/vite-dev-server";
import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. Every request
// but Vite's own goes through the Hono app, so the guard sees page loads.
export default defineConfig({
  plugins: [
    robkit(),
    devServer({ entry: "src/server.tsx", injectClientScript: false }),
    tailwindcss(),
  ],
  // The production build: the server, ready for Node, as dist/serve.js,
  // and the stylesheet its page links, in dist/assets.
  build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true },
});
