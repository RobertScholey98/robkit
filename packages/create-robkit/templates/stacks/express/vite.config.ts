import { readCoreUrl, readDevServerEnv, orThrow } from "@robkit/input";
import tailwindcss from "@tailwindcss/vite";
import type { Express } from "express";
import { defineConfig, type Plugin } from "vite";

const { port, domain } = orThrow(readDevServerEnv(process.env));

/** An Express app is a function with a `handle` method. */
function isExpressApp(value: unknown): value is Express {
  return typeof value === "function" && "handle" in value;
}

/**
 * Serves the Express app from `entry` in Vite's dev server, loading it
 * afresh after each change. Vite answers its own requests, such as the
 * stylesheet, and the Express app answers every other one, so the guard
 * sees page loads.
 */
function expressApp(entry: string): Plugin {
  return {
    name: "express-app",
    configureServer(server) {
      // Returned, so it runs after Vite's own middleware.
      return () => {
        server.middlewares.use((req, res, next) => {
          server
            .ssrLoadModule(entry)
            .then(({ default: app }: { default?: unknown }) => {
              if (!isExpressApp(app)) {
                throw new Error(
                  `${entry} must export its Express app as default.`,
                );
              }
              app(req, res);
            })
            .catch(next);
        });
      };
    },
  };
}

// robkit-dev assigns PORT and serves the app on <slug>.<domain> through its
// proxy.
export default defineConfig(({ command }) => {
  // Vite loads the server on the first request, so check its config now.
  if (command === "serve") {
    orThrow(readCoreUrl(process.env));
  }
  return {
    plugins: [expressApp("/src/server.tsx"), tailwindcss()],
    // Vite serves no index.html: the Express app answers every page.
    appType: "custom",
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
