import type { Viewer } from "@robkit/guard";
import { requestGuard, type GuardedOptions } from "@robkit/session";
import type { ServerEntry } from "@tanstack/react-start/server-entry";

export type { GuardedOptions };

/**
 * What routes, middleware and server functions find in `context` once the
 * guard lets a request through. Register it as Start's request context:
 *
 * ```ts
 * declare module "@tanstack/react-start" {
 *   interface Register {
 *     server: { requestContext: GuardedContext };
 *   }
 * }
 * ```
 */
export interface GuardedContext {
  viewer: Viewer;
}

/**
 * Start's server entry with robkit's guard in front, for `src/server.ts`.
 * The guard runs on every request Start handles, page loads and server
 * function calls alike. It checks the session cookie against core's public
 * key, then hands the request to Start with `context.viewer` set, sends the
 * browser to log in or refresh, or answers 404.
 *
 * It wraps the server entry rather than sitting in `src/start.ts`, because
 * Start loads that file in the browser too, and the guard is server code.
 */
export function guarded(
  entry: ServerEntry,
  options: GuardedOptions,
): ServerEntry {
  const check = requestGuard(options);
  return {
    async fetch(request, opts) {
      const decision = await check(request);
      if ("response" in decision) return decision.response;
      const context: GuardedContext = { viewer: decision.viewer };
      return entry.fetch(request, {
        ...opts,
        context: { ...opts?.context, ...context },
      });
    },
  };
}
