import type { Viewer } from "@robkit/guard";
import type { NextFunction, Request as ExpressRequest } from "express";
import type { GuardedResponse } from "./guarded.ts";

export { guest, nobody, owner, type GuestOptions } from "@robkit/guard/testing";

const refusal =
  "This app's server uses guardedAs() from @robkit/express/testing, which serves only in tests, and NODE_ENV is production. Use guarded() from @robkit/express.";

/**
 * For tests only: a stand-in for `guarded()` that checks nothing and serves
 * every request as `viewer`, so a test can call the app's routes as the
 * owner, a guest or nobody. When `NODE_ENV` is `production`, as in every
 * image, it refuses every request with a 500, so a copy left in a server
 * opens nothing.
 */
export function guardedAs(
  viewer: Viewer,
): (req: ExpressRequest, res: GuardedResponse, next: NextFunction) => void {
  return (_req, res, next) => {
    if (process.env.NODE_ENV === "production") {
      res.status(500).set("cache-control", "no-store").type("text/plain");
      res.send(refusal);
      return;
    }
    res.locals.viewer = viewer;
    next();
  };
}
