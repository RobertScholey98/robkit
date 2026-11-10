import { orThrow, readDevServerEnv, readGuardEnv } from "@robkit/input";
import { securityHeaders } from "@robkit/input/headers";
import type { Plugin } from "vite";

export interface RobkitOptions {
  /**
   * Whether the app has a guard, which sends its own headers and needs
   * `ROBKIT_APP` and `ROBKIT_CORE_URL`. Only the hub sets it to `false`:
   * the dev server then checks neither and sends the hub's headers itself.
   */
  guarded?: boolean;
}

/**
 * Sets an app's Vite dev server up behind `pnpm dev`'s proxy: it listens
 * on 127.0.0.1 at `PORT`, never another port, and answers the install's
 * host names. A guarded app's settings are checked as the server starts,
 * since the guard is loaded only on the first request.
 *
 * It changes nothing for a build, or under Vitest, which loads the app's
 * config with no `pnpm dev` behind it and sets `VITEST` before it does.
 */
export function robkit({ guarded = true }: RobkitOptions = {}): Plugin {
  return {
    name: "robkit",
    config(_config, { command }) {
      if (command !== "serve" || process.env.VITEST) return;
      if (guarded) orThrow(readGuardEnv(process.env));
      const { port, domain } = orThrow(readDevServerEnv(process.env));
      return {
        server: {
          host: "127.0.0.1",
          ...(port && { port, strictPort: true }),
          ...(domain && { allowedHosts: [`.${domain}`] }),
        },
      };
    },
    configureServer(server) {
      if (guarded || process.env.VITEST) return;
      // The hub's headers, as core sends them: nobody may frame it. pnpm dev
      // serves plain http, so there is no HSTS to send.
      const headers = securityHeaders("http://localhost", "none");
      server.middlewares.use((_req, res, next) => {
        for (const [name, value] of headers) res.setHeader(name, value);
        next();
      });
    },
  };
}
