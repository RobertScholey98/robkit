import type { Viewer } from "@robkit/guard";
import { appOrigin, requestGuard, type GuardedOptions } from "@robkit/session";
import type {
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

export type { GuardedOptions };

/** What `guarded` puts on `res.locals`: the viewer. */
export interface GuardedLocals {
  viewer: Viewer;
}

/** A handler behind `guarded` reads the viewer as `res.locals.viewer`. */
export type GuardedResponse = ExpressResponse<unknown, GuardedLocals>;

/**
 * The request as the guard reads it: the path and query on its request
 * line, on the app's own origin, its method and its headers. A target that
 * starts with two slashes stays a path on the app, and no Host is read. The
 * body stays unread, for the app's own handlers.
 */
function webRequest(req: ExpressRequest, origin: string): Request {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(String(req.rawHeaders[i]), String(req.rawHeaders[i + 1]));
  }
  const url = new URL(origin);
  const [path = "", ...query] = req.originalUrl.split("?");
  url.pathname = path;
  url.search = query.join("?");
  return new Request(url, { method: req.method, headers });
}

/** Sends the guard's answer as it is: status, every header and the body. */
async function send(answer: Response, res: ExpressResponse): Promise<void> {
  res.status(answer.status);
  // Iterating keeps each Set-Cookie apart, and append keeps them all.
  for (const [name, value] of answer.headers) res.append(name, value);
  res.end(Buffer.from(await answer.arrayBuffer()));
}

/**
 * Runs robkit's guard on every request: checks the app's own token against
 * core's public key and the app's slug, then lets the request through with
 * `res.locals.viewer` set, sends the browser to log in or for a token from
 * core, or answers 404. The guard answers `/_robkit/*` itself.
 */
export function guarded(
  options: GuardedOptions,
): (
  req: ExpressRequest,
  res: GuardedResponse,
  next: NextFunction,
) => Promise<void> {
  const check = requestGuard(options);
  const origin = appOrigin(options);
  return async (req, res, next) => {
    const decision = await check(webRequest(req, origin));
    if (decision.outcome === "answer") {
      await send(decision.response, res);
      return;
    }
    res.locals.viewer = decision.viewer;
    // Set before the handlers run, so every answer they send carries them,
    // redirects included. A handler that sets one of its own replaces it.
    for (const [name, value] of decision.headers) res.setHeader(name, value);
    next();
  };
}
