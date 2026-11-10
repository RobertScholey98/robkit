import { appOrigin, requestGuard, type GuardedOptions } from "@robkit/session";
import { readSessionLapsed } from "@robkit/session/lapsed";
import { NextResponse } from "next/server.js";
import { viewerHeader, viewerValue } from "./viewer.ts";

export type { GuardedOptions };

/**
 * The request as the guard reads it: the page the browser asked for, on the
 * app's own origin, and the headers. Next hands the proxy a URL on its own
 * host and port, so only its path and query count. The origin comes from
 * the app's settings, as the guard's does, so a server action comes back to
 * the page it was called from whatever Host the proxy sent.
 */
function publicRequest(request: Request, origin: string): Request {
  const { pathname, search } = new URL(request.url);
  return new Request(`${origin}${pathname}${search}`, {
    method: request.method,
    headers: request.headers,
  });
}

/**
 * Next's client calls a server action with a POST to the page, so the guard
 * answers a lapsed session with its 401. Next's client turns an answer with
 * `x-action-redirect` and no RSC body into a full page load, so this sends
 * the browser where the 401 says, and back to the page, as `sessionFetch`
 * from `@robkit/react` does for other calls.
 */
async function forServerAction(
  request: Request,
  answer: Response,
  page: string,
): Promise<Response> {
  if (!request.headers.has("next-action")) return answer;
  const lapsed = await readSessionLapsed(answer);
  if (!lapsed) return answer;
  const target = new URL(lapsed.location);
  target.searchParams.set("next", page);
  answer.headers.set("x-action-redirect", `${target.href};push`);
  return answer;
}

/**
 * Runs robkit's guard on every request the proxy's matcher covers: checks
 * the app's own token against core's public key and the app's slug, then
 * lets the request through with the viewer for `viewer()`, sends the
 * browser to log in or for a token from core, or answers 404. The guard
 * answers `/_robkit/*` itself. Export it as `proxy` from `src/proxy.ts`.
 */
export function guarded(
  options: GuardedOptions,
): (request: Request) => Promise<Response> {
  const check = requestGuard(options);
  const origin = appOrigin(options);
  return async (request) => {
    const asked = publicRequest(request, origin);
    const decision = await check(asked);
    if (decision.outcome === "answer") {
      return forServerAction(request, decision.response, asked.url);
    }
    // set replaces any viewer the request came with.
    const forwarded = new Headers(request.headers);
    forwarded.set(viewerHeader, viewerValue(decision.viewer));
    const next = NextResponse.next({ request: { headers: forwarded } });
    // The guard answers before the page exists, so its headers go on what
    // it passes on. Next sends them with the page's answer, and drops the
    // page's own header of the same name.
    for (const [name, value] of decision.headers) next.headers.set(name, value);
    return next;
  };
}
