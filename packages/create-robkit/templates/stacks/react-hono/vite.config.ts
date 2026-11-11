import devServer from "@hono/vite-dev-server";
import { robkit } from "@robkit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// robkit() sets the dev server up behind pnpm dev's proxy. Every request
// but Vite's own goes through the Hono app, so the guard sees page loads.
// For vite build, serve names the server's entry: robkit() builds it to
// dist/serve.js and the stylesheet its page links to dist/assets.
export default defineConfig({
  plugins: [
    robkit({ serve: "src/serve.ts" }),
    devServer({ entry: "src/server.tsx", injectClientScript: false }),
    tailwindcss(),
  ],
});
