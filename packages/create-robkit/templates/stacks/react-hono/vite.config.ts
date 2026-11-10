import devServer from "@hono/vite-dev-server";
import { readCoreUrl, readDevServerEnv, orThrow } from "@robkit/input";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const { port, domain } = orThrow(readDevServerEnv(process.env));

// robkit-dev assigns PORT and serves the app on <slug>.<domain> through its
// proxy. Every request but Vite's own goes through the Hono app, so the
// guard sees page loads.
export default defineConfig(({ command }) => {
  // Vite loads the server on the first request, so check its config now.
  // Vitest runs the serve command too, with no pnpm dev behind it, and sets
  // VITEST before it loads this file.
  if (command === "serve" && !process.env.VITEST) {
    orThrow(readCoreUrl(process.env));
  }
  return {
    plugins: [
      devServer({ entry: "src/server.tsx", injectClientScript: false }),
      tailwindcss(),
    ],
    // The production build: the server, ready for Node, as dist/serve.js,
    // and the stylesheet its page links, in dist/assets.
    build: { ssr: "src/serve.ts", outDir: "dist", ssrEmitAssets: true },
    server: {
      host: "127.0.0.1",
      ...(port && { port, strictPort: true }),
      ...(domain && { allowedHosts: [`.${domain}`] }),
    },
  };
});
