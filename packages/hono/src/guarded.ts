import type { Viewer } from "@robkit/guard";
import { requestGuard, type GuardedOptions } from "@robkit/session";
import type { MiddlewareHandler } from "hono";

export type { GuardedOptions };

/** Handlers behind `guarded` read the viewer as `c.var.viewer`. */
export interface GuardedEnv {
  Variables: { viewer: Viewer };
}

/**
 * Runs robkit's guard on every request: checks the app's own token against
 * core's public key and the app's slug, then lets the request through with
 * `c.var.viewer` set, sends the browser to log in or for a token from
 * core, or answers 404. The guard answers `/_robkit/*` itself.
 */
export function guarded(
  options: GuardedOptions,
): MiddlewareHandler<GuardedEnv> {
  const check = requestGuard(options);
  return async (c, next) => {
    const decision = await check(c.req.raw);
    if (decision.outcome === "answer") return decision.response;
    c.set("viewer", decision.viewer);
    await next();
  };
}
