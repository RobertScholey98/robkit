import devServer from "@hono/vite-dev-server";
import { defineConfig } from "vite";

const domain = process.env.ROBKIT_DOMAIN;

// robkit-dev assigns PORT and serves the app on example.<domain> through its
// proxy. Every request but Vite's own goes through the Hono app, so the
// guard sees page loads.
export default defineConfig({
  plugins: [devServer({ entry: "src/server.tsx", injectClientScript: false })],
  server: {
    host: "127.0.0.1",
    ...(process.env.PORT && {
      port: Number(process.env.PORT),
      strictPort: true,
    }),
    ...(domain && { allowedHosts: [`example.${domain}`] }),
  },
});
