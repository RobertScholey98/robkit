import devServer from "@hono/vite-dev-server";
import { isProblem, readCoreUrl, readDevServerEnv } from "@robkit/input";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const devServerEnv = readDevServerEnv(process.env);
if (isProblem(devServerEnv)) throw new Error(devServerEnv.error);
const { port, domain } = devServerEnv;

// robkit-dev assigns PORT and serves admin on admin.<domain> through its
// proxy. Page loads go through the Hono app and its guard; Vite serves the
// client's modules and styles itself.
export default defineConfig(({ command }) => {
  // Vite loads the server on the first request, so check its config now.
  if (command === "serve") {
    const core = readCoreUrl(process.env);
    if (isProblem(core)) throw new Error(core.error);
  }
  return {
    plugins: [devServer({ entry: "src/server.ts" }), tailwindcss()],
    // There is no index.html for Vite to scan, so name the client's entry.
    optimizeDeps: { entries: ["src/client/main.tsx"] },
    // The production build: the client's files, and a manifest the server
    // reads to name them on its page.
    build: {
      outDir: "dist/client",
      manifest: true,
      rolldownOptions: { input: "src/client/main.tsx" },
    },
    server: {
      host: "127.0.0.1",
      ...(port && { port, strictPort: true }),
      ...(domain && { allowedHosts: [`.${domain}`] }),
    },
  };
});
