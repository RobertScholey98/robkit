import devServer from "@hono/vite-dev-server";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const domain = process.env.ROBKIT_DOMAIN;

// robkit-dev assigns PORT and serves the app on <slug>.<domain> through its
// proxy. Every request but Vite's own goes through the Hono app, so the
// guard sees page loads.
export default defineConfig(({ command }) => {
  // Vite loads the server on the first request, so check its config now.
  if (command === "serve" && !process.env.ROBKIT_CORE_URL) {
    throw new Error(
      "ROBKIT_CORE_URL is not set. Run the app with pnpm dev, which sets it.",
    );
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
      ...(process.env.PORT && {
        port: Number(process.env.PORT),
        strictPort: true,
      }),
      ...(domain && { allowedHosts: [`.${domain}`] }),
    },
  };
});
