import devServer from "@hono/vite-dev-server";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const domain = process.env.ROBKIT_DOMAIN;

// robkit-dev assigns PORT and serves admin on admin.<domain> through its
// proxy. Page loads go through the Hono app and its guard; Vite serves the
// client's modules and styles itself.
export default defineConfig(({ command }) => {
  // Vite loads the server on the first request, so check its config now.
  if (command === "serve" && !process.env.ROBKIT_CORE_URL) {
    throw new Error(
      "ROBKIT_CORE_URL is not set. Run admin with pnpm dev, which sets it.",
    );
  }
  return {
    plugins: [devServer({ entry: "src/server.ts" }), tailwindcss()],
    // There is no index.html for Vite to scan, so name the client's entry.
    optimizeDeps: { entries: ["src/client/main.tsx"] },
    server: {
      host: "127.0.0.1",
      ...(process.env.PORT && {
        port: Number(process.env.PORT),
        strictPort: true,
      }),
      ...(domain && { allowedHosts: [`admin.${domain}`] }),
    },
  };
});
