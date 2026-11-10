import type { Viewer } from "@robkit/guard";
import type { MiddlewareHandler } from "hono";
import type { GuardedEnv } from "./guarded.ts";

export { guest, nobody, owner, type GuestOptions } from "@robkit/guard/testing";

const refusal =
  "This app's server uses guardedAs() from @robkit/hono/testing, which serves only in a test run: NODE_ENV is test, or Vitest is running and NODE_ENV isn't production. Use guarded() from @robkit/hono.";

/**
 * Whether this process is a test run: `NODE_ENV` is `test`, or Vitest is
 * running, which sets `VITEST`. `NODE_ENV` of `production` is never one,
 * whatever else is set.
 */
function inTestRun(): boolean {
  const { NODE_ENV, VITEST } = process.env;
  if (NODE_ENV === "production") return false;
  return NODE_ENV === "test" || VITEST !== undefined;
}

/**
 * For tests only: a stand-in for `guarded()` that checks nothing and serves
 * every request as `viewer`, so a test can call the app's routes as the
 * owner, a guest or nobody. Outside a test run it refuses every request
 * with a 500: in an image, under `pnpm dev`, and in a server started by
 * hand. So a copy left in a server opens nothing, wherever it runs.
 */
export function guardedAs(viewer: Viewer): MiddlewareHandler<GuardedEnv> {
  return async (c, next) => {
    if (!inTestRun()) {
      c.header("cache-control", "no-store");
      return c.text(refusal, 500);
    }
    c.set("viewer", viewer);
    await next();
  };
}
