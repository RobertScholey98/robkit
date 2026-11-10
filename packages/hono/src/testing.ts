import type { Viewer } from "@robkit/guard";
import type { MiddlewareHandler } from "hono";
import type { GuardedEnv } from "./guarded.ts";

export { guest, nobody, owner, type GuestOptions } from "@robkit/guard/testing";

const refusal =
  "This app's server uses guardedAs() from @robkit/hono/testing, which serves only in tests, and NODE_ENV is production. Use guarded() from @robkit/hono.";

/**
 * For tests only: a stand-in for `guarded()` that checks nothing and serves
 * every request as `viewer`, so a test can call the app's routes as the
 * owner, a guest or nobody. When `NODE_ENV` is `production`, as in every
 * image, it refuses every request with a 500, so a copy left in a server
 * opens nothing.
 */
export function guardedAs(viewer: Viewer): MiddlewareHandler<GuardedEnv> {
  return async (c, next) => {
    if (process.env.NODE_ENV === "production") {
      c.header("cache-control", "no-store");
      return c.text(refusal, 500);
    }
    c.set("viewer", viewer);
    await next();
  };
}
