import type { Viewer } from "@robkit/guard";
import { requestGuard, type GuardedOptions } from "@robkit/session";
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
 * The request as the guard reads it: its URL, method and headers. The body
 * stays unread, for the app's own handlers.
 */
function webRequest(req: ExpressRequest, host: string): Request {
  const headers = new Headers();
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.append(String(req.rawHeaders[i]), String(req.rawHeaders[i + 1]));
  }
  const url = new URL(req.originalUrl, `${req.protocol}://${host}`);
  return new Request(url, { method: req.method, headers });
}

/**
 * Node refuses an HTTP/1.1 request without a Host header, but not an
 * HTTP/1.0 one. Without it the guard can't tell which page was asked for.
 */
const noHost = () =>
  new Response("Send a Host header.", {
    status: 400,
    headers: { "content-type": "text/plain; charset=UTF-8" },
  });

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
  return async (req, res, next) => {
    const { host } = req.headers;
    if (host === undefined) {
      await send(noHost(), res);
      return;
    }
    const decision = await check(webRequest(req, host));
    if (decision.outcome === "answer") {
      await send(decision.response, res);
      return;
    }
    res.locals.viewer = decision.viewer;
    next();
  };
}
