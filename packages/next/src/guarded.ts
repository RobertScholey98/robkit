import { requestGuard, type GuardedOptions } from "@robkit/session";
import { readSessionLapsed } from "@robkit/session/lapsed";
import { NextResponse } from "next/server.js";
import { viewerHeader, viewerValue } from "./viewer.ts";

export type { GuardedOptions };

/**
 * The request as the guard reads it: the URL the browser asked for, by the
 * Host header the dev proxy or Traefik sent, and the headers. Next hands the
 * proxy a URL on its own host and port instead.
 */
function publicRequest(request: Request, host: string): Request {
  const { pathname, search } = new URL(request.url);
  return new Request(new URL(`${pathname}${search}`, `http://${host}`), {
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
 * Node refuses an HTTP/1.1 request without a Host header, but not an
 * HTTP/1.0 one. Without it the guard can't tell which page was asked for.
 */
const noHost = () =>
  new Response("Send a Host header.", {
    status: 400,
    headers: { "content-type": "text/plain; charset=UTF-8" },
  });

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
  return async (request) => {
    const host = request.headers.get("host");
    if (host === null) return noHost();
    const asked = publicRequest(request, host);
    const decision = await check(asked);
    if (decision.outcome === "answer") {
      return forServerAction(request, decision.response, asked.url);
    }
    // set replaces any viewer the request came with.
    const forwarded = new Headers(request.headers);
    forwarded.set(viewerHeader, viewerValue(decision.viewer));
    return NextResponse.next({ request: { headers: forwarded } });
  };
}
