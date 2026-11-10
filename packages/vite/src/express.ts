import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";

/**
 * An Express app as Node's server calls it. Nothing here imports Express,
 * so this package names nothing an app runs on.
 */
type NodeApp = (req: IncomingMessage, res: ServerResponse) => void;

function isNodeApp(value: unknown): value is NodeApp {
  return typeof value === "function";
}

/**
 * Serves the Express app that `entry` exports as default from Vite's dev
 * server, loading it afresh after each change, so an edit to the server
 * needs no restart. Vite answers its own requests, such as a stylesheet,
 * and the app answers every other one, so its guard sees page loads.
 *
 * It sets `appType: "custom"`: otherwise Vite answers a page with an
 * `index.html` before the app sees the request.
 */
export function expressApp(entry: string): Plugin {
  return {
    name: "robkit:express-app",
    config: () => ({ appType: "custom" }),
    configureServer(server) {
      // Returned, so it runs after Vite's own middleware.
      return () => {
        server.middlewares.use((req, res, next) => {
          server
            .ssrLoadModule(entry)
            .then(({ default: app }: { default?: unknown }) => {
              if (!isNodeApp(app)) {
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
