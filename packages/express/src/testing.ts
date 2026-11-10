import type { Viewer } from "@robkit/guard";
import type { NextFunction, Request as ExpressRequest } from "express";
import type { GuardedResponse } from "./guarded.ts";

export { guest, nobody, owner, type GuestOptions } from "@robkit/guard/testing";

const refusal =
  "This app's server uses guardedAs() from @robkit/express/testing, which serves only in a test run: NODE_ENV is test, or Vitest is running and NODE_ENV isn't production. Use guarded() from @robkit/express.";

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
export function guardedAs(
  viewer: Viewer,
): (req: ExpressRequest, res: GuardedResponse, next: NextFunction) => void {
  return (_req, res, next) => {
    if (!inTestRun()) {
      res.status(500).set("cache-control", "no-store").type("text/plain");
      res.send(refusal);
      return;
    }
    res.locals.viewer = viewer;
    next();
  };
}
