import devServer from "@hono/vite-dev-server";
import {
  isProblem,
  readCoreUrl,
  readDevServerEnv,
} from "@robkit/session/input";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const devServerEnv = readDevServerEnv(process.env);
if (isProblem(devServerEnv)) throw new Error(devServerEnv.error);
const { port, domain } = devServerEnv;

// robkit-dev assigns PORT and serves the app on <slug>.<domain> through its
// proxy. Every request but Vite's own goes through the Hono app, so the
// guard sees page loads.
export default defineConfig(({ command }) => {
  // Vite loads the server on the first request, so check its config now.
  if (command === "serve") {
    const core = readCoreUrl(process.env);
    if (typeof core !== "string") throw new Error(core.error);
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
